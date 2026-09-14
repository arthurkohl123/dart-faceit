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

const statusCfg: Record<string, { label: string; cls: string; dot: string }> = {
  open:             { label: 'Offen',          cls: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-300' },
  in_progress:      { label: 'In Bearbeitung', cls: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',         dot: 'bg-cyan-300' },
  waiting_for_user: { label: 'Warte auf User', cls: 'border-amber-300/25 bg-amber-400/10 text-amber-200',      dot: 'bg-amber-300' },
  resolved:         { label: 'Gelöst',         cls: 'border-zinc-300/25 bg-zinc-400/10 text-zinc-300',         dot: 'bg-zinc-400' },
  closed:           { label: 'Geschlossen',    cls: 'border-zinc-700/25 bg-zinc-800/10 text-zinc-500',         dot: 'bg-zinc-600' },
};

const priorityCfg: Record<string, { label: string; cls: string }> = {
  low:    { label: 'Niedrig', cls: 'text-zinc-400' },
  normal: { label: 'Normal',  cls: 'text-zinc-300' },
  high:   { label: 'Hoch',    cls: 'text-amber-300' },
  urgent: { label: 'Dringend',cls: 'text-red-300' },
};

const catLabels: Record<string, string> = {
  general: 'Allgemein', bug: 'Bug', account: 'Account',
  match_dispute: 'Match-Streit', ban_appeal: 'Ban-Einspruch', other: 'Sonstiges',
};

const matchStatusCfg: Record<string, { label: string; cls: string }> = {
  pending_result:        { label: 'Läuft',        cls: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' },
  awaiting_confirmation: { label: 'Bestätigung',  cls: 'border-amber-300/25 bg-amber-400/10 text-amber-200' },
  disputed:              { label: 'Dispute',      cls: 'border-red-400/25 bg-red-400/10 text-red-200' },
};

const inputCls = 'w-full rounded-lg border border-[#303845] bg-[#10141c] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#476ef0] focus:bg-[#151b26]';

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
          ? 'bg-[#233d93] text-white shadow-[inset_4px_0_0_#e84235]'
          : 'text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200'
      }`}
    >
      <span className={active ? 'text-white' : 'text-slate-500 group-hover:text-slate-200'}>{icon}</span>
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className={`ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1.5 text-[10px] font-black ${
          active ? 'bg-[#e84235] text-white' : 'bg-white/[0.08] text-slate-400'
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
  const [pendingCancelDisputeId, setPendingCancelDisputeId] = useState<string | null>(null);
  const [pendingCancelMatchId, setPendingCancelMatchId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Tickets
  const [tickets,       setTickets]       = useState<ModTicket[]>([]);
  const [ticketFilter,  setTicketFilter]  = useState<string | null>(null);
  const [openTicketId,  setOpenTicketId]  = useState<string | null>(null);
  const [ticketDetail,  setTicketDetail]  = useState<TicketDetail | null>(null);
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
    const { data } = await supabase.rpc('mod_get_tickets', {
      p_status: status ?? null, p_limit: 100, p_offset: 0,
    });
    if (data) setTickets(data as ModTicket[]);
  }, [supabase]);

  const loadDisputes = useCallback(async () => {
    const { data } = await supabase.rpc('mod_get_disputed_matches');
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
            note: '',
          };
        });
        return next;
      });
    }
  }, [supabase]);

  const loadLiveMatches = useCallback(async () => {
    const { data } = await supabase.rpc('mod_get_live_matches');
    if (data) setLiveMatches(data as LiveMatch[]);
  }, [supabase]);

  const loadFlagged = useCallback(async () => {
    const { data } = await supabase.rpc('mod_get_flagged_players');
    if (data) setFlagged(data as FlaggedPlayer[]);
  }, [supabase]);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.rpc('mod_get_logs', { p_limit: 100 });
    if (data) setLogs(data as ModLog[]);
  }, [supabase]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadTickets(ticketFilter), loadDisputes(), loadLiveMatches(), loadFlagged(), loadLogs()]);
  }, [loadTickets, loadDisputes, loadLiveMatches, loadFlagged, loadLogs, ticketFilter]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }

      const { data: me } = await supabase
        .from('profiles')
        .select('is_moderator, is_admin')
        .eq('supabaseId', session.user.id)
        .single();

      if (!mounted) return;
      if (!me?.is_moderator && !me?.is_admin) {
        showToast('Kein Moderator-Zugriff. Du wirst zur Startseite weitergeleitet.', false);
        setTimeout(() => router.push('/'), 1200);
        return;
      }

      await Promise.all([loadTickets(null), loadDisputes(), loadLiveMatches(), loadFlagged(), loadLogs()]);
      if (mounted) setLoading(false);
    }
    void init();
    return () => { mounted = false; };
  }, [supabase, router, loadTickets, loadDisputes, loadLiveMatches, loadFlagged, loadLogs]);

  // ── Ticket Actions ────────────────────────────────────────────────────────

  const loadTicketDetail = async (id: string) => {
    const { data, error } = await supabase.rpc('mod_get_ticket_detail', { p_ticket_id: id });
    if (error) { showToast('Ticket konnte nicht geladen werden: ' + error.message, false); return; }
    if (data) { setTicketDetail(data as TicketDetail); setOpenTicketId(id); }
  };

  const openTicket = async (id: string) => {
    if (openTicketId === id) { setOpenTicketId(null); setTicketDetail(null); return; }
    await loadTicketDetail(id);
  };

  const sendReply = async (ticketId: string) => {
    if (!reply.trim()) return;
    setSending(true);
    const { error } = await supabase.rpc('mod_send_ticket_reply', { p_ticket_id: ticketId, p_content: reply.trim() });
    setSending(false);
    if (error) { showToast('Fehler beim Senden: ' + error.message, false); return; }
    setReply('');
    await loadTicketDetail(ticketId);
    await loadTickets(ticketFilter);
    showToast('Antwort gesendet.');
  };

  const updateStatus = async (ticketId: string, status: string) => {
    const { error } = await supabase.rpc('mod_update_ticket', { p_ticket_id: ticketId, p_status: status });
    if (error) { showToast('Status konnte nicht aktualisiert werden: ' + error.message, false); return; }
    await loadTickets(ticketFilter);
    if (openTicketId === ticketId) await loadTicketDetail(ticketId);
    showToast('Status aktualisiert.');
  };

  const updatePriority = async (ticketId: string, priority: string) => {
    const { error } = await supabase.rpc('mod_update_ticket', { p_ticket_id: ticketId, p_priority: priority });
    if (error) { showToast('Priorität konnte nicht aktualisiert werden: ' + error.message, false); return; }
    await loadTickets(ticketFilter);
    showToast('Priorität aktualisiert.');
  };

  // ── Dispute Actions ───────────────────────────────────────────────────────

  const patchForm = (id: string, patch: Partial<ResolveForm>) => {
    setResolveForms(prev => ({ ...prev, [id]: { ...(prev[id] || {} as ResolveForm), ...patch } }));
  };

  const resolveDispute = async (m: DisputedMatch) => {
    const f = resolveForms[m.match_id];
    if (!f?.winnerId || !f.p1Legs || !f.p2Legs) { showToast('Bitte Gewinner und Legs ausfüllen.', false); return; }
    const { error } = await supabase.rpc('mod_resolve_dispute', {
      p_match_id: m.match_id, p_winner_id: f.winnerId,
      p_player1_legs: Number(f.p1Legs), p_player2_legs: Number(f.p2Legs),
      p_player1_average: f.p1Avg ? Number(f.p1Avg) : null,
      p_player2_average: f.p2Avg ? Number(f.p2Avg) : null,
      p_player1_checkout: f.p1Checkout ? Number(f.p1Checkout) : null,
      p_player2_checkout: f.p2Checkout ? Number(f.p2Checkout) : null,
      p_mod_note: f.note || null,
    });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Dispute wurde entschieden.');
    setOpenDispute(null);
    await loadDisputes();
    await loadLogs();
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
    await loadDisputes();
    await loadLogs();
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
    await loadLiveMatches();
    await loadLogs();
  };

  // ── Flagged Actions ───────────────────────────────────────────────────────

  const warnPlayer = async (playerId: string) => {
    if (!warnReason.trim()) { showToast('Bitte Grund eingeben.', false); return; }
    const { error } = await supabase.rpc('mod_warn_player', { p_player_id: playerId, p_reason: warnReason.trim() });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Warnung wurde protokolliert.');
    setWarnReason('');
    setOpenFlagged(null);
    await loadLogs();
  };

  // ── Counts ────────────────────────────────────────────────────────────────

  const openTicketCount  = tickets.filter(t => t.status === 'open').length;
  const disputeCount     = disputes.length;
  const liveCount        = liveMatches.length;
  const flaggedCount     = flagged.length;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f0eee8] text-[#151923]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#c9c6bc] border-t-[#2f58d5]" />
          <p className="text-sm font-bold text-slate-500">Match Control wird vorbereitet…</p>
        </div>
      </main>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="control-room relative min-h-screen overflow-hidden bg-[#f0eee8] text-[#151923]">

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-40 top-28 h-[34rem] w-[34rem] rounded-full bg-[#325ad8]/[0.075] blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-[26rem] w-[26rem] rounded-full bg-[#e84235]/[0.07] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.045] bg-[linear-gradient(to_right,#182030_1px,transparent_1px),linear-gradient(to_bottom,#182030_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-xl border px-5 py-3.5 text-sm font-bold shadow-2xl backdrop-blur-xl transition-all ${
          toast.ok
            ? 'border-emerald-300/25 bg-emerald-400/15 text-emerald-200'
            : 'border-red-400/25 bg-red-400/15 text-red-200'
        }`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Command header */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.08] bg-[#111725]/95 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-3.5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-white/20 bg-[#2f58d5] text-white shadow-[4px_4px_0_#e84235]">
              <Shield size={20} />
            </div>
            <div>
              <div className="text-sm font-black tracking-[0.12em] text-white md:text-base">MATCH CONTROL</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-400">RankedDarts · Moderator Desk</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#55d298]" /> Einsatzbereit
            </div>
            <Link href="/admin" className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-zinc-400 transition hover:border-white/20 hover:text-white">
              Admin
            </Link>
            <button
              onClick={refreshAll}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-zinc-400 transition hover:border-white/20 hover:text-white"
              title="Alle Daten aktualisieren"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto grid max-w-[1440px] gap-6 px-4 pb-16 pt-20 sm:px-5 lg:grid-cols-[228px_minmax(0,1fr)] lg:px-8 lg:pt-24">
        <aside className="lg:sticky lg:top-[84px] lg:h-[calc(100vh-108px)]">
          <div className="overflow-hidden rounded-xl bg-[#111725] p-2 shadow-[10px_10px_0_rgba(21,25,35,0.12)]">
            <div className="border-b border-white/[0.09] px-3 py-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500"><Command size={12} /> Kontrollraum</div>
            </div>
            <div className="space-y-1 py-2">
              <TabBtn active={tab === 'desk'}     onClick={() => setTab('desk')}     icon={<LayoutDashboard size={16} />} label="Leitstand" />
              <TabBtn active={tab === 'tickets'}  onClick={() => setTab('tickets')}  icon={<Inbox size={16} />} label="Fall-Inbox" badge={openTicketCount} />
              <TabBtn active={tab === 'disputes'} onClick={() => setTab('disputes')} icon={<Gavel size={16} />} label="Disputes" badge={disputeCount} />
              <TabBtn active={tab === 'matches'}  onClick={() => setTab('matches')}  icon={<Radio size={16} />} label="Live Matches" badge={liveCount} />
              <TabBtn active={tab === 'flagged'}  onClick={() => setTab('flagged')}  icon={<BadgeAlert size={16} />} label="Auffälligkeiten" badge={flaggedCount} />
              <TabBtn active={tab === 'logs'}     onClick={() => setTab('logs')}     icon={<ClipboardList size={16} />} label="Audit-Log" />
            </div>
            <div className="mx-2 mt-2 border-t border-white/[0.09] px-2 py-4 text-[11px] leading-relaxed text-slate-500">
              Jede Entscheidung bleibt im Audit-Log nachvollziehbar. Eingriffe nur bei eindeutigem Sachverhalt.
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#151923] pb-5">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#2f58d5]"><PanelRightOpen size={13} /> Shift 01 / Moderation</div>
              <h1 className="text-4xl font-black uppercase tracking-[-0.06em] text-[#151923] sm:text-5xl">
                {tab === 'desk' ? 'Leitstand' : tab === 'tickets' ? 'Fall-Inbox' : tab === 'disputes' ? 'Dispute-Prüfung' : tab === 'matches' ? 'Live-Match-Übersicht' : tab === 'flagged' ? 'Auffällige Accounts' : 'Audit-Log'}
              </h1>
            </div>
            <div className="flex items-center gap-2 border border-[#151923] bg-[#151923] px-3 py-2 text-[10px] font-black uppercase tracking-[0.13em] text-white">
              <span className="h-1.5 w-1.5 animate-pulse bg-[#55d298]" /> Live-Daten
            </div>
          </header>

        {/* ══════════════════════════════════════════════════════════════════
            TAB: LEITSTAND
        ══════════════════════════════════════════════════════════════════ */}
        {tab === 'desk' && (
          <div className="space-y-5">
            <div className="relative overflow-hidden border-2 border-[#151923] bg-[#151923] px-5 py-6 text-white sm:px-7">
              <div className="pointer-events-none absolute -right-5 -top-14 select-none text-[9rem] font-black leading-none tracking-[-0.12em] text-white/[0.045] sm:text-[13rem]">MOD</div>
              <div className="relative grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 bg-[#e84235] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white"><Radio size={12} /> Live Control</div>
                  <h2 className="max-w-xl text-3xl font-black uppercase leading-[0.9] tracking-[-0.07em] sm:text-5xl">Fair Play<br/><span className="text-[#91a9ff]">unter Kontrolle.</span></h2>
                  <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">Dein Schiedsrichterraum für Fälle, Entscheidungen und laufende Matches. Erst prüfen, dann handeln.</p>
                </div>
                <div className="border-l border-white/15 pl-5 lg:pb-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Schichtstatus</div>
                  <div className="mt-2 flex items-end gap-3"><span className="text-4xl font-black tracking-[-0.06em]">{openTicketCount + disputeCount}</span><span className="mb-1 text-xs font-bold text-slate-400">Vorgänge mit Bedarf</span></div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Offene Fälle', value: openTicketCount, sub: 'Tickets brauchen Antwort', icon: <Inbox size={17} />, tone: 'bg-[#2f58d5] text-white', marker: 'bg-[#91a9ff]' },
                { label: 'Entscheidungen', value: disputeCount, sub: 'Disputes warten auf Prüfung', icon: <Gavel size={17} />, tone: 'bg-[#e84235] text-white', marker: 'bg-[#ffb0a8]' },
                { label: 'Im Spiel', value: liveCount, sub: 'Live-Matches im Blick', icon: <Radio size={17} />, tone: 'bg-[#d8d4ca] text-[#151923]', marker: 'bg-[#151923]' },
                { label: 'Hinweise', value: flaggedCount, sub: 'Accounts zur Einordnung', icon: <FileWarning size={17} />, tone: 'bg-white text-[#151923] border border-[#151923]', marker: 'bg-[#e84235]' },
              ].map(item => (
                <button key={item.label} onClick={() => setTab(item.label === 'Offene Fälle' ? 'tickets' : item.label === 'Entscheidungen' ? 'disputes' : item.label === 'Im Spiel' ? 'matches' : 'flagged')} className={`group relative overflow-hidden p-5 text-left transition hover:-translate-y-1 ${item.tone}`}>
                  <div className={`absolute right-0 top-0 h-2 w-12 ${item.marker}`} />
                  <div className="mb-6 opacity-75">{item.icon}</div>
                  <div className="text-5xl font-black tracking-[-0.08em]">{item.value}</div>
                  <div className="mt-1 text-sm font-black uppercase tracking-[-0.02em]">{item.label}</div>
                  <div className="mt-1 text-xs opacity-65">{item.sub}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
              <div className="overflow-hidden border-2 border-[#151923] bg-[#151923] shadow-[8px_8px_0_rgba(21,25,35,0.12)]">
                <div className="flex items-center justify-between border-b border-white/[0.12] px-5 py-4">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[-0.02em] text-white">Priorisierte Fall-Inbox</div>
                    <div className="mt-0.5 text-xs text-slate-500">Neue und hochpriorisierte Meldungen zuerst</div>
                  </div>
                  <button onClick={() => setTab('tickets')} className="inline-flex items-center gap-1.5 bg-[#2f58d5] px-2.5 py-1.5 text-xs font-black text-white transition hover:bg-[#4167e2]">Alle Fälle <ArrowUpRight size={14} /></button>
                </div>
                {tickets.filter(ticket => ticket.status !== 'closed' && ticket.status !== 'resolved').slice(0, 5).length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-slate-500">Keine offenen Fälle. Der Leitstand ist ruhig.</div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {tickets.filter(ticket => ticket.status !== 'closed' && ticket.status !== 'resolved').slice(0, 5).map(ticket => {
                      const priority = priorityCfg[ticket.priority] ?? priorityCfg.normal;
                      const status = statusCfg[ticket.status] ?? statusCfg.open;
                      return (
                        <button key={ticket.id} onClick={() => { setTab('tickets'); void openTicket(ticket.id); }} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.055]">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-100">{ticket.subject}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{ticket.username} · {catLabels[ticket.category] ?? ticket.category} · {timeAgo(ticket.created_at)}</span>
                          </span>
                          <span className={`shrink-0 text-[10px] font-black uppercase tracking-[0.14em] ${priority.cls}`}>{priority.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div className="border-2 border-[#151923] bg-white p-5 shadow-[6px_6px_0_rgba(21,25,35,0.12)]">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.17em] text-[#2f58d5]"><Command size={14} /> Schnellzugriff</div>
                  <div className="space-y-2">
                    <button onClick={() => setTab('disputes')} className="flex w-full items-center justify-between border border-[#151923] bg-[#151923] px-3.5 py-3 text-left text-sm font-bold text-white transition hover:bg-[#2f58d5]"><span>Offene Disputes prüfen</span><span className="font-mono text-[#91a9ff]">{disputeCount}</span></button>
                    <button onClick={() => setTab('matches')} className="flex w-full items-center justify-between border border-[#151923] px-3.5 py-3 text-left text-sm font-bold text-[#151923] transition hover:bg-[#ece9e1]"><span>Laufende Matches überwachen</span><ArrowUpRight size={15} className="text-[#e84235]" /></button>
                    <button onClick={() => setTab('flagged')} className="flex w-full items-center justify-between border border-[#151923] px-3.5 py-3 text-left text-sm font-bold text-[#151923] transition hover:bg-[#ece9e1]"><span>Account-Hinweise sichten</span><ArrowUpRight size={15} className="text-[#e84235]" /></button>
                  </div>
                </div>

                <div className="border-l-4 border-[#e84235] bg-[#d8d4ca] p-5">
                  <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.17em] text-[#151923]"><Activity size={14} /> Letzte Eingriffe</div>
                  {logs.slice(0, 3).length === 0 ? <p className="text-sm text-slate-600">Noch keine dokumentierten Eingriffe.</p> : (
                    <div className="space-y-3">
                      {logs.slice(0, 3).map(log => <div key={log.id} className="border-l border-[#151923]/30 pl-3"><div className="truncate text-xs font-bold text-[#151923]">{log.action}{log.target_label ? ` · ${log.target_label}` : ''}</div><div className="mt-1 text-[11px] text-slate-600">{log.mod_username} · {timeAgo(log.created_at)}</div></div>)}
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
            <div className="mb-5 flex flex-wrap gap-2">
              {[null, 'open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'].map(s => (
                <button
                  key={s ?? 'all'}
                  onClick={async () => { setTicketFilter(s); await loadTickets(s); }}
                  className={`border px-4 py-2 text-xs font-bold transition ${
                    ticketFilter === s
                      ? 'border border-[#2f58d5] bg-[#2f58d5] text-white'
                      : 'border-[#151923]/25 bg-white/50 text-slate-600 hover:border-[#151923] hover:bg-white hover:text-[#151923]'
                  }`}
                >
                  {s ? (statusCfg[s]?.label ?? s) : `Alle (${tickets.length})`}
                </button>
              ))}
            </div>

            {tickets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 border-2 border-dashed border-[#151923]/30 bg-white/45 py-20 text-center">
                <Headphones size={32} className="text-slate-400" />
                <p className="text-sm font-bold text-slate-500">Keine Tickets vorhanden</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map(t => {
                  const sc = statusCfg[t.status] ?? statusCfg.open;
                  const pc = priorityCfg[t.priority] ?? priorityCfg.normal;
                  const isOpen = openTicketId === t.id;

                  return (
                    <div key={t.id} className="overflow-hidden border border-[#151923] border-l-4 border-l-[#2f58d5] bg-[#151923] shadow-[5px_5px_0_rgba(21,25,35,0.10)]">
                      {/* Ticket-Header */}
                      <button
                        onClick={() => openTicket(t.id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-white/[0.03]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${sc.cls}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                {sc.label}
                              </span>
                              <span className={`text-xs font-black ${pc.cls}`}>{pc.label}</span>
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-zinc-500">
                                {catLabels[t.category] ?? t.category}
                              </span>
                            </div>
                            <div className="text-base font-black text-white">{t.subject}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              von <span className="font-bold text-zinc-300">{t.username}</span> · {timeAgo(t.created_at)}
                              {t.message_count > 0 && ` · ${t.message_count} Nachrichten`}
                            </div>
                          </div>
                          <div className="shrink-0 text-zinc-600">
                            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </div>
                      </button>

                      {/* Ticket-Detail */}
                      {isOpen && ticketDetail && (
                        <div className="border-t border-white/[0.06] px-6 pb-6 pt-5">
                          {/* Aktionen */}
                          <div className="mb-5 flex flex-wrap gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-600">Status:</span>
                              <select
                                value={t.status}
                                onChange={e => updateStatus(t.id, e.target.value)}
                                className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none"
                              >
                                {Object.entries(statusCfg).map(([k, v]) => (
                                  <option key={k} value={k} className="bg-zinc-950">{v.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-600">Priorität:</span>
                              <select
                                value={t.priority}
                                onChange={e => updatePriority(t.id, e.target.value)}
                                className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none"
                              >
                                {Object.entries(priorityCfg).map(([k, v]) => (
                                  <option key={k} value={k} className="bg-zinc-950">{v.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Nachrichten */}
                          <div className="mb-5 max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-white/[0.06] bg-black/30 p-4">
                            {ticketDetail.messages.map(msg => {
                              const parsed = parseTicketMessageContent(msg.content);
                              return (
                              <div key={msg.id} className={`flex gap-3 ${msg.is_staff ? 'flex-row-reverse' : ''}`}>
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                                  msg.is_staff ? 'bg-[#2f58d5]/30 text-[#b6c5ff]' : 'bg-white/10 text-zinc-300'
                                }`}>
                                  {msg.sender_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                                  msg.is_staff
                                    ? 'rounded-tr-sm border border-[#4569df]/40 bg-[#2f58d5]/25 text-[#edf0ff]'
                                    : 'rounded-tl-sm bg-white/[0.06] border border-white/10 text-zinc-200'
                                }`}>
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className="text-[10px] font-black text-zinc-500">{msg.sender_name}</span>
                                    {msg.is_staff && <span className="rounded-md bg-[#2f58d5]/30 px-1.5 py-0.5 text-[9px] font-black text-[#b6c5ff]">MOD</span>}
                                    <span className="text-[10px] text-zinc-700">{timeAgo(msg.created_at)}</span>
                                  </div>
                                  <div className="space-y-3">
                                    {parsed.text && <p className="leading-relaxed whitespace-pre-wrap">{parsed.text}</p>}
                                    {parsed.images.length > 0 && (
                                      <div className="grid gap-2">
                                        {parsed.images.map((image) => (
                                          <a key={image.url} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10 bg-black/25 transition hover:border-white/25">
                                            <img src={image.url} alt={ticketImageAlt(image.label)} className="max-h-56 w-full object-cover" />
                                            <div className="truncate px-3 py-2 text-[11px] font-bold text-zinc-400">{image.label}</div>
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
                              <p className="text-center text-xs text-zinc-700">Noch keine Nachrichten</p>
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
              <div className="flex flex-col items-center gap-3 border-2 border-dashed border-[#151923]/30 bg-white/45 py-20 text-center">
                <Gavel size={32} className="text-slate-400" />
                <p className="text-sm font-bold text-slate-500">Keine offenen Disputes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map(m => {
                  const f = resolveForms[m.match_id] ?? {} as ResolveForm;
                  const isOpen = openDispute === m.match_id;

                  return (
                    <div key={m.match_id} className="overflow-hidden border border-[#151923] border-l-4 border-l-[#e84235] bg-[#151923] shadow-[5px_5px_0_rgba(21,25,35,0.10)]">
                      {/* Header */}
                      <button
                        onClick={() => setOpenDispute(isOpen ? null : m.match_id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-white/[0.03]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-400/10 px-3 py-1 text-xs font-black text-red-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                                Dispute
                              </span>
                              <span className="text-xs text-zinc-600">{timeAgo(m.created_at)}</span>
                            </div>
                            <div className="text-xl font-black">
                              {m.player1_username} <span className="text-zinc-600">vs</span> {m.player2_username}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              Eingereicht von: <span className="font-bold text-zinc-300">{m.submitted_by_username ?? '—'}</span>
                              {m.submitted_winner_username && ` · Gewinner lt. Einreichung: ${m.submitted_winner_username}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs text-zinc-600">Elo</div>
                              <div className="font-black">{m.player1_elo} vs {m.player2_elo}</div>
                            </div>
                            {isOpen ? <ChevronUp size={18} className="text-zinc-500" /> : <ChevronDown size={18} className="text-zinc-500" />}
                          </div>
                        </div>
                      </button>

                      {/* Detail */}
                      {isOpen && (
                        <div className="border-t border-white/[0.06] px-6 pb-6 pt-5 space-y-5">
                          {/* Dispute-Grund */}
                          {m.dispute_reason && (
                            <div className="rounded-2xl border border-amber-300/15 bg-amber-400/[0.06] p-4">
                              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 mb-1">Dispute-Grund</div>
                              <p className="text-sm text-zinc-300">{m.dispute_reason}</p>
                            </div>
                          )}
                          {m.dispute_screenshot_url && (
                            <a href={m.dispute_screenshot_url} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 transition hover:text-white">
                              Screenshot ansehen
                            </a>
                          )}

                          {/* Formular */}
                          <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-5 space-y-4">
                            <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Entscheidung treffen</div>

                            {/* Gewinner */}
                            <div>
                              <label className="mb-2 block text-xs font-bold text-zinc-500">Gewinner</label>
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
                                        ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
                                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20'
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
                                <label className="mb-1.5 block text-xs font-bold text-zinc-500">{m.player1_username} Legs</label>
                                <input type="number" value={f.p1Legs ?? ''} onChange={e => patchForm(m.match_id, { p1Legs: e.target.value })} className={inputCls} placeholder="0" />
                              </div>
                              <div>
                                <label className="mb-1.5 block text-xs font-bold text-zinc-500">{m.player2_username} Legs</label>
                                <input type="number" value={f.p2Legs ?? ''} onChange={e => patchForm(m.match_id, { p2Legs: e.target.value })} className={inputCls} placeholder="0" />
                              </div>
                            </div>

                            {/* Averages + Checkouts */}
                            <div className="grid grid-cols-2 gap-3">
                              <input type="number" value={f.p1Avg ?? ''} onChange={e => patchForm(m.match_id, { p1Avg: e.target.value })} className={inputCls} placeholder={`${m.player1_username} Average`} />
                              <input type="number" value={f.p2Avg ?? ''} onChange={e => patchForm(m.match_id, { p2Avg: e.target.value })} className={inputCls} placeholder={`${m.player2_username} Average`} />
                              <input type="number" value={f.p1Checkout ?? ''} onChange={e => patchForm(m.match_id, { p1Checkout: e.target.value })} className={inputCls} placeholder={`${m.player1_username} Checkout`} />
                              <input type="number" value={f.p2Checkout ?? ''} onChange={e => patchForm(m.match_id, { p2Checkout: e.target.value })} className={inputCls} placeholder={`${m.player2_username} Checkout`} />
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
                                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-400"
                              >
                                <Gavel size={15} /> Entscheiden
                              </button>
                              <button
                                onClick={() => cancelDispute(m)}
                                className="flex items-center gap-2 rounded-2xl border border-red-400/25 bg-red-400/10 px-5 py-3 text-sm font-black text-red-200 transition hover:bg-red-400/20"
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
              <div className="flex flex-col items-center gap-3 border-2 border-dashed border-[#151923]/30 bg-white/45 py-20 text-center">
                <Swords size={32} className="text-slate-400" />
                <p className="text-sm font-bold text-slate-500">Keine aktiven Matches</p>
              </div>
            ) : (
              <div className="space-y-3">
                {liveMatches.map(m => {
                  const sc = matchStatusCfg[m.status] ?? matchStatusCfg.pending_result;
                  const isLong = m.duration_minutes > 60;

                  return (
                    <div key={m.id} className={`overflow-hidden border border-[#151923] border-l-4 backdrop-blur-xl shadow-[5px_5px_0_rgba(21,25,35,0.10)] ${
                      m.status === 'disputed'
                        ? 'border-l-[#e84235] bg-[#151923]'
                        : isLong
                          ? 'border-l-[#e8b535] bg-[#151923]'
                          : 'border-l-[#2f58d5] bg-[#151923]'
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
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-zinc-500">
                                  {m.app === 'scolia' ? '📷 Scolia' : m.app === 'autodarts' ? '🎯 AutoDarts' : '📱 DartCounter'}
                                </span>
                              )}
                              {isLong && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-200">
                                  <AlertTriangle size={10} /> Sehr lang
                                </span>
                              )}
                            </div>
                            <div className="text-xl font-black">
                              {m.player1_username} <span className="text-zinc-600">vs</span> {m.player2_username}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                              <span className="flex items-center gap-1"><Timer size={11} /> {m.duration_minutes} Min. aktiv</span>
                              <span>{m.player1_elo} vs {m.player2_elo} Elo</span>
                            </div>
                          </div>
                          <button
                            onClick={() => cancelMatch(m.id)}
                            className="flex items-center gap-2 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-xs font-black text-red-200 transition hover:bg-red-400/20"
                          >
                            <XCircle size={14} /> {pendingCancelMatchId === m.id ? 'Abbruch bestätigen' : 'Match abbrechen'}
                          </button>
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
              <div className="flex flex-col items-center gap-3 border-2 border-dashed border-[#151923]/30 bg-white/45 py-20 text-center">
                <ShieldCheck size={32} className="text-slate-400" />
                <p className="text-sm font-bold text-slate-500">Keine verdächtigen Accounts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {flagged.map(p => {
                  const isOpen = openFlagged === p.id;
                  return (
                    <div key={p.id} className="overflow-hidden border border-[#151923] border-l-4 border-l-[#e8b535] bg-[#151923] shadow-[5px_5px_0_rgba(21,25,35,0.10)]">
                      <button
                        onClick={() => setOpenFlagged(isOpen ? null : p.id)}
                        className="w-full px-6 py-5 text-left transition hover:bg-white/[0.03]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="mb-2 flex flex-wrap gap-2">
                              {p.flags.map(flag => (
                                <span key={flag} className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-200">
                                  <AlertTriangle size={9} /> {flag}
                                </span>
                              ))}
                            </div>
                            <div className="text-xl font-black">{p.username}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {p.elo} Elo · {p.gamesPlayed} Spiele · {p.winrate}% Winrate · +{p.elo_gain_7d} Elo (7d) · {p.account_age_days} Tage alt
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={18} className="text-zinc-500" /> : <ChevronDown size={18} className="text-zinc-500" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-white/[0.06] px-6 pb-6 pt-5">
                          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                              { label: 'Elo', val: p.elo },
                              { label: 'Spiele', val: p.gamesPlayed },
                              { label: 'Siege', val: p.wins },
                              { label: 'Winrate', val: `${p.winrate}%` },
                              { label: 'Elo +7d', val: `+${p.elo_gain_7d}` },
                              { label: 'Account-Alter', val: `${p.account_age_days}d` },
                            ].map(({ label, val }) => (
                              <div key={label} className="rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-center">
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">{label}</div>
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
                              className="flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-400/20"
                            >
                              <AlertTriangle size={14} /> Warnen
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-zinc-700">Für Bans bitte das Admin-Panel nutzen.</p>
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
              <div className="flex flex-col items-center gap-3 border-2 border-dashed border-[#151923]/30 bg-white/45 py-20 text-center">
                <ClipboardList size={32} className="text-slate-400" />
                <p className="text-sm font-bold text-slate-500">Noch keine Mod-Aktionen</p>
              </div>
            ) : (
              <div className="overflow-hidden border border-[#151923] bg-[#151923] shadow-[5px_5px_0_rgba(21,25,35,0.10)]">
                <div className="divide-y divide-white/[0.05]">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-start gap-4 px-6 py-4">
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#2f58d5]/20 text-[#b6c5ff]">
                        <Activity size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-zinc-200">{log.mod_username}</span>
                          <span className="rounded-md border border-[#2f58d5]/25 bg-[#2f58d5]/15 px-2 py-0.5 text-[10px] font-black text-[#b6c5ff]">{log.action}</span>
                          {log.target_label && <span className="text-xs text-zinc-500">→ {log.target_label}</span>}
                        </div>
                        {log.details && <p className="mt-0.5 text-xs text-zinc-600">{log.details}</p>}
                      </div>
                      <div className="shrink-0 text-xs text-zinc-700">{timeAgo(log.created_at)}</div>
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
