'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Crown,
  Gavel,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';

type Profile = {
  id: string;
  username: string | null;
  elo: number | null;
  gamesPlayed: number | null;
  wins: number | null;
  is_banned: boolean | null;
  ban_reason: string | null;
  is_admin: boolean | null;
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
  confirmation_requested_at: string | null;
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
  const [resolveForms, setResolveForms] = useState<Record<string, ResolveFormState>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDisputes, setLoadingDisputes] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  const checkAdminAndLoad = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/auth/login');
      return;
    }

    const { data: me, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('supabaseId', session.user.id)
      .single();

    if (error || !me?.is_admin) {
      alert('Du hast keinen Admin-Zugriff!');
      router.push('/');
      return;
    }

    await Promise.all([loadProfiles(), loadDisputedMatches()]);
    setLoading(false);
  }, [loadDisputedMatches, loadProfiles, router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkAdminAndLoad();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [checkAdminAndLoad]);

  const refreshAdminData = useCallback(async () => {
    setActionMessage(null);
    await Promise.all([loadProfiles(), loadDisputedMatches()]);
  }, [loadDisputedMatches, loadProfiles]);

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
            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.9] tracking-[-0.07em] md:text-7xl">Admin Panel für Ladder, Spieler und Disputes.</h1>
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
            <div className={statCardClassName}>
              <CheckCircle2 className="h-7 w-7 text-lime-300" />
              <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{activeCount}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-400">Aktive Accounts</div>
            </div>
            <div className={statCardClassName}>
              <Crown className="h-7 w-7 text-cyan-300" />
              <div className="mt-5 text-4xl font-black tracking-[-0.05em]">{adminCount}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-400">Admins</div>
            </div>
          </div>
        </header>

        {actionMessage && (
          <div className="mt-8 rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100 shadow-2xl shadow-black/20 backdrop-blur-xl">
            {actionMessage}
          </div>
        )}

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
                            <span className="text-zinc-500">Widerspruch</span>
                            <p className="mt-2 leading-6 text-zinc-200">{match.dispute_reason || 'Kein Grund angegeben.'}</p>
                          </div>
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

          <div className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-black/25">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px]">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.035] text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                    <th className="p-5 text-left">Benutzername</th>
                    <th className="p-5 text-center">Elo</th>
                    <th className="p-5 text-center">Spiele</th>
                    <th className="p-5 text-center">Siege</th>
                    <th className="p-5 text-center">Status</th>
                    <th className="p-5 text-center">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id} className="border-b border-white/5 transition hover:bg-emerald-400/[0.035]">
                      <td className="p-5">
                        <div className="font-black text-zinc-100">{user.username || 'Unbekannt'}</div>
                        {user.ban_reason && <div className="mt-1 text-xs text-rose-200/80">Ban-Grund: {user.ban_reason}</div>}
                      </td>
                      <td className="p-5 text-center">
                        <input
                          type="number"
                          defaultValue={user.elo || 1000}
                          onBlur={(event) => updateElo(user.id, Number(event.target.value))}
                          className="w-24 rounded-xl border border-transparent bg-transparent p-2 text-center font-black text-emerald-200 outline-none transition focus:border-emerald-300/40 focus:bg-emerald-400/10"
                        />
                      </td>
                      <td className="p-5 text-center font-semibold text-zinc-300">{user.gamesPlayed || 0}</td>
                      <td className="p-5 text-center font-black text-lime-300">{user.wins || 0}</td>
                      <td className="p-5 text-center">
                        {user.is_banned ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-rose-100"><Ban className="h-3.5 w-3.5" />Gesperrt</span>
                        ) : user.is_admin ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-cyan-100"><Crown className="h-3.5 w-3.5" />Admin</span>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-emerald-100"><Trophy className="h-3.5 w-3.5" />Aktiv</span>
                        )}
                      </td>
                      <td className="p-5">
                        <div className="flex justify-center gap-3">
                          <button
                            onClick={() => toggleBan(user)}
                            className={`rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition ${user.is_banned ? 'border border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15' : 'border border-rose-300/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15'}`}
                          >
                            {user.is_banned ? 'Entbannen' : 'Bannen'}
                          </button>
                          <button
                            onClick={() => toggleAdmin(user.id, user.is_admin)}
                            className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-zinc-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/10"
                          >
                            {user.is_admin ? 'Admin entfernen' : 'Zum Admin'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-8 text-center text-sm font-semibold text-zinc-500">
            {filtered.length} von {profiles.length} Spielern sichtbar
          </p>
        </section>
      </div>
    </main>
  );
}
