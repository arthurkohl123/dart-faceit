'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Activity,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Command,
  Crown,
  Download,
  ExternalLink,
  Gavel,
  Headphones,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  RefreshCw,
  Radar,
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
  X,
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
  isPremium: boolean | null;
  stripe_subscription_status: string | null;
  premium_manual_granted_at: string | null;
  premium_manual_until: string | null;
  premium_manual_reason: string | null;
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

type SoftResetResult = {
  reset_id: string;
  player_count: number;
  changed_count: number;
  average_before: number;
  average_after: number;
  minimum_before: number;
  maximum_before: number;
  minimum_after: number;
  maximum_after: number;
};

type AdminTournament = {
  id: string; title: string; description: string; starts_at: string; registration_closes_at: string;
  max_players: number; best_of: number; premium_only: boolean; max_average: number | null; min_average: number | null;
  status: 'registration' | 'live' | 'completed' | 'cancelled'; participant_count: number; winner_username: string | null;
  scoring_platform: 'scolia' | 'dartcounter'; requires_access_code: boolean;
};

type TournamentMatch = {
  id: string; round_number: number; match_number: number; player1_id: string | null; player2_id: string | null;
  player1_username: string | null; player2_username: string | null; winner_id: string | null; status: string;
};

type TournamentForm = {
  title: string; description: string; startsAt: string; closesAt: string; maxPlayers: string; bestOf: string;
  premiumOnly: boolean; maxAverage: string; minAverage: string; scoringPlatform: 'scolia' | 'dartcounter'; accessCode: string;
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
  const [pendingLiveCancelMatchId, setPendingLiveCancelMatchId] = useState<string | null>(null);
  const [pendingDisputeCancelMatchId, setPendingDisputeCancelMatchId] = useState<string | null>(null);
  const [banReasonUserId, setBanReasonUserId] = useState<string | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('');
  const [premiumEditorUserId, setPremiumEditorUserId] = useState<string | null>(null);
  const [premiumDuration, setPremiumDuration] = useState<'7' | '30' | '90' | 'unlimited'>('30');
  const [premiumReason, setPremiumReason] = useState('');
  const [premiumSavingUserId, setPremiumSavingUserId] = useState<string | null>(null);
  const [softResetSeasonLabel, setSoftResetSeasonLabel] = useState('Season 02');
  const [softResetConfirming, setSoftResetConfirming] = useState(false);
  const [softResetLoading, setSoftResetLoading] = useState(false);
  const [softResetResult, setSoftResetResult] = useState<SoftResetResult | null>(null);
  const [softResetRollbackConfirming, setSoftResetRollbackConfirming] = useState(false);

  // Ticket-System State
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<string | null>(null);
  const [ticketAssignmentFilter, setTicketAssignmentFilter] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<AdminTicketDetail | null>(null);
  const [ticketReply, setTicketReply] = useState('');
  const [ticketSending, setTicketSending] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [tournamentForm, setTournamentForm] = useState<TournamentForm>({ title: '', description: '', startsAt: '', closesAt: '', maxPlayers: '8', bestOf: '5', premiumOnly: false, maxAverage: '', minAverage: '', scoringPlatform: 'dartcounter', accessCode: '' });
  const [tournamentSaving, setTournamentSaving] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [tournamentBracket, setTournamentBracket] = useState<TournamentMatch[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'disputes' | 'live' | 'tournaments' | 'tickets' | 'logs' | 'flagged'>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);

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
    if (pendingLiveCancelMatchId !== matchId) {
      setPendingLiveCancelMatchId(matchId);
      setActionMessage('Bitte bestätige den Match-Abbruch direkt in der Live-Match-Karte.');
      return;
    }
    const { error } = await supabase.rpc('admin_force_cancel_match', { p_match_id: matchId });
    if (error) { setActionMessage(`Fehler: ${error.message}`); return; }
    setPendingLiveCancelMatchId(null);
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

  const loadTournaments = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_tournaments');
    if (error) { setActionMessage(`Turniere konnten nicht geladen werden: ${error.message}`); return; }
    setTournaments((data || []) as AdminTournament[]);
  }, [supabase]);

  const loadTournamentBracket = useCallback(async (tournamentId: string) => {
    setSelectedTournamentId(tournamentId);
    const { data, error } = await supabase.rpc('get_tournament_bracket', { p_tournament_id: tournamentId });
    if (error) { setActionMessage(`Turnierbaum konnte nicht geladen werden: ${error.message}`); return; }
    setTournamentBracket((data || []) as TournamentMatch[]);
  }, [supabase]);

  const createTournament = async () => {
    if (!tournamentForm.title.trim() || !tournamentForm.startsAt || !tournamentForm.closesAt) {
      setActionMessage('Bitte gib Titel, Anmeldeschluss und Startzeit an.'); return;
    }
    setTournamentSaving(true);
    const { error } = await supabase.rpc('admin_create_tournament', {
      p_title: tournamentForm.title.trim(), p_description: tournamentForm.description.trim(),
      p_starts_at: new Date(tournamentForm.startsAt).toISOString(), p_registration_closes_at: new Date(tournamentForm.closesAt).toISOString(),
      p_max_players: Number(tournamentForm.maxPlayers), p_best_of: Number(tournamentForm.bestOf), p_premium_only: tournamentForm.premiumOnly,
      p_max_average: toOptionalNumber(tournamentForm.maxAverage), p_min_average: toOptionalNumber(tournamentForm.minAverage),
      p_scoring_platform: tournamentForm.scoringPlatform, p_access_code: tournamentForm.accessCode.trim() || null,
    });
    setTournamentSaving(false);
    if (error) { setActionMessage(`Turnier konnte nicht erstellt werden: ${error.message}`); return; }
    setTournamentForm({ title: '', description: '', startsAt: '', closesAt: '', maxPlayers: '8', bestOf: '5', premiumOnly: false, maxAverage: '', minAverage: '', scoringPlatform: 'dartcounter', accessCode: '' });
    setActionMessage('Turnier ist veröffentlicht und für Spieler sichtbar.');
    await loadTournaments();
  };

  const startTournament = async (tournamentId: string) => {
    const { error } = await supabase.rpc('admin_generate_tournament_bracket', { p_tournament_id: tournamentId });
    if (error) { setActionMessage(`Turnier konnte nicht gestartet werden: ${error.message}`); return; }
    setActionMessage('Turnierbaum ausgelost – das Turnier ist jetzt live.');
    await Promise.all([loadTournaments(), loadTournamentBracket(tournamentId)]);
  };

  const reportTournamentWinner = async (matchId: string, winnerId: string) => {
    const { error } = await supabase.rpc('admin_report_tournament_winner', { p_match_id: matchId, p_winner_id: winnerId });
    if (error) { setActionMessage(`Ergebnis konnte nicht gespeichert werden: ${error.message}`); return; }
    setActionMessage('Ergebnis gespeichert. Der nächste Bracket-Schritt wurde aktualisiert.');
    if (selectedTournamentId) await Promise.all([loadTournaments(), loadTournamentBracket(selectedTournamentId)]);
  };

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

  async function openTicketDetail(ticketId: string) {
    if (openTicketId === ticketId) { setOpenTicketId(null); setTicketDetail(null); return; }
    const { data } = await supabase.rpc('admin_get_ticket_detail', { p_ticket_id: ticketId });
    if (data) { setTicketDetail(data as AdminTicketDetail); setOpenTicketId(ticketId); }
  }

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
        setActionMessage('Du hast keinen Admin-Zugriff. Du wirst zur Startseite weitergeleitet.');
        setTimeout(() => router.push('/'), 1200);
        return;
      }
      await Promise.all([loadProfiles(), loadDisputedMatches(), loadLiveMatches(), loadAdminLogs(), loadFlaggedPlayers(), loadTickets(null, null), loadTournaments()]);
      if (isMounted) {
        setLastRefreshedAt(new Date());
        setLoading(false);
      }
    }
    void init();
    return () => { isMounted = false; };
  }, [supabase, router, loadProfiles, loadDisputedMatches, loadLiveMatches, loadAdminLogs, loadFlaggedPlayers, loadTickets, loadTournaments]);

  const refreshAdminData = useCallback(async () => {
    setActionMessage(null);
    await Promise.all([loadProfiles(), loadDisputedMatches(), loadLiveMatches(), loadAdminLogs(), loadFlaggedPlayers(), loadTickets(ticketFilter), loadTournaments()]);
    setLastRefreshedAt(new Date());
  }, [loadAdminLogs, loadDisputedMatches, loadFlaggedPlayers, loadLiveMatches, loadProfiles, loadTickets, loadTournaments, ticketFilter]);

  useEffect(() => {
    if (!autoRefresh || loading) return;
    const timer = window.setInterval(() => { void refreshAdminData(); }, 30000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loading, refreshAdminData]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandCenterOpen(true);
      }
      if (event.key === 'Escape') setCommandCenterOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

    if (newStatus && banReasonUserId !== user.id) {
      setBanReasonUserId(user.id);
      setBanReasonInput(user.ban_reason || '');
      setActionMessage(`Bitte gib den Ban-Grund für ${user.username || 'diesen Nutzer'} direkt in der Spielerliste ein.`);
      return;
    }

    const reason = newStatus ? (banReasonInput.trim() || null) : null;

    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: newStatus, ban_reason: reason })
      .eq('id', user.id);

    if (error) {
      setActionMessage(`Ban-Status konnte nicht geändert werden: ${error.message}`);
      return;
    }

    setBanReasonUserId(null);
    setBanReasonInput('');
    setActionMessage(newStatus ? 'Nutzer wurde gesperrt.' : 'Nutzer wurde entsperrt.');
    await loadProfiles();
  };

  const toggleModerator = async (id: string, current: boolean | null) => {
    const { error } = await supabase.rpc('admin_set_moderator', {
      p_user_id: id,
      p_is_mod: !current,
    });
    if (error) {
      setActionMessage('Fehler: ' + error.message);
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

  const executeSoftEloReset = async () => {
    const seasonLabel = softResetSeasonLabel.trim();
    if (!seasonLabel) {
      setActionMessage('Bitte gib eine Season-Bezeichnung ein.');
      return;
    }

    if (!softResetConfirming) {
      setSoftResetConfirming(true);
      setActionMessage('Soft Reset vorbereitet. Prüfe die Vorschau und bestätige die Aktion ein zweites Mal.');
      return;
    }

    setSoftResetLoading(true);
    setActionMessage(null);
    const { data, error } = await supabase.rpc('admin_execute_soft_elo_reset', {
      p_season_label: seasonLabel,
      p_anchor_elo: 1000,
      p_compression_factor: 0.5,
      p_confirmation: 'SOFT RESET',
    });
    setSoftResetLoading(false);

    if (error) {
      setActionMessage(`Soft Reset fehlgeschlagen: ${error.message}`);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as SoftResetResult | null;
    if (!result) {
      setActionMessage('Soft Reset wurde ausgeführt, aber die Zusammenfassung fehlt.');
      return;
    }

    setSoftResetResult(result);
    setSoftResetConfirming(false);
    setActionMessage(`${seasonLabel} ist aktiv: ${result.changed_count} Elo-Werte wurden sicher komprimiert.`);
    await loadProfiles();
  };

  const rollbackSoftEloReset = async () => {
    if (!softResetResult) return;
    if (!softResetRollbackConfirming) {
      setSoftResetRollbackConfirming(true);
      setActionMessage('Rollback vorbereitet. Bestätige erneut, um alle gesicherten Elo-Werte wiederherzustellen.');
      return;
    }

    setSoftResetLoading(true);
    const { data, error } = await supabase.rpc('admin_rollback_soft_elo_reset', {
      p_reset_id: softResetResult.reset_id,
      p_confirmation: 'ROLLBACK',
    });
    setSoftResetLoading(false);

    if (error) {
      setActionMessage(`Rollback fehlgeschlagen: ${error.message}`);
      return;
    }

    const restored = Array.isArray(data) ? Number(data[0]?.restored_players ?? 0) : 0;
    setSoftResetResult(null);
    setSoftResetRollbackConfirming(false);
    setActionMessage(`Rollback abgeschlossen: ${restored} Elo-Werte wurden wiederhergestellt.`);
    await loadProfiles();
  };

  const updateManualPremium = async (user: Profile, active: boolean) => {
    const reason = premiumReason.trim();
    if (!reason) {
      setActionMessage('Bitte trage für die Premium-Änderung eine interne Begründung ein.');
      return;
    }

    const until = active && premiumDuration !== 'unlimited'
      ? new Date(Date.now() + Number(premiumDuration) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    setPremiumSavingUserId(user.id);
    const { error } = await supabase.rpc('admin_set_manual_premium', {
      p_profile_id: user.id,
      p_active: active,
      p_until: until,
      p_reason: reason,
    });
    setPremiumSavingUserId(null);

    if (error) {
      setActionMessage(`Premium konnte nicht geändert werden: ${error.message}`);
      return;
    }

    setPremiumEditorUserId(null);
    setPremiumReason('');
    setPremiumDuration('30');
    setActionMessage(active
      ? `Premium wurde für ${user.username || 'den Spieler'} aktiviert.`
      : `Die manuelle Premium-Freigabe für ${user.username || 'den Spieler'} wurde beendet.`);
    await Promise.all([loadProfiles(), loadAdminLogs()]);
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

    if (pendingDisputeCancelMatchId !== match.match_id) {
      setPendingDisputeCancelMatchId(match.match_id);
      setActionMessage('Bitte bestätige die Annullierung direkt in der Dispute-Karte.');
      return;
    }

    const { data, error } = await supabase.rpc('admin_cancel_disputed_match', {
      p_match_id: match.match_id,
      p_admin_note: form.adminNote.trim() || null,
    });

    if (error) {
      setActionMessage(`Annullieren fehlgeschlagen: ${error.message}`);
      return;
    }

    const result = Array.isArray(data) ? data[0] : null;
    setPendingDisputeCancelMatchId(null);
    setActionMessage(result?.result_message || 'Match wurde annulliert.');
    await refreshAdminData();
  };

  const filtered = profiles.filter((profile) =>
    profile.username?.toLowerCase().includes(search.toLowerCase())
  );

  const adminCount = profiles.filter((profile) => profile.is_admin).length;
  const bannedCount = profiles.filter((profile) => profile.is_banned).length;
  const premiumCount = profiles.filter((profile) => profile.isPremium).length;
  const activeCount = profiles.length - bannedCount;
  const eloValues = profiles.map((profile) => profile.elo ?? 1000);
  const projectedEloValues = eloValues.map((elo) => Math.round(1000 + ((elo - 1000) * 0.5)));
  const projectedChangedCount = eloValues.filter((elo, index) => elo !== projectedEloValues[index]).length;
  const projectedAverage = projectedEloValues.length
    ? projectedEloValues.reduce((sum, elo) => sum + elo, 0) / projectedEloValues.length
    : 1000;
  const projectedMinimum = projectedEloValues.length ? Math.min(...projectedEloValues) : 1000;
  const projectedMaximum = projectedEloValues.length ? Math.max(...projectedEloValues) : 1000;
  const ticketsInQueue = tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'in_progress').length;
  const ticketsWaitingForUser = tickets.filter((ticket) => ticket.status === 'waiting_for_user').length;
  const unassignedTickets = tickets.filter((ticket) => !ticket.assigned_to_id && !['resolved', 'closed'].includes(ticket.status)).length;
  const urgentTickets = tickets.filter((ticket) => ticket.priority === 'urgent' && !['resolved', 'closed'].includes(ticket.status)).length;
  const attentionCount = disputedMatches.length + urgentTickets + flaggedPlayers.length + unassignedTickets;
  const activeTournamentCount = tournaments.filter((tournament) => tournament.status === 'registration' || tournament.status === 'live').length;
  const healthScore = Math.max(0, 100 - Math.min(100, (disputedMatches.length * 12) + (urgentTickets * 10) + (flaggedPlayers.length * 6) + (unassignedTickets * 5)));

  const goToSection = (section: typeof activeTab) => {
    setActiveTab(section);
    setCommandCenterOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportOperationsSnapshot = () => {
    const report = [
      ['RankedDarts Operations Snapshot', new Date().toLocaleString('de-DE')],
      ['System Health', `${healthScore}%`],
      ['Spieler gesamt', String(profiles.length)],
      ['Aktive Accounts', String(activeCount)],
      ['Offene Disputes', String(disputedMatches.length)],
      ['Live Matches', String(liveMatches.length)],
      ['Support Queue', String(ticketsInQueue)],
      ['Dringende Tickets', String(urgentTickets)],
      ['Nicht zugewiesene Tickets', String(unassignedTickets)],
      ['Verdächtige Accounts', String(flaggedPlayers.length)],
      ['Aktive Turniere', String(activeTournamentCount)],
    ].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\n');
    const blob = new Blob([report], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `rankeddarts-operations-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setActionMessage('Operations-Snapshot wurde als CSV exportiert.');
    setCommandCenterOpen(false);
  };

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

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-5 sm:px-7 sm:py-8 lg:px-10">
        {commandCenterOpen && (
          <div className="fixed inset-0 z-50 grid place-items-start bg-[#020304]/85 px-4 py-16 backdrop-blur-xl sm:place-items-center">
            <section className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/15 bg-[#0d1117] shadow-[0_30px_120px_rgba(0,0,0,0.75)]">
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-300 text-black"><Command className="h-5 w-5" /></div><div><p className="font-black">Command Center</p><p className="text-xs text-zinc-500">Schnelle Navigation und Operations-Aktionen</p></div></div><button onClick={() => setCommandCenterOpen(false)} className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                {[['disputes', 'Disputes priorisieren', `${disputedMatches.length} offen`, Gavel, 'text-amber-200'], ['tickets', 'Support Queue öffnen', `${ticketsInQueue} in Bearbeitung`, Headphones, 'text-violet-200'], ['live', 'Live Arena beobachten', `${liveMatches.length} Matches`, Radar, 'text-emerald-200'], ['flagged', 'Fairness Monitor', `${flaggedPlayers.length} Accounts`, TriangleAlert, 'text-orange-200'], ['tournaments', 'Cup Control', `${activeTournamentCount} aktiv`, Trophy, 'text-cyan-200'], ['players', 'Spieler verwalten', `${profiles.length} Profile`, Users, 'text-zinc-100']].map(([id, title, meta, Icon, tone]) => {
                  const SectionIcon = Icon as typeof Gavel;
                  return <button key={id as string} onClick={() => goToSection(id as typeof activeTab)} className="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-left transition hover:border-emerald-300/25 hover:bg-emerald-400/[0.07]"><SectionIcon className={`h-5 w-5 ${tone as string}`} /><span><span className="block text-sm font-black text-white">{title as string}</span><span className="mt-0.5 block text-xs text-zinc-500">{meta as string}</span></span></button>;
                })}
              </div>
              <div className="flex flex-col gap-2 border-t border-white/10 bg-black/20 p-4 sm:flex-row"><button onClick={() => void refreshAdminData()} className="flex-1 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/20">Alle Daten aktualisieren</button><button onClick={exportOperationsSnapshot} className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-xs font-black text-zinc-200 transition hover:bg-white/10">Snapshot exportieren</button></div>
            </section>
          </div>
        )}

        <section className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#090d13]/95 shadow-[0_35px_120px_rgba(0,0,0,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(16,185,129,0.21),transparent_31%),radial-gradient(circle_at_88%_15%,rgba(34,211,238,0.16),transparent_28%),linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.025)_48%,transparent_75%)]" />
          <div className="relative border-b border-white/10 px-5 py-4 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button onClick={() => router.push('/')} className="flex items-center gap-3 text-left"><div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 via-lime-200 to-cyan-200 font-black text-black shadow-[0_0_30px_rgba(110,231,183,0.35)]">R</div><div><p className="text-sm font-black tracking-[-0.04em] text-white">RANKEDDARTS / OPS</p><p className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-300/80">Private administrator workspace</p></div></button>
              <div className="flex items-center gap-2"><button onClick={() => setAutoRefresh((enabled) => !enabled)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${autoRefresh ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/[0.035] text-zinc-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-emerald-300 animate-pulse' : 'bg-zinc-500'}`} />Sync {autoRefresh ? 'an' : 'aus'}</button><button onClick={() => setCommandCenterOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.09]"><Command className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Command</span><kbd className="hidden rounded border border-white/10 px-1 py-0.5 text-[9px] text-zinc-500 sm:inline">⌘K</kbd></button></div>
            </div>
          </div>

          <div className="relative grid gap-8 px-5 py-8 sm:px-7 lg:grid-cols-[1.2fr_0.8fr] lg:px-9 lg:py-10">
            <div><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100"><Activity className="h-3.5 w-3.5" /> Operations telemetry · {lastRefreshedAt ? `letzter Sync ${lastRefreshedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'initialisiert'}</div><h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.84] tracking-[-0.08em] text-white sm:text-6xl xl:text-7xl">Mission control<br /><span className="bg-gradient-to-r from-emerald-200 via-lime-200 to-cyan-200 bg-clip-text text-transparent">für die ganze Arena.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">Kein Admin-Chaos, keine versteckten Probleme. Priorisiere Fairness, Support und Turniere aus einer klaren Operations-Zentrale.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={() => goToSection(attentionCount > 0 ? 'disputes' : 'overview')} className="rounded-2xl bg-emerald-300 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:-translate-y-0.5 hover:bg-emerald-200">{attentionCount > 0 ? `${attentionCount} Vorgänge prüfen` : 'Systemübersicht öffnen'}</button><button onClick={() => void refreshAdminData()} className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.09]"><RefreshCw className="h-3.5 w-3.5" /> Jetzt synchronisieren</button></div></div>
            <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr] lg:grid-cols-1 xl:grid-cols-[0.8fr_1.2fr]"><div className="relative grid min-h-48 place-items-center overflow-hidden rounded-[2rem] border border-white/10 bg-black/30"><div className="absolute h-44 w-44 rounded-full opacity-90" style={{ background: `conic-gradient(#6ee7b7 ${healthScore}%, rgba(255,255,255,0.08) 0)` }} /><div className="absolute h-36 w-36 rounded-full bg-[#0b0f14]" /><div className="relative text-center"><p className="text-4xl font-black tracking-[-0.07em] text-white">{healthScore}</p><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Health score</p></div></div><div className="grid grid-cols-2 gap-3"><button onClick={() => goToSection('disputes')} className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-left transition hover:bg-amber-300/[0.12]"><Gavel className="h-4 w-4 text-amber-200" /><p className="mt-5 text-3xl font-black">{disputedMatches.length}</p><p className="text-[10px] font-black uppercase tracking-[0.13em] text-amber-100/70">Disputes</p></button><button onClick={() => goToSection('tickets')} className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.06] p-4 text-left transition hover:bg-violet-400/[0.12]"><Headphones className="h-4 w-4 text-violet-200" /><p className="mt-5 text-3xl font-black">{ticketsInQueue}</p><p className="text-[10px] font-black uppercase tracking-[0.13em] text-violet-100/70">Support queue</p></button><button onClick={() => goToSection('live')} className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4 text-left transition hover:bg-emerald-400/[0.12]"><Radar className="h-4 w-4 text-emerald-200" /><p className="mt-5 text-3xl font-black">{liveMatches.length}</p><p className="text-[10px] font-black uppercase tracking-[0.13em] text-emerald-100/70">Live matches</p></button><button onClick={() => goToSection('tournaments')} className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-4 text-left transition hover:bg-cyan-400/[0.12]"><Trophy className="h-4 w-4 text-cyan-200" /><p className="mt-5 text-3xl font-black">{activeTournamentCount}</p><p className="text-[10px] font-black uppercase tracking-[0.13em] text-cyan-100/70">Active cups</p></button></div></div>
          </div>
          <div className="relative grid border-t border-white/10 bg-black/20 sm:grid-cols-3"><button onClick={() => goToSection('flagged')} className="flex items-center gap-3 border-b border-white/10 px-5 py-4 text-left transition hover:bg-orange-400/[0.06] sm:border-b-0 sm:border-r"><TriangleAlert className="h-4 w-4 text-orange-300" /><span><span className="block text-xs font-black text-white">Fairness monitor</span><span className="text-[11px] text-zinc-500">{flaggedPlayers.length ? `${flaggedPlayers.length} Accounts brauchen Prüfung` : 'Keine auffälligen Signale'}</span></span></button><button onClick={() => goToSection('tickets')} className="flex items-center gap-3 border-b border-white/10 px-5 py-4 text-left transition hover:bg-violet-400/[0.06] sm:border-b-0 sm:border-r"><MessageCircle className="h-4 w-4 text-violet-300" /><span><span className="block text-xs font-black text-white">Support routing</span><span className="text-[11px] text-zinc-500">{unassignedTickets ? `${unassignedTickets} Tickets nicht zugewiesen` : 'Jedes Ticket hat einen Owner'}</span></span></button><button onClick={exportOperationsSnapshot} className="flex items-center gap-3 px-5 py-4 text-left transition hover:bg-emerald-400/[0.06]"><Download className="h-4 w-4 text-emerald-300" /><span><span className="block text-xs font-black text-white">Operations snapshot</span><span className="text-[11px] text-zinc-500">CSV-Bericht für deinen Team-Stand</span></span></button></div>
        </section>




        {/* ── Tab-Navigation ── */}
        <div className="sticky top-3 z-30 mt-8 flex flex-wrap gap-2 rounded-[1.6rem] border border-white/10 bg-zinc-950/80 p-2 shadow-2xl shadow-black/30 backdrop-blur-2xl">
          {([
            { id: 'overview',  label: 'Übersicht',   icon: <Trophy className="h-4 w-4" />,         badge: null },
            { id: 'disputes',  label: 'Disputes',    icon: <Gavel className="h-4 w-4" />,           badge: disputedMatches.length > 0 ? disputedMatches.length : null },
            { id: 'live',      label: 'Live',        icon: <Swords className="h-4 w-4" />,          badge: liveMatches.length > 0 ? liveMatches.length : null },
            { id: 'tournaments', label: 'Turniere',  icon: <Trophy className="h-4 w-4" />,          badge: tournaments.filter(t => t.status === 'registration' || t.status === 'live').length || null },
            { id: 'players',   label: 'Spieler',     icon: <Users className="h-4 w-4" />,           badge: null },
            { id: 'tickets',   label: 'Tickets',     icon: <Headphones className="h-4 w-4" />,      badge: tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length > 0 ? tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length : null },
            { id: 'flagged',   label: 'Verdächtig',  icon: <TriangleAlert className="h-4 w-4" />,   badge: flaggedPlayers.length > 0 ? flaggedPlayers.length : null },
            { id: 'logs',      label: 'Logs',        icon: <ClipboardList className="h-4 w-4" />,   badge: null },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-emerald-400/20 to-cyan-400/10 text-white shadow-[0_8px_25px_rgba(34,197,94,0.10)]'
                  : 'text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge !== null && (
                <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                  activeTab === tab.id ? 'bg-emerald-400/30 text-emerald-200' : 'bg-white/10 text-zinc-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab-Inhalte ── */}
        <div className="mt-6">
          {activeTab === 'overview' && (
            <div>
              {actionMessage && (
                <div className="mb-6 rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
                  {actionMessage}
                </div>
              )}
              <div className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/25"><div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" /><div className="relative flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Next best action</p><h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">{attentionCount > 0 ? 'Die Arena braucht Aufmerksamkeit.' : 'Alles unter Kontrolle.'}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-zinc-400">{attentionCount > 0 ? `${disputedMatches.length} Disputes, ${urgentTickets} dringende Tickets und ${flaggedPlayers.length} verdächtige Accounts warten auf Prüfung.` : 'Keine eskalierten Vorgänge. Nutze die Zeit für Spielerpflege oder den nächsten Cup.'}</p></div><div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border ${attentionCount > 0 ? 'border-amber-300/25 bg-amber-300/10 text-amber-200' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200'}`}>{attentionCount > 0 ? <AlertTriangle className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}</div></div><div className="relative mt-5 flex flex-wrap gap-2">{disputedMatches.length > 0 && <button onClick={() => setActiveTab('disputes')} className="rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-black transition hover:bg-amber-200">Disputes prüfen</button>}{urgentTickets > 0 && <button onClick={() => setActiveTab('tickets')} className="rounded-xl border border-violet-300/25 bg-violet-400/10 px-4 py-2.5 text-xs font-black text-violet-100 transition hover:bg-violet-400/20">Dringende Tickets</button>}{flaggedPlayers.length > 0 && <button onClick={() => setActiveTab('flagged')} className="rounded-xl border border-orange-300/25 bg-orange-400/10 px-4 py-2.5 text-xs font-black text-orange-100 transition hover:bg-orange-400/20">Accounts prüfen</button>}{attentionCount === 0 && <button onClick={() => setActiveTab('tournaments')} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-black transition hover:bg-emerald-200">Cup erstellen</button>}</div></section>
                <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">System Pulse</p><div className="mt-5 space-y-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-zinc-400"><span className="h-2 w-2 rounded-full bg-emerald-300" />Match-System</span><span className="text-xs font-black text-emerald-200">ONLINE</span></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-zinc-400"><span className={`h-2 w-2 rounded-full ${urgentTickets > 0 ? 'bg-amber-300' : 'bg-emerald-300'}`} />Support-SLA</span><span className={`text-xs font-black ${urgentTickets > 0 ? 'text-amber-200' : 'text-emerald-200'}`}>{urgentTickets > 0 ? 'PRIORITÄT' : 'STABIL'}</span></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-zinc-400"><span className={`h-2 w-2 rounded-full ${flaggedPlayers.length > 0 ? 'bg-orange-300' : 'bg-emerald-300'}`} />Fairness Monitor</span><span className={`text-xs font-black ${flaggedPlayers.length > 0 ? 'text-orange-200' : 'text-emerald-200'}`}>{flaggedPlayers.length > 0 ? 'PRÜFUNG' : 'CLEAR'}</span></div></div></section>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className={statCardClassName}>
                  <Users className="h-7 w-7 text-emerald-300" />
                  <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{profiles.length}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-400">Spieler gesamt</div>
                  <button onClick={() => setActiveTab('players')} className="mt-4 text-xs font-bold text-emerald-300 hover:underline">→ Spieler verwalten</button>
                </div>
                <div className={statCardClassName}>
                  <ShieldAlert className="h-7 w-7 text-amber-300" />
                  <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{disputedMatches.length}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-400">Offene Disputes</div>
                  <button onClick={() => setActiveTab('disputes')} className="mt-4 text-xs font-bold text-amber-300 hover:underline">→ Disputes prüfen</button>
                </div>
                <div className={statCardClassName}>
                  <Headphones className="h-7 w-7 text-violet-300" />
                  <div className="mt-5 text-4xl font-black tracking-[-0.05em] text-violet-300">{tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-400">Offene Tickets</div>
                  <button onClick={() => setActiveTab('tickets')} className="mt-4 text-xs font-bold text-violet-300 hover:underline">→ Tickets öffnen</button>
                </div>
                <div className={statCardClassName}>
                  <CheckCircle2 className="h-7 w-7 text-lime-300" />
                  <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{activeCount}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-400">Aktive Accounts</div>
                </div>
                <div className={statCardClassName}>
                  <Swords className="h-7 w-7 text-emerald-300" />
                  <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{liveMatches.length}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-400">Laufende Matches</div>
                  <button onClick={() => setActiveTab('live')} className="mt-4 text-xs font-bold text-emerald-300 hover:underline">→ Live ansehen</button>
                </div>
                <div className={`${statCardClassName} ${flaggedPlayers.length > 0 ? 'border-orange-400/30 bg-orange-400/[0.06]' : ''}`}>
                  <TriangleAlert className={`h-7 w-7 ${flaggedPlayers.length > 0 ? 'text-orange-300' : 'text-zinc-500'}`} />
                  <div className={`mt-5 text-4xl font-black tracking-[-0.05em] ${flaggedPlayers.length > 0 ? 'text-orange-300' : ''}`}>{flaggedPlayers.length}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-400">Verdächtige Accounts</div>
                  {flaggedPlayers.length > 0 && <button onClick={() => setActiveTab('flagged')} className="mt-4 text-xs font-bold text-orange-300 hover:underline">→ Prüfen</button>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'disputes' && (
            <div>
              {actionMessage && (
                <div className="mb-6 rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
                  {actionMessage}
                </div>
              )}
        <section className="rounded-[2.4rem] border border-amber-300/15 bg-amber-300/[0.035] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
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
                            {pendingDisputeCancelMatchId === match.match_id ? 'Annullierung bestätigen' : 'Ohne Elo annullieren'}
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

            </div>
          )}

          {activeTab === 'live' && (
            <div>
              {actionMessage && (
                <div className="mb-6 rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
                  {actionMessage}
                </div>
              )}
        <section className="rounded-[2.4rem] border border-emerald-300/15 bg-emerald-300/[0.025] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
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
                      {pendingLiveCancelMatchId === m.id ? 'Endgültig abbrechen' : 'Abbrechen'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

            </div>
          )}

          {activeTab === 'tournaments' && (
            <div className="space-y-6">
              {actionMessage && <div className="rounded-[1.7rem] border border-amber-300/20 bg-amber-400/10 p-5 text-sm font-semibold leading-6 text-amber-100">{actionMessage}</div>}
              <section className="overflow-hidden rounded-[2.4rem] border border-amber-300/20 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.15),transparent_50%),rgba(9,9,11,0.82)] p-5 shadow-2xl shadow-black/30 md:p-7">
                <div className="mb-6 flex items-start gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-200"><Trophy className="h-6 w-6" /></div><div><p className="text-[10px] font-black tracking-[0.2em] text-amber-300">CUP CONTROL</p><h2 className="mt-1 text-3xl font-black tracking-[-0.045em]">Turnier erstellen</h2><p className="mt-1 text-sm text-zinc-400">Die Anmeldung wird nach dem Veröffentlichen sofort im Turnierzentrum sichtbar.</p></div></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <input value={tournamentForm.title} onChange={e => setTournamentForm(f => ({ ...f, title: e.target.value }))} placeholder="Name, z. B. Friday Night Cup" className={inputClassName} />
                  <select value={tournamentForm.maxPlayers} onChange={e => setTournamentForm(f => ({ ...f, maxPlayers: e.target.value }))} className={inputClassName}><option className={selectOptionClassName} value="4">4 Spieler</option><option className={selectOptionClassName} value="8">8 Spieler</option><option className={selectOptionClassName} value="16">16 Spieler</option><option className={selectOptionClassName} value="32">32 Spieler</option></select>
                  <textarea value={tournamentForm.description} onChange={e => setTournamentForm(f => ({ ...f, description: e.target.value }))} placeholder="Kurze Beschreibung, Regeln oder Streamer-Hinweis" className={`${inputClassName} min-h-24 resize-none md:col-span-2`} />
                  <label className="text-xs font-bold text-zinc-400">Anmeldeschluss<input type="datetime-local" value={tournamentForm.closesAt} onChange={e => setTournamentForm(f => ({ ...f, closesAt: e.target.value }))} className={`${inputClassName} mt-2 w-full`} /></label><label className="text-xs font-bold text-zinc-400">Turnierstart<input type="datetime-local" value={tournamentForm.startsAt} onChange={e => setTournamentForm(f => ({ ...f, startsAt: e.target.value }))} className={`${inputClassName} mt-2 w-full`} /></label>
                  <label className="text-xs font-bold text-zinc-400">Match-Plattform<select value={tournamentForm.scoringPlatform} onChange={e => setTournamentForm(f => ({ ...f, scoringPlatform: e.target.value as 'scolia' | 'dartcounter' }))} className={`${inputClassName} mt-2`}><option className={selectOptionClassName} value="dartcounter">DartCounter</option><option className={selectOptionClassName} value="scolia">Scolia</option></select><span className="mt-1 block text-[10px] font-normal text-zinc-500">Alle Matchrooms dieses Cups werden darauf festgelegt.</span></label>
                  <label className="text-xs font-bold text-zinc-400">Community-Code <span className="font-normal text-zinc-600">(optional)</span><input value={tournamentForm.accessCode} onChange={e => setTournamentForm(f => ({ ...f, accessCode: e.target.value.toUpperCase() }))} placeholder="z. B. STREAM24" className={`${inputClassName} mt-2 uppercase`} /><span className="mt-1 block text-[10px] font-normal text-zinc-500">Nur mit diesem Code kann man dem Turnier beitreten.</span></label>
                  <select value={tournamentForm.bestOf} onChange={e => setTournamentForm(f => ({ ...f, bestOf: e.target.value }))} className={inputClassName}><option className={selectOptionClassName} value="3">Best of 3</option><option className={selectOptionClassName} value="5">Best of 5</option><option className={selectOptionClassName} value="7">Best of 7</option><option className={selectOptionClassName} value="9">Best of 9</option></select><input type="number" min="0" step="0.1" value={tournamentForm.maxAverage} onChange={e => setTournamentForm(f => ({ ...f, maxAverage: e.target.value }))} placeholder="Max. AVG (optional, z. B. 60)" className={inputClassName} /><input type="number" min="0" step="0.1" value={tournamentForm.minAverage} onChange={e => setTournamentForm(f => ({ ...f, minAverage: e.target.value }))} placeholder="Min. AVG (optional)" className={inputClassName} /><label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-3 text-sm font-bold text-zinc-300"><input type="checkbox" checked={tournamentForm.premiumOnly} onChange={e => setTournamentForm(f => ({ ...f, premiumOnly: e.target.checked }))} className="h-4 w-4 accent-amber-300" /> <Crown className="h-4 w-4 text-amber-300" />Nur für Premium</label>
                </div>
                <button onClick={() => void createTournament()} disabled={tournamentSaving} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-orange-400 px-6 py-3.5 text-sm font-black uppercase tracking-[0.12em] text-black transition hover:-translate-y-0.5 disabled:opacity-60"><Sparkles className="h-4 w-4" />{tournamentSaving ? 'Wird veröffentlicht …' : 'Turnier veröffentlichen'}</button>
              </section>

              <section className="rounded-[2.4rem] border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-2xl font-black">Turnier-Übersicht</h2><p className="mt-1 text-sm text-zinc-400">Starte Cups ab zwei Teilnehmern, lose Paarungen aus und trage Ergebnisse ein.</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-zinc-400">{tournaments.length} Events</span></div>
                {tournaments.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">Noch keine Turniere erstellt.</div> : <div className="grid gap-4 lg:grid-cols-2">{tournaments.map(tournament => { const canStart = [2, 4, 8, 16, 32].includes(Number(tournament.participant_count)); return <article key={tournament.id} className={`rounded-[1.6rem] border p-5 ${selectedTournamentId === tournament.id ? 'border-amber-300/35 bg-amber-300/[0.07]' : 'border-white/10 bg-white/[0.035]'}`}><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-amber-300">{tournament.status.toUpperCase()}{tournament.premium_only && <><span className="text-zinc-600">·</span><Crown className="h-3.5 w-3.5" />PREMIUM</>}</div><h3 className="mt-2 text-xl font-black">{tournament.title}</h3></div><span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-bold text-zinc-300">{tournament.participant_count}/{tournament.max_players}</span></div><p className="mt-2 text-sm text-zinc-500">Start: {formatDate(tournament.starts_at)} · Best of {tournament.best_of}{tournament.max_average ? ` · bis ${tournament.max_average} AVG` : ''}</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void loadTournamentBracket(tournament.id)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10">Bracket öffnen</button>{tournament.status === 'registration' && <button onClick={() => void startTournament(tournament.id)} disabled={!canStart} className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-40">Turnier starten</button>}</div>{tournament.status === 'registration' && !canStart && <p className="mt-3 text-[11px] text-zinc-500">Zum Start werden 2, 4, 8, 16 oder 32 Teilnehmer benötigt.</p>}</article>; })}</div>}
                {selectedTournamentId && <div className="mt-7 rounded-[1.7rem] border border-white/10 bg-black/25 p-5"><div className="mb-4 flex items-center gap-2"><Swords className="h-5 w-5 text-amber-300" /><h3 className="font-black">Bracket & Ergebnisse</h3></div>{tournamentBracket.length === 0 ? <p className="text-sm text-zinc-500">Noch keine Paarungen – das Turnier kann ab 2, 4, 8, 16 oder 32 Teilnehmern gestartet werden.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{tournamentBracket.map(match => <div key={match.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><div className="mb-2 text-[10px] font-black tracking-widest text-zinc-500">RUNDE {match.round_number} · MATCH {match.match_number}</div><div className="flex items-center justify-between gap-3 text-sm"><span className={match.winner_id === match.player1_id ? 'font-black text-emerald-200' : 'text-zinc-300'}>{match.player1_username || 'Wird ermittelt'}</span>{match.status !== 'completed' && match.player1_id && <button onClick={() => void reportTournamentWinner(match.id, match.player1_id!)} className="text-[10px] font-black text-amber-300">SIEG</button>}</div><div className="my-2 h-px bg-white/10" /><div className="flex items-center justify-between gap-3 text-sm"><span className={match.winner_id === match.player2_id ? 'font-black text-emerald-200' : 'text-zinc-300'}>{match.player2_username || 'Wird ermittelt'}</span>{match.status !== 'completed' && match.player2_id && <button onClick={() => void reportTournamentWinner(match.id, match.player2_id!)} className="text-[10px] font-black text-amber-300">SIEG</button>}</div></div>)}</div>}</div>}
              </section>
            </div>
          )}

          {activeTab === 'players' && (
            <div className="space-y-6">
              {actionMessage && (
                <div className="rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
                  {actionMessage}
                </div>
              )}

        <section className="relative overflow-hidden rounded-[2.4rem] border border-cyan-300/15 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.13),transparent_48%),rgba(9,9,11,0.78)] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300"><RefreshCw className="h-4 w-4" /> Season Control</div>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Soft Elo Reset</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Komprimiert jedes Rating zu 50 % Richtung 1000. Die Rangfolge bleibt erhalten; Match-Historie, Siege und Statistiken werden nicht verändert.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-zinc-300">1600 → 1300</span>
                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-zinc-300">1000 → 1000</span>
                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-zinc-300">800 → 900</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[34rem]">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center"><span className="block text-xl font-black text-white">{profiles.length}</span><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Spieler</span></div>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.05] p-3 text-center"><span className="block text-xl font-black text-cyan-200">{projectedChangedCount}</span><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Änderungen</span></div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center"><span className="block text-xl font-black text-white">{projectedMinimum}–{projectedMaximum}</span><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Neue Spanne</span></div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center"><span className="block text-xl font-black text-white">{projectedAverage.toFixed(1)}</span><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Neuer Ø</span></div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">Neue Season
              <input value={softResetSeasonLabel} onChange={(event) => { setSoftResetSeasonLabel(event.target.value); setSoftResetConfirming(false); }} className={`${inputClassName} mt-2 w-full`} placeholder="z. B. Season 02" />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              {softResetConfirming && <button onClick={() => { setSoftResetConfirming(false); setActionMessage(null); }} disabled={softResetLoading} className="min-h-12 rounded-2xl border border-white/10 px-4 text-xs font-black uppercase tracking-[0.1em] text-zinc-300 transition hover:bg-white/10">Abbrechen</button>}
              <button onClick={() => void executeSoftEloReset()} disabled={softResetLoading || profiles.length === 0} className={`min-h-12 rounded-2xl px-5 text-xs font-black uppercase tracking-[0.1em] transition disabled:opacity-50 ${softResetConfirming ? 'bg-gradient-to-r from-amber-300 to-orange-400 text-black shadow-[0_0_30px_rgba(251,191,36,0.18)]' : 'border border-cyan-300/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15'}`}>
                {softResetLoading ? 'Wird ausgeführt …' : softResetConfirming ? 'Soft Reset endgültig bestätigen' : 'Soft Reset vorbereiten'}
              </button>
            </div>
          </div>

          {softResetResult && (
            <div className="mt-5 rounded-[1.5rem] border border-emerald-300/20 bg-emerald-400/[0.07] p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">Reset erfolgreich gesichert</p><p className="mt-1 text-sm text-zinc-300">{softResetResult.changed_count} von {softResetResult.player_count} Ratings geändert · {softResetResult.minimum_before}–{softResetResult.maximum_before} → {softResetResult.minimum_after}–{softResetResult.maximum_after} Elo</p></div>
                <button onClick={() => void rollbackSoftEloReset()} disabled={softResetLoading} className="min-h-11 shrink-0 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 text-xs font-black uppercase tracking-[0.1em] text-rose-100 transition hover:bg-rose-400/15 disabled:opacity-50">{softResetRollbackConfirming ? 'Rollback endgültig bestätigen' : 'Reset zurückrollen'}</button>
              </div>
            </div>
          )}
          <p className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500"><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" /> Vor der Änderung wird jeder Elo-Wert gespeichert. Bei laufenden Ranked-Matches blockiert die Datenbank den Reset automatisch.</p>
        </section>

        <section className="rounded-[2.4rem] border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="flex items-center gap-3 text-3xl font-black tracking-[-0.045em]">
                <Users className="h-7 w-7 text-emerald-300" />
                Spieler-Verwaltung
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Elo korrigieren, Premium verwalten, Accounts sperren oder Rollen vergeben.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center text-xs font-bold text-zinc-400 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"><span className="block text-lg font-black text-emerald-200">{activeCount}</span>Aktiv</div>
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3"><span className="block text-lg font-black text-amber-200">{premiumCount}</span>Premium</div>
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
                      {user.isPremium && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100"><Crown className="h-3 w-3" />{user.premium_manual_granted_at ? 'Premium · manuell' : 'Premium'}</span>
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
                    {user.premium_manual_granted_at && (
                      <div className="mt-1 text-xs text-amber-200/80">Manuelle Freigabe: {user.premium_manual_until ? `bis ${formatDate(user.premium_manual_until)}` : 'unbegrenzt'}{user.premium_manual_reason ? ` · ${user.premium_manual_reason}` : ''}</div>
                    )}
                    {banReasonUserId === user.id && !user.is_banned && (
                      <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-3">
                        <label className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">Ban-Grund</label>
                        <textarea
                          value={banReasonInput}
                          onChange={(e) => setBanReasonInput(e.target.value)}
                          rows={2}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-rose-300/40"
                          placeholder="Grund für die Sperre eintragen..."
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button onClick={() => toggleBan(user)} className="rounded-xl bg-rose-400 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-black">Sperre bestätigen</button>
                          <button onClick={() => { setBanReasonUserId(null); setBanReasonInput(''); }} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/10">Abbrechen</button>
                        </div>
                      </div>
                    )}
                    {premiumEditorUserId === user.id && (
                      <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
                        <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-200" /><span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Premium Control</span></div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[0.65fr_1.35fr]">
                          <select value={premiumDuration} onChange={(event) => setPremiumDuration(event.target.value as typeof premiumDuration)} className={`${inputClassName} [color-scheme:dark]`}>
                            <option className={selectOptionClassName} value="7">7 Tage</option>
                            <option className={selectOptionClassName} value="30">30 Tage</option>
                            <option className={selectOptionClassName} value="90">90 Tage</option>
                            <option className={selectOptionClassName} value="unlimited">Unbegrenzt</option>
                          </select>
                          <input value={premiumReason} onChange={(event) => setPremiumReason(event.target.value)} className={inputClassName} placeholder="Interne Begründung, z. B. Community-Gewinnspiel" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => void updateManualPremium(user, true)} disabled={premiumSavingUserId === user.id} className="rounded-xl bg-amber-300 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-black disabled:opacity-50">{premiumSavingUserId === user.id ? 'Speichert …' : user.premium_manual_granted_at ? 'Freigabe aktualisieren' : 'Premium vergeben'}</button>
                          {user.premium_manual_granted_at && <button onClick={() => void updateManualPremium(user, false)} disabled={premiumSavingUserId === user.id} className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-rose-100 disabled:opacity-50">Manuell entziehen</button>}
                          <button onClick={() => { setPremiumEditorUserId(null); setPremiumReason(''); }} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10">Abbrechen</button>
                        </div>
                        {user.stripe_subscription_status && <p className="mt-3 text-[11px] text-zinc-500">Stripe-Status: {user.stripe_subscription_status}. Eine manuelle Änderung beendet kein bezahltes Stripe-Abo.</p>}
                      </div>
                    )}
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setPremiumEditorUserId(premiumEditorUserId === user.id ? null : user.id); setPremiumReason(user.premium_manual_reason || ''); }}
                      className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-amber-100 transition hover:bg-amber-300/15"
                    >
                      {user.premium_manual_granted_at ? 'Premium verwalten' : 'Premium'}
                    </button>
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

            </div>
          )}

          {activeTab === 'tickets' && (
            <div>
              {actionMessage && (
                <div className="mb-6 rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
                  {actionMessage}
                </div>
              )}
        {/* ── Support-Tickets ── */}
        <section className="overflow-hidden rounded-[2.4rem] border border-violet-400/20 bg-violet-400/[0.03] shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="relative border-b border-white/10 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.18),transparent_46%),linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] p-5 md:p-7">
          <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-400/25 to-cyan-400/10 text-violet-100 shadow-[0_0_30px_rgba(139,92,246,0.14)]">
                <Headphones className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300">Support Operations</p>
                <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-white">Ticket-Inbox</h2>
                <p className="mt-1 text-sm text-zinc-400">Priorisieren, übernehmen, antworten – alles in einer klaren Arbeitsansicht.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
              <span className="self-center px-2 text-[10px] font-black uppercase tracking-[0.17em] text-zinc-600">Status</span>
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
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'In Bearbeitung', value: ticketsInQueue, icon: <MessageCircle className="h-4 w-4" />, tone: 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-200' },
              { label: 'Ohne Zuordnung', value: unassignedTickets, icon: <Users className="h-4 w-4" />, tone: 'border-violet-300/20 bg-violet-400/[0.08] text-violet-200' },
              { label: 'Warten auf User', value: ticketsWaitingForUser, icon: <Clock className="h-4 w-4" />, tone: 'border-amber-300/20 bg-amber-400/[0.08] text-amber-200' },
              { label: 'Dringend', value: urgentTickets, icon: <AlertTriangle className="h-4 w-4" />, tone: 'border-red-300/20 bg-red-400/[0.08] text-red-200' },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-3 rounded-2xl border p-3 ${item.tone}`}>
                <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/20">{item.icon}</div>
                <div><p className="text-xl font-black tracking-[-0.04em]">{item.value}</p><p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">{item.label}</p></div>
              </div>
            ))}
          </div>
          </div>

          <div className="p-5 md:p-7">
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="px-2 text-xs font-bold text-zinc-500">{tickets.length} Ticket{tickets.length !== 1 ? 's' : ''} in der aktuellen Ansicht</p>
              <div className="flex flex-wrap gap-2">
              <span className="self-center px-2 text-[10px] font-black uppercase tracking-[0.17em] text-zinc-600">Zuständigkeit</span>
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
                  <div key={ticket.id} className={`group overflow-hidden rounded-[1.75rem] border bg-zinc-950/70 transition ${isOpen ? 'border-violet-300/30 shadow-[0_0_38px_rgba(139,92,246,0.10)]' : 'border-white/10 hover:border-white/20 hover:bg-zinc-950/90'}`}>
                    {/* Ticket-Header */}
                    <button
                      onClick={() => void openTicketDetail(ticket.id)}
                      className="flex w-full items-start gap-4 p-5 text-left transition hover:bg-white/[0.03]"
                    >
                      <div className={`mt-1 h-11 w-1 shrink-0 rounded-full ${sc.dot}`} />
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
                        <p className="truncate text-lg font-black tracking-[-0.025em] text-white">{ticket.subject}</p>
                        {ticket.last_message && (
                          <p className="mt-1 truncate text-xs text-zinc-500">{ticket.last_message}</p>
                        )}
                        <p className="mt-1 text-xs text-zinc-600">
                          {new Date(ticket.updated_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {ticket.message_count} Nachricht{ticket.message_count !== 1 ? 'en' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-zinc-600">
                        <span className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500 sm:inline">{isOpen ? 'Ansicht schließen' : 'Bearbeiten'}</span>
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown className="transition group-hover:translate-y-0.5 group-hover:text-zinc-300" size={18} />}
                      </div>
                    </button>

                    {/* Ticket-Detail */}
                    {isOpen && ticketDetail && ticketDetail.ticket.id === ticket.id && (
                      <div className="border-t border-white/10 bg-black/20 px-5 pb-5 pt-5">
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
                          {ticketDetail.messages.map((msg) => {
                            const parsed = parseTicketMessageContent(msg.content);
                            return (
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
                              <div className="space-y-3">
                                {parsed.text && <p className="text-sm leading-6 text-zinc-300 whitespace-pre-wrap">{parsed.text}</p>}
                                {parsed.images.length > 0 && (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {parsed.images.map((image) => (
                                      <a key={image.url} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10 bg-black/25 transition hover:border-white/25">
                                        <img src={image.url} alt={ticketImageAlt(image.label)} className="h-36 w-full object-cover" />
                                        <div className="truncate px-3 py-2 text-[11px] font-bold text-zinc-400">{image.label}</div>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            );
                          })}
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
          </div>
        </section>

            </div>
          )}

          {activeTab === 'flagged' && (
            <div>
              {actionMessage && (
                <div className="mb-6 rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
                  {actionMessage}
                </div>
              )}
        {/* Verdächtige Accounts / Anti-Smurf-Flagging */}
        {flaggedPlayers.length > 0 && (
          <section className="rounded-[2.4rem] border border-orange-400/20 bg-orange-400/[0.03] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
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


            </div>
          )}

          {activeTab === 'logs' && (
            <div>
        {/* Admin-Aktions-Log */}
        <section className="rounded-[2.4rem] border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-7">
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
          )}
        </div>
      </div>
    </main>
  );
}
