'use client';
/* eslint-disable @next/next/no-img-element -- Ticket attachments use arbitrary signed storage URLs. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeAlert,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Command,
  FileWarning,
  Gavel,
  Headphones,
  Inbox,
  LayoutDashboard,
  Loader2,
  PanelRightOpen,
  RefreshCw,
  Radio,
  Send,
  Shield,
  ShieldCheck,
  Swords,
  Timer,
  XCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ModTicket = {
  id: string;
  username: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  admin_note: string | null;
  assigned_to_id: string | null;
  assigned_to_username: string | null;
  message_count: number;
  last_message: string | null;
};

type TicketMsg = {
  id: string;
  sender_name: string;
  is_staff: boolean;
  content: string;
  created_at: string;
};

type TicketDetail = {
  ticket: ModTicket;
  messages: TicketMsg[];
};

type DisputedMatch = {
  match_id: string;
  player1_id: string;
  player2_id: string;
  player1_username: string;
  player2_username: string;
  player1_elo: number;
  player2_elo: number;
  submitted_by: string | null;
  submitted_by_username: string | null;
  submitted_winner_id: string | null;
  submitted_winner_username: string | null;
  submitted_player1_legs: number | null;
  submitted_player2_legs: number | null;
  submitted_player1_average: number | null;
  submitted_player2_average: number | null;
  submitted_player1_checkout: number | null;
  submitted_player2_checkout: number | null;
  submitted_player1_180s: number | null;
  submitted_player2_180s: number | null;
  dispute_reason: string | null;
  dispute_screenshot_url: string | null;
  created_at: string;
};

type LiveMatch = {
  id: string;
  player1_username: string;
  player2_username: string;
  player1_elo: number;
  player2_elo: number;
  status: string;
  app: string | null;
  created_at: string;
  duration_minutes: number;
};

type FlaggedPlayer = {
  id: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  winrate: number;
  elo_gain_7d: number;
  account_age_days: number;
  flags: string[];
};

type ModLog = {
  id: string;
  mod_username: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  details: string | null;
  created_at: string;
};

type ResolveForm = {
  winnerId: string;
  p1Legs: string;
  p2Legs: string;
  p1Avg: string;
  p2Avg: string;
  p1Checkout: string;
  p2Checkout: string;
  p1OneEighties: string;
  p2OneEighties: string;
  note: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────

function parseTicketMessageContent(content: string) {
  const images: { label: string; url: string }[] = [];
  const text = content
    .replace(/\n?\[Bildanhang: ([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) => {
      images.push({ label, url });
      return '';
    })
    .trim();
  return { text, images };
}

function ticketImageAlt(fileName: string) {
  return fileName.replace(/[-_]+/g, ' ').replace(/\.[^/.]+$/, '').trim() || 'Ticket-Bildanhang';
}

function toNonNegativeInteger(value: string) {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

const statusCfg: Record<string, { label: string; cls: string; dot: string }> = {
  open:             { label: 'Offen',          cls: 'border-emerald-900/15 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  in_progress:      { label: 'In Bearbeitung', cls: 'border-sky-900/15 bg-sky-50 text-sky-800',             dot: 'bg-sky-500' },
  waiting_for_user: { label: 'Warte auf User', cls: 'border-amber-900/15 bg-amber-50 text-amber-800',       dot: 'bg-amber-500' },
  resolved:         { label: 'Gelöst',         cls: 'border-stone-900/10 bg-stone-100 text-stone-600',      dot: 'bg-stone-400' },
  closed:           { label: 'Geschlossen',    cls: 'border-stone-900/10 bg-stone-50 text-stone-500',        dot: 'bg-stone-300' },
};

const priorityCfg: Record<string, { label: string; cls: string }> = {
  low:    { label: 'Niedrig', cls: 'text-stone-400' },
  normal: { label: 'Normal',  cls: 'text-stone-600' },
  high:   { label: 'Hoch',    cls: 'text-amber-700' },
  urgent: { label: 'Dringend',cls: 'text-rose-700' },
};

const catLabels: Record<string, string> = {
  general: 'Allgemein', bug: 'Bug', account: 'Account',
  match_dispute: 'Match-Streit', ban_appeal: 'Ban-Einspruch', other: 'Sonstiges',
};

const matchStatusCfg: Record<string, { label: string; cls: string }> = {
  pending_result:        { label: 'Läuft',        cls: 'border-emerald-900/15 bg-emerald-50 text-emerald-800' },
  awaiting_confirmation: { label: 'Bestätigung',  cls: 'border-amber-900/15 bg-amber-50 text-amber-800' },
  disputed:              { label: 'Dispute',      cls: 'border-rose-900/15 bg-rose-50 text-rose-800' },
};

const inputCls = 'w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-[#2f6b55] focus:ring-4 focus:ring-[#2f6b55]/10';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tag(en)`;
}

// ─── Tab-Button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold transition-all ${
        active
          ? 'bg-[#153f33] text-white shadow-sm'
          : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
      }`}
    >
      <span className={active ? 'text-[#d5f080]' : 'text-stone-400 group-hover:text-[#153f33]'}>{icon}</span>
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className={`ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1.5 text-[10px] font-black ${
          active ? 'bg-[#d5f080] text-[#153f33]' : 'bg-stone-200 text-stone-600'
        }`}>{badge}</span>
      )}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ModeratorPanel() {
  const supabase = useMemo(() => createClient(), []);
  const router   = useRouter();

  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<'desk' | 'tickets' | 'disputes' | 'matches' | 'flagged' | 'logs'>('desk');
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);
  const [operatorName, setOperatorName] = useState('Moderator');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [pendingCancelDisputeId, setPendingCancelDisputeId] = useState<string | null>(null);
  const [pendingCancelMatchId, setPendingCancelMatchId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Tickets
  const [tickets,       setTickets]       = useState<ModTicket[]>([]);
  const [ticketFilter,  setTicketFilter]  = useState<string | null>(null);
  const [openTicketId,  setOpenTicketId]  = useState<string | null>(null);
  const [ticketDetail,  setTicketDetail]  = useState<TicketDetail | null>(null);
  const [ticketSearch,  setTicketSearch]  = useState('');
  const [ticketNotes,   setTicketNotes]   = useState<Record<string, string>>({});
  const [savingTicketNoteId, setSavingTicketNoteId] = useState<string | null>(null);
  const [claimingTicketId, setClaimingTicketId] = useState<string | null>(null);
  const [reply,         setReply]         = useState('');
  const [sending,       setSending]       = useState(false);

  // Disputes
  const [disputes,      setDisputes]      = useState<DisputedMatch[]>([]);
  const [openDispute,   setOpenDispute]   = useState<string | null>(null);
  const [resolveForms,  setResolveForms]  = useState<Record<string, ResolveForm>>({});

  // Live Matches
  const [liveMatches,   setLiveMatches]   = useState<LiveMatch[]>([]);

  // Flagged
  const [flagged,       setFlagged]       = useState<FlaggedPlayer[]>([]);
  const [openFlagged,   setOpenFlagged]   = useState<string | null>(null);
  const [warnReason,    setWarnReason]    = useState('');

  // Logs
  const [logs,          setLogs]          = useState<ModLog[]>([]);

  // ── Toast Helper ──────────────────────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadTickets = useCallback(async (status?: string | null) => {
    const { data, error } = await supabase.rpc('mod_get_tickets', {
      p_status: status ?? null, p_limit: 100, p_offset: 0,
    });
    if (error) throw new Error(error.message);
    if (data) setTickets(data as ModTicket[]);
  }, [supabase]);

  const loadDisputes = useCallback(async () => {
    const { data, error } = await supabase.rpc('mod_get_disputed_matches');
    if (error) throw new Error(error.message);
    if (data) {
      setDisputes(data as DisputedMatch[]);
      setResolveForms(prev => {
        const next = { ...prev };
        (data as DisputedMatch[]).forEach(m => {
          if (!next[m.match_id]) next[m.match_id] = {
            winnerId: m.submitted_winner_id || m.player1_id,
            p1Legs: String(m.submitted_player1_legs ?? ''),
            p2Legs: String(m.submitted_player2_legs ?? ''),
            p1Avg: String(m.submitted_player1_average ?? ''),
            p2Avg: String(m.submitted_player2_average ?? ''),
            p1Checkout: String(m.submitted_player1_checkout ?? ''),
            p2Checkout: String(m.submitted_player2_checkout ?? ''),
            p1OneEighties: String(m.submitted_player1_180s ?? ''),
            p2OneEighties: String(m.submitted_player2_180s ?? ''),
            note: '',
          };
        });
        return next;
      });
    }
  }, [supabase]);

  const loadLiveMatches = useCallback(async () => {
    const { data, error } = await supabase.rpc('mod_get_live_matches');
    if (error) throw new Error(error.message);
    if (data) setLiveMatches(data as LiveMatch[]);
  }, [supabase]);

  const loadFlagged = useCallback(async () => {
    const { data, error } = await supabase.rpc('mod_get_flagged_players');
    if (error) throw new Error(error.message);
    if (data) setFlagged(data as FlaggedPlayer[]);
  }, [supabase]);

  const loadLogs = useCallback(async () => {
    const { data, error } = await supabase.rpc('mod_get_logs', { p_limit: 100 });
    if (error) throw new Error(error.message);
    if (data) setLogs(data as ModLog[]);
  }, [supabase]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    setDataError(null);
    const results = await Promise.allSettled([loadTickets(ticketFilter), loadDisputes(), loadLiveMatches(), loadFlagged(), loadLogs()]);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) {
      const message = failed.reason instanceof Error ? failed.reason.message : 'Unbekannter Fehler';
      setDataError(`Moderationsdaten konnten nicht vollständig geladen werden: ${message}`);
    } else {
      setLastRefreshedAt(new Date());
    }
    setIsRefreshing(false);
  }, [loadTickets, loadDisputes, loadLiveMatches, loadFlagged, loadLogs, ticketFilter]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/auth/login'); return; }

        const { data: me, error } = await supabase
          .from('profiles')
          .select('username, is_moderator, is_admin')
          .eq('supabaseId', session.user.id)
          .single();

        if (!mounted) return;
        if (error) throw new Error(error.message);
        if (!me?.is_moderator && !me?.is_admin) {
          setAccessError('Dein Konto hat keine Berechtigung für die Moderation.');
          return;
        }

        setOperatorName(me.username || 'Moderator');
        await refreshAll();
      } catch (error) {
        if (mounted) setAccessError(error instanceof Error ? error.message : 'Die Moderationsoberfläche konnte nicht gestartet werden.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void init();
    return () => { mounted = false; };
  }, [supabase, router, refreshAll]);

  useEffect(() => {
    if (!autoRefresh || loading) return;
    const timer = window.setInterval(() => { void refreshAll(); }, 45_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loading, refreshAll]);

  // ── Ticket Actions ────────────────────────────────────────────────────────

  const loadTicketDetail = async (id: string) => {
    const { data, error } = await supabase.rpc('mod_get_ticket_detail', { p_ticket_id: id });
    if (error) { showToast('Ticket konnte nicht geladen werden: ' + error.message, false); return; }
    if (data) {
      const detail = data as TicketDetail;
      setTicketDetail(detail);
      setTicketNotes((current) => ({ ...current, [id]: current[id] ?? detail.ticket.admin_note ?? '' }));
      setOpenTicketId(id);
    }
  };

  const openTicket = async (id: string) => {
    if (openTicketId === id) { setOpenTicketId(null); setTicketDetail(null); return; }
    await loadTicketDetail(id);
  };

  const refreshTicket = async (ticketId: string) => {
    await refreshAll();
    if (openTicketId === ticketId) await loadTicketDetail(ticketId);
  };

  const sendReply = async (ticketId: string) => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc('mod_send_ticket_reply', { p_ticket_id: ticketId, p_content: reply.trim() });
      if (error) { showToast('Fehler beim Senden: ' + error.message, false); return; }
      setReply('');
      await refreshTicket(ticketId);
      showToast('Antwort gesendet.');
    } catch (error) {
      showToast(error instanceof Error ? `Fehler beim Senden: ${error.message}` : 'Antwort konnte nicht gesendet werden.', false);
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (ticketId: string, status: string) => {
    const { error } = await supabase.rpc('mod_update_ticket', { p_ticket_id: ticketId, p_status: status, p_priority: null, p_note: null });
    if (error) { showToast('Status konnte nicht aktualisiert werden: ' + error.message, false); return; }
    await refreshTicket(ticketId);
    showToast('Status aktualisiert.');
  };

  const updatePriority = async (ticketId: string, priority: string) => {
    const { error } = await supabase.rpc('mod_update_ticket', { p_ticket_id: ticketId, p_status: null, p_priority: priority, p_note: null });
    if (error) { showToast('Priorität konnte nicht aktualisiert werden: ' + error.message, false); return; }
    await refreshTicket(ticketId);
    showToast('Priorität aktualisiert.');
  };

  const saveTicketNote = async (ticketId: string) => {
    const note = ticketNotes[ticketId]?.trim() || '';
    setSavingTicketNoteId(ticketId);
    const { error } = await supabase.rpc('mod_update_ticket', { p_ticket_id: ticketId, p_status: null, p_priority: null, p_note: note });
    setSavingTicketNoteId(null);
    if (error) { showToast('Interne Notiz konnte nicht gespeichert werden: ' + error.message, false); return; }
    await refreshTicket(ticketId);
    showToast(note ? 'Interne Notiz gespeichert.' : 'Interne Notiz entfernt.');
  };

  const claimTicket = async (ticketId: string) => {
    setClaimingTicketId(ticketId);
    const { data, error } = await supabase.rpc('mod_claim_ticket', { p_ticket_id: ticketId });
    setClaimingTicketId(null);
    if (error) { showToast('Ticket konnte nicht übernommen werden: ' + error.message, false); return; }
    await refreshTicket(ticketId);
    const response = data as { message?: string } | null;
    showToast(response?.message || 'Ticket wurde dir zugewiesen.');
  };

  // ── Dispute Actions ───────────────────────────────────────────────────────

  const patchForm = (id: string, patch: Partial<ResolveForm>) => {
    setResolveForms(prev => ({ ...prev, [id]: { ...(prev[id] || {} as ResolveForm), ...patch } }));
  };

  const resolveDispute = async (m: DisputedMatch) => {
    const f = resolveForms[m.match_id];
    const p1OneEighties = toNonNegativeInteger(f?.p1OneEighties ?? '');
    const p2OneEighties = toNonNegativeInteger(f?.p2OneEighties ?? '');
    if (!f?.winnerId || !f.p1Legs || !f.p2Legs || p1OneEighties === null || p2OneEighties === null) { showToast('Bitte Gewinner, Legs und 180er ausfüllen.', false); return; }
    const { error } = await supabase.rpc('mod_resolve_dispute', {
      p_match_id: m.match_id, p_winner_id: f.winnerId,
      p_player1_legs: Number(f.p1Legs), p_player2_legs: Number(f.p2Legs),
      p_player1_average: f.p1Avg ? Number(f.p1Avg) : null,
      p_player2_average: f.p2Avg ? Number(f.p2Avg) : null,
      p_player1_checkout: f.p1Checkout ? Number(f.p1Checkout) : null,
      p_player2_checkout: f.p2Checkout ? Number(f.p2Checkout) : null,
      p_player1_one_eighties: p1OneEighties,
      p_player2_one_eighties: p2OneEighties,
      p_mod_note: f.note || null,
    });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Dispute wurde entschieden.');
    setOpenDispute(null);
    await refreshAll();
  };

  const cancelDispute = async (m: DisputedMatch) => {
    if (pendingCancelDisputeId !== m.match_id) {
      setPendingCancelDisputeId(m.match_id);
      showToast('Bitte bestätige die Annullierung direkt in der Dispute-Karte.', false);
      return;
    }
    const f = resolveForms[m.match_id];
    const { error } = await supabase.rpc('mod_cancel_dispute', {
      p_match_id: m.match_id, p_mod_note: f?.note || null,
    });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Match annulliert.');
    setPendingCancelDisputeId(null);
    setOpenDispute(null);
    await refreshAll();
  };

  // ── Live Match Actions ────────────────────────────────────────────────────

  const cancelMatch = async (matchId: string) => {
    if (pendingCancelMatchId !== matchId) {
      setPendingCancelMatchId(matchId);
      setCancelReason('');
      showToast('Bitte gib optional einen Grund ein und bestätige den Match-Abbruch direkt auf der Seite.', false);
      return;
    }
    const reason = cancelReason.trim() || null;
    const { error } = await supabase.rpc('mod_force_cancel_match', { p_match_id: matchId, p_reason: reason });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Match abgebrochen.');
    setPendingCancelMatchId(null);
    setCancelReason('');
    await refreshAll();
  };

  // ── Flagged Actions ───────────────────────────────────────────────────────

  const warnPlayer = async (playerId: string) => {
    if (!warnReason.trim()) { showToast('Bitte Grund eingeben.', false); return; }
    const { error } = await supabase.rpc('mod_warn_player', { p_player_id: playerId, p_reason: warnReason.trim() });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Warnung wurde protokolliert.');
    setWarnReason('');
    setOpenFlagged(null);
    await refreshAll();
  };

  // ── Counts ────────────────────────────────────────────────────────────────

  const openTicketCount  = tickets.filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'waiting_for_user').length;
  const disputeCount     = disputes.length;
  const liveCount        = liveMatches.length;
  const flaggedCount     = flagged.length;
  const visibleTickets = tickets.filter((ticket) => `${ticket.subject} ${ticket.username} ${ticket.category}`.toLocaleLowerCase('de-DE').includes(ticketSearch.trim().toLocaleLowerCase('de-DE')));

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f0eee8] text-[#151923]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#c9c6bc] border-t-[#2f58d5]" />
          <p className="text-sm font-bold text-stone-500">Moderation wird vorbereitet…</p>
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f5f1] px-5 text-stone-900">
        <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-7 shadow-[0_24px_60px_rgba(36,45,40,.10)]">
          <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-700"><Shield size={21} /></div>
          <h1 className="text-2xl font-black tracking-tight">Moderation nicht verfügbar</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{accessError}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => window.location.reload()} className="rounded-xl bg-[#153f33] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#205542]">Erneut versuchen</button>
            <Link href="/" className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-50">Zur Startseite</Link>
          </div>
        </div>
      </main>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6f5f1] text-stone-900">

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-48 top-12 h-[32rem] w-[32rem] rounded-full bg-[#b8d8b5]/35 blur-3xl" />
        <div className="absolute -right-36 top-1/3 h-[30rem] w-[30rem] rounded-full bg-[#ead9ad]/35 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.32] [background-image:radial-gradient(#c9c6bc_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-bold shadow-xl backdrop-blur-xl transition-all ${
          toast.ok
            ? 'border-emerald-200 bg-white/95 text-emerald-800'
            : 'border-rose-200 bg-white/95 text-rose-800'
        }`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-stone-200/80 bg-[#f6f5f1]/90 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-3.5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-[#153f33] text-[#d5f080] shadow-sm">
              <Shield size={20} />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight text-stone-950 md:text-base">Moderation</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">RankedDarts · Arbeitsbereich</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-stone-600 lg:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {operatorName}
            </div>
            <button onClick={() => setAutoRefresh((enabled) => !enabled)} className={`hidden items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition sm:flex ${autoRefresh ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-white text-stone-400'}`} title={autoRefresh ? 'Automatische Aktualisierung alle 45 Sekunden pausieren' : 'Automatische Aktualisierung alle 45 Sekunden aktivieren'}><span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'animate-pulse bg-emerald-500' : 'bg-stone-400'}`} /> Sync {autoRefresh ? 'an' : 'aus'}</button>
            <button
              onClick={() => void refreshAll()}
              className="grid h-9 w-9 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
              title="Alle Daten aktualisieren"
              disabled={isRefreshing}
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto grid max-w-[1440px] gap-6 px-4 pb-16 pt-20 sm:px-5 lg:grid-cols-[228px_minmax(0,1fr)] lg:px-8 lg:pt-24">
        <aside className="lg:sticky lg:top-[84px] lg:h-[calc(100vh-108px)]">
          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white p-2 shadow-[0_18px_45px_rgba(35,49,42,.08)]">
            <div className="border-b border-stone-100 px-3 py-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-stone-400"><Command size={12} /> Bereiche</div>
            </div>
            <div className="space-y-1 py-2">
              <TabBtn active={tab === 'desk'}     onClick={() => setTab('desk')}     icon={<LayoutDashboard size={16} />} label="Leitstand" />
              <TabBtn active={tab === 'tickets'}  onClick={() => setTab('tickets')}  icon={<Inbox size={16} />} label="Fall-Inbox" badge={openTicketCount} />
              <TabBtn active={tab === 'disputes'} onClick={() => setTab('disputes')} icon={<Gavel size={16} />} label="Disputes" badge={disputeCount} />
              <TabBtn active={tab === 'matches'}  onClick={() => setTab('matches')}  icon={<Radio size={16} />} label="Live Matches" badge={liveCount} />
              <TabBtn active={tab === 'flagged'}  onClick={() => setTab('flagged')}  icon={<BadgeAlert size={16} />} label="Auffälligkeiten" badge={flaggedCount} />
              <TabBtn active={tab === 'logs'}     onClick={() => setTab('logs')}     icon={<ClipboardList size={16} />} label="Audit-Log" />
            </div>
            <div className="mx-2 mt-2 border-t border-stone-100 px-2 py-4 text-[11px] leading-relaxed text-stone-500">
              Entscheidungen werden im Audit-Log gespeichert. Greife nur ein, wenn der Sachverhalt klar ist.
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#2f6b55]"><PanelRightOpen size={13} /> Moderation</div>
              <h1 className="text-3xl font-black tracking-[-0.05em] text-stone-950 sm:text-4xl">
                {tab === 'desk' ? 'Übersicht' : tab === 'tickets' ? 'Tickets' : tab === 'disputes' ? 'Disputes' : tab === 'matches' ? 'Aktive Matches' : tab === 'flagged' ? 'Account-Hinweise' : 'Aktivitäten'}
              </h1>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-[#153f33] px-3 py-2 text-[10px] font-black uppercase tracking-[0.11em] text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d5f080]" /> {lastRefreshedAt ? `Aktualisiert ${lastRefreshedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Live-Daten'}</div>
          </header>

        {dataError && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"><span>{dataError}</span><button onClick={() => void refreshAll()} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition hover:bg-rose-100">Erneut laden</button></div>}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: LEITSTAND
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'desk' && (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl bg-[#153f33] px-6 py-7 text-white shadow-[0_24px_60px_rgba(21,63,51,.16)] sm:px-8">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#d5f080] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#153f33]"><ShieldCheck size={12} /> Arbeitsübersicht</span>
                  <h2 className="mt-5 text-3xl font-black tracking-[-0.06em] sm:text-5xl">Was braucht jetzt deine Aufmerksamkeit?</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75">Prüfe offene Anliegen, Disputes und laufende Matches. Alles Wichtige steht hier an einem Ort – ohne unnötige Ablenkung.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-[360px]">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-50/60">Offen</div><div className="mt-1 text-3xl font-black text-[#d5f080]">{openTicketCount + disputeCount}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-50/60">Live</div><div className="mt-1 text-3xl font-black">{liveCount}</div></div>
                  <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.08] p-4 sm:col-span-1"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-50/60">Hinweise</div><div className="mt-1 text-3xl font-black">{flaggedCount}</div></div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Offene Tickets', value: openTicketCount, sub: 'brauchen eine Antwort', icon: <Inbox size={17} />, tone: 'border border-stone-200 bg-white text-stone-900', marker: 'bg-emerald-500' },
                { label: 'Disputes', value: disputeCount, sub: 'warten auf eine Entscheidung', icon: <Gavel size={17} />, tone: 'border border-stone-200 bg-white text-stone-900', marker: 'bg-rose-500' },
                { label: 'Aktive Matches', value: liveCount, sub: 'sind gerade im Blick', icon: <Radio size={17} />, tone: 'border border-stone-200 bg-white text-stone-900', marker: 'bg-sky-500' },
                { label: 'Hinweise', value: flaggedCount, sub: 'Accounts zur Einordnung', icon: <FileWarning size={17} />, tone: 'border border-stone-200 bg-white text-stone-900', marker: 'bg-amber-500' },
              ].map(item => (
                <button key={item.label} onClick={() => setTab(item.label === 'Offene Tickets' ? 'tickets' : item.label === 'Disputes' ? 'disputes' : item.label === 'Aktive Matches' ? 'matches' : 'flagged')} className={`group relative overflow-hidden rounded-2xl p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${item.tone}`}>
                  <div className={`absolute left-0 top-0 h-1 w-full ${item.marker}`} />
                  <div className="mb-6 opacity-70">{item.icon}</div>
                  <div className="text-5xl font-black tracking-[-0.08em]">{item.value}</div>
                  <div className="mt-1 text-sm font-black uppercase tracking-[-0.02em]">{item.label}</div>
                  <div className="mt-1 text-xs opacity-65">{item.sub}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
              <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_18px_45px_rgba(35,49,42,.08)]">
                <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                  <div>
                    <div className="text-sm font-black tracking-tight text-stone-950">Priorisierte Tickets</div>
                    <div className="mt-0.5 text-xs text-stone-500">Neue und dringende Meldungen zuerst</div>
                  </div>
                  <button onClick={() => setTab('tickets')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#153f33] px-3 py-2 text-xs font-black text-white transition hover:bg-[#205542]">Alle Tickets <ArrowUpRight size={14} /></button>
                </div>
                {tickets.filter(ticket => ticket.status !== 'closed' && ticket.status !== 'resolved').slice(0, 5).length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-stone-500">Keine offenen Tickets.</div>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {tickets.filter(ticket => ticket.status !== 'closed' && ticket.status !== 'resolved').slice(0, 5).map(ticket => {
                      const priority = priorityCfg[ticket.priority] ?? priorityCfg.normal;
                      const status = statusCfg[ticket.status] ?? statusCfg.open;
                      return (
                        <button key={ticket.id} onClick={() => { setTab('tickets'); void openTicket(ticket.id); }} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-stone-50">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-stone-900">{ticket.subject}</span>
                            <span className="mt-1 block truncate text-xs text-stone-500">{ticket.username} · {catLabels[ticket.category] ?? ticket.category} · {timeAgo(ticket.created_at)}</span>
                          </span>
                          <span className={`shrink-0 text-[10px] font-black uppercase tracking-[0.14em] ${priority.cls}`}>{priority.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_18px_45px_rgba(35,49,42,.08)]">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#2f6b55]"><Command size={14} /> Direkt zu</div>
                  <div className="space-y-2">
                    <button onClick={() => setTab('disputes')} className="flex w-full items-center justify-between rounded-xl bg-[#153f33] px-3.5 py-3 text-left text-sm font-bold text-white transition hover:bg-[#205542]"><span>Offene Disputes prüfen</span><span className="font-mono text-[#d5f080]">{disputeCount}</span></button>
                    <button onClick={() => setTab('matches')} className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3.5 py-3 text-left text-sm font-bold text-stone-800 transition hover:bg-stone-50"><span>Laufende Matches überwachen</span><ArrowUpRight size={15} className="text-[#2f6b55]" /></button>
                    <button onClick={() => setTab('flagged')} className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3.5 py-3 text-left text-sm font-bold text-stone-800 transition hover:bg-stone-50"><span>Account-Hinweise sichten</span><ArrowUpRight size={15} className="text-[#2f6b55]" /></button>
                  </div>
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800"><Activity size={14} /> Letzte Aktivitäten</div>
                  {logs.slice(0, 3).length === 0 ? <p className="text-sm text-stone-600">Noch keine dokumentierten Aktionen.</p> : (
                    <div className="space-y-3">
                      {logs.slice(0, 3).map(log => <div key={log.id} className="border-l border-amber-300 pl-3"><div className="truncate text-xs font-bold text-stone-900">{log.action}{log.target_label ? ` · ${log.target_label}` : ''}</div><div className="mt-1 text-[11px] text-stone-600">{log.mod_username} · {timeAgo(log.created_at)}</div></div>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: TICKETS
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'tickets' && (
          <div>
            {/* Filter */}
            <div className="mb-5 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="flex flex-wrap gap-2">
                {[null, 'open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'].map(s => (
                  <button
                    key={s ?? 'all'}
                    onClick={() => {
                      setTicketFilter(s);
                      setOpenTicketId(null);
                      setTicketDetail(null);
                      void loadTickets(s).catch((error: unknown) => {
                        showToast(error instanceof Error ? `Tickets konnten nicht geladen werden: ${error.message}` : 'Tickets konnten nicht geladen werden.', false);
                      });
                    }}
                    className={`border px-4 py-2 text-xs font-bold transition ${
                      ticketFilter === s
                        ? 'border border-[#153f33] bg-[#153f33] text-white'
                        : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950'
                    }`}
                  >
                    {s ? (statusCfg[s]?.label ?? s) : `Alle (${tickets.length})`}
                  </button>
                ))}
              </div>
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-500 shadow-sm xl:w-72"><Command size={14} /><input value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-stone-900 outline-none placeholder:text-stone-400" placeholder="Ticket oder Spieler suchen" /></label>
            </div>

            {visibleTickets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-white/70 py-20 text-center">
                <Headphones size={32} className="text-stone-400" />
                <p className="text-sm font-bold text-stone-500">{tickets.length === 0 ? 'Keine Tickets vorhanden' : 'Keine Tickets für diese Suche gefunden'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleTickets.map(t => {
                  const sc = statusCfg[t.status] ?? statusCfg.open;
                  const pc = priorityCfg[t.priority] ?? priorityCfg.normal;
                  const isOpen = openTicketId === t.id;

                  return (
                    <div key={t.id} className="overflow-hidden rounded-2xl border border-stone-200 border-l-4 border-l-[#2f6b55] bg-white shadow-[0_10px_30px_rgba(35,49,42,.06)]">
                      {/* Ticket-Header */}
                      <button
                        onClick={() => openTicket(t.id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-stone-50"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${sc.cls}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                {sc.label}
                              </span>
                              <span className={`text-xs font-black ${pc.cls}`}>{pc.label}</span>
                              <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] font-bold text-stone-500">
                                {catLabels[t.category] ?? t.category}
                              </span>
                            </div>
                            <div className="text-base font-black text-stone-950">{t.subject}</div>
                            <div className="mt-1 text-xs text-stone-500">
                              von <span className="font-bold text-stone-800">{t.username}</span> · {timeAgo(t.created_at)}
                              {t.message_count > 0 && ` · ${t.message_count} Nachrichten`}
                            </div>
                            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.13em] text-stone-400">{t.assigned_to_username ? `Übernommen von ${t.assigned_to_username}` : 'Noch nicht übernommen'}</div>
                          </div>
                          <div className="shrink-0 text-stone-400">
                            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </div>
                      </button>

                      {/* Ticket-Detail */}
                      {isOpen && ticketDetail && (
                        <div className="border-t border-stone-100 px-6 pb-6 pt-5">
                          {/* Aktionen */}
                          <div className="mb-5 flex flex-wrap gap-3">
                            <button onClick={() => void claimTicket(t.id)} disabled={claimingTicketId === t.id || Boolean(t.assigned_to_id)} title={t.assigned_to_id ? `Bereits übernommen von ${t.assigned_to_username || 'einem Teammitglied'}` : 'Ticket selbst übernehmen'} className="inline-flex items-center gap-2 rounded-xl border border-[#4569df]/40 bg-[#2f58d5]/15 px-3 py-1.5 text-xs font-black text-[#b6c5ff] transition hover:bg-[#2f58d5]/25 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={13} />{claimingTicketId === t.id ? 'Übernimmt …' : t.assigned_to_id ? `Übernommen${t.assigned_to_username ? ` · ${t.assigned_to_username}` : ''}` : 'Mir zuweisen'}</button>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-500">Status:</span>
                              <select
                                value={t.status}
                                onChange={e => updateStatus(t.id, e.target.value)}
                                className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 outline-none"
                              >
                                {Object.entries(statusCfg).map(([k, v]) => (
                                  <option key={k} value={k} className="bg-zinc-950">{v.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-500">Priorität:</span>
                              <select
                                value={t.priority}
                                onChange={e => updatePriority(t.id, e.target.value)}
                                className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 outline-none"
                              >
                                {Object.entries(priorityCfg).map(([k, v]) => (
                                  <option key={k} value={k} className="bg-zinc-950">{v.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="mb-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                            <div className="mb-2 flex items-center justify-between gap-3"><label className="text-[10px] font-black uppercase tracking-[0.17em] text-stone-500">Interne Übergabe-Notiz</label><span className="text-[10px] text-stone-400">Nur Moderation & Admins</span></div>
                            <textarea value={ticketNotes[t.id] ?? ''} onChange={(event) => setTicketNotes((current) => ({ ...current, [t.id]: event.target.value }))} maxLength={1200} rows={2} placeholder="Kontext, nächste Schritte oder Übergabe für das Team …" className={`${inputCls} resize-y`} />
                            <div className="mt-3 flex justify-end"><button onClick={() => void saveTicketNote(t.id)} disabled={savingTicketNoteId === t.id} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.13em] text-stone-700 transition hover:border-stone-300 hover:bg-stone-100 disabled:opacity-50">{savingTicketNoteId === t.id ? 'Speichert …' : 'Notiz speichern'}</button></div>
                          </div>

                          {/* Nachrichten */}
                          <div className="mb-5 max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 p-4">
                            {ticketDetail.messages.map(msg => {
                              const parsed = parseTicketMessageContent(msg.content);
                              return (
                              <div key={msg.id} className={`flex gap-3 ${msg.is_staff ? 'flex-row-reverse' : ''}`}>
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                                  msg.is_staff ? 'bg-[#153f33] text-white' : 'bg-white text-stone-700 border border-stone-200'
                                }`}>
                                  {msg.sender_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                                  msg.is_staff
                                    ? 'rounded-tr-sm border border-[#4569df]/40 bg-[#2f58d5]/25 text-[#edf0ff]'
                                    : 'rounded-tl-sm bg-white border border-stone-200 text-stone-800'
                                }`}>
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className="text-[10px] font-black text-stone-600">{msg.sender_name}</span>
                                    {msg.is_staff && <span className="rounded-md bg-[#2f58d5]/30 px-1.5 py-0.5 text-[9px] font-black text-[#b6c5ff]">MOD</span>}
                                    <span className="text-[10px] text-stone-400">{timeAgo(msg.created_at)}</span>
                                  </div>
                                  <div className="space-y-3">
                                    {parsed.text && <p className="leading-relaxed whitespace-pre-wrap">{parsed.text}</p>}
                                    {parsed.images.length > 0 && (
                                      <div className="grid gap-2">
                                        {parsed.images.map((image) => (
                                          <a key={image.url} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:border-stone-300">
                                            <img src={image.url} alt={ticketImageAlt(image.label)} className="max-h-56 w-full object-cover" />
                                            <div className="truncate px-3 py-2 text-[11px] font-bold text-stone-500">{image.label}</div>
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              );
                            })}
                            {ticketDetail.messages.length === 0 && (
                              <p className="text-center text-xs text-stone-400">Noch keine Nachrichten</p>
                            )}
                          </div>

                          {/* Antwort */}
                          <div className="flex gap-3">
                            <textarea
                              value={reply}
                              onChange={e => setReply(e.target.value)}
                              placeholder="Antwort schreiben…"
                              rows={3}
                              className={`${inputCls} resize-none flex-1`}
                            />
                            <button
                              onClick={() => sendReply(t.id)}
                              disabled={sending || !reply.trim()}
                              className="flex items-center gap-2 self-end rounded-xl bg-[#d68e27] px-5 py-3 text-sm font-black text-[#17120b] transition hover:bg-[#f0b95c] disabled:opacity-40"
                            >
                              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                              Senden
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: DISPUTES
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'disputes' && (
          <div>
            {disputes.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-white/70 py-20 text-center">
                <Gavel size={32} className="text-stone-400" />
                <p className="text-sm font-bold text-stone-500">Keine offenen Disputes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map(m => {
                  const f = resolveForms[m.match_id] ?? {} as ResolveForm;
                  const isOpen = openDispute === m.match_id;

                  return (
                    <div key={m.match_id} className="overflow-hidden rounded-2xl border border-stone-200 border-l-4 border-l-rose-500 bg-white shadow-[0_10px_30px_rgba(35,49,42,.06)]">
                      {/* Header */}
                      <button
                        onClick={() => setOpenDispute(isOpen ? null : m.match_id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-stone-50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                                Dispute
                              </span>
                              <span className="text-xs text-stone-400">{timeAgo(m.created_at)}</span>
                            </div>
                            <div className="text-xl font-black text-stone-950">
                              {m.player1_username} <span className="text-stone-400">vs</span> {m.player2_username}
                            </div>
                            <div className="mt-1 text-xs text-stone-500">
                              Eingereicht von: <span className="font-bold text-stone-800">{m.submitted_by_username ?? '—'}</span>
                              {m.submitted_winner_username && ` · Gewinner lt. Einreichung: ${m.submitted_winner_username}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs text-stone-400">Elo</div>
                              <div className="font-black">{m.player1_elo} vs {m.player2_elo}</div>
                            </div>
                            {isOpen ? <ChevronUp size={18} className="text-stone-400" /> : <ChevronDown size={18} className="text-stone-400" />}
                          </div>
                        </div>
                      </button>

                      {/* Detail */}
                      {isOpen && (
                        <div className="space-y-5 border-t border-stone-100 px-6 pb-6 pt-5">
                          {/* Dispute-Grund */}
                          {m.dispute_reason && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                              <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Dispute-Grund</div>
                              <p className="text-sm text-stone-700">{m.dispute_reason}</p>
                            </div>
                          )}
                          {m.dispute_screenshot_url && (
                            <a href={m.dispute_screenshot_url} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 transition hover:border-stone-300">
                              Screenshot ansehen
                            </a>
                          )}

                          {/* Formular */}
                          <div className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-5">
                            <div className="text-xs font-black uppercase tracking-[0.2em] text-stone-500">Entscheidung treffen</div>

                            {/* Gewinner */}
                            <div>
                              <label className="mb-2 block text-xs font-bold text-stone-500">Gewinner</label>
                              <div className="grid grid-cols-2 gap-3">
                                {[
                                  { id: m.player1_id, name: m.player1_username, elo: m.player1_elo },
                                  { id: m.player2_id, name: m.player2_username, elo: m.player2_elo },
                                ].map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => patchForm(m.match_id, { winnerId: p.id })}
                                    className={`rounded-2xl border p-4 text-left transition ${
                                      f.winnerId === p.id
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                        : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                                    }`}
                                  >
                                    <div className="font-black">{p.name}</div>
                                    <div className="text-xs">{p.elo} Elo</div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Legs */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="mb-1.5 block text-xs font-bold text-stone-500">{m.player1_username} Legs</label>
                                <input type="number" value={f.p1Legs ?? ''} onChange={e => patchForm(m.match_id, { p1Legs: e.target.value })} className={inputCls} placeholder="0" />
                              </div>
                              <div>
                                <label className="mb-1.5 block text-xs font-bold text-stone-500">{m.player2_username} Legs</label>
                                <input type="number" value={f.p2Legs ?? ''} onChange={e => patchForm(m.match_id, { p2Legs: e.target.value })} className={inputCls} placeholder="0" />
                              </div>
                            </div>

                            {/* Averages + Checkouts */}
                            <div className="grid grid-cols-2 gap-3">
                              <input type="number" value={f.p1Avg ?? ''} onChange={e => patchForm(m.match_id, { p1Avg: e.target.value })} className={inputCls} placeholder={`${m.player1_username} Average`} />
                              <input type="number" value={f.p2Avg ?? ''} onChange={e => patchForm(m.match_id, { p2Avg: e.target.value })} className={inputCls} placeholder={`${m.player2_username} Average`} />
                              <input type="number" value={f.p1Checkout ?? ''} onChange={e => patchForm(m.match_id, { p1Checkout: e.target.value })} className={inputCls} placeholder={`${m.player1_username} Checkout`} />
                              <input type="number" value={f.p2Checkout ?? ''} onChange={e => patchForm(m.match_id, { p2Checkout: e.target.value })} className={inputCls} placeholder={`${m.player2_username} Checkout`} />
                              <input type="number" min="0" step="1" inputMode="numeric" value={f.p1OneEighties ?? ''} onChange={e => patchForm(m.match_id, { p1OneEighties: e.target.value })} className={inputCls} placeholder={`${m.player1_username} 180er`} />
                              <input type="number" min="0" step="1" inputMode="numeric" value={f.p2OneEighties ?? ''} onChange={e => patchForm(m.match_id, { p2OneEighties: e.target.value })} className={inputCls} placeholder={`${m.player2_username} 180er`} />
                            </div>

                            {/* Notiz */}
                            <textarea
                              value={f.note ?? ''}
                              onChange={e => patchForm(m.match_id, { note: e.target.value })}
                              placeholder="Moderator-Notiz (optional)"
                              rows={2}
                              className={`${inputCls} resize-none`}
                            />

                            {/* Buttons */}
                            <div className="flex gap-3">
                              <button
                                onClick={() => resolveDispute(m)}
                                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#153f33] px-5 py-3 text-sm font-black text-white transition hover:bg-[#205542]"
                              >
                                <Gavel size={15} /> Entscheiden
                              </button>
                              <button
                                onClick={() => cancelDispute(m)}
                                className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100"
                              >
                                <XCircle size={15} /> {pendingCancelDisputeId === m.match_id ? 'Annullierung bestätigen' : 'Annullieren'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: AKTIVE MATCHES
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'matches' && (
          <div>
            {liveMatches.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-white/70 py-20 text-center">
                <Swords size={32} className="text-stone-400" />
                <p className="text-sm font-bold text-stone-500">Keine aktiven Matches</p>
              </div>
            ) : (
              <div className="space-y-3">
                {liveMatches.map(m => {
                  const sc = matchStatusCfg[m.status] ?? matchStatusCfg.pending_result;
                  const isLong = m.duration_minutes > 60;

                  return (
                    <div key={m.id} className={`overflow-hidden rounded-2xl border border-stone-200 border-l-4 bg-white shadow-[0_10px_30px_rgba(35,49,42,.06)] ${
                      m.status === 'disputed'
                        ? 'border-l-rose-500'
                        : isLong
                          ? 'border-l-amber-500'
                          : 'border-l-[#2f6b55]'
                    }`}>
                      <div className="px-6 py-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${sc.cls}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                                {sc.label}
                              </span>
                              {m.app && (
                                <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] font-bold text-stone-500">
                                  {m.app === 'scolia' ? '📷 Scolia' : m.app === 'autodarts' ? '🎯 AutoDarts' : '📱 DartCounter'}
                                </span>
                              )}
                              {isLong && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
                                  <AlertTriangle size={10} /> Sehr lang
                                </span>
                              )}
                            </div>
                            <div className="text-xl font-black text-stone-950">
                              {m.player1_username} <span className="text-stone-400">vs</span> {m.player2_username}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-stone-500">
                              <span className="flex items-center gap-1"><Timer size={11} /> {m.duration_minutes} Min. aktiv</span>
                              <span>{m.player1_elo} vs {m.player2_elo} Elo</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {pendingCancelMatchId === m.id && <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="w-52 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 outline-none focus:border-rose-300" placeholder="Grund (optional)" />}
                            <button
                              onClick={() => cancelMatch(m.id)}
                              className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                            >
                              <XCircle size={14} /> {pendingCancelMatchId === m.id ? 'Abbruch bestätigen' : 'Match abbrechen'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: VERDÄCHTIGE ACCOUNTS
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'flagged' && (
          <div>
            {flagged.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-white/70 py-20 text-center">
                <ShieldCheck size={32} className="text-stone-400" />
                <p className="text-sm font-bold text-stone-500">Keine auffälligen Accounts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {flagged.map(p => {
                  const isOpen = openFlagged === p.id;
                  return (
                    <div key={p.id} className="overflow-hidden rounded-2xl border border-stone-200 border-l-4 border-l-amber-500 bg-white shadow-[0_10px_30px_rgba(35,49,42,.06)]">
                      <button
                        onClick={() => setOpenFlagged(isOpen ? null : p.id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-stone-50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="mb-2 flex flex-wrap gap-2">
                              {p.flags.map(flag => (
                                <span key={flag} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
                                  <AlertTriangle size={9} /> {flag}
                                </span>
                              ))}
                            </div>
                            <div className="text-xl font-black text-stone-950">{p.username}</div>
                            <div className="mt-1 text-xs text-stone-500">
                              {p.elo} Elo · {p.gamesPlayed} Spiele · {p.winrate}% Winrate · +{p.elo_gain_7d} Elo (7d) · {p.account_age_days} Tage alt
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={18} className="text-stone-400" /> : <ChevronDown size={18} className="text-stone-400" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-stone-100 px-6 pb-6 pt-5">
                          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                              { label: 'Elo', val: p.elo },
                              { label: 'Spiele', val: p.gamesPlayed },
                              { label: 'Siege', val: p.wins },
                              { label: 'Winrate', val: `${p.winrate}%` },
                              { label: 'Elo +7d', val: `+${p.elo_gain_7d}` },
                              { label: 'Account-Alter', val: `${p.account_age_days}d` },
                            ].map(({ label, val }) => (
                              <div key={label} className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-center">
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">{label}</div>
                                <div className="mt-1 text-lg font-black text-stone-950">{val}</div>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-3">
                            <input
                              type="text"
                              value={warnReason}
                              onChange={e => setWarnReason(e.target.value)}
                              placeholder="Warn-Grund eingeben…"
                              className={`${inputCls} flex-1`}
                            />
                            <button
                              onClick={() => warnPlayer(p.id)}
                              className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-100"
                            >
                              <AlertTriangle size={14} /> Warnen
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-stone-500">Die Warnung wird dem Spieler in der Benachrichtigungszentrale zugestellt und im Aktivitätsprotokoll festgehalten. Sperren bleiben Admins vorbehalten.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: MOD-LOGS
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'logs' && (
          <div>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-white/70 py-20 text-center">
                <ClipboardList size={32} className="text-stone-400" />
                <p className="text-sm font-bold text-stone-500">Noch keine Moderationsaktionen</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_10px_30px_rgba(35,49,42,.06)]">
                <div className="divide-y divide-stone-100">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-start gap-4 px-6 py-4">
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#2f6b55]">
                        <Activity size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-stone-900">{log.mod_username}</span>
                          <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-800">{log.action}</span>
                          {log.target_label && <span className="text-xs text-stone-500">→ {log.target_label}</span>}
                        </div>
                        {log.details && <p className="mt-0.5 text-xs text-stone-500">{log.details}</p>}
                      </div>
                      <div className="shrink-0 text-xs text-stone-400">{timeAgo(log.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </section>
      </div>
    </main>
  );
}
