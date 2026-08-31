'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Clock3,
  Gamepad2,
  Loader2,
  Radio,
  Search,
  ShieldCheck,
  Swords,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { NotificationBell } from '@/components/notification-bell';

type Platform = 'scolia' | 'dartcounter' | 'autodarts';

type Friend = {
  friendship_id: string;
  user_id: string;
  username: string;
  elo: number;
  is_online: boolean;
  in_queue: boolean;
  queue_app: Platform | null;
  available_apps: Platform[] | null;
};

type FriendRequest = {
  friendship_id: string;
  user_id: string;
  username: string;
  elo: number;
  created_at: string;
};

type FriendChallenge = {
  challenge_id: string;
  direction: 'incoming' | 'outgoing';
  user_id: string;
  username: string;
  app: Platform;
  best_of: number;
  expires_at: string;
  created_at: string;
};

type SearchResult = {
  user_id: string;
  username: string;
  elo: number;
  friendship_status: 'pending' | 'accepted' | 'declined' | null;
};

const platformDetails: Record<Platform, { label: string; accent: string; background: string }> = {
  scolia: { label: 'Scolia', accent: 'text-emerald-200', background: 'border-emerald-300/25 bg-emerald-400/[0.08]' },
  dartcounter: { label: 'DartCounter', accent: 'text-cyan-200', background: 'border-cyan-300/25 bg-cyan-400/[0.08]' },
  autodarts: { label: 'AutoDarts', accent: 'text-violet-200', background: 'border-violet-300/25 bg-violet-400/[0.08]' },
};

function platformLabel(app: Platform | null) {
  return app ? platformDetails[app].label : 'Plattform';
}

function remainingTime(expiresAt: string) {
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function FriendsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [challenges, setChallenges] = useState<FriendChallenge[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [challengeFriend, setChallengeFriend] = useState<Friend | null>(null);
  const [selectedApp, setSelectedApp] = useState<Platform>('scolia');
  const [bestOf, setBestOf] = useState(7);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const [friendResult, requestResult, challengeResult] = await Promise.all([
      supabase.rpc('list_my_friends'),
      supabase.rpc('list_my_friend_requests'),
      supabase.rpc('list_my_friend_challenges'),
    ]);

    const firstError = friendResult.error || requestResult.error || challengeResult.error;
    if (firstError) {
      setNotice({ type: 'error', text: `Freunde konnten nicht vollständig geladen werden: ${firstError.message}` });
    }
    setFriends((friendResult.data ?? []) as Friend[]);
    setRequests((requestResult.data ?? []) as FriendRequest[]);
    setChallenges((challengeResult.data ?? []) as FriendChallenge[]);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    // Defer the first data load so React's effect setup stays side-effect
    // free; subsequent refreshes are driven by the timer.
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 12_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  const searchPlayers = async () => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setNotice({ type: 'error', text: 'Gib mindestens zwei Zeichen eines Nutzernamens ein.' });
      return;
    }
    setSearching(true);
    setNotice(null);
    const { data, error } = await supabase.rpc('search_friend_candidates', { p_query: query });
    if (error) setNotice({ type: 'error', text: error.message });
    setSearchResults((data ?? []) as SearchResult[]);
    setSearching(false);
  };

  const sendFriendRequest = async (userId: string) => {
    setBusy(`request-${userId}`);
    setNotice(null);
    const { error } = await supabase.rpc('send_friend_request', { p_recipient_id: userId });
    if (error) setNotice({ type: 'error', text: error.message });
    else {
      setNotice({ type: 'success', text: 'Freundschaftsanfrage wurde gesendet.' });
      await Promise.all([searchPlayers(), load()]);
    }
    setBusy(null);
  };

  const respondToRequest = async (request: FriendRequest, accept: boolean) => {
    setBusy(`friend-request-${request.friendship_id}`);
    setNotice(null);
    const { error } = await supabase.rpc('respond_to_friend_request', {
      p_friendship_id: request.friendship_id,
      p_accept: accept,
    });
    if (error) setNotice({ type: 'error', text: error.message });
    else {
      setNotice({ type: 'success', text: accept ? `${request.username} ist jetzt dein Freund.` : 'Anfrage abgelehnt.' });
      await load();
    }
    setBusy(null);
  };

  const removeFriend = async (friend: Friend) => {
    if (!window.confirm(`${friend.username} wirklich aus deiner Freundesliste entfernen?`)) return;
    setBusy(`remove-${friend.friendship_id}`);
    setNotice(null);
    const { error } = await supabase.rpc('remove_friend', { p_friendship_id: friend.friendship_id });
    if (error) setNotice({ type: 'error', text: error.message });
    else {
      setNotice({ type: 'success', text: `${friend.username} wurde aus deiner Freundesliste entfernt.` });
      await load();
    }
    setBusy(null);
  };

  const openChallenge = (friend: Friend) => {
    const apps = friend.available_apps ?? [];
    if (!friend.is_online) {
      setNotice({ type: 'error', text: `${friend.username} ist gerade nicht online.` });
      return;
    }
    if (friend.in_queue) {
      setNotice({ type: 'error', text: `${friend.username} sucht gerade ein Ranked-Match. Warte, bis die Queue verlassen wurde.` });
      return;
    }
    if (apps.length === 0) {
      setNotice({ type: 'error', text: 'Ihr braucht beide einen Namen auf derselben Plattform.' });
      return;
    }
    setSelectedApp(apps[0]);
    setBestOf(7);
    setChallengeFriend(friend);
    setNotice(null);
  };

  const sendChallenge = async () => {
    if (!challengeFriend) return;
    setBusy(`challenge-${challengeFriend.user_id}`);
    setNotice(null);
    const { error } = await supabase.rpc('create_friend_challenge', {
      p_friend_id: challengeFriend.user_id,
      p_app: selectedApp,
      p_best_of: bestOf,
    });
    if (error) setNotice({ type: 'error', text: error.message });
    else {
      setNotice({ type: 'success', text: `Herausforderung an ${challengeFriend.username} gesendet. Sie läuft fünf Minuten.` });
      setChallengeFriend(null);
      await load();
    }
    setBusy(null);
  };

  const respondToChallenge = async (challenge: FriendChallenge, accept: boolean) => {
    setBusy(`challenge-response-${challenge.challenge_id}`);
    setNotice(null);
    const { data, error } = await supabase.rpc('respond_to_friend_challenge', {
      p_challenge_id: challenge.challenge_id,
      p_accept: accept,
    });
    if (error) {
      setNotice({ type: 'error', text: error.message });
      await load();
    } else if (accept) {
      const result = data as { match_id?: string; best_of?: number } | null;
      if (result?.match_id) {
        router.push(`/result?matchId=${encodeURIComponent(result.match_id)}&bestOf=${result.best_of ?? challenge.best_of}`);
        return;
      }
      setNotice({ type: 'error', text: 'Das Duell wurde erstellt, konnte aber nicht geöffnet werden.' });
      await load();
    } else {
      setNotice({ type: 'success', text: 'Herausforderung abgelehnt.' });
      await load();
    }
    setBusy(null);
  };

  const cancelChallenge = async (challenge: FriendChallenge) => {
    setBusy(`cancel-${challenge.challenge_id}`);
    const { error } = await supabase.rpc('cancel_friend_challenge', { p_challenge_id: challenge.challenge_id });
    if (error) setNotice({ type: 'error', text: error.message });
    else {
      setNotice({ type: 'success', text: 'Herausforderung zurückgezogen.' });
      await load();
    }
    setBusy(null);
  };

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white"><div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] px-7 py-5 text-sm font-black text-emerald-200"><Loader2 className="h-5 w-5 animate-spin" /> Freundesystem wird geladen …</div></main>;
  }

  const incomingChallenges = challenges.filter((challenge) => challenge.direction === 'incoming');
  const outgoingChallenges = challenges.filter((challenge) => challenge.direction === 'outgoing');

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] pb-16 text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_0%,rgba(34,197,94,0.2),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(34,211,238,0.14),transparent_26%),linear-gradient(180deg,#050607_20%,#050607_76%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />

      <nav className="sticky top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-300 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Profil</Link>
          <div className="flex items-center gap-3"><Link href="/matchmaking" className="hidden rounded-full border border-white/10 px-4 py-2 text-xs font-black text-zinc-300 transition hover:bg-white/10 sm:block">Matchmaking</Link><NotificationBell /></div>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-5 md:px-8 md:pt-14">
        <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.14] via-zinc-950/85 to-cyan-400/[0.1] p-6 shadow-2xl shadow-black/40 sm:rounded-[2.5rem] sm:p-9">
          <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100"><UsersRound className="h-3.5 w-3.5" /> Social Arena</div><h1 className="mt-4 text-4xl font-black tracking-[-0.07em] sm:text-5xl">Deine Crew. Dein Duell.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300 sm:text-base">Sieh, wer online ist, fordere Freunde direkt heraus und spiele private Best-of-Matches – ohne Elo, Saisonwertung oder Tageslimit.</p></div>
            <div className="grid grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-center"><div className="px-4 py-3"><div className="text-2xl font-black text-white">{friends.length}</div><div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Freunde</div></div><div className="px-4 py-3"><div className="text-2xl font-black text-emerald-300">{friends.filter((friend) => friend.is_online).length}</div><div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Online</div></div><div className="px-4 py-3"><div className="text-2xl font-black text-amber-200">{incomingChallenges.length}</div><div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Duells</div></div></div>
          </div>
        </div>

        {notice && <div className={`mt-5 flex items-start gap-3 rounded-2xl border px-5 py-4 text-sm font-bold ${notice.type === 'success' ? 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100' : 'border-red-400/30 bg-red-400/[0.09] text-red-100'}`}><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notice.type === 'success' ? 'bg-emerald-300' : 'bg-red-300'}`} />{notice.text}</div>}

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 shadow-xl shadow-black/20 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">Freunde finden</p><h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">Spieler hinzufügen</h2></div><p className="max-w-sm text-xs leading-5 text-zinc-500">Suche nach dem RankedDarts-Nutzernamen. E-Mail-Adressen bleiben dabei privat.</p></div>
          <div className="mt-5 flex gap-2"><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchPlayers(); }} placeholder="Nutzername suchen" maxLength={60} className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/45 focus:bg-white/[0.07]" /><button onClick={() => void searchPlayers()} disabled={searching} className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-50"><Search className="h-4 w-4" />{searching ? 'Suche …' : 'Suchen'}</button></div>
          {searchResults.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-2">{searchResults.map((player) => <div key={player.user_id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 font-black text-cyan-100">{player.username.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{player.username}</p><p className="text-xs text-zinc-500">{player.elo} Elo</p></div>{player.friendship_status === 'accepted' ? <span className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100">Freunde</span> : player.friendship_status === 'pending' ? <span className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-100">Offen</span> : <button onClick={() => void sendFriendRequest(player.user_id)} disabled={busy === `request-${player.user_id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-zinc-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/10 disabled:opacity-50"><UserPlus className="h-3.5 w-3.5" />{busy === `request-${player.user_id}` ? '…' : player.friendship_status === 'declined' ? 'Erneut anfragen' : 'Hinzufügen'}</button>}</div>)}</div>}
        </section>

        {(requests.length > 0 || incomingChallenges.length > 0 || outgoingChallenges.length > 0) && <section className="mt-5 grid gap-5 lg:grid-cols-2">
          {(requests.length > 0 || incomingChallenges.length > 0) && <div className="rounded-[1.75rem] border border-amber-300/20 bg-amber-400/[0.045] p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-100"><Zap className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Aktion nötig</p><h2 className="text-xl font-black">Neue Signale</h2></div></div><div className="mt-5 space-y-3">{requests.map((request) => <div key={request.friendship_id} className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="font-black">{request.username}</p><p className="mt-1 text-xs text-zinc-400">Möchte dein Freund werden · {request.elo} Elo</p><div className="mt-3 flex gap-2"><button onClick={() => void respondToRequest(request, true)} disabled={busy === `friend-request-${request.friendship_id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-black disabled:opacity-50"><Check className="h-3.5 w-3.5" />Annehmen</button><button onClick={() => void respondToRequest(request, false)} disabled={busy === `friend-request-${request.friendship_id}`} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-zinc-300 transition hover:bg-white/10 disabled:opacity-50">Ablehnen</button></div></div>)}{incomingChallenges.map((challenge) => <div key={challenge.challenge_id} className="rounded-2xl border border-amber-300/20 bg-black/25 p-4"><div className="flex items-center justify-between gap-3"><p className="font-black">{challenge.username} fordert dich heraus</p><span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-200"><Clock3 className="h-3.5 w-3.5" />{remainingTime(challenge.expires_at)}</span></div><p className="mt-1 text-xs text-zinc-400">{platformLabel(challenge.app)} · Best of {challenge.best_of} · privates Duell</p><div className="mt-3 flex gap-2"><button onClick={() => void respondToChallenge(challenge, true)} disabled={busy === `challenge-response-${challenge.challenge_id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-300 px-3 py-2 text-xs font-black text-black disabled:opacity-50"><Swords className="h-3.5 w-3.5" />Annehmen</button><button onClick={() => void respondToChallenge(challenge, false)} disabled={busy === `challenge-response-${challenge.challenge_id}`} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-zinc-300 transition hover:bg-white/10 disabled:opacity-50">Ablehnen</button></div></div>)}</div></div>}
          {outgoingChallenges.length > 0 && <div className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-400/[0.045] p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-100"><Radio className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">Wartebereich</p><h2 className="text-xl font-black">Deine Herausforderungen</h2></div></div><div className="mt-5 space-y-3">{outgoingChallenges.map((challenge) => <div key={challenge.challenge_id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4"><div><p className="font-black">{challenge.username}</p><p className="mt-1 text-xs text-zinc-400">{platformLabel(challenge.app)} · Best of {challenge.best_of} · noch {remainingTime(challenge.expires_at)}</p></div><button onClick={() => void cancelChallenge(challenge)} disabled={busy === `cancel-${challenge.challenge_id}`} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-zinc-300 transition hover:border-red-300/30 hover:bg-red-400/10 disabled:opacity-50">Zurückziehen</button></div>)}</div></div>}
        </section>}

        <section className="mt-5"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Freundesliste</p><h2 className="mt-1 text-3xl font-black tracking-[-0.05em]">Bereit für das nächste Leg?</h2></div><span className="text-xs font-bold text-zinc-500">Online-Status aktualisiert sich automatisch</span></div>{friends.length === 0 ? <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.025] p-12 text-center"><UsersRound className="mx-auto h-10 w-10 text-zinc-600" /><h3 className="mt-4 text-xl font-black">Noch keine Freunde.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">Füge Spieler über ihren Nutzernamen hinzu. Sobald ihr euch gegenseitig verbunden habt, kannst du direkte Duelle starten.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{friends.map((friend) => { const apps = friend.available_apps ?? []; const challengeDisabled = !friend.is_online || friend.in_queue || apps.length === 0; return <article key={friend.friendship_id} className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/75 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-emerald-300/25"><div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-300/[0.07] blur-3xl transition group-hover:bg-emerald-300/[0.13]" /><div className="relative flex items-start gap-3"><div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg font-black text-white">{friend.username.slice(0, 1).toUpperCase()}<span className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-zinc-950 ${friend.is_online ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]' : 'bg-zinc-600'}`} /></div><div className="min-w-0 flex-1"><p className="truncate text-lg font-black tracking-[-0.03em]">{friend.username}</p><p className="mt-0.5 text-xs text-zinc-500">{friend.elo} Elo</p></div><button onClick={() => void removeFriend(friend)} disabled={busy === `remove-${friend.friendship_id}`} aria-label={`${friend.username} entfernen`} className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 text-zinc-600 transition hover:border-red-300/30 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50"><UserMinus className="h-3.5 w-3.5" /></button></div><div className="relative mt-5 flex flex-wrap gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${friend.is_online ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-zinc-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${friend.is_online ? 'bg-emerald-300' : 'bg-zinc-600'}`} />{friend.is_online ? 'Online' : 'Offline'}</span>{friend.in_queue && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100"><Loader2 className="h-3 w-3 animate-spin" />Queue · {platformLabel(friend.queue_app)}</span>}</div><div className="relative mt-4 flex min-h-7 flex-wrap gap-1.5">{apps.map((app) => <span key={app} className={`rounded-lg border px-2 py-1 text-[10px] font-black ${platformDetails[app].background} ${platformDetails[app].accent}`}>{platformDetails[app].label}</span>)}{apps.length === 0 && <span className="text-xs text-zinc-600">Keine gemeinsame Plattform hinterlegt</span>}</div><button onClick={() => openChallenge(friend)} disabled={challengeDisabled || busy === `challenge-${friend.user_id}`} className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 via-lime-300 to-emerald-300 px-4 py-3 text-sm font-black text-black shadow-[0_10px_28px_rgba(74,222,128,0.16)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Swords className="h-4 w-4" />{friend.in_queue ? 'In Ranked-Queue' : friend.is_online ? 'Jetzt herausfordern' : 'Gerade offline'}</button></article>; })}</div>}</section>
      </section>

      {challengeFriend && <div className="fixed inset-0 z-50 flex items-end bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-emerald-300/25 bg-[#0a0d0c] shadow-2xl shadow-black/80"><div className="flex items-start justify-between border-b border-white/10 p-6"><div><div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><Swords className="h-3.5 w-3.5" /> Privates Duell</div><h2 className="mt-2 text-2xl font-black">{challengeFriend.username} herausfordern</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Das Match wird nicht für Elo, Saison oder Tageslimit gewertet.</p></div><button onClick={() => setChallengeFriend(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div><div className="space-y-5 p-6"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Plattform</p><div className="mt-3 grid grid-cols-3 gap-2">{(challengeFriend.available_apps ?? []).map((app) => <button key={app} onClick={() => setSelectedApp(app)} className={`rounded-xl border px-2 py-3 text-xs font-black transition ${selectedApp === app ? `${platformDetails[app].background} ${platformDetails[app].accent}` : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:bg-white/[0.07]'}`}>{platformDetails[app].label}</button>)}</div></div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Format</p><div className="mt-3 grid grid-cols-4 gap-2">{[3, 5, 7, 9].map((format) => <button key={format} onClick={() => setBestOf(format)} className={`rounded-xl border py-3 text-sm font-black transition ${bestOf === format ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:bg-white/[0.07]'}`}>Bo{format}</button>)}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-zinc-400"><ShieldCheck className="mr-2 inline h-4 w-4 text-emerald-300" />Dein Freund hat fünf Minuten Zeit, die Herausforderung anzunehmen. Beim Annehmen verlassen beide automatisch eine eventuell gerade gestartete Queue, damit kein Match kollidiert.</div><button onClick={() => void sendChallenge()} disabled={busy === `challenge-${challengeFriend.user_id}`} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-3.5 text-sm font-black text-black transition hover:bg-emerald-200 disabled:opacity-50"><Gamepad2 className="h-4 w-4" />{busy === `challenge-${challengeFriend.user_id}` ? 'Wird gesendet …' : `Best of ${bestOf} senden`}</button></div></div></div>}
    </main>
  );
}
