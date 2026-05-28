'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Crown,
  ExternalLink,
  Gavel,
  Headphones,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  TriangleAlert,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';

type Profile = {
  id: string;
  supabaseId: string;
  username: string | null;
  elo: number | null;
  gamesPlayed: number | null;
  wins: number | null;
  is_banned: boolean | null;
  ban_reason: string | null;
  is_admin: boolean | null;
  is_moderator: boolean | null;
  phone_verified: boolean | null;
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
  confirmation_requested_at: string | null;
  created_at: string;
};

type AdminLog = {
  id: string;
  admin_id: string;
  admin_username: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  details: string | null;
  created_at: string;
};

type AdminTicket = {
  id: string;
  user_id: string;
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
  assigned_to_id: string | null;
  assigned_to_username: string | null;
};

type TicketMsg = {
  id: string;
  sender_name: string;
  is_staff: boolean;
  content: string;
  created_at: string;
};

type AdminTicketDetail = {
  ticket: AdminTicket;
  messages: TicketMsg[];
};

const ticketStatusConfig: Record<string, { label: string; color: string; dot: string }> = {
  open:             { label: 'Offen',           color: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-300' },
  in_progress:      { label: 'In Bearbeitung',  color: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',         dot: 'bg-cyan-300' },
  waiting_for_user: { label: 'Warte auf User',  color: 'border-amber-300/25 bg-amber-400/10 text-amber-200',      dot: 'bg-amber-300' },
  resolved:         { label: 'Gelöst',          color: 'border-zinc-300/25 bg-zinc-400/10 text-zinc-300',         dot: 'bg-zinc-400' },
  closed:           { label: 'Geschlossen',     color: 'border-zinc-700/25 bg-zinc-800/10 text-zinc-500',         dot: 'bg-zinc-600' },
};

const ticketCategoryLabels: Record<string, string> = {
  general: 'Allgemein', bug: 'Bug', account: 'Account',
  match_dispute: 'Match-Streit', ban_appeal: 'Ban-Einspruch', other: 'Sonstiges',
};

const ticketPriorityConfig: Record<string, { label: string; color: string }> = {
  low:    { label: 'Niedrig', color: 'text-zinc-400' },
  normal: { label: 'Normal',  color: 'text-zinc-300' },
  high:   { label: 'Hoch',    color: 'text-amber-300' },
  urgent: { label: 'Dringend',color: 'text-red-300' },
};

type FlaggedPlayer = {
  id: string;           // TEXT (Prisma-ID, kein UUID)
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  winrate: number;
  elo_gain_7d: number;
  account_age_days: number;
  flags: string[];
};

type LiveMatch = {
  id: string;
  player1_id: string;
  player2_id: string;
  player1_username: string;
  player2_username: string;
  player1_elo: number;
  player2_elo: number;
  status: string;
  created_at: string;
};

type ResolveFormState = {
  winnerId: string;
  player1Legs: string;
  player2Legs: string;
  player1Average: string;
  player2Average: string;
  player1Checkout: string;
  player2Checkout: string;
  adminNote: string;
};

const emptyForm: ResolveFormState = {
  winnerId: '',
  player1Legs: '',
  player2Legs: '',
  player1Average: '',
  player2Average: '',
  player1Checkout: '',
  player2Checkout: '',
  adminNote: '',
};

const inputClassName =
  'w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.075]';

const selectOptionClassName = 'bg-zinc-950 text-zinc-50';

const statCardClassName =
  'relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl';

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AdminPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [disputedMatches, setDisputedMatches] = useState<DisputedMatch[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [flaggedPlayers, setFlaggedPlayers] = useState<FlaggedPlayer[]>([]);
  const [resolveForms, setResolveForms] = useState<Record<string, ResolveFormState>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDisputes, setLoadingDisputes] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Ticket-System State
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<string | null>(null);
  const [ticketAssignmentFilter, setTicketAssignmentFilter] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<AdminTicketDetail | null>(null);
  const [ticketReply, setTicketReply] = useState('');
  const [ticketSending, setTicketSending] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('elo', { ascending: false });

    if (error) {
      setActionMessage(`Spieler konnten nicht geladen werden: ${error.message}`);
      return;
    }

    setProfiles((data || []) as Profile[]);
  }, [supabase]);

  const loadLiveMatches = useCallback(async () => {
    const { data } = await supabase
      .from('active_matches')
      .select('id, player1_id, player2_id, player1_username, player2_username, player1_elo, player2_elo, status, created_at')
      .in('status', ['pending_result', 'awaiting_confirmation'])
      .order('created_at', { ascending: false });
    if (data) setLiveMatches(data as LiveMatch[]);
  }, [supabase]);

  const adminCancelMatch = async (matchId: string) => {
    if (!confirm('Dieses Match wirklich ohne Elo-Wertung abbrechen?')) return;
    const { error } = await supabase.rpc('admin_force_cancel_match', { p_match_id: matchId });
    if (error) { setActionMessage(`Fehler: ${error.message}`); return; }
    setActionMessage('Match wurde durch Admin abgebrochen.');
    await loadLiveMatches();
  };

  const loadAdminLogs = useCallback(async () => {
    const { data } = await supabase
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setAdminLogs(data as AdminLog[]);
  }, [supabase]);

  const loadFlaggedPlayers = useCallback(async () => {
    const { data } = await supabase.rpc('get_flagged_players');
    if (data) setFlaggedPlayers(data as FlaggedPlayer[]);
  }, [supabase]);

  const loadTickets = useCallback(async (status?: string | null, assignedToId?: string | null) => {
    const { data } = await supabase.rpc('admin_get_all_tickets', {
      p_status: status ?? null,
      p_assigned_to_id: assignedToId ?? null,
      p_limit: 100,
      p_offset: 0,
    });
    if (data) setTickets(data as AdminTicket[]);
  }, [supabase]);

  const assignTicket = useCallback(async (ticketId: string, assignedToId: string | null) => {
    const { error } = await supabase.rpc('admin_assign_ticket', {
      p_ticket_id: ticketId,
      p_assigned_to_id: assignedToId,
    });
    if (error) {
      setActionMessage(`Fehler beim Zuweisen: ${error.message}`);
      return;
    }
    setActionMessage('Ticket zugewiesen.');
    await loadTickets(ticketFilter, ticketAssignmentFilter === 'my' ? currentAdminId : null);
    if (openTicketId === ticketId) await openTicketDetail(ticketId);
  }, [supabase, ticketFilter, ticketAssignmentFilter, currentAdminId, loadTickets, openTicketId]);

  const openTicketDetail = async (ticketId: string) => {
    if (openTicketId === ticketId) { setOpenTicketId(null); setTicketDetail(null); return; }
    const { data } = await supabase.rpc('admin_get_ticket_detail', { p_ticket_id: ticketId });
    if (data) { setTicketDetail(data as AdminTicketDetail); setOpenTicketId(ticketId); }
  };

  const sendTicketReply = async (ticketId: string) => {
    if (!ticketReply.trim()) return;
    setTicketSending(true);
    await supabase.rpc('send_ticket_message', { p_ticket_id: ticketId, p_content: ticketReply.trim() });
    setTicketReply('');
    setTicketSending(false);
    await openTicketDetail(ticketId);
    await loadTickets(ticketFilter, ticketAssignmentFilter === 'my' ? currentAdminId : null);
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    const { error } = await supabase.rpc('admin_update_ticket', { p_ticket_id: ticketId, p_status: status });
    if (error) {
      setActionMessage(`Fehler beim Status-Update: ${error.message}`);
      return;
    }
    await loadTickets(ticketFilter, ticketAssignmentFilter === 'my' ? currentAdminId : null);
    if (openTicketId === ticketId) await openTicketDetail(ticketId);
  };

  const updateTicketPriority = async (ticketId: string, priority: string) => {
    const { error } = await supabase.rpc('admin_update_ticket', { p_ticket_id: ticketId, p_priority: priority });
    if (error) {
      setActionMessage(`Fehler beim Prioritäts-Update: ${error.message}`);
      return;
    }
    await loadTickets(ticketFilter, ticketAssignmentFilter === 'my' ? currentAdminId : null);
    if (openTicketId === ticketId) await openTicketDetail(ticketId);
  };

  const loadDisputedMatches = useCallback(async () => {
    setLoadingDisputes(true);

    const { data, error } = await supabase.rpc('get_disputed_matches_for_admin');

    if (error) {
      setActionMessage(`Widersprochene Matches konnten nicht geladen werden: ${error.message}`);
      setLoadingDisputes(false);
      return;
    }

    const matches = (data || []) as DisputedMatch[];
    setDisputedMatches(matches);
    setResolveForms((current) => {
      const next = { ...current };

      matches.forEach((match) => {
        if (!next[match.match_id]) {
          next[match.match_id] = {
            winnerId: match.submitted_winner_id || match.player1_id,
            player1Legs: String(match.submitted_player1_legs ?? ''),
            player2Legs: String(match.submitted_player2_legs ?? ''),
            player1Average: String(match.submitted_player1_average ?? ''),
            player2Average: String(match.submitted_player2_average ?? ''),
            player1Checkout: String(match.submitted_player1_checkout ?? ''),
            player2Checkout: String(match.submitted_player2_checkout ?? ''),
            adminNote: '',
          };
        }
      });

      return next;
    });
    setLoadingDisputes(false);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }

      if (isMounted) setCurrentAdminId(session.user.id);

      const { data: me, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('supabaseId', session.user.id)
        .single();

      if (!isMounted) return;
      if (error || !me?.is_admin) {
        alert('Du hast keinen Admin-Zugriff!');
        router.push('/');
        return;
      }
      await Promise.all([loadProfiles(), loadDisputedMatches(), loadLiveMatches(), loadAdminLogs(), loadFlaggedPlayers(), loadTickets(null, null)]);
      if (isMounted) setLoading(false);
    }
    void init();
    return () => { isMounted = false; };
  }, [supabase, router, loadProfiles, loadDisputedMatches, loadLiveMatches, loadAdminLogs, loadFlaggedPlayers]);

  const refreshAdminData = useCallback(async () => {
    setActionMessage(null);
    await Promise.all([loadProfiles(), loadDisputedMatches(), loadLiveMatches(), loadAdminLogs(), loadFlaggedPlayers(), loadTickets(ticketFilter)]);
  }, [loadAdminLogs, loadDisputedMatches, loadFlaggedPlayers, loadLiveMatches, loadProfiles, loadTickets, ticketFilter]);

  const updateElo = async (id: string, newElo: number) => {
    const { error } = await supabase.from('profiles').update({ elo: newElo }).eq('id', id);

    if (error) {
      setActionMessage(`Elo konnte nicht geändert werden: ${error.message}`);
      return;
    }

    await loadProfiles();
  };

  const toggleBan = async (user: Profile) => {
    const newStatus = !user.is_banned;
    const reason = newStatus ? prompt('Ban-Grund eingeben:') : null;

    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: newStatus, ban_reason: reason })
      .eq('id', user.id);

    if (error) {
      setActionMessage(`Ban-Status konnte nicht geändert werden: ${error.message}`);
      return;
    }

    await loadProfiles();
  };

  const toggleModerator = async (id: string, current: boolean | null) => {
    const { error } = await supabase.rpc('admin_set_moderator', {
      p_user_id: id,
      p_is_mod: !current,
    });
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    setProfiles(prev =>
      prev.map(p => p.id === id ? { ...p, is_moderator: !current } : p)
    );
  };

  const toggleAdmin = async (id: string, current: boolean | null) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !current })
      .eq('id', id);

    if (error) {
      setActionMessage(`Admin-Status konnte nicht geändert werden: ${error.message}`);
      return;
    }

    await loadProfiles();
  };

  const toggleVerification = async (user: Profile) => {
    const newStatus = !user.phone_verified;
    const { error } = await supabase
      .from('profiles')
      .update({ 
        phone_verified: newStatus, 
        phone_verified_at: newStatus ? new Date().toISOString() : null 
      })
      .eq('id', user.id);

    if (error) {
      setActionMessage(`Verifizierungs-Status konnte nicht geändert werden: ${error.message}`);
      return;
    }

    setActionMessage(`Nutzer ${user.username} wurde ${newStatus ? 'manuell verifiziert' : 'Verifizierung entfernt'}.`);
    await loadProfiles();
  };

  const updateResolveForm = (matchId: string, patch: Partial<ResolveFormState>) => {
    setResolveForms((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] || emptyForm),
        ...patch,
      },
    }));
  };

  const resolveDispute = async (match: DisputedMatch) => {
    const form = resolveForms[match.match_id] || emptyForm;
    const player1Legs = Number(form.player1Legs);
    const player2Legs = Number(form.player2Legs);

    if (!form.winnerId || Number.isNaN(player1Legs) || Number.isNaN(player2Legs)) {
      setActionMessage('Bitte Gewinner und Legs korrekt ausfüllen.');
      return;
    }

    const { data, error } = await supabase.rpc('admin_resolve_disputed_match', {
      p_match_id: match.match_id,
      p_winner_id: form.winnerId,
      p_player1_legs: player1Legs,
      p_player2_legs: player2Legs,
      p_player1_average: toOptionalNumber(form.player1Average),
      p_player2_average: toOptionalNumber(form.player2Average),
      p_player1_checkout: toOptionalNumber(form.player1Checkout),
      p_player2_checkout: toOptionalNumber(form.player2Checkout),
      p_admin_note: form.adminNote.trim() || null,
    });

    if (error) {
      setActionMessage(`Admin-Entscheidung fehlgeschlagen: ${error.message}`);
      return;
    }

    const result = Array.isArray(data) ? data[0] : null;
    setActionMessage(result?.result_message || 'Match wurde durch Admin gewertet.');
    await refreshAdminData();
  };

  const cancelDispute = async (match: DisputedMatch) => {
    const form = resolveForms[match.match_id] || emptyForm;
    const confirmed = confirm('Dieses Match wirklich annullieren? Es wird keine Elo vergeben.');

    if (!confirmed) return;

    const { data, error } = await supabase.rpc('admin_cancel_disputed_match', {
      p_match_id: match.match_id,
      p_admin_note: form.adminNote.trim() || null,
    });

    if (error) {
      setActionMessage(`Annullieren fehlgeschlagen: ${error.message}`);
      return;
    }

    const result = Array.isArray(data) ? data[0] : null;
    setActionMessage(result?.result_message || 'Match wurde annulliert.');
    await refreshAdminData();
  };

  const filtered = profiles.filter((profile) =>
    profile.username?.toLowerCase().includes(search.toLowerCase())
  );

  const adminCount = profiles.filter((profile) => profile.is_admin).length;
  const bannedCount = profiles.filter((profile) => profile.is_banned).length;
  const activeCount = profiles.length - bannedCount;

  if (loading) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#050607] text-white">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,197,94,0.25),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(6,182,212,0.13),transparent_30%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_82%)]" />
          <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
        </div>
        <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-300" />
          <h1 className="mt-5 text-2xl font-black tracking-[-0.04em]">Admin Panel wird geladen</h1>
          <p className="mt-2 text-sm text-zinc-400">Zugriff und Verwaltungsdaten werden geprüft.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(34,197,94,0.24),transparent_32%),radial-gradient(circle_at_88%_10%,rgba(6,182,212,0.14),transparent_30%),radial-gradient(circle_at_50%_74%,rgba(163,230,53,0.1),transparent_36%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_84%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-5 py-8 md:px-8 lg:py-10">
        <nav className="mb-8 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-black/45 p-4 shadow-2xl shadow-black/25 backdrop-blur-2xl md:flex-row md:items-center md:justify-between">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 text-left">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Admin Control Center</div>
            </div>
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={refreshAdminData}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:border-emerald-300/45 hover:bg-emerald-400/15"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </button>
            <button
              onClick={() => router.push('/profile')}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Zum Profil
            </button>
          </div>
        </nav>

        <header className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
              Geschützter Admin-Bereich
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[0.9] tracking-[-0.07em] sm:text-5xl md:text-6xl lg:text-7xl">Admin Panel für Ladder, Spieler und Disputes.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">Verwalte Spielerprofile, prüfe widersprochene Matches und entscheide kritische Ergebnisse in einem einheitlichen RankedDarts-Dashboard.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={statCardClassName}>
              <Users className="h-7 w-7 text-emerald-300" />
              <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{profiles.length}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-400">Spieler gesamt</div>
            </div>
            <div className={statCardClassName}>
              <ShieldAlert className="h-7 w-7 text-amber-300" />
              <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{disputedMatches.length}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-400">Offene Disputes</div>
            </div>
            <div className={`${statCardClassName} col-span-2 sm:col-span-1`}>
              <Headphones className="h-7 w-7 text-violet-300" />
              <div className="mt-5 text-4xl font-black tracking-[-0.05em] text-violet-300">{tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-400">Offene Tickets</div>
            </div>
            <div className={statCardClassName}>
              <CheckCircle2 className="h-7 w-7 text-lime-300" />
              <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{activeCount}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-400">Aktive Accounts</div>
            </div>
            <div className={`${statCardClassName} ${flaggedPlayers.length > 0 ? 'border-orange-400/30 bg-orange-400/[0.06]' : ''}`}>
              <TriangleAlert className={`h-7 w-7 ${flaggedPlayers.length > 0 ? 'text-orange-300' : 'text-zinc-500'}`} />
              <div className={`mt-5 text-4xl font-black tracking-[-0.05em] ${flaggedPlayers.length > 0 ? 'text-orange-300' : ''}`}>{flaggedPlayers.length}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-400">Verdächtige Accounts</div>
            </div>
          </div>
        </header>

        {actionMessage && (
          <div className="mt-8 rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
            {actionMessage}
          </div>
        )}

        {/* Verdächtige Accounts / Anti-Smurf-Flagging */}
        {flaggedPlayers.length > 0 && (
          <section className="mt-10 rounded-[2.4rem] border border-orange-400/20 bg-orange-400/[0.03] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-orange-400/25 bg-orange-400/10 text-orange-200">
                  <TriangleAlert className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-3xl font-black tracking-[-0.045em] text-white">Verdächtige Accounts</h2>
                  <p className="mt-1 text-sm text-zinc-400">Automatisch geflaggte Spieler basierend auf Winrate, Elo-Anstieg und Account-Alter. Kein automatischer Ban – nur ein Hinweis zur manuellen Prüfung.</p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-5 py-2.5 text-sm font-black text-orange-100">
                <span className="h-2 w-2 animate-pulse rounded-full bg-orange-300" />
                {flaggedPlayers.length} zur Prüfung
              </span>
            </div>

            <div className="space-y-3">
              {flaggedPlayers.map((player) => {
                const winrate = Math.round(player.winrate);
                return (
                  <div key={player.id} className="overflow-hidden rounded-[1.5rem] border border-orange-400/15 bg-zinc-950/60 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`/players/${encodeURIComponent(player.username)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-black text-zinc-100 underline-offset-2 hover:text-emerald-300 hover:underline transition"
                          >
                            {player.username}
                          </a>
                          <span className="text-sm font-bold text-emerald-300">{player.elo} Elo</span>
                          {player.account_age_days < 14 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-300/20 bg-blue-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-blue-200">
                              <Zap className="h-2.5 w-2.5" /> Neuer Account ({player.account_age_days}d)
                            </span>
                          )}
                        </div>
                        {/* Flag-Badges */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {player.flags.map((flag) => (
                            <span key={flag} className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-orange-200">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="flex shrink-0 gap-4 text-center text-xs">
                        <div>
                          <div className="text-zinc-500">Spiele</div>
                          <div className="font-black text-zinc-200">{player.gamesPlayed}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Winrate</div>
                          <div className={`font-black ${winrate >= 85 ? 'text-orange-300' : 'text-zinc-200'}`}>{winrate}%</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Elo +7d</div>
                          <div className={`font-black ${player.elo_gain_7d >= 200 ? 'text-orange-300' : 'text-zinc-200'}`}>+{player.elo_gain_7d}</div>
                        </div>
                      </div>
                    </div>
                    {/* Aktionen */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const user = profiles.find((p) => p.id === player.id);
                          if (user) void toggleBan(user);
                        }}
                        className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-rose-100 transition hover:bg-rose-400/15"
                      >
                        Bannen
                      </button>
                      <button
                        onClick={() => refreshAdminData()}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-zinc-300 transition hover:bg-white/10"
                      >
                        Ignorieren
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Live-Matches-Übersicht */}
        <section className="mt-10 rounded-[2.4rem] border border-emerald-300/15 bg-emerald-300/[0.025] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
                <Swords className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-[-0.045em] text-white">Laufende Matches</h2>
                <p className="mt-1 text-sm text-zinc-400">Alle aktiven Matches in Echtzeit. Direkt in den Matchroom springen oder Match abbrechen.</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-2.5 text-sm font-black text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
              {liveMatches.length} aktiv
            </span>
          </div>

          {liveMatches.length === 0 ? (
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-7 text-zinc-300">
              <div className="flex items-center gap-3 font-bold text-zinc-400">
                <Swords className="h-5 w-5" />
                Keine laufenden Matches
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {liveMatches.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-4 rounded-[1.5rem] border border-white/10 bg-zinc-950/60 px-5 py-4">
                  {/* Spieler */}
                  <div className="flex flex-1 min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-black text-white">{m.player1_username}</span>
                        <span className="text-xs text-zinc-600">vs</span>
                        <span className="truncate font-black text-white">{m.player2_username}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {m.player1_elo} vs {m.player2_elo} Elo · {formatDate(m.created_at)}
                      </div>
                    </div>
                  </div>
                  {/* Status */}
                  <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                    m.status === 'awaiting_confirmation'
                      ? 'border border-amber-300/20 bg-amber-400/10 text-amber-200'
                      : 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      m.status === 'awaiting_confirmation' ? 'bg-amber-300' : 'bg-emerald-300'
                    }`} />
                    {m.status === 'awaiting_confirmation' ? 'Bestätigung' : 'Läuft'}
                  </span>
                  {/* Aktionen */}
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={`/result?matchId=${m.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200 transition hover:bg-emerald-400/20"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Matchroom
                    </a>
                    <button
                      onClick={() => adminCancelMatch(m.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-1.5 text-xs font-black text-rose-200 transition hover:bg-rose-400/15"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Abbrechen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 rounded-[2.4rem] border border-amber-300/15 bg-amber-300/[0.035] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
          <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-13 w-13 place-items-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-200">
                <Gavel className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-[-0.045em] text-white">Widersprochene Matches</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Prüfe eingereichte Ergebnisse, setze finale Matchdaten und dokumentiere deine Entscheidung transparent per Admin-Notiz.</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-5 py-2.5 text-sm font-black text-amber-100">
              {loadingDisputes && <Loader2 className="h-4 w-4 animate-spin" />}
              {loadingDisputes ? 'Lädt...' : `${disputedMatches.length} offen`}
            </span>
          </div>

          {disputedMatches.length === 0 ? (
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-7 text-zinc-300">
              <div className="flex items-center gap-3 font-bold text-emerald-200">
                <ShieldCheck className="h-5 w-5" />
                Keine offenen Widersprüche
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Aktuell gibt es keine Matches, die durch einen Admin geprüft werden müssen.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {disputedMatches.map((match) => {
                const form = resolveForms[match.match_id] || emptyForm;

                return (
                  <article key={match.match_id} className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/78 p-5 shadow-2xl shadow-black/25 backdrop-blur-2xl md:p-6">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
                    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                      <div>
                        <div className="mb-5 flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-amber-100">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Disputed
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-zinc-400">Match-ID: {match.match_id}</span>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-400/[0.055] p-5">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300/80">Spieler 1</p>
                            <p className="mt-3 text-2xl font-black tracking-[-0.04em]">{match.player1_username}</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-400">{match.player1_elo} Elo</p>
                          </div>
                          <div className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-400/[0.045] p-5">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300/80">Spieler 2</p>
                            <p className="mt-3 text-2xl font-black tracking-[-0.04em]">{match.player2_username}</p>
                            <p className="mt-1 text-sm font-semibold text-zinc-400">{match.player2_elo} Elo</p>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/30 p-5 text-sm text-zinc-300">
                          <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                            <span className="text-zinc-500">Eingereicht von</span>
                            <strong className="text-right text-zinc-100">{match.submitted_by_username || 'Unbekannt'}</strong>
                          </div>
                          <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                            <span className="text-zinc-500">Gemeldeter Gewinner</span>
                            <strong className="text-right text-zinc-100">{match.submitted_winner_username || 'Unbekannt'}</strong>
                          </div>
                          <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                            <span className="text-zinc-500">Gemeldetes Ergebnis</span>
                            <strong className="text-right text-zinc-100">{match.submitted_player1_legs ?? '—'}:{match.submitted_player2_legs ?? '—'}</strong>
                          </div>
                          <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                            <span className="text-zinc-500">Eingereicht am</span>
                            <strong className="text-right text-zinc-100">{formatDate(match.confirmation_requested_at || match.created_at)}</strong>
                          </div>
                          <div>
                            <span className="text-zinc-500">Widerspruchsgrund</span>
                            <p className="mt-2 leading-6 text-zinc-200">{match.dispute_reason || 'Kein Grund angegeben.'}</p>
                          </div>
                          {match.dispute_screenshot_url && (
                            <div className="mt-3 rounded-[1.2rem] border border-amber-300/20 bg-amber-300/[0.04] p-4">
                              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-200">
                                <ImageIcon className="h-3.5 w-3.5" />
                                Beweis-Screenshot
                              </div>
                              <a
                                href={match.dispute_screenshot_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block overflow-hidden rounded-xl border border-white/10 hover:border-amber-300/40 transition"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={match.dispute_screenshot_url}
                                  alt="Dispute Screenshot"
                                  className="w-full max-h-56 object-contain bg-black/50"
                                />
                              </a>
                              <a
                                href={match.dispute_screenshot_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-200/70 hover:text-amber-200 transition"
                              >
                                <ExternalLink className="h-3 w-3" />
                                In voller Größe öffnen
                              </a>
                            </div>
                          )}
                          {!match.dispute_screenshot_url && (
                            <div className="flex items-center gap-2 text-xs text-zinc-600">
                              <ImageIcon className="h-3.5 w-3.5" />
                              Kein Screenshot eingereicht
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-5">
                        <h3 className="flex items-center gap-2 text-xl font-black tracking-[-0.03em]">
                          <Sparkles className="h-5 w-5 text-emerald-300" />
                          Admin-Entscheidung
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">Finale Werte speichern, Elo korrekt vergeben oder das Match ohne Wertung annullieren.</p>

                        <label className="mt-5 block text-sm font-bold text-zinc-300">Gewinner</label>
                        <select
                          value={form.winnerId}
                          onChange={(event) => updateResolveForm(match.match_id, { winnerId: event.target.value })}
                          className={`${inputClassName} mt-2 [color-scheme:dark]`}
                        >
                          <option className={selectOptionClassName} value={match.player1_id}>
                            {match.player1_username}
                          </option>
                          <option className={selectOptionClassName} value={match.player2_id}>
                            {match.player2_username}
                          </option>
                        </select>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="mb-2 block text-xs font-bold text-zinc-400">Legs {match.player1_username}</span>
                            <input
                              type="number"
                              min="0"
                              value={form.player1Legs}
                              onChange={(event) => updateResolveForm(match.match_id, { player1Legs: event.target.value })}
                              className={inputClassName}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-xs font-bold text-zinc-400">Legs {match.player2_username}</span>
                            <input
                              type="number"
                              min="0"
                              value={form.player2Legs}
                              onChange={(event) => updateResolveForm(match.match_id, { player2Legs: event.target.value })}
                              className={inputClassName}
                            />
                          </label>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <input
                            type="number"
                            step="0.01"
                            placeholder={`Average ${match.player1_username}`}
                            value={form.player1Average}
                            onChange={(event) => updateResolveForm(match.match_id, { player1Average: event.target.value })}
                            className={inputClassName}
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder={`Average ${match.player2_username}`}
                            value={form.player2Average}
                            onChange={(event) => updateResolveForm(match.match_id, { player2Average: event.target.value })}
                            className={inputClassName}
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <input
                            type="number"
                            placeholder={`Checkout ${match.player1_username}`}
                            value={form.player1Checkout}
                            onChange={(event) => updateResolveForm(match.match_id, { player1Checkout: event.target.value })}
                            className={inputClassName}
                          />
                          <input
                            type="number"
                            placeholder={`Checkout ${match.player2_username}`}
                            value={form.player2Checkout}
                            onChange={(event) => updateResolveForm(match.match_id, { player2Checkout: event.target.value })}
                            className={inputClassName}
                          />
                        </div>

                        <textarea
                          placeholder="Admin-Notiz, zum Beispiel Begründung oder Discord-Nachweis"
                          value={form.adminNote}
                          onChange={(event) => updateResolveForm(match.match_id, { adminNote: event.target.value })}
                          className={`${inputClassName} mt-4 min-h-28 resize-none`}
                        />

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button
                            onClick={() => resolveDispute(match)}
                            className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-5 py-3.5 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[0_16px_45px_rgba(34,197,94,0.22)] transition hover:-translate-y-0.5"
                          >
                            Ergebnis werten
                          </button>
                          <button
                            onClick={() => cancelDispute(match)}
                            className="flex-1 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-5 py-3.5 text-sm font-black uppercase tracking-[0.14em] text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/15"
                          >
                            Ohne Elo annullieren
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-10 rounded-[2.4rem] border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="flex items-center gap-3 text-3xl font-black tracking-[-0.045em]">
                <Users className="h-7 w-7 text-emerald-300" />
                Spieler-Verwaltung
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Elo direkt korrigieren, Accounts bannen oder Admin-Rechte vergeben.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs font-bold text-zinc-400">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"><span className="block text-lg font-black text-emerald-200">{activeCount}</span>Aktiv</div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"><span className="block text-lg font-black text-amber-200">{adminCount}</span>Admins</div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"><span className="block text-lg font-black text-rose-200">{bannedCount}</span>Bans</div>
            </div>
          </div>

          <div className="relative mb-6">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Benutzer suchen..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-14 py-4 text-lg text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.075]"
            />
          </div>

          <div className="space-y-3">
            {filtered.map((user) => (
              <div key={user.id} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/25 p-4 transition hover:bg-emerald-400/[0.03] sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Name + Status */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-zinc-100">{user.username || 'Unbekannt'}</span>
                      {user.is_banned ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/20 bg-rose-400/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-rose-100"><Ban className="h-3 w-3" />Gesperrt</span>
                       ) : user.is_admin ? (
                         <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100"><Crown className="h-3 w-3" />Admin</span>
                       ) : user.is_moderator ? (
                         <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-violet-100"><Shield className="h-3 w-3" />Mod</span>
                       ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100"><Trophy className="h-3 w-3" />Aktiv</span>
                      )}
                      <button
                        onClick={() => toggleVerification(user)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${
                          user.phone_verified
                            ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
                            : 'border-white/10 bg-white/[0.04] text-zinc-500 hover:border-emerald-300/30'
                        }`}
                      >
                        {user.phone_verified ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                        {user.phone_verified ? 'Verifiziert' : 'Unverif.'}
                      </button>
                    </div>
                    {user.ban_reason && <div className="mt-1 text-xs text-rose-200/80">Ban-Grund: {user.ban_reason}</div>}
                  </div>

                  {/* Elo-Input */}
                  <input
                    type="number"
                    defaultValue={user.elo || 1000}
                    onBlur={(event) => updateElo(user.id, Number(event.target.value))}
                    className="w-20 rounded-xl border border-transparent bg-emerald-400/10 p-2 text-center text-sm font-black text-emerald-200 outline-none transition focus:border-emerald-300/40 focus:bg-emerald-400/15"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  {/* Stats */}
                  <div className="flex gap-4 text-xs text-zinc-400">
                    <span><strong className="text-zinc-200">{user.gamesPlayed || 0}</strong> Spiele</span>
                    <span><strong className="text-lime-300">{user.wins || 0}</strong> Siege</span>
                    <span><strong className="text-cyan-300">{user.gamesPlayed ? Math.round(((user.wins || 0) / user.gamesPlayed) * 100) : 0}%</strong> WR</span>
                  </div>

                  {/* Aktionen */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleBan(user)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] transition ${user.is_banned ? 'border border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15' : 'border border-rose-300/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15'}`}
                    >
                      {user.is_banned ? 'Entbannen' : 'Bannen'}
                    </button>
                    <button
                      onClick={() => toggleAdmin(user.id, user.is_admin)}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-zinc-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/10"
                    >
                      {user.is_admin ? 'Admin weg' : 'Admin'}
                    </button>
                    <button
                      onClick={() => toggleModerator(user.id, user.is_moderator)}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-zinc-200 transition hover:border-violet-300/30 hover:bg-violet-400/10"
                    >
                      {user.is_moderator ? 'Mod weg' : 'Mod'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm font-semibold text-zinc-500">
            {filtered.length} von {profiles.length} Spielern sichtbar
          </p>
        </section>

        {/* ── Support-Tickets ── */}
        <section className="mt-10 rounded-[2.4rem] border border-violet-400/20 bg-violet-400/[0.03] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-400/25 bg-violet-400/10 text-violet-200">
                <Headphones className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-[-0.045em] text-white">Support-Tickets</h2>
                <p className="mt-1 text-sm text-zinc-400">Benutzer-Anfragen verwalten, beantworten und schließen.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[null, 'open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'].map((s) => (
                <button
                  key={s ?? 'all'}
                  onClick={() => { setTicketFilter(s); void loadTickets(s, ticketAssignmentFilter === 'my' ? currentAdminId : null); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                    ticketFilter === s
                      ? 'border-violet-300/40 bg-violet-400/20 text-violet-200'
                      : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {s === null ? 'Alle' : (ticketStatusConfig[s]?.label ?? s)}
                </button>
              ))}
              <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500 self-center ml-4 mr-2">Zugewiesen:</span>
              <button
                onClick={() => { setTicketAssignmentFilter(null); void loadTickets(ticketFilter, null); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                  ticketAssignmentFilter === null
                    ? 'border-emerald-300/40 bg-emerald-400/20 text-emerald-200'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => { setTicketAssignmentFilter('my'); void loadTickets(ticketFilter, currentAdminId); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                  ticketAssignmentFilter === 'my'
                    ? 'border-emerald-300/40 bg-emerald-400/20 text-emerald-200'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                Meine
              </button>
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-500">
              <Headphones className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
              <p className="font-bold">Keine Tickets vorhanden</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => {
                const sc = ticketStatusConfig[ticket.status] ?? ticketStatusConfig.open;
                const pc = ticketPriorityConfig[ticket.priority] ?? ticketPriorityConfig.normal;
                const isOpen = openTicketId === ticket.id;
                return (
                  <div key={ticket.id} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/70">
                    {/* Ticket-Header */}
                    <button
                      onClick={() => void openTicketDetail(ticket.id)}
                      className="flex w-full items-start gap-3 p-5 text-left transition hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${sc.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                          <span className={`text-xs font-black ${pc.color}`}>{pc.label}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-zinc-400">
                            {ticketCategoryLabels[ticket.category] ?? ticket.category}
                          </span>
                          <span className="text-xs font-bold text-zinc-500">{ticket.username}</span>
                          {ticket.assigned_to_username && (
                            <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                              👤 {ticket.assigned_to_username}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-base font-black text-white">{ticket.subject}</p>
                        {ticket.last_message && (
                          <p className="mt-1 truncate text-xs text-zinc-500">{ticket.last_message}</p>
                        )}
                        <p className="mt-1 text-xs text-zinc-600">
                          {new Date(ticket.updated_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {ticket.message_count} Nachricht{ticket.message_count !== 1 ? 'en' : ''}
                        </p>
                      </div>
                      <div className="shrink-0 mt-1 text-zinc-600">
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </button>

                    {/* Ticket-Detail */}
                    {isOpen && ticketDetail && ticketDetail.ticket.id === ticket.id && (
                      <div className="border-t border-white/10 px-5 pb-5">
                        {/* Zuweisung */}
                        <div className="mb-4 flex flex-wrap gap-2 items-center">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Zugewiesen an:</span>
                          <select
                            value={ticket.assigned_to_id || ''}
                            onChange={(e) => void assignTicket(ticket.id, e.target.value || null)}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-zinc-300 outline-none transition hover:border-white/20 [color-scheme:dark]"
                          >
                            <option value="">Nicht zugewiesen</option>
                            {profiles.filter((p) => p.is_admin || p.is_moderator).map((admin) => (
                              <option key={admin.supabaseId} value={admin.supabaseId}>
                                {admin.username}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Aktionen */}
                        <div className="flex flex-wrap gap-2 py-4">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500 self-center mr-2">Status:</span>
                          {['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'].map((s) => (
                            <button
                              key={s}
                              onClick={() => void updateTicketStatus(ticket.id, s)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                                ticket.status === s
                                  ? `${ticketStatusConfig[s]?.color ?? ''} opacity-100`
                                  : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-white'
                              }`}
                            >
                              {ticketStatusConfig[s]?.label ?? s}
                            </button>
                          ))}
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500 self-center ml-4 mr-2">Priorität:</span>
                          {['low', 'normal', 'high', 'urgent'].map((p) => (
                            <button
                              key={p}
                              onClick={() => void updateTicketPriority(ticket.id, p)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                                ticket.priority === p
                                  ? 'border-violet-300/40 bg-violet-400/15 text-violet-200'
                                  : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-white'
                              }`}
                            >
                              {ticketPriorityConfig[p]?.label ?? p}
                            </button>
                          ))}
                        </div>

                        {/* Nachrichten */}
                        <div className="space-y-3 max-h-96 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-4">
                          {ticketDetail.messages.map((msg) => (
                            <div key={msg.id} className={`rounded-2xl p-4 ${
                              msg.is_staff
                                ? 'border border-emerald-300/20 bg-emerald-400/[0.07] ml-8'
                                : 'border border-white/10 bg-white/[0.04] mr-8'
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-black ${ msg.is_staff ? 'text-emerald-300' : 'text-white'}`}>{msg.sender_name}</span>
                                {msg.is_staff && (
                                  <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Support</span>
                                )}
                                <span className="ml-auto text-[10px] text-zinc-600">
                                  {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-sm leading-6 text-zinc-300 whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          ))}
                        </div>

                        {/* Antwort */}
                        {!['resolved', 'closed'].includes(ticket.status) && (
                          <div className="mt-4 flex gap-3">
                            <textarea
                              value={ticketReply}
                              onChange={(e) => setTicketReply(e.target.value)}
                              placeholder="Als Support antworten…"
                              rows={3}
                              className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-300/40 focus:bg-white/[0.07]"
                            />
                            <button
                              onClick={() => void sendTicketReply(ticket.id)}
                              disabled={ticketSending || !ticketReply.trim()}
                              className="grid h-12 w-12 shrink-0 place-items-center self-end rounded-2xl bg-gradient-to-br from-violet-400 to-purple-300 text-black transition hover:scale-105 disabled:opacity-40"
                            >
                              <Send size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Admin-Aktions-Log */}
        <section className="mt-10 rounded-[2.4rem] border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-[-0.045em] text-white">Admin-Aktions-Log</h2>
                <p className="mt-1 text-sm text-zinc-400">Alle Admin-Aktionen der letzten 100 Einträge. Wer hat was wann gemacht.</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2.5 text-sm font-black text-cyan-100">
              {adminLogs.length} Einträge
            </span>
          </div>

          {adminLogs.length === 0 ? (
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.035] p-7 text-zinc-500">
              <div className="flex items-center gap-3 font-bold">
                <ClipboardList className="h-5 w-5" />
                Noch keine Admin-Aktionen protokolliert
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[1.7rem] border border-white/10">
              {/* Header-Zeile */}
              <div className="hidden grid-cols-[1fr_1fr_1.5fr_1fr_auto] gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 sm:grid">
                <span>Admin</span>
                <span>Aktion</span>
                <span>Ziel</span>
                <span>Details</span>
                <span>Zeit</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {adminLogs.map((log) => (
                  <div key={log.id} className="grid gap-2 px-5 py-3.5 transition hover:bg-white/[0.02] sm:grid-cols-[1fr_1fr_1.5fr_1fr_auto] sm:items-center sm:gap-4">
                    {/* Admin */}
                    <div className="flex items-center gap-2">
                      <Crown className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                      <span className="text-sm font-black text-cyan-100">{log.admin_username}</span>
                    </div>
                    {/* Aktion */}
                    <div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ${
                        log.action.includes('BAN') ? 'border border-rose-300/20 bg-rose-400/10 text-rose-200' :
                        log.action.includes('UNBAN') ? 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-200' :
                        log.action.includes('CANCEL') ? 'border border-red-300/20 bg-red-400/10 text-red-200' :
                        log.action.includes('RESOLVE') ? 'border border-amber-300/20 bg-amber-400/10 text-amber-200' :
                        log.action.includes('ELO') ? 'border border-blue-300/20 bg-blue-400/10 text-blue-200' :
                        log.action.includes('ADMIN') ? 'border border-cyan-300/20 bg-cyan-400/10 text-cyan-200' :
                        'border border-white/10 bg-white/[0.04] text-zinc-300'
                      }`}>
                        {log.action}
                      </span>
                    </div>
                    {/* Ziel */}
                    <div className="min-w-0">
                      {log.target_label ? (
                        <span className="truncate text-sm font-semibold text-zinc-200">{log.target_label}</span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                      {log.target_type && (
                        <span className="ml-2 text-[10px] text-zinc-600">{log.target_type}</span>
                      )}
                    </div>
                    {/* Details */}
                    <div className="min-w-0">
                      {log.details ? (
                        <span className="truncate text-xs text-zinc-400">{log.details}</span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </div>
                    {/* Zeit */}
                    <div className="shrink-0 text-xs text-zinc-500">{formatDate(log.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
