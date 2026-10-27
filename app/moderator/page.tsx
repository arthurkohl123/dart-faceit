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
  open:             { label: 'Offen',          cls: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200', dot: 'bg-emerald-300' },
  in_progress:      { label: 'In Bearbeitung', cls: 'border-sky-300/20 bg-sky-300/10 text-sky-200',             dot: 'bg-sky-300' },
  waiting_for_user: { label: 'Warte auf User', cls: 'border-amber-300/20 bg-amber-300/10 text-amber-200',       dot: 'bg-amber-300' },
  resolved:         { label: 'Gelöst',         cls: 'border-white/10 bg-white/[0.06] text-[#bed0c8]',           dot: 'bg-[#9eb6aa]' },
  closed:           { label: 'Geschlossen',    cls: 'border-white/10 bg-white/[0.035] text-[#82988e]',           dot: 'bg-[#70877c]' },
};

const priorityCfg: Record<string, { label: string; cls: string }> = {
  low:    { label: 'Niedrig', cls: 'text-[#82988e]' },
  normal: { label: 'Normal',  cls: 'text-[#b8cbc2]' },
  high:   { label: 'Hoch',    cls: 'text-amber-200' },
  urgent: { label: 'Dringend',cls: 'text-rose-300' },
};

const catLabels: Record<string, string> = {
  general: 'Allgemein', bug: 'Bug', account: 'Account',
  match_dispute: 'Match-Streit', ban_appeal: 'Ban-Einspruch', other: 'Sonstiges',
};

const matchStatusCfg: Record<string, { label: string; cls: string }> = {
  pending_result:        { label: 'Läuft',        cls: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' },
  awaiting_confirmation: { label: 'Bestätigung',  cls: 'border-amber-300/20 bg-amber-300/10 text-amber-200' },
  disputed:              { label: 'Dispute',      cls: 'border-rose-300/20 bg-rose-300/10 text-rose-200' },
};

const inputCls = 'w-full rounded-xl border border-white/10 bg-[#061511]/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#779286] focus:border-[#b8ff8b]/60 focus:ring-4 focus:ring-[#b8ff8b]/10';

const opsCardCls = 'rounded-[1.4rem] border border-white/10 bg-[#0e2b23]/85 shadow-[0_16px_42px_rgba(0,0,0,.16)]';
const opsEmptyCls = 'flex flex-col items-center gap-3 rounded-[1.4rem] border border-dashed border-white/15 bg-[#0e2b23]/45 py-20 text-center';

const viewMeta = {
  desk: {
    kicker: 'Live-Überblick',
    title: 'Einsatzleitzentrale',
    description: 'Prioritäten, Spielbetrieb und Fälle in einem ruhigen Arbeitsbereich.',
  },
  tickets: {
    kicker: 'Fallbearbeitung',
    title: 'Fall-Inbox',
    description: 'Übernimm Fälle klar sichtbar, halte den Kontext fest und gib Spielern verlässliche Antworten.',
  },
  disputes: {
    kicker: 'Entscheidungen',
    title: 'Dispute-Desk',
    description: 'Prüfe die Fakten sorgfältig. Jede Entscheidung bleibt für das Team nachvollziehbar.',
  },
  matches: {
    kicker: 'Spielbetrieb',
    title: 'Live-Monitor',
    description: 'Behalte laufende Matches im Blick und greife nur ein, wenn ein klarer Anlass besteht.',
  },
  flagged: {
    kicker: 'Fair Play',
    title: 'Account-Hinweise',
    description: 'Hinweise sind kein Urteil. Nutze sie als Anlass zur sorgfältigen, fairen Prüfung.',
  },
  logs: {
    kicker: 'Nachvollziehbarkeit',
    title: 'Team-Aktivität',
    description: 'Alle Moderationsmaßnahmen bleiben transparent und für das Team nachvollziehbar.',
  },
} as const;

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
      aria-current={active ? 'page' : undefined}
      className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-bold transition-all ${
        active
          ? 'bg-gradient-to-r from-[#d4ff9a] to-[#8ee5bf] text-[#072118] shadow-[0_10px_28px_rgba(154,255,197,.18)]'
          : 'text-[#a9bbb4] hover:bg-white/[0.07] hover:text-white'
      }`}
    >
      <span className={active ? 'text-[#072118]' : 'text-[#6f9185] group-hover:text-[#b8f2d5]'}>{icon}</span>
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className={`ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1.5 text-[10px] font-black ${
          active ? 'bg-[#072118]/10 text-[#072118]' : 'bg-white/10 text-[#d7eee3]'
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
  const currentView = viewMeta[tab];

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#061511] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-[#b8ff8b]" />
          <p className="text-sm font-bold text-[#b6cec4]">Moderation wird vorbereitet…</p>
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#061511] px-5 text-white">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0d251f] p-7 shadow-[0_24px_80px_rgba(0,0,0,.35)]">
          <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-rose-400/10 text-rose-300"><Shield size={21} /></div>
          <h1 className="text-2xl font-black tracking-tight">Moderation nicht verfügbar</h1>
          <p className="mt-3 text-sm leading-6 text-[#b6cec4]">{accessError}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => window.location.reload()} className="rounded-xl bg-[#b8ff8b] px-4 py-2.5 text-sm font-bold text-[#072118] transition hover:bg-[#d2ffb7]">Erneut versuchen</button>
            <Link href="/" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-[#d8ebe2] transition hover:bg-white/5">Zur Startseite</Link>
          </div>
        </div>
      </main>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#061511] text-white">

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-48 top-12 h-[32rem] w-[32rem] rounded-full bg-[#29c985]/20 blur-3xl" />
        <div className="absolute -right-36 top-1/3 h-[30rem] w-[30rem] rounded-full bg-[#0da4a8]/20 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(154,255,197,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(154,255,197,.18)_1px,transparent_1px)] [background-size:46px_46px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-bold shadow-2xl backdrop-blur-xl transition-all ${
          toast.ok
            ? 'border-emerald-300/30 bg-[#0e2b23]/95 text-[#b8ff8b]'
            : 'border-rose-300/30 bg-[#32151a]/95 text-rose-100'
        }`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#061511]/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between px-5 py-3.5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-2xl border border-[#b8ff8b]/30 bg-gradient-to-br from-[#173c31] to-[#0a1714] text-[#b8ff8b] shadow-[0_8px_24px_rgba(0,0,0,.25)]">
              <Shield size={20} />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight text-white md:text-base">Moderator Ops</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#82a99b]">RankedDarts · Einsatzsystem</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#d6ebe1] lg:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8ff8b]" /> {operatorName}
            </div>
            <button onClick={() => setAutoRefresh((enabled) => !enabled)} className={`hidden items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition sm:flex ${autoRefresh ? 'border-[#b8ff8b]/25 bg-[#b8ff8b]/10 text-[#d8ffc0]' : 'border-white/10 bg-white/[0.045] text-[#839c92]'}`} title={autoRefresh ? 'Automatische Aktualisierung alle 45 Sekunden pausieren' : 'Automatische Aktualisierung alle 45 Sekunden aktivieren'}><span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'animate-pulse bg-[#b8ff8b]' : 'bg-[#839c92]'}`} /> Sync {autoRefresh ? 'an' : 'aus'}</button>
            <button
              onClick={() => void refreshAll()}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-[#b5cfc4] transition hover:border-[#b8ff8b]/30 hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
              title="Alle Daten aktualisieren"
              disabled={isRefreshing}
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto grid max-w-[1540px] gap-5 px-4 pb-16 pt-20 sm:px-5 lg:grid-cols-[252px_minmax(0,1fr)] lg:px-8 lg:pt-24">
        <aside className="lg:sticky lg:top-[84px] lg:h-[calc(100vh-108px)]">
          <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a211b]/90 p-2 shadow-[0_24px_70px_rgba(0,0,0,.24)] backdrop-blur-xl">
            <div className="border-b border-white/10 px-3 py-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#80a899]"><Command size={12} /> Arbeitsbereiche</div>
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-white"><span className="grid h-6 w-6 place-items-center rounded-lg bg-[#b8ff8b] text-[#072118]"><ShieldCheck size={13} /></span> Moderation bereit</div>
            </div>
            <div className="space-y-1 py-2">
              <TabBtn active={tab === 'desk'}     onClick={() => setTab('desk')}     icon={<LayoutDashboard size={16} />} label="Leitstand" />
              <TabBtn active={tab === 'tickets'}  onClick={() => setTab('tickets')}  icon={<Inbox size={16} />} label="Fall-Inbox" badge={openTicketCount} />
              <TabBtn active={tab === 'disputes'} onClick={() => setTab('disputes')} icon={<Gavel size={16} />} label="Disputes" badge={disputeCount} />
              <TabBtn active={tab === 'matches'}  onClick={() => setTab('matches')}  icon={<Radio size={16} />} label="Live Matches" badge={liveCount} />
              <TabBtn active={tab === 'flagged'}  onClick={() => setTab('flagged')}  icon={<BadgeAlert size={16} />} label="Auffälligkeiten" badge={flaggedCount} />
              <TabBtn active={tab === 'logs'}     onClick={() => setTab('logs')}     icon={<ClipboardList size={16} />} label="Audit-Log" />
            </div>
            <div className="mt-auto space-y-3 px-2 pb-2 pt-4">
              <div className="rounded-2xl border border-[#b8ff8b]/15 bg-[#b8ff8b]/[0.06] p-3">
                <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-[#b8ff8b]"><span>Schichtstatus</span><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8ff8b]" /></div>
                <div className="mt-2 truncate text-sm font-black text-white">{operatorName}</div>
                <div className="mt-1 text-[11px] text-[#9eb8ad]">{autoRefresh ? 'Live-Sync alle 45 Sekunden' : 'Live-Sync pausiert'}</div>
              </div>
              <div className="border-t border-white/10 px-1 pt-3 text-[11px] leading-relaxed text-[#8ea79d]">
                Entscheidungen werden protokolliert. Greife nur ein, wenn der Sachverhalt klar ist.
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 rounded-[2rem] border border-white/10 bg-[#0a211b]/80 p-3 shadow-[0_24px_70px_rgba(0,0,0,.20)] backdrop-blur-xl sm:p-5">
          <header className="relative mb-5 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0e2b23] px-5 py-6 sm:px-7">
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(120deg,transparent_0%,rgba(184,255,139,.13)_50%,transparent_100%)]" />
            <div className="relative flex flex-wrap items-end justify-between gap-5">
              <div className="max-w-2xl">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#b8ff8b]"><PanelRightOpen size={13} /> {currentView.kicker}</div>
                <h1 className="text-3xl font-black tracking-[-0.055em] text-white sm:text-4xl">{currentView.title}</h1>
                <p className="mt-2 text-sm leading-6 text-[#a6c5b8]">{currentView.description}</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#b8ff8b]/20 bg-[#061511]/55 px-3 py-2 text-[10px] font-black uppercase tracking-[0.11em] text-[#d8ffc0]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8ff8b]" /> {lastRefreshedAt ? `Stand ${lastRefreshedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Live-Daten'}</div>
            </div>
          </header>

        {dataError && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-semibold text-rose-100"><span>{dataError}</span><button onClick={() => void refreshAll()} className="shrink-0 rounded-lg border border-rose-200/30 bg-[#31171c] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition hover:bg-rose-300/15">Erneut laden</button></div>}

        {/* ══════════════════════════════════════════════════════════════════
            TAB: LEITSTAND
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'desk' && (
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-[1.6rem] border border-[#b8ff8b]/15 bg-[linear-gradient(130deg,#123a2e_0%,#0c241d_52%,#081814_100%)] px-6 py-7 text-white shadow-[0_24px_60px_rgba(0,0,0,.25)] sm:px-8">
              <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-[#b8ff8b]/20" />
              <div className="pointer-events-none absolute -right-6 top-8 h-44 w-44 rounded-full border border-[#b8ff8b]/10" />
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#b8ff8b]/25 bg-[#b8ff8b]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#d8ffc0]"><ShieldCheck size={12} /> Arbeitsübersicht</span>
                  <h2 className="mt-5 text-3xl font-black tracking-[-0.06em] sm:text-5xl">Was braucht jetzt deine Aufmerksamkeit?</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a6c5b8]">Prüfe offene Anliegen, Disputes und laufende Matches. Alles Wichtige steht hier an einem Ort – ohne unnötige Ablenkung.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-[360px]">
                  <div className="rounded-2xl border border-white/10 bg-[#061511]/45 p-4 backdrop-blur"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8fab9f]">Offen</div><div className="mt-1 text-3xl font-black text-[#b8ff8b]">{openTicketCount + disputeCount}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-[#061511]/45 p-4 backdrop-blur"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8fab9f]">Live</div><div className="mt-1 text-3xl font-black">{liveCount}</div></div>
                  <div className="col-span-2 rounded-2xl border border-white/10 bg-[#061511]/45 p-4 backdrop-blur sm:col-span-1"><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8fab9f]">Hinweise</div><div className="mt-1 text-3xl font-black">{flaggedCount}</div></div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Offene Tickets', value: openTicketCount, sub: 'brauchen eine Antwort', icon: <Inbox size={17} />, tone: 'border border-white/10 bg-[#0e2b23] text-white', marker: 'bg-[#b8ff8b]' },
                { label: 'Disputes', value: disputeCount, sub: 'warten auf eine Entscheidung', icon: <Gavel size={17} />, tone: 'border border-white/10 bg-[#0e2b23] text-white', marker: 'bg-rose-300' },
                { label: 'Aktive Matches', value: liveCount, sub: 'sind gerade im Blick', icon: <Radio size={17} />, tone: 'border border-white/10 bg-[#0e2b23] text-white', marker: 'bg-sky-300' },
                { label: 'Hinweise', value: flaggedCount, sub: 'Accounts zur Einordnung', icon: <FileWarning size={17} />, tone: 'border border-white/10 bg-[#0e2b23] text-white', marker: 'bg-amber-300' },
              ].map(item => (
                <button key={item.label} onClick={() => setTab(item.label === 'Offene Tickets' ? 'tickets' : item.label === 'Disputes' ? 'disputes' : item.label === 'Aktive Matches' ? 'matches' : 'flagged')} className={`group relative overflow-hidden rounded-[1.35rem] p-5 text-left shadow-[0_14px_35px_rgba(0,0,0,.12)] transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_42px_rgba(0,0,0,.22)] ${item.tone}`}>
                  <div className={`absolute left-0 top-0 h-1 w-full ${item.marker}`} />
                  <div className="mb-6 text-[#9dd6bd]">{item.icon}</div>
                  <div className="text-5xl font-black tracking-[-0.08em]">{item.value}</div>
                  <div className="mt-1 text-sm font-black uppercase tracking-[-0.02em]">{item.label}</div>
                  <div className="mt-1 text-xs text-[#8fab9f]">{item.sub}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
              <div className={`overflow-hidden ${opsCardCls}`}>
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <div className="text-sm font-black tracking-tight text-white">Priorisierte Tickets</div>
                    <div className="mt-0.5 text-xs text-[#8fab9f]">Neue und dringende Meldungen zuerst</div>
                  </div>
                  <button onClick={() => setTab('tickets')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#b8ff8b] px-3 py-2 text-xs font-black text-[#072118] transition hover:bg-[#d2ffb7]">Alle Tickets <ArrowUpRight size={14} /></button>
                </div>
                {tickets.filter(ticket => ticket.status !== 'closed' && ticket.status !== 'resolved').slice(0, 5).length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-[#8fab9f]">Keine offenen Tickets.</div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {tickets.filter(ticket => ticket.status !== 'closed' && ticket.status !== 'resolved').slice(0, 5).map(ticket => {
                      const priority = priorityCfg[ticket.priority] ?? priorityCfg.normal;
                      const status = statusCfg[ticket.status] ?? statusCfg.open;
                      return (
                        <button key={ticket.id} onClick={() => { setTab('tickets'); void openTicket(ticket.id); }} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.045]">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-white">{ticket.subject}</span>
                            <span className="mt-1 block truncate text-xs text-[#8fab9f]">{ticket.username} · {catLabels[ticket.category] ?? ticket.category} · {timeAgo(ticket.created_at)}</span>
                          </span>
                          <span className={`shrink-0 text-[10px] font-black uppercase tracking-[0.14em] ${priority.cls}`}>{priority.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div className={`${opsCardCls} p-5`}>
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#b8ff8b]"><Command size={14} /> Direkt zu</div>
                  <div className="space-y-2">
                    <button onClick={() => setTab('disputes')} className="flex w-full items-center justify-between rounded-xl bg-[#b8ff8b] px-3.5 py-3 text-left text-sm font-bold text-[#072118] transition hover:bg-[#d2ffb7]"><span>Offene Disputes prüfen</span><span className="font-mono">{disputeCount}</span></button>
                    <button onClick={() => setTab('matches')} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-3 text-left text-sm font-bold text-[#d6ebe1] transition hover:bg-white/[0.07]"><span>Laufende Matches überwachen</span><ArrowUpRight size={15} className="text-[#b8ff8b]" /></button>
                    <button onClick={() => setTab('flagged')} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-3 text-left text-sm font-bold text-[#d6ebe1] transition hover:bg-white/[0.07]"><span>Account-Hinweise sichten</span><ArrowUpRight size={15} className="text-[#b8ff8b]" /></button>
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-amber-300/15 bg-amber-300/[0.065] p-5">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-200"><Activity size={14} /> Letzte Aktivitäten</div>
                  {logs.slice(0, 3).length === 0 ? <p className="text-sm text-[#b8cbc2]">Noch keine dokumentierten Aktionen.</p> : (
                    <div className="space-y-3">
                      {logs.slice(0, 3).map(log => <div key={log.id} className="border-l border-amber-300/40 pl-3"><div className="truncate text-xs font-bold text-white">{log.action}{log.target_label ? ` · ${log.target_label}` : ''}</div><div className="mt-1 text-[11px] text-[#b8cbc2]">{log.mod_username} · {timeAgo(log.created_at)}</div></div>)}
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
                        ? 'border border-[#b8ff8b]/40 bg-[#b8ff8b] text-[#072118]'
                        : 'border-white/10 bg-[#0e2b23] text-[#a9bbb4] hover:border-white/20 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    {s ? (statusCfg[s]?.label ?? s) : `Alle (${tickets.length})`}
                  </button>
                ))}
              </div>
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-[#0e2b23] px-3 py-2 text-[#8fab9f] shadow-sm xl:w-72"><Command size={14} /><input value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none placeholder:text-[#779286]" placeholder="Ticket oder Spieler suchen" /></label>
            </div>

            {visibleTickets.length === 0 ? (
              <div className={opsEmptyCls}>
                <Headphones size={32} className="text-[#779286]" />
                <p className="text-sm font-bold text-[#a9bbb4]">{tickets.length === 0 ? 'Keine Tickets vorhanden' : 'Keine Tickets für diese Suche gefunden'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleTickets.map(t => {
                  const sc = statusCfg[t.status] ?? statusCfg.open;
                  const pc = priorityCfg[t.priority] ?? priorityCfg.normal;
                  const isOpen = openTicketId === t.id;

                  return (
                    <div key={t.id} className="overflow-hidden rounded-[1.35rem] border border-white/10 border-l-4 border-l-[#b8ff8b] bg-[#0e2b23] shadow-[0_12px_32px_rgba(0,0,0,.14)]">
                      {/* Ticket-Header */}
                      <button
                        onClick={() => openTicket(t.id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-white/[0.045]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${sc.cls}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                {sc.label}
                              </span>
                              <span className={`text-xs font-black ${pc.cls}`}>{pc.label}</span>
                              <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold text-[#9eb8ad]">
                                {catLabels[t.category] ?? t.category}
                              </span>
                            </div>
                            <div className="text-base font-black text-white">{t.subject}</div>
                            <div className="mt-1 text-xs text-[#9eb8ad]">
                              von <span className="font-bold text-[#e6f4ed]">{t.username}</span> · {timeAgo(t.created_at)}
                              {t.message_count > 0 && ` · ${t.message_count} Nachrichten`}
                            </div>
                            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#779286]">{t.assigned_to_username ? `Übernommen von ${t.assigned_to_username}` : 'Noch nicht übernommen'}</div>
                          </div>
                          <div className="shrink-0 text-[#779286]">
                            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </div>
                      </button>

                      {/* Ticket-Detail */}
                      {isOpen && ticketDetail && (
                        <div className="border-t border-white/10 px-6 pb-6 pt-5">
                          {/* Aktionen */}
                          <div className="mb-5 flex flex-wrap gap-3">
                            <button onClick={() => void claimTicket(t.id)} disabled={claimingTicketId === t.id || Boolean(t.assigned_to_id)} title={t.assigned_to_id ? `Bereits übernommen von ${t.assigned_to_username || 'einem Teammitglied'}` : 'Ticket selbst übernehmen'} className="inline-flex items-center gap-2 rounded-xl border border-[#4569df]/40 bg-[#2f58d5]/15 px-3 py-1.5 text-xs font-black text-[#b6c5ff] transition hover:bg-[#2f58d5]/25 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={13} />{claimingTicketId === t.id ? 'Übernimmt …' : t.assigned_to_id ? `Übernommen${t.assigned_to_username ? ` · ${t.assigned_to_username}` : ''}` : 'Mir zuweisen'}</button>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#9eb8ad]">Status:</span>
                              <select
                                value={t.status}
                                onChange={e => updateStatus(t.id, e.target.value)}
                                className="rounded-xl border border-white/10 bg-[#061511] px-3 py-1.5 text-xs font-bold text-white outline-none"
                              >
                                {Object.entries(statusCfg).map(([k, v]) => (
                                  <option key={k} value={k} className="bg-zinc-950">{v.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#9eb8ad]">Priorität:</span>
                              <select
                                value={t.priority}
                                onChange={e => updatePriority(t.id, e.target.value)}
                                className="rounded-xl border border-white/10 bg-[#061511] px-3 py-1.5 text-xs font-bold text-white outline-none"
                              >
                                {Object.entries(priorityCfg).map(([k, v]) => (
                                  <option key={k} value={k} className="bg-zinc-950">{v.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="mb-5 rounded-2xl border border-white/10 bg-[#061511]/45 p-4">
                            <div className="mb-2 flex items-center justify-between gap-3"><label className="text-[10px] font-black uppercase tracking-[0.17em] text-[#9eb8ad]">Interne Übergabe-Notiz</label><span className="text-[10px] text-[#779286]">Nur Moderation & Admins</span></div>
                            <textarea value={ticketNotes[t.id] ?? ''} onChange={(event) => setTicketNotes((current) => ({ ...current, [t.id]: event.target.value }))} maxLength={1200} rows={2} placeholder="Kontext, nächste Schritte oder Übergabe für das Team …" className={`${inputCls} resize-y`} />
                            <div className="mt-3 flex justify-end"><button onClick={() => void saveTicketNote(t.id)} disabled={savingTicketNoteId === t.id} className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-[10px] font-black uppercase tracking-[0.13em] text-[#d6ebe1] transition hover:border-[#b8ff8b]/30 hover:bg-white/[0.1] disabled:opacity-50">{savingTicketNoteId === t.id ? 'Speichert …' : 'Notiz speichern'}</button></div>
                          </div>

                          {/* Nachrichten */}
                          <div className="mb-5 max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-[#061511]/45 p-4">
                            {ticketDetail.messages.map(msg => {
                              const parsed = parseTicketMessageContent(msg.content);
                              return (
                              <div key={msg.id} className={`flex gap-3 ${msg.is_staff ? 'flex-row-reverse' : ''}`}>
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                                  msg.is_staff ? 'bg-[#b8ff8b] text-[#072118]' : 'border border-white/10 bg-[#0e2b23] text-[#d6ebe1]'
                                }`}>
                                  {msg.sender_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                                  msg.is_staff
                                    ? 'rounded-tr-sm border border-[#b8ff8b]/25 bg-[#b8ff8b]/10 text-[#e6f8df]'
                                    : 'rounded-tl-sm border border-white/10 bg-[#0e2b23] text-[#d6ebe1]'
                                }`}>
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className="text-[10px] font-black text-[#d6ebe1]">{msg.sender_name}</span>
                                    {msg.is_staff && <span className="rounded-md bg-[#b8ff8b]/15 px-1.5 py-0.5 text-[9px] font-black text-[#d8ffc0]">MOD</span>}
                                    <span className="text-[10px] text-[#779286]">{timeAgo(msg.created_at)}</span>
                                  </div>
                                  <div className="space-y-3">
                                    {parsed.text && <p className="leading-relaxed whitespace-pre-wrap">{parsed.text}</p>}
                                    {parsed.images.length > 0 && (
                                      <div className="grid gap-2">
                                        {parsed.images.map((image) => (
                                          <a key={image.url} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10 bg-[#061511] transition hover:border-[#b8ff8b]/30">
                                            <img src={image.url} alt={ticketImageAlt(image.label)} className="max-h-56 w-full object-cover" />
                                            <div className="truncate px-3 py-2 text-[11px] font-bold text-[#9eb8ad]">{image.label}</div>
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
                              <p className="text-center text-xs text-[#779286]">Noch keine Nachrichten</p>
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
                              className="flex items-center gap-2 self-end rounded-xl bg-[#b8ff8b] px-5 py-3 text-sm font-black text-[#072118] transition hover:bg-[#d2ffb7] disabled:opacity-40"
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
              <div className={opsEmptyCls}>
                <Gavel size={32} className="text-[#779286]" />
                <p className="text-sm font-bold text-[#a9bbb4]">Keine offenen Disputes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map(m => {
                  const f = resolveForms[m.match_id] ?? {} as ResolveForm;
                  const isOpen = openDispute === m.match_id;

                  return (
                    <div key={m.match_id} className="overflow-hidden rounded-[1.35rem] border border-white/10 border-l-4 border-l-rose-300 bg-[#0e2b23] shadow-[0_12px_32px_rgba(0,0,0,.14)]">
                      {/* Header */}
                      <button
                        onClick={() => setOpenDispute(isOpen ? null : m.match_id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-white/[0.045]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-xs font-black text-rose-200">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300" />
                                Dispute
                              </span>
                              <span className="text-xs text-[#779286]">{timeAgo(m.created_at)}</span>
                            </div>
                            <div className="text-xl font-black text-white">
                              {m.player1_username} <span className="text-[#779286]">vs</span> {m.player2_username}
                            </div>
                            <div className="mt-1 text-xs text-[#9eb8ad]">
                              Eingereicht von: <span className="font-bold text-[#e6f4ed]">{m.submitted_by_username ?? '—'}</span>
                              {m.submitted_winner_username && ` · Gewinner lt. Einreichung: ${m.submitted_winner_username}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs text-[#779286]">Elo</div>
                              <div className="font-black">{m.player1_elo} vs {m.player2_elo}</div>
                            </div>
                            {isOpen ? <ChevronUp size={18} className="text-[#779286]" /> : <ChevronDown size={18} className="text-[#779286]" />}
                          </div>
                        </div>
                      </button>

                      {/* Detail */}
                      {isOpen && (
                        <div className="space-y-5 border-t border-white/10 px-6 pb-6 pt-5">
                          {/* Dispute-Grund */}
                          {m.dispute_reason && (
                            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
                              <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Dispute-Grund</div>
                              <p className="text-sm text-[#e8d8aa]">{m.dispute_reason}</p>
                            </div>
                          )}
                          {m.dispute_screenshot_url && (
                            <a href={m.dispute_screenshot_url} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-bold text-[#d6ebe1] transition hover:border-[#b8ff8b]/30 hover:bg-white/[0.08]">
                              Screenshot ansehen
                            </a>
                          )}

                          {/* Formular */}
                          <div className="space-y-4 rounded-2xl border border-white/10 bg-[#061511]/45 p-5">
                            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#9eb8ad]">Entscheidung treffen</div>

                            {/* Gewinner */}
                            <div>
                              <label className="mb-2 block text-xs font-bold text-[#9eb8ad]">Gewinner</label>
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
                                        ? 'border-[#b8ff8b]/50 bg-[#b8ff8b]/15 text-[#d8ffc0]'
                                        : 'border-white/10 bg-[#0e2b23] text-[#b8cbc2] hover:border-white/20'
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
                                <label className="mb-1.5 block text-xs font-bold text-[#9eb8ad]">{m.player1_username} Legs</label>
                                <input type="number" value={f.p1Legs ?? ''} onChange={e => patchForm(m.match_id, { p1Legs: e.target.value })} className={inputCls} placeholder="0" />
                              </div>
                              <div>
                                <label className="mb-1.5 block text-xs font-bold text-[#9eb8ad]">{m.player2_username} Legs</label>
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
                                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#b8ff8b] px-5 py-3 text-sm font-black text-[#072118] transition hover:bg-[#d2ffb7]"
                              >
                                <Gavel size={15} /> Entscheiden
                              </button>
                              <button
                                onClick={() => cancelDispute(m)}
                                className="flex items-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-300/10 px-5 py-3 text-sm font-black text-rose-200 transition hover:bg-rose-300/15"
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
              <div className={opsEmptyCls}>
                <Swords size={32} className="text-[#779286]" />
                <p className="text-sm font-bold text-[#a9bbb4]">Keine aktiven Matches</p>
              </div>
            ) : (
              <div className="space-y-3">
                {liveMatches.map(m => {
                  const sc = matchStatusCfg[m.status] ?? matchStatusCfg.pending_result;
                  const isLong = m.duration_minutes > 60;

                  return (
                    <div key={m.id} className={`overflow-hidden rounded-[1.35rem] border border-white/10 border-l-4 bg-[#0e2b23] shadow-[0_12px_32px_rgba(0,0,0,.14)] ${
                      m.status === 'disputed'
                          ? 'border-l-rose-300'
                        : isLong
                          ? 'border-l-amber-300'
                          : 'border-l-[#b8ff8b]'
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
                                <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold text-[#9eb8ad]">
                                  {m.app === 'scolia' ? '📷 Scolia' : m.app === 'autodarts' ? '🎯 AutoDarts' : '📱 DartCounter'}
                                </span>
                              )}
                              {isLong && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black text-amber-200">
                                  <AlertTriangle size={10} /> Sehr lang
                                </span>
                              )}
                            </div>
                            <div className="text-xl font-black text-white">
                              {m.player1_username} <span className="text-[#779286]">vs</span> {m.player2_username}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-[#9eb8ad]">
                              <span className="flex items-center gap-1"><Timer size={11} /> {m.duration_minutes} Min. aktiv</span>
                              <span>{m.player1_elo} vs {m.player2_elo} Elo</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {pendingCancelMatchId === m.id && <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="w-52 rounded-xl border border-rose-300/25 bg-[#061511] px-3 py-2 text-xs text-white outline-none placeholder:text-[#779286] focus:border-rose-300" placeholder="Grund (optional)" />}
                            <button
                              onClick={() => cancelMatch(m.id)}
                              className="flex items-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-2.5 text-xs font-black text-rose-200 transition hover:bg-rose-300/15"
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
              <div className={opsEmptyCls}>
                <ShieldCheck size={32} className="text-[#779286]" />
                <p className="text-sm font-bold text-[#a9bbb4]">Keine auffälligen Accounts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {flagged.map(p => {
                  const isOpen = openFlagged === p.id;
                  return (
                    <div key={p.id} className="overflow-hidden rounded-[1.35rem] border border-white/10 border-l-4 border-l-amber-300 bg-[#0e2b23] shadow-[0_12px_32px_rgba(0,0,0,.14)]">
                      <button
                        onClick={() => setOpenFlagged(isOpen ? null : p.id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-white/[0.045]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="mb-2 flex flex-wrap gap-2">
                              {p.flags.map(flag => (
                                <span key={flag} className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black text-amber-200">
                                  <AlertTriangle size={9} /> {flag}
                                </span>
                              ))}
                            </div>
                            <div className="text-xl font-black text-white">{p.username}</div>
                            <div className="mt-1 text-xs text-[#9eb8ad]">
                              {p.elo} Elo · {p.gamesPlayed} Spiele · {p.winrate}% Winrate · +{p.elo_gain_7d} Elo (7d) · {p.account_age_days} Tage alt
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={18} className="text-[#779286]" /> : <ChevronDown size={18} className="text-[#779286]" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-white/10 px-6 pb-6 pt-5">
                          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                              { label: 'Elo', val: p.elo },
                              { label: 'Spiele', val: p.gamesPlayed },
                              { label: 'Siege', val: p.wins },
                              { label: 'Winrate', val: `${p.winrate}%` },
                              { label: 'Elo +7d', val: `+${p.elo_gain_7d}` },
                              { label: 'Account-Alter', val: `${p.account_age_days}d` },
                            ].map(({ label, val }) => (
                              <div key={label} className="rounded-2xl border border-white/10 bg-[#061511]/45 p-3 text-center">
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#779286]">{label}</div>
                                <div className="mt-1 text-lg font-black text-white">{val}</div>
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
                              className="flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-300/15"
                            >
                              <AlertTriangle size={14} /> Warnen
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-[#9eb8ad]">Die Warnung wird dem Spieler in der Benachrichtigungszentrale zugestellt und im Aktivitätsprotokoll festgehalten. Sperren bleiben Admins vorbehalten.</p>
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
              <div className={opsEmptyCls}>
                <ClipboardList size={32} className="text-[#779286]" />
                <p className="text-sm font-bold text-[#a9bbb4]">Noch keine Moderationsaktionen</p>
              </div>
            ) : (
              <div className={`overflow-hidden ${opsCardCls}`}>
                <div className="divide-y divide-white/10">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-start gap-4 px-6 py-4">
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#b8ff8b]/10 text-[#b8ff8b]">
                        <Activity size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-white">{log.mod_username}</span>
                          <span className="rounded-md border border-[#b8ff8b]/20 bg-[#b8ff8b]/10 px-2 py-0.5 text-[10px] font-black text-[#d8ffc0]">{log.action}</span>
                          {log.target_label && <span className="text-xs text-[#9eb8ad]">→ {log.target_label}</span>}
                        </div>
                        {log.details && <p className="mt-0.5 text-xs text-[#9eb8ad]">{log.details}</p>}
                      </div>
                      <div className="shrink-0 text-xs text-[#779286]">{timeAgo(log.created_at)}</div>
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
