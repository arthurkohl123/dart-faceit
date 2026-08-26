'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Database, Pencil, Power, RadioTower, RefreshCcw, Save, Search, Shield, SlidersHorizontal, Swords, Trophy, Wrench, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type DashboardStats = {
  profiles?: number;
  banned_profiles?: number;
  queue_locked_profiles?: number;
  open_matches?: number;
  queue_entries?: number;
};

type DashboardPayload = {
  settings?: Record<string, unknown>;
  stats?: DashboardStats;
};

type MaintenanceSetting = {
  enabled?: boolean;
  message?: string;
};

type BanMinutesSetting = {
  minutes?: number;
};

type DeveloperNoticeSetting = {
  message?: string;
};

type SmsVerificationSetting = {
  enabled?: boolean;
};

type MatchmakingQueueSetting = {
  enabled?: boolean;
  message?: string;
};

type DevMatch = {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string | null;
  opponent_name: string;
  is_win: boolean;
  result: string | null;
  legs_won: number | null;
  legs_lost: number | null;
  my_average: number | null;
  highest_checkout: number | null;
  one_eighties: number | null;
  elo_change: number | null;
  app: string | null;
};

type MatchDraft = {
  legs_won: string;
  legs_lost: string;
  my_average: string;
  highest_checkout: string;
  one_eighties: string;
  is_win: boolean;
};

function getObjectSetting<T extends object>(settings: Record<string, unknown> | undefined, key: string): T {
  const value = settings?.[key];
  return value && typeof value === 'object' ? value as T : {} as T;
}

function toDraft(m: DevMatch): MatchDraft {
  return {
    legs_won: m.legs_won?.toString() ?? '',
    legs_lost: m.legs_lost?.toString() ?? '',
    my_average: m.my_average?.toString() ?? '',
    highest_checkout: m.highest_checkout?.toString() ?? '',
    one_eighties: m.one_eighties?.toString() ?? '',
    is_win: m.is_win,
  };
}

function formatMatchDate(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function DeveloperDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [matchError, setMatchError] = useState('');
  const [stats, setStats] = useState<DashboardStats>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('RankedDarts wird gerade aktualisiert. Bitte versuche es gleich erneut.');
  const [noShowBanMinutes, setNoShowBanMinutes] = useState(15);
  const [smsVerificationEnabled, setSmsVerificationEnabled] = useState(true);
  const [matchmakingEnabled, setMatchmakingEnabled] = useState(true);
  const [matchmakingMessage, setMatchmakingMessage] = useState('Die Ranked-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.');
  const [developerNotice, setDeveloperNotice] = useState('');

  // Match-Editor
  const [matches, setMatches] = useState<DevMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchSearch, setMatchSearch] = useState('');
  const [matchSearchInput, setMatchSearchInput] = useState('');
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MatchDraft | null>(null);
  const [savingMatch, setSavingMatch] = useState(false);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError('');
    window.setTimeout(() => setSuccess(''), 3500);
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace('/auth/login?redirectTo=/developer');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_developer')
      .eq('supabaseId', userData.user.id)
      .single();

    if (!profile?.is_developer) {
      router.replace('/');
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('dev_get_dashboard');
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const payload = data as DashboardPayload | null;
    const settings = payload?.settings;
    const maintenance = getObjectSetting<MaintenanceSetting>(settings, 'maintenance_mode');
    const banMinutes = getObjectSetting<BanMinutesSetting>(settings, 'no_show_queue_ban_minutes');
    const smsVerification = getObjectSetting<SmsVerificationSetting>(settings, 'sms_verification');
    const matchmakingQueue = getObjectSetting<MatchmakingQueueSetting>(settings, 'matchmaking_queue');
    const notice = getObjectSetting<DeveloperNoticeSetting>(settings, 'developer_notice');

    setStats(payload?.stats ?? {});
    setMaintenanceEnabled(Boolean(maintenance.enabled));
    setMaintenanceMessage(maintenance.message ?? 'RankedDarts wird gerade aktualisiert. Bitte versuche es gleich erneut.');
    setNoShowBanMinutes(Number(banMinutes.minutes ?? 15));
    setSmsVerificationEnabled(smsVerification.enabled !== false);
    setMatchmakingEnabled(matchmakingQueue.enabled !== false);
    setMatchmakingMessage(matchmakingQueue.message ?? 'Die Ranked-Queue ist vorübergehend pausiert. Bitte versuche es später erneut.');
    setDeveloperNotice(notice.message ?? '');
    setLastUpdated(new Date());
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const updateSetting = async (key: string, value: Record<string, unknown>, successMessage: string) => {
    setSaving(key);
    setError('');

    const { error: rpcError } = await supabase.rpc('dev_update_setting', {
      p_key: key,
      p_value: value,
    });

    setSaving(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    showSuccess(successMessage);
    void loadDashboard();
  };

  const clearExpiredQueueLocks = async () => {
    setSaving('clear_locks');
    setError('');

    const { data, error: rpcError } = await supabase.rpc('dev_clear_expired_queue_locks');
    setSaving(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const result = data as { cleared?: number } | null;
    showSuccess(`${result?.cleared ?? 0} abgelaufene Queue-Sperren bereinigt.`);
    void loadDashboard();
  };

  const saveMatchmakingQueue = async () => {
    setSaving('matchmaking_queue');
    setError('');

    const { data, error: rpcError } = await supabase.rpc('dev_set_matchmaking_queue', {
      p_enabled: matchmakingEnabled,
      p_message: matchmakingMessage,
    });
    setSaving(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const result = data as { cleared_entries?: number } | null;
    const cleared = Number(result?.cleared_entries ?? 0);
    showSuccess(matchmakingEnabled
      ? 'Matchmaking-Queue ist wieder geöffnet.'
      : `Matchmaking-Queue pausiert. ${cleared} wartende Einträge wurden entfernt.`);
    void loadDashboard();
  };

  const loadMatches = useCallback(async (search = '') => {
    setMatchesLoading(true);
    setMatchError('');
    const { data, error: rpcError } = await supabase.rpc('dev_list_matches', {
      p_limit: 100,
      p_offset: 0,
      p_search: search.trim() || null,
    });
    setMatchesLoading(false);
    if (rpcError) {
      setMatchError(`Match-Verwaltung konnte nicht geladen werden: ${rpcError.message}`);
      return;
    }
    setMatches((data ?? []) as DevMatch[]);
  }, [supabase]);

  useEffect(() => {
    if (loading) return;

    const timer = window.setTimeout(() => {
      void loadMatches('');
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loading, loadMatches]);

  useEffect(() => {
    if (!autoRefresh || loading) return;

    const timer = window.setInterval(() => {
      void loadDashboard();
      void loadMatches(matchSearch);
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, loading, loadDashboard, loadMatches, matchSearch]);

  const startEditMatch = (m: DevMatch) => {
    setEditingMatchId(m.id);
    setDraft(toDraft(m));
  };

  const cancelEditMatch = () => {
    setEditingMatchId(null);
    setDraft(null);
  };

  const saveMatch = async () => {
    if (!editingMatchId || !draft) return;
    setSavingMatch(true);
    setError('');

    const toIntOrNull = (s: string) => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    };
    const toNumOrNull = (s: string) => {
      const n = Number(s.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };

    const { error: rpcError } = await supabase.rpc('dev_update_match', {
      p_match_id: editingMatchId,
      p_legs_won: toIntOrNull(draft.legs_won),
      p_legs_lost: toIntOrNull(draft.legs_lost),
      p_my_average: toNumOrNull(draft.my_average),
      p_highest_checkout: toIntOrNull(draft.highest_checkout),
      p_one_eighties: toIntOrNull(draft.one_eighties),
      p_is_win: draft.is_win,
    });

    setSavingMatch(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    showSuccess('Match-Stats aktualisiert.');
    cancelEditMatch();
    void loadMatches(matchSearch);
  };

  const handleMatchSearch = (event: FormEvent) => {
    event.preventDefault();
    setMatchSearch(matchSearchInput);
    void loadMatches(matchSearchInput);
  };

  const operationalStatus = maintenanceEnabled
    ? { label: 'Wartungsmodus aktiv', className: 'border-amber-300/25 bg-amber-400/10 text-amber-100' }
    : !matchmakingEnabled
      ? { label: 'Matchmaking pausiert', className: 'border-red-300/25 bg-red-500/10 text-red-100' }
    : (stats.queue_locked_profiles ?? 0) > 0
      ? { label: 'Queue-Sperren prüfen', className: 'border-red-300/25 bg-red-500/10 text-red-100' }
      : { label: 'System betriebsbereit', className: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' };



  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <RefreshCcw className="mx-auto h-7 w-7 animate-spin text-cyan-300" />
          <p className="mt-4 text-sm font-bold text-zinc-300">Developer-Oberfläche wird geladen…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.12),transparent_32%)]" />
      <section className="relative mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
              <Shield className="h-4 w-4" /> Developer Control Center
            </div>
            <h1 className="mt-6 text-5xl font-black tracking-[-0.07em] md:text-7xl">RankedDarts Steuerung</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
              Zentrale Steuerung für Betriebsstatus, Match-Qualität und Queue-Regeln. Änderungen werden direkt dokumentiert und die Kennzahlen bleiben bei aktiver Live-Aktualisierung im Blick.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${autoRefresh ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15' : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]'}`}
            >
              Live-Update: {autoRefresh ? 'an' : 'aus'}
            </button>
            <button type="button" onClick={() => void loadDashboard()} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.08]">
              Jetzt aktualisieren
            </button>
            <Link href="/admin" className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-zinc-200">
              Admin öffnen
            </Link>
          </div>
        </div>

        {(error || success) && (
          <div className={`mt-6 flex items-center gap-3 rounded-3xl border px-5 py-4 text-sm font-bold ${error ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'}`}>
            {error ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            {error || success}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Activity className="h-5 w-5 text-emerald-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.profiles ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Profile</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Shield className="h-5 w-5 text-red-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.banned_profiles ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Account-Bans</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Clock className="h-5 w-5 text-amber-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.queue_locked_profiles ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Queue-Sperren</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Database className="h-5 w-5 text-cyan-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.open_matches ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Offene Matches</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Swords className="h-5 w-5 text-violet-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.queue_entries ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">In der Queue</p>
          </div>
        </div>

        <section className="mt-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-black/20 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${maintenanceEnabled ? 'bg-amber-300' : !matchmakingEnabled || (stats.queue_locked_profiles ?? 0) > 0 ? 'bg-red-400' : 'bg-emerald-400'} ${autoRefresh ? 'animate-pulse' : ''}`} />
            <div>
              <p className="text-sm font-black text-zinc-100">Betriebsstatus</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {lastUpdated ? `Zuletzt aktualisiert: ${lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Status wird geladen'}
              </p>
            </div>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] ${operationalStatus.className}`}>
            {operationalStatus.label}
          </span>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className={`relative overflow-hidden rounded-[2rem] border p-6 shadow-2xl shadow-black/30 lg:col-span-2 ${matchmakingEnabled ? 'border-emerald-300/20 bg-emerald-400/[0.055]' : 'border-red-300/25 bg-red-500/[0.07]'}`}>
            <div className={`pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl ${matchmakingEnabled ? 'bg-emerald-400/15' : 'bg-red-500/15'}`} />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
              <div>
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${matchmakingEnabled ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : 'border-red-300/25 bg-red-500/10 text-red-100'}`}>
                  <RadioTower className="h-3.5 w-3.5" /> Matchmaking Master Switch
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <h2 className="text-3xl font-black tracking-[-0.05em]">Ranked-Queue steuern</h2>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${matchmakingEnabled ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-red-300/30 bg-red-500/10 text-red-100'}`}>
                    {matchmakingEnabled ? 'Queue geöffnet' : 'Queue geschlossen'}
                  </span>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Beim Ausschalten werden alle wartenden Spieler entfernt und neue Queue-Beitritte in der Datenbank blockiert. Bereits gestartete Matches und Matchrooms bleiben aktiv.</p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Hinweis für Spieler</label>
                <textarea
                  value={matchmakingMessage}
                  onChange={(event) => setMatchmakingMessage(event.target.value)}
                  rows={3}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/40"
                />
              </div>
            </div>

            <div className="relative mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setMatchmakingEnabled((value) => !value)}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black transition ${matchmakingEnabled ? 'border-red-300/25 bg-red-500/10 text-red-100 hover:bg-red-500/15' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15'}`}
              >
                <Power className="h-4 w-4" /> {matchmakingEnabled ? 'Queue zum Schließen vorbereiten' : 'Queue zum Öffnen vorbereiten'}
              </button>
              <button
                type="button"
                disabled={saving === 'matchmaking_queue'}
                onClick={() => void saveMatchmakingQueue()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-zinc-200 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving === 'matchmaking_queue' ? 'Wird angewendet…' : 'Queue-Status anwenden'}
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">
                  <Wrench className="h-3.5 w-3.5" /> Wartungsmodus
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Website temporär sperren</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Wenn aktiv, werden normale Nutzer auf die Wartungsseite weitergeleitet. Developer bleiben eingeloggt und können den Modus wieder deaktivieren.</p>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceEnabled((value) => !value)}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${maintenanceEnabled ? 'border border-amber-300/30 bg-amber-400/15 text-amber-100' : 'border border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}
              >
                {maintenanceEnabled ? 'Aktiv' : 'Aus'}
              </button>
            </div>

            <label className="mt-6 block text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Wartungstext</label>
            <textarea
              value={maintenanceMessage}
              onChange={(event) => setMaintenanceMessage(event.target.value)}
              rows={4}
              className="mt-3 w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-300/40"
            />

            <button
              type="button"
              disabled={saving === 'maintenance_mode'}
              onClick={() => void updateSetting('maintenance_mode', { enabled: maintenanceEnabled, message: maintenanceMessage }, maintenanceEnabled ? 'Wartungsmodus aktiviert.' : 'Wartungsmodus deaktiviert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving === 'maintenance_mode' ? 'Speichert…' : 'Wartungsmodus speichern'}
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
              <SlidersHorizontal className="h-3.5 w-3.5" /> No-Show Regeln
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Queue-Sperre nach No-Show</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Diese Minutenanzahl wird verwendet, wenn ein Spieler nach Ablauf der 5-Minuten-No-Show-Frist automatisch gesperrt wird.</p>

            <label className="mt-6 block text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Sperrdauer in Minuten</label>
            <input
              type="number"
              min={1}
              max={1440}
              value={noShowBanMinutes}
              onChange={(event) => setNoShowBanMinutes(Number(event.target.value))}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-zinc-100 outline-none transition focus:border-cyan-300/40"
            />

            <button
              type="button"
              disabled={saving === 'no_show_queue_ban_minutes'}
              onClick={() => void updateSetting('no_show_queue_ban_minutes', { minutes: Math.max(1, noShowBanMinutes) }, 'No-Show-Sperrdauer gespeichert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving === 'no_show_queue_ban_minutes' ? 'Speichert…' : 'Sperrdauer speichern'}
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
                  <Shield className="h-3.5 w-3.5" /> SMS-Verifizierung
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Telefon-Verifizierung steuern</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Wenn deaktiviert, dürfen Nutzer Matchmaking auch ohne bestätigte Telefonnummer verwenden. Neue Registrierungen werden dann automatisch als telefonisch verifiziert markiert.</p>
              </div>
              <button
                type="button"
                onClick={() => setSmsVerificationEnabled((value) => !value)}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${smsVerificationEnabled ? 'border border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border border-zinc-500/30 bg-zinc-500/10 text-zinc-200'}`}
              >
                {smsVerificationEnabled ? 'Aktiv' : 'Aus'}
              </button>
            </div>

            <button
              type="button"
              disabled={saving === 'sms_verification'}
              onClick={() => void updateSetting('sms_verification', { enabled: smsVerificationEnabled }, smsVerificationEnabled ? 'SMS-Verifizierung aktiviert.' : 'SMS-Verifizierung deaktiviert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving === 'sms_verification' ? 'Speichert…' : 'SMS-Einstellung speichern'}
            </button>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-200">
              <AlertTriangle className="h-3.5 w-3.5" /> Developer Notice
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Interne Notiz speichern</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Nutze dieses Feld für kurze technische Hinweise, Deploy-Notizen oder To-dos. Die Notiz wird in `app_settings` gespeichert.</p>
            <textarea
              value={developerNotice}
              onChange={(event) => setDeveloperNotice(event.target.value)}
              rows={4}
              placeholder="z. B. Nach Deployment SQL-Migration prüfen…"
              className="mt-5 w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-300/40"
            />
            <button
              type="button"
              disabled={saving === 'developer_notice'}
              onClick={() => void updateSetting('developer_notice', { message: developerNotice }, 'Developer-Notiz gespeichert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-violet-300/25 bg-violet-400/10 px-5 py-3 text-sm font-black text-violet-100 transition hover:bg-violet-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Notiz speichern
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
              <Database className="h-3.5 w-3.5" /> Wartungsaktionen
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Sichere Hilfsfunktionen</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Diese Aktionen sind bewusst nicht destruktiv. Sie räumen nur abgelaufene Sperren auf oder führen zu vorhandenen Admin-Bereichen.</p>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                disabled={saving === 'clear_locks'}
                onClick={() => void clearExpiredQueueLocks()}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm font-black text-zinc-100 transition hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span>Abgelaufene Queue-Sperren bereinigen</span>
                <RefreshCcw className={`h-4 w-4 ${saving === 'clear_locks' ? 'animate-spin' : ''}`} />
              </button>
              <Link href="/support" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.06]">
                Support-Tickets prüfen
                <span className="text-zinc-500">öffnen</span>
              </Link>
              <Link href="/matchmaking" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.06]">
                Matchmaking testen
                <span className="text-zinc-500">öffnen</span>
              </Link>
            </div>
          </section>
        </div>

        {/* Fertig gespielte Matches */}
        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-200">
                <Trophy className="h-3.5 w-3.5" /> Match-Verwaltung
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Fertig gespielte Matches</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Übersicht aller Matches mit Möglichkeit zur nachträglichen Korrektur von Stats.
                Hinweis: Pro Match existieren zwei Einträge (je Spielerperspektive) — beide Zeilen werden direkt untereinander angezeigt, damit du sie synchron anpassen kannst.
              </p>
            </div>
            <form onSubmit={handleMatchSearch} className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
              <div className="relative flex-1 lg:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={matchSearchInput}
                  onChange={(e) => setMatchSearchInput(e.target.value)}
                  placeholder="Username oder Gegner suchen…"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300/40"
                />
              </div>
              <button type="submit" className="rounded-2xl border border-sky-300/25 bg-sky-400/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-sky-100 transition hover:bg-sky-400/15">
                Suchen
              </button>
              <button type="button" onClick={() => void loadMatches(matchSearch)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 text-zinc-200 transition hover:bg-white/[0.08]">
                <RefreshCcw className={`h-4 w-4 ${matchesLoading ? 'animate-spin' : ''}`} />
              </button>
            </form>
          </div>

          <div className="mt-6 overflow-x-auto">
            {matchError ? (
              <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-100">
                {matchError}
              </div>
            ) : matchesLoading && matches.length === 0 ? (
              <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/20 py-10 text-sm font-bold text-zinc-400">
                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> Matches werden geladen…
              </div>
            ) : matches.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 py-10 text-center text-sm font-bold text-zinc-400">
                Keine Matches gefunden.
              </div>
            ) : (
              <div className="min-w-[960px] space-y-2">
                <div className="grid grid-cols-[1fr_1.2fr_1.2fr_0.6fr_0.6fr_0.7fr_0.6fr_0.6fr_0.8fr] gap-2 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                  <div>Datum / App</div>
                  <div>Spieler</div>
                  <div>Gegner</div>
                  <div>Legs</div>
                  <div>Win</div>
                  <div>Avg</div>
                  <div>180s</div>
                  <div>HC</div>
                  <div>Aktionen</div>
                </div>

                {matches.map((m) => {
                  const isEditing = editingMatchId === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`rounded-2xl border ${isEditing ? 'border-sky-300/40 bg-sky-400/[0.05]' : 'border-white/10 bg-black/20'} px-3 py-3`}
                    >
                      <div className="grid grid-cols-[1fr_1.2fr_1.2fr_0.6fr_0.6fr_0.7fr_0.6fr_0.6fr_0.8fr] items-center gap-2 text-sm">
                        <div>
                          <div className="font-bold text-zinc-100">{formatMatchDate(m.created_at)}</div>
                          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{m.app ?? '—'}</div>
                        </div>
                        <div className="truncate font-bold text-zinc-100">{m.user_name ?? '—'}</div>
                        <div className="truncate font-bold text-zinc-300">{m.opponent_name}</div>

                        {isEditing && draft ? (
                          <>
                            <div className="flex items-center gap-1">
                              <input value={draft.legs_won} onChange={(e) => setDraft({ ...draft, legs_won: e.target.value })} className="w-10 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center text-xs" />
                              <span className="text-zinc-500">:</span>
                              <input value={draft.legs_lost} onChange={(e) => setDraft({ ...draft, legs_lost: e.target.value })} className="w-10 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center text-xs" />
                            </div>
                            <button
                              type="button"
                              onClick={() => setDraft({ ...draft, is_win: !draft.is_win })}
                              className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${draft.is_win ? 'border border-emerald-300/30 bg-emerald-400/15 text-emerald-100' : 'border border-red-300/30 bg-red-500/10 text-red-100'}`}
                            >
                              {draft.is_win ? 'Sieg' : 'Niedrl.'}
                            </button>
                            <input value={draft.my_average} onChange={(e) => setDraft({ ...draft, my_average: e.target.value })} className="w-16 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center text-xs" />
                            <input value={draft.one_eighties} onChange={(e) => setDraft({ ...draft, one_eighties: e.target.value })} className="w-12 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center text-xs" />
                            <input value={draft.highest_checkout} onChange={(e) => setDraft({ ...draft, highest_checkout: e.target.value })} className="w-14 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center text-xs" />
                            <div className="flex items-center gap-1.5">
                              <button type="button" disabled={savingMatch} onClick={() => void saveMatch()} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-2 py-1 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/25 disabled:opacity-50">
                                <Save className="h-3 w-3" /> {savingMatch ? '…' : 'Speichern'}
                              </button>
                              <button type="button" onClick={cancelEditMatch} className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-zinc-300 transition hover:bg-white/[0.08]">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-zinc-100">
                              {m.legs_won ?? '—'} <span className="text-zinc-500">:</span> {m.legs_lost ?? '—'}
                            </div>
                            <div className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${m.is_win ? 'border border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : 'border border-red-300/25 bg-red-500/10 text-red-200'}`}>
                              <Swords className="h-3 w-3" /> {m.is_win ? 'Sieg' : 'Niedrl.'}
                            </div>
                            <div className="text-zinc-300">{m.my_average ?? '—'}</div>
                            <div className="text-zinc-300">{m.one_eighties ?? 0}</div>
                            <div className="text-zinc-300">{m.highest_checkout ?? '—'}</div>
                            <div>
                              <button type="button" onClick={() => startEditMatch(m)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black text-zinc-100 transition hover:bg-white/[0.08]">
                                <Pencil className="h-3 w-3" /> Bearbeiten
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </section>
    </main>
  );
}

