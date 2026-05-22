'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-2xl text-white">
        Lade Admin Panel...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6 lg:flex-row lg:justify-between lg:items-center mb-10">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🔧</span>
            <div>
              <h1 className="text-4xl font-black">Admin Panel</h1>
              <p className="text-zinc-400 mt-2">Spieler verwalten und widersprochene Matches prüfen</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={refreshAdminData}
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
            >
              Aktualisieren
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
            >
              ← Zurück zum Profil
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mb-8 rounded-2xl border border-red-700/60 bg-red-950/40 p-5 text-red-100">
            {actionMessage}
          </div>
        )}

        <section className="mb-12 rounded-3xl border border-amber-700/50 bg-amber-950/20 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
            <div>
              <h2 className="text-2xl font-black text-amber-300">Widersprochene Matches</h2>
              <p className="text-zinc-400 mt-2">
                Hier werden Matches angezeigt, bei denen ein Spieler dem eingereichten Ergebnis widersprochen hat.
              </p>
            </div>
            <span className="rounded-full bg-amber-500/20 px-5 py-2 text-amber-200 font-bold">
              {loadingDisputes ? 'Lädt...' : `${disputedMatches.length} offen`}
            </span>
          </div>

          {disputedMatches.length === 0 ? (
            <div className="rounded-2xl bg-zinc-900/70 p-6 text-zinc-400">
              Aktuell gibt es keine widersprochenen Matches zur Prüfung.
            </div>
          ) : (
            <div className="space-y-6">
              {disputedMatches.map((match) => {
                const form = resolveForms[match.match_id] || emptyForm;

                return (
                  <div key={match.match_id} className="rounded-3xl border border-zinc-700 bg-zinc-900 p-6">
                    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                      <div>
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                          <span className="rounded-full bg-red-600/20 px-4 py-1 text-sm font-bold text-red-300">
                            DISPUTED
                          </span>
                          <span className="text-zinc-500 text-sm">Match-ID: {match.match_id}</span>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 mb-5">
                          <div className="rounded-2xl bg-zinc-950 p-5 border border-zinc-800">
                            <p className="text-zinc-500 text-sm">Spieler 1</p>
                            <p className="text-xl font-black">{match.player1_username}</p>
                            <p className="text-zinc-400">{match.player1_elo} Elo</p>
                          </div>
                          <div className="rounded-2xl bg-zinc-950 p-5 border border-zinc-800">
                            <p className="text-zinc-500 text-sm">Spieler 2</p>
                            <p className="text-xl font-black">{match.player2_username}</p>
                            <p className="text-zinc-400">{match.player2_elo} Elo</p>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-zinc-950 p-5 border border-zinc-800 space-y-2 text-sm text-zinc-300">
                          <p>
                            <span className="text-zinc-500">Eingereicht von:</span>{' '}
                            <strong>{match.submitted_by_username || 'Unbekannt'}</strong>
                          </p>
                          <p>
                            <span className="text-zinc-500">Gemeldeter Gewinner:</span>{' '}
                            <strong>{match.submitted_winner_username || 'Unbekannt'}</strong>
                          </p>
                          <p>
                            <span className="text-zinc-500">Gemeldetes Ergebnis:</span>{' '}
                            <strong>{match.submitted_player1_legs ?? '—'}:{match.submitted_player2_legs ?? '—'}</strong>
                          </p>
                          <p>
                            <span className="text-zinc-500">Widerspruch:</span>{' '}
                            {match.dispute_reason || 'Kein Grund angegeben.'}
                          </p>
                          <p>
                            <span className="text-zinc-500">Eingereicht am:</span>{' '}
                            {formatDate(match.confirmation_requested_at || match.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-zinc-950 p-5 border border-zinc-800">
                        <h3 className="text-lg font-black mb-4">Admin-Entscheidung</h3>

                        <label className="block text-sm text-zinc-400 mb-2">Gewinner</label>
                        <select
                          value={form.winnerId}
                          onChange={(event) => updateResolveForm(match.match_id, { winnerId: event.target.value })}
                          className="w-full mb-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                        >
                          <option value={match.player1_id}>{match.player1_username}</option>
                          <option value={match.player2_id}>{match.player2_username}</option>
                        </select>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div>
                            <label className="block text-sm text-zinc-400 mb-2">Legs {match.player1_username}</label>
                            <input
                              type="number"
                              min="0"
                              value={form.player1Legs}
                              onChange={(event) => updateResolveForm(match.match_id, { player1Legs: event.target.value })}
                              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-zinc-400 mb-2">Legs {match.player2_username}</label>
                            <input
                              type="number"
                              min="0"
                              value={form.player2Legs}
                              onChange={(event) => updateResolveForm(match.match_id, { player2Legs: event.target.value })}
                              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <input
                            type="number"
                            step="0.01"
                            placeholder={`Average ${match.player1_username}`}
                            value={form.player1Average}
                            onChange={(event) => updateResolveForm(match.match_id, { player1Average: event.target.value })}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder={`Average ${match.player2_username}`}
                            value={form.player2Average}
                            onChange={(event) => updateResolveForm(match.match_id, { player2Average: event.target.value })}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <input
                            type="number"
                            placeholder={`Checkout ${match.player1_username}`}
                            value={form.player1Checkout}
                            onChange={(event) => updateResolveForm(match.match_id, { player1Checkout: event.target.value })}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                          />
                          <input
                            type="number"
                            placeholder={`Checkout ${match.player2_username}`}
                            value={form.player2Checkout}
                            onChange={(event) => updateResolveForm(match.match_id, { player2Checkout: event.target.value })}
                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3"
                          />
                        </div>

                        <textarea
                          placeholder="Admin-Notiz, zum Beispiel Begründung oder Discord-Nachweis"
                          value={form.adminNote}
                          onChange={(event) => updateResolveForm(match.match_id, { adminNote: event.target.value })}
                          className="w-full min-h-24 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 mb-4"
                        />

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            onClick={() => resolveDispute(match)}
                            className="flex-1 rounded-xl bg-green-600 px-5 py-3 font-bold hover:bg-green-500"
                          >
                            Ergebnis werten
                          </button>
                          <button
                            onClick={() => cancelDispute(match)}
                            className="flex-1 rounded-xl bg-red-600 px-5 py-3 font-bold hover:bg-red-500"
                          >
                            Ohne Elo annullieren
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <input
            type="text"
            placeholder="Benutzer suchen..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-6 py-4 mb-8 text-lg"
          />

          <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-700">
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-800 border-b border-zinc-700">
                  <th className="text-left p-6">Benutzername</th>
                  <th className="text-center p-6">Elo</th>
                  <th className="text-center p-6">Spiele</th>
                  <th className="text-center p-6">Siege</th>
                  <th className="text-center p-6">Status</th>
                  <th className="text-center p-6">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="border-b border-zinc-800 hover:bg-zinc-800/70">
                    <td className="p-6 font-medium">{user.username}</td>
                    <td className="p-6 text-center">
                      <input
                        type="number"
                        defaultValue={user.elo || 1000}
                        onBlur={(event) => updateElo(user.id, Number(event.target.value))}
                        className="bg-transparent text-center w-24 font-bold focus:bg-zinc-800 rounded p-1"
                      />
                    </td>
                    <td className="p-6 text-center">{user.gamesPlayed || 0}</td>
                    <td className="p-6 text-center text-green-500">{user.wins || 0}</td>
                    <td className="p-6 text-center">
                      {user.is_banned ? (
                        <span className="bg-red-600/20 text-red-500 px-4 py-1 rounded-full text-sm">GEBANNT</span>
                      ) : user.is_admin ? (
                        <span className="bg-purple-600/20 text-purple-400 px-4 py-1 rounded-full text-sm">ADMIN</span>
                      ) : (
                        <span className="bg-green-600/20 text-green-500 px-4 py-1 rounded-full text-sm">Aktiv</span>
                      )}
                    </td>
                    <td className="p-6 text-center space-x-3">
                      <button
                        onClick={() => toggleBan(user)}
                        className={`px-5 py-2.5 rounded-2xl text-sm font-medium ${user.is_banned ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}
                      >
                        {user.is_banned ? 'Entbannen' : 'Bannen'}
                      </button>
                      <button
                        onClick={() => toggleAdmin(user.id, user.is_admin)}
                        className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-2xl text-sm font-medium"
                      >
                        {user.is_admin ? 'Admin entfernen' : 'Zum Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-zinc-500 mt-8">
            {profiles.length} Spieler insgesamt
          </p>
        </section>
      </div>
    </div>
  );
}
