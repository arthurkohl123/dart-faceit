'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Gavel,
  Headphones,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Timer,
  Users,
  XCircle,
  Zap,
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

const inputCls = 'w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-300/60 focus:bg-white/[0.075]';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tag(en)`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

// ─── Tab-Button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-bold transition-all ${
        active
          ? 'border border-violet-300/30 bg-violet-400/15 text-violet-200 shadow-[0_0_20px_rgba(167,139,250,0.12)]'
          : 'border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge != null && badge > 0 && (
        <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
          active ? 'bg-violet-300/25 text-violet-100' : 'bg-white/10 text-zinc-400'
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
  const [tab,      setTab]      = useState<'tickets' | 'disputes' | 'matches' | 'flagged' | 'logs'>('tickets');
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

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
        alert('Kein Moderator-Zugriff!');
        router.push('/');
        return;
      }

      await Promise.all([loadTickets(null), loadDisputes(), loadLiveMatches(), loadFlagged(), loadLogs()]);
      if (mounted) setLoading(false);
    }
    void init();
    return () => { mounted = false; };
  }, [supabase, router, loadTickets, loadDisputes, loadLiveMatches, loadFlagged, loadLogs]);

  // ── Ticket Actions ────────────────────────────────────────────────────────

  const openTicket = async (id: string) => {
    if (openTicketId === id) { setOpenTicketId(null); setTicketDetail(null); return; }
    const { data } = await supabase.rpc('mod_get_ticket_detail', { p_ticket_id: id });
    if (data) { setTicketDetail(data as TicketDetail); setOpenTicketId(id); }
  };

  const sendReply = async (ticketId: string) => {
    if (!reply.trim()) return;
    setSending(true);
    const { error } = await supabase.rpc('mod_send_ticket_reply', { p_ticket_id: ticketId, p_content: reply.trim() });
    setSending(false);
    if (error) { showToast('Fehler beim Senden: ' + error.message, false); return; }
    setReply('');
    await openTicket(ticketId);
    await loadTickets(ticketFilter);
    showToast('Antwort gesendet.');
  };

  const updateStatus = async (ticketId: string, status: string) => {
    await supabase.rpc('mod_update_ticket', { p_ticket_id: ticketId, p_status: status });
    await loadTickets(ticketFilter);
    if (openTicketId === ticketId) await openTicket(ticketId);
    showToast('Status aktualisiert.');
  };

  const updatePriority = async (ticketId: string, priority: string) => {
    await supabase.rpc('mod_update_ticket', { p_ticket_id: ticketId, p_priority: priority });
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
    if (!confirm('Match wirklich annullieren? Keine Elo-Wertung.')) return;
    const f = resolveForms[m.match_id];
    const { error } = await supabase.rpc('mod_cancel_dispute', {
      p_match_id: m.match_id, p_mod_note: f?.note || null,
    });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Match annulliert.');
    setOpenDispute(null);
    await loadDisputes();
    await loadLogs();
  };

  // ── Live Match Actions ────────────────────────────────────────────────────

  const cancelMatch = async (matchId: string) => {
    if (!confirm('Dieses Match wirklich abbrechen? Keine Elo-Wertung.')) return;
    const reason = prompt('Grund (optional):') ?? undefined;
    const { error } = await supabase.rpc('mod_force_cancel_match', { p_match_id: matchId, p_reason: reason ?? null });
    if (error) { showToast('Fehler: ' + error.message, false); return; }
    showToast('Match abgebrochen.');
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
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-violet-400" />
          <p className="text-sm font-bold text-zinc-600">Moderator-Panel wird geladen…</p>
        </div>
      </main>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(167,139,250,0.14),transparent_38%),radial-gradient(ellipse_at_85%_5%,rgba(6,182,212,0.08),transparent_30%),radial-gradient(ellipse_at_20%_85%,rgba(239,68,68,0.06),transparent_35%)]" />
        <div className="absolute inset-0 opacity-[0.05] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-bold shadow-2xl backdrop-blur-xl transition-all ${
          toast.ok
            ? 'border-emerald-300/25 bg-emerald-400/15 text-emerald-200'
            : 'border-red-400/25 bg-red-400/15 text-red-200'
        }`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Navbar */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-violet-300/30 bg-gradient-to-br from-violet-500 to-purple-400 text-lg font-black text-white shadow-[0_0_35px_rgba(167,139,250,0.35)]">
              <Shield size={20} />
            </div>
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/80">Moderator Panel</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-400 transition hover:text-white">
              Admin Panel
            </Link>
            <button
              onClick={refreshAll}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-400 transition hover:text-white"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-5 md:px-8 md:pt-28">

        {/* ── Header ── */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-violet-200 mb-4">
            <Shield size={12} /> Moderator Panel
          </div>
          <h1 className="text-4xl font-black tracking-[-0.06em] sm:text-5xl">
            Moderation <span className="bg-gradient-to-r from-violet-300 via-purple-200 to-fuchsia-300 bg-clip-text text-transparent">Dashboard</span>
          </h1>
        </div>

        {/* ── Stats ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Offene Tickets', val: openTicketCount, icon: <Headphones size={20} />, cls: 'border-violet-300/15 bg-violet-400/[0.06]', num: 'text-violet-300' },
            { label: 'Disputes',       val: disputeCount,    icon: <Gavel size={20} />,      cls: 'border-red-400/15 bg-red-400/[0.06]',       num: 'text-red-300' },
            { label: 'Aktive Matches', val: liveCount,       icon: <Swords size={20} />,     cls: 'border-emerald-300/15 bg-emerald-400/[0.06]',num: 'text-emerald-300' },
            { label: 'Verdächtige',    val: flaggedCount,    icon: <ShieldAlert size={20} />,cls: 'border-amber-300/15 bg-amber-400/[0.06]',    num: 'text-amber-300' },
          ].map(({ label, val, icon, cls, num }) => (
            <div key={label} className={`relative overflow-hidden rounded-[2rem] border p-5 backdrop-blur-xl ${cls}`}>
              <div className="mb-3 text-zinc-500">{icon}</div>
              <div className={`text-4xl font-black tracking-[-0.07em] ${num}`}>{val}</div>
              <div className="mt-1 text-xs font-bold text-zinc-600">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="mb-6 flex flex-wrap gap-2">
          <TabBtn active={tab === 'tickets'}  onClick={() => setTab('tickets')}  icon={<Headphones size={15} />}  label="Tickets"         badge={openTicketCount} />
          <TabBtn active={tab === 'disputes'} onClick={() => setTab('disputes')} icon={<Gavel size={15} />}       label="Disputes"        badge={disputeCount} />
          <TabBtn active={tab === 'matches'}  onClick={() => setTab('matches')}  icon={<Swords size={15} />}      label="Aktive Matches"  badge={liveCount} />
          <TabBtn active={tab === 'flagged'}  onClick={() => setTab('flagged')}  icon={<ShieldAlert size={15} />} label="Verdächtige"     badge={flaggedCount} />
          <TabBtn active={tab === 'logs'}     onClick={() => setTab('logs')}     icon={<ClipboardList size={15} />} label="Mod-Logs" />
        </div>

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
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    ticketFilter === s
                      ? 'border border-violet-300/40 bg-violet-400/15 text-violet-200'
                      : 'border border-white/10 bg-white/[0.04] text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {s ? (statusCfg[s]?.label ?? s) : `Alle (${tickets.length})`}
                </button>
              ))}
            </div>

            {tickets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] py-20 text-center">
                <Headphones size={32} className="text-zinc-700" />
                <p className="text-sm font-bold text-zinc-600">Keine Tickets vorhanden</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map(t => {
                  const sc = statusCfg[t.status] ?? statusCfg.open;
                  const pc = priorityCfg[t.priority] ?? priorityCfg.normal;
                  const isOpen = openTicketId === t.id;

                  return (
                    <div key={t.id} className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
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
                            {ticketDetail.messages.map(msg => (
                              <div key={msg.id} className={`flex gap-3 ${msg.is_staff ? 'flex-row-reverse' : ''}`}>
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                                  msg.is_staff ? 'bg-violet-400/20 text-violet-300' : 'bg-white/10 text-zinc-300'
                                }`}>
                                  {msg.sender_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                                  msg.is_staff
                                    ? 'rounded-tr-sm bg-violet-400/15 border border-violet-300/20 text-violet-100'
                                    : 'rounded-tl-sm bg-white/[0.06] border border-white/10 text-zinc-200'
                                }`}>
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className="text-[10px] font-black text-zinc-500">{msg.sender_name}</span>
                                    {msg.is_staff && <span className="rounded-full bg-violet-400/20 px-1.5 py-0.5 text-[9px] font-black text-violet-300">MOD</span>}
                                    <span className="text-[10px] text-zinc-700">{timeAgo(msg.created_at)}</span>
                                  </div>
                                  <p className="leading-relaxed">{msg.content}</p>
                                </div>
                              </div>
                            ))}
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
                              className="flex items-center gap-2 self-end rounded-2xl bg-violet-500 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-400 disabled:opacity-40"
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
              <div className="flex flex-col items-center gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] py-20 text-center">
                <Gavel size={32} className="text-zinc-700" />
                <p className="text-sm font-bold text-zinc-600">Keine offenen Disputes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map(m => {
                  const f = resolveForms[m.match_id] ?? {} as ResolveForm;
                  const isOpen = openDispute === m.match_id;

                  return (
                    <div key={m.match_id} className="overflow-hidden rounded-[2rem] border border-red-400/15 bg-red-400/[0.04] backdrop-blur-xl">
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
                                <XCircle size={15} /> Annullieren
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
              <div className="flex flex-col items-center gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] py-20 text-center">
                <Swords size={32} className="text-zinc-700" />
                <p className="text-sm font-bold text-zinc-600">Keine aktiven Matches</p>
              </div>
            ) : (
              <div className="space-y-3">
                {liveMatches.map(m => {
                  const sc = matchStatusCfg[m.status] ?? matchStatusCfg.pending_result;
                  const isLong = m.duration_minutes > 60;

                  return (
                    <div key={m.id} className={`overflow-hidden rounded-[2rem] border backdrop-blur-xl ${
                      m.status === 'disputed'
                        ? 'border-red-400/20 bg-red-400/[0.04]'
                        : isLong
                          ? 'border-amber-300/20 bg-amber-400/[0.04]'
                          : 'border-white/10 bg-white/[0.03]'
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
                                  {m.app === 'scolia' ? '📷 Scolia' : '📱 DartCounter'}
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
                            <XCircle size={14} /> Match abbrechen
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
              <div className="flex flex-col items-center gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] py-20 text-center">
                <ShieldCheck size={32} className="text-zinc-700" />
                <p className="text-sm font-bold text-zinc-600">Keine verdächtigen Accounts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {flagged.map(p => {
                  const isOpen = openFlagged === p.id;
                  return (
                    <div key={p.id} className="overflow-hidden rounded-[2rem] border border-amber-300/15 bg-amber-400/[0.04] backdrop-blur-xl">
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
              <div className="flex flex-col items-center gap-3 rounded-[2rem] border border-white/10 bg-white/[0.03] py-20 text-center">
                <ClipboardList size={32} className="text-zinc-700" />
                <p className="text-sm font-bold text-zinc-600">Noch keine Mod-Aktionen</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                <div className="divide-y divide-white/[0.05]">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-start gap-4 px-6 py-4">
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
                        <Activity size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-zinc-200">{log.mod_username}</span>
                          <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-0.5 text-[10px] font-black text-violet-300">{log.action}</span>
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
      </div>
    </main>
  );
}
