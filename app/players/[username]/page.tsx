'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AdminBadge } from '@/components/AdminBadge';
import { BrandLogo } from '@/components/BrandLogo';
import { RankBadge } from '@/components/RankBadge';
import { StreamerBadge } from '@/components/StreamerBadge';
import { type DartsPlatform, type PlatformStatistic, PlatformBadge, UnifiedDartsProfile } from '@/components/UnifiedDartsProfile';
import { getRankProgress } from '@/lib/ranks';
import { ArrowUpRight, Crown, ExternalLink, Menu, ShieldCheck, Sparkles, Star, Target, Trophy, X, Zap } from 'lucide-react';

type PremiumCosmetic = 'emerald' | 'violet' | 'gold' | 'cyan';
type PublicProfile = {
  username: string; elo: number; gamesPlayed: number; wins: number; isPremium: boolean; premium_cosmetic: PremiumCosmetic | null;
  isAdmin: boolean; is_streamer: boolean; twitch_url: string | null; kick_url: string | null; supabaseId: string;
};
type MatchHistory = {
  id: string; created_at: string; completed_at?: string | null; opponent_name: string; is_win: boolean; legs_won: number; legs_lost: number;
  my_average: number | null; one_eighties: number; app?: DartsPlatform | null;
};
type TournamentHistory = {
  tournament_id: string; title: string; starts_at: string; status: string; tournament_format: string; scoring_platform: string;
  participant_status: string; wins: number; losses: number; points: number; placement: number | null; is_winner: boolean; prize_title: string | null;
};

const premiumCosmeticStyles: Record<PremiumCosmetic, { avatar: string; badge: string; icon: string; name: string }> = {
  emerald: { avatar: '!border-emerald-300/70 !bg-emerald-400/[0.08] shadow-[0_0_34px_rgba(110,231,183,.22)]', badge: '!border-emerald-300/35 !bg-emerald-400/10 !text-emerald-100', icon: 'text-emerald-300', name: 'text-emerald-50' },
  violet: { avatar: '!border-violet-300/70 !bg-violet-400/[0.08] shadow-[0_0_34px_rgba(196,181,253,.22)]', badge: '!border-violet-300/40 !bg-violet-400/10 !text-violet-100', icon: 'text-violet-300', name: 'text-violet-100' },
  gold: { avatar: '!border-amber-300/75 !bg-amber-300/[0.08] shadow-[0_0_34px_rgba(252,211,77,.24)]', badge: '!border-amber-300/40 !bg-amber-300/10 !text-amber-100', icon: 'text-amber-300', name: 'text-amber-100' },
  cyan: { avatar: '!border-cyan-300/70 !bg-cyan-400/[0.08] shadow-[0_0_34px_rgba(103,232,249,.22)]', badge: '!border-cyan-300/40 !bg-cyan-400/10 !text-cyan-100', icon: 'text-cyan-300', name: 'text-cyan-100' },
};

function getPremiumCosmeticStyle(isPremium: boolean, cosmetic: PremiumCosmetic | null | undefined) {
  if (!isPremium) return null;
  return premiumCosmeticStyles[cosmetic === 'violet' || cosmetic === 'gold' || cosmetic === 'cyan' ? cosmetic : 'emerald'];
}

function formatCompletion(match: MatchHistory) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(match.completed_at ?? match.created_at));
}

export default function PlayerProfile() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [matches, setMatches] = useState<MatchHistory[]>([]);
  const [tournamentHistory, setTournamentHistory] = useState<TournamentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avgAverage, setAvgAverage] = useState<number | null>(null);
  const [total180s, setTotal180s] = useState(0);
  const [bestAverage, setBestAverage] = useState<number | null>(null);
  const [platformStatistics, setPlatformStatistics] = useState<PlatformStatistic[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const [{ data: profileData }, { data: adminRows, error: adminError }] = await Promise.all([
        supabase.from('public_visible_profiles').select('username, elo, gamesPlayed, wins, isPremium, premium_cosmetic, is_streamer, twitch_url, kick_url, supabaseId').eq('username', username).maybeSingle(),
        supabase.rpc('get_public_admin_profile_ids'),
      ]);
      if (!isMounted) return;
      if (!profileData) { setNotFound(true); setLoading(false); return; }
      if (adminError) console.error('Admin-Badge konnte nicht geladen werden:', adminError);
      const publicProfile: PublicProfile = {
        username: profileData.username,
        elo: profileData.elo ?? 1000,
        gamesPlayed: profileData.gamesPlayed ?? 0,
        wins: profileData.wins ?? 0,
        isPremium: Boolean(profileData.isPremium),
        premium_cosmetic: profileData.premium_cosmetic ?? null,
        isAdmin: (adminRows || []).some((row: { profile_id: string }) => row.profile_id === profileData.supabaseId),
        is_streamer: Boolean(profileData.is_streamer),
        twitch_url: profileData.twitch_url ?? null,
        kick_url: profileData.kick_url ?? null,
        supabaseId: profileData.supabaseId,
      };
      setProfile(publicProfile);
      const { data: matchData, error: matchHistoryError } = await supabase.rpc('get_public_player_match_history_with_platform', { p_user_id: publicProfile.supabaseId, p_limit: 20 });
      if (!isMounted) return;
      setMatches((matchData || []) as MatchHistory[]);
      if (matchHistoryError) console.error('Öffentliche Match-Historie konnte nicht geladen werden:', matchHistoryError);
      const [{ data: tournamentRows }, { data: statisticRows, error: statisticsError }, { data: platformRows, error: platformStatisticsError }] = await Promise.all([
        supabase.rpc('list_player_tournament_history', { p_user_id: publicProfile.supabaseId }),
        supabase.rpc('get_public_player_statistics', { p_user_ids: [publicProfile.supabaseId] }),
        supabase.rpc('get_public_player_platform_statistics', { p_user_ids: [publicProfile.supabaseId] }),
      ]);
      if (!isMounted) return;
      setTournamentHistory((tournamentRows || []) as TournamentHistory[]);
      if (!statisticsError) {
        const stats = (statisticRows as { average: number | null; best_average: number | null; total_180s: number }[] | null)?.[0];
        setAvgAverage(stats?.average ?? null);
        setBestAverage(stats?.best_average ?? null);
        setTotal180s(stats?.total_180s ?? 0);
      } else console.error('Öffentliche Spielerstatistiken konnten nicht geladen werden:', statisticsError);
      if (!platformStatisticsError) setPlatformStatistics((platformRows || []) as PlatformStatistic[]);
      else console.error('Öffentliche Plattform-Statistiken konnten nicht geladen werden:', platformStatisticsError);
      setLoading(false);
    }
    void load();
    return () => { isMounted = false; };
  }, [supabase, username]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#080b0a] text-zinc-300"><div className="border border-white/15 bg-[#0d1110] px-6 py-4 font-bold">Profil wird geladen…</div></main>;
  if (notFound) return <main className="grid min-h-screen place-items-center bg-[#080b0a] px-5 text-center text-white"><div className="max-w-md border border-white/15 bg-[#0d1110] px-8 py-10"><Trophy className="mx-auto h-11 w-11 text-zinc-600" /><h1 className="mt-5 text-3xl font-black tracking-[-.05em]">Spieler nicht gefunden</h1><p className="mt-3 text-sm leading-6 text-zinc-400">Das Profil von <strong className="text-white">{username}</strong> ist nicht öffentlich erreichbar.</p><button type="button" onClick={() => router.back()} className="mt-7 bg-emerald-300 px-6 py-3 text-xs font-black uppercase tracking-[.15em] text-[#07100b]">Zurück</button></div></main>;

  const elo = profile!.elo;
  const gamesPlayed = profile!.gamesPlayed;
  const wins = profile!.wins;
  const losses = Math.max(gamesPlayed - wins, 0);
  const winrate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const { current: currentRank, upcoming, eloToNext, progress } = getRankProgress(elo);
  const nextRank = upcoming ?? currentRank;
  const premiumCosmetic = getPremiumCosmeticStyle(profile!.isPremium, profile!.premium_cosmetic);

  return (
    <main className="player-profile-page text-[#f7f5ef]">
      <nav className="player-profile-nav border-b backdrop-blur-xl">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-5 py-4 md:px-8 lg:px-10">
          <Link href="/" className="flex min-w-0 items-center gap-3"><BrandLogo className="h-10 w-10 shrink-0 rounded-lg" /><span className="min-w-0"><span className="block text-lg font-black tracking-[-.05em]">RANKEDDARTS</span><span className="block text-[9px] font-black uppercase tracking-[.25em] text-emerald-300">Competitive darts</span></span></Link>
          <div className="hidden items-center gap-6 text-sm font-bold text-zinc-400 lg:flex"><Link href="/leaderboard" className="transition hover:text-white">Rangliste</Link><Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link><Link href="/tournaments" className="transition hover:text-white">Turniere</Link><Link href="/streamers" className="transition hover:text-white">Streamer</Link><Link href="/history" className="transition hover:text-white">Match-Verlauf</Link><Link href="/premium" className="border border-emerald-300/30 px-3 py-1.5 text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-300/10">Premium</Link></div>
          <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center border border-white/15 text-zinc-200 lg:hidden" aria-label="Navigation öffnen">{mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-4 lg:hidden"><div className="mx-auto flex max-w-[90rem] flex-col gap-1 text-sm font-bold text-zinc-300"><Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 hover:bg-white/[.04]">Rangliste</Link><Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 hover:bg-white/[.04]">Matchmaking</Link><Link href="/tournaments" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 hover:bg-white/[.04]">Turniere</Link><Link href="/streamers" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 hover:bg-white/[.04]">Streamer</Link></div></div>}
      </nav>

      <section className="player-profile-shell mx-auto max-w-[90rem] px-5 pb-20 pt-7 md:px-8 md:pt-10 lg:px-10">
        <header className="player-profile-hero">
          <div className="player-profile-hero-grid grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10 lg:p-10">
            <div className="min-w-0">
              <div className="player-profile-kicker"><Sparkles className="h-3.5 w-3.5" /> Öffentliches Spielerprofil</div>
              <div className="mt-7 flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                <div className={'player-profile-rank-seal grid h-24 w-24 shrink-0 place-items-center sm:h-28 sm:w-28 ' + (premiumCosmetic?.avatar || '')}><RankBadge level={currentRank.level} size="xl" priority /><span className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center bg-emerald-300 text-[#07100b]"><Zap className="h-4 w-4 fill-current" /></span></div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5">{profile!.isPremium && <Star className={'h-5 w-5 shrink-0 fill-current ' + (premiumCosmetic?.icon || 'text-emerald-300')} />}<h1 className={'truncate text-4xl font-black tracking-[-.08em] sm:text-5xl lg:text-6xl ' + (premiumCosmetic?.name || '')}>{profile!.username}</h1>{profile!.is_streamer && <StreamerBadge />}{profile!.isAdmin && <AdminBadge />}</div><div className="mt-3 flex flex-wrap gap-2"><span className={'player-profile-rank-tag ' + currentRank.color}>Level {currentRank.level} · {currentRank.name}</span>{profile!.isPremium && <span className={'player-profile-premium-tag ' + (premiumCosmetic?.badge || '')}>Premium</span>}</div><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">Alle Werte stammen aus bestätigten Ranked-Matches. Private Spiele und offene Ergebnisse zählen nicht in dieses Profil.</p></div>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-zinc-500"><span className="inline-flex items-center gap-2 text-emerald-100"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Bestätigte Ranked-Stats</span><span>{gamesPlayed} Matches gespielt</span>{profile!.is_streamer && profile!.twitch_url && <a href={profile!.twitch_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-violet-200 transition hover:text-white">Twitch öffnen <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
            </div>
            <div className="player-profile-scorecard self-start"><div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.2em] text-emerald-100"><span>Aktuelles Rating</span><Crown className="h-4 w-4 text-amber-200" /></div><div className="mt-5 text-6xl font-black tracking-[-.1em] text-emerald-200">{elo}</div><div className="mt-1 text-sm font-bold text-zinc-500">Elo-Punkte</div><div className="mt-8 border-t border-white/10 pt-4"><div className="flex items-center gap-3"><RankBadge level={currentRank.level} size="sm" /><div><div className={'font-black ' + currentRank.color}>{currentRank.name}</div><div className="mt-1 text-xs text-zinc-500">Level {currentRank.level} · Season 01</div></div></div></div></div>
          </div>
          <div className="player-profile-anchor-nav flex flex-wrap gap-x-7 gap-y-2 px-6 py-3 text-[10px] font-black uppercase tracking-[.16em] sm:px-8 lg:px-10"><a href="#matches">Matches</a><a href="#entwicklung">Entwicklung</a><a href="#plattformen">Plattformen</a><a href="#turniere">Turniere</a><span className="ml-auto hidden text-zinc-600 md:inline">Season 01 · bis 01.11.2026</span></div>
        </header>

        <section className="player-profile-stat-rail mt-4 grid grid-cols-2 border-y border-white/10 md:grid-cols-4"><div><span>Siege</span><strong className="text-emerald-200">{wins}</strong><small>Bestätigte Matches</small></div><div><span>Niederlagen</span><strong className="text-rose-200">{losses}</strong><small>Bestätigte Matches</small></div><div><span>Winrate</span><strong>{winrate}%</strong><small>{wins}W / {losses}L</small></div><div><span>Spiele</span><strong>{gamesPlayed}</strong><small>Diese Season</small></div></section>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14">
          <section id="matches" className="player-profile-section min-w-0 scroll-mt-28"><div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="player-profile-label">Match-Protokoll</div><h2 className="mt-2 text-3xl font-black tracking-[-.065em]">Letzte Matches.</h2><p className="mt-2 text-sm text-zinc-500">Die letzten 20 bestätigten Ergebnisse von {profile!.username}.</p></div><div className="player-profile-count">{matches.length} Matches</div></div>{matches.length === 0 ? <div className="py-12 text-sm text-zinc-500">Noch keine bestätigten Matches vorhanden.</div> : <div className="mt-4">{matches.map((match) => <div key={match.id} className={'player-profile-match-row ' + (match.is_win ? 'is-win' : 'is-loss')}><span className="player-profile-match-state">{match.is_win ? 'Sieg' : 'Niederlage'}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-base font-black text-white">vs. {match.opponent_name || 'Unbekannter Gegner'}</span><PlatformBadge app={match.app} /></div><div className="mt-1 text-xs text-zinc-500">{match.legs_won} : {match.legs_lost} Legs · {formatCompletion(match)}</div></div><div className="flex shrink-0 items-center gap-4 text-right"><div>{match.my_average !== null && <span className="block text-sm font-black text-violet-200">Ø {match.my_average.toFixed(1)}</span>}{match.one_eighties > 0 && <span className="mt-1 block text-xs font-bold text-amber-200">{match.one_eighties}× 180</span>}</div><ArrowUpRight className="hidden h-4 w-4 text-zinc-600 sm:block" /></div></div>)}</div>}</section>

          <aside id="entwicklung" className="player-profile-aside min-w-0 scroll-mt-28"><section className="player-profile-progression"><div className="player-profile-label">Nächster Rang</div><div className="mt-4 flex items-end justify-between gap-4"><div><div className={'text-3xl font-black tracking-[-.06em] ' + nextRank.color}>{nextRank.name}</div><p className="mt-2 text-sm leading-5 text-zinc-500">{eloToNext > 0 ? `${eloToNext} Elo bis zum nächsten Rang.` : 'Maximaler Rang erreicht.'}</p></div><span className="text-3xl font-black text-emerald-200">{Math.round(progress)}%</span></div><div className="mt-6 h-1.5 overflow-hidden bg-white/10"><div className="h-full bg-emerald-300" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex justify-between text-xs text-zinc-500"><span>{elo} Elo</span><span>{upcoming ? nextRank.min + ' Elo' : 'Maximal'}</span></div></section><section className="player-profile-performance mt-10"><div className="player-profile-label">Spielwerte</div><div className="mt-5 space-y-4"><div className="flex items-center justify-between border-b border-white/10 pb-4"><span className="inline-flex items-center gap-2 text-sm text-zinc-400"><Target className="h-4 w-4 text-violet-200" />Ø Average</span><strong className="text-xl text-violet-100">{avgAverage !== null ? avgAverage.toFixed(1) : '—'}</strong></div><div className="flex items-center justify-between border-b border-white/10 pb-4"><span className="inline-flex items-center gap-2 text-sm text-zinc-400"><Zap className="h-4 w-4 text-emerald-200" />Best Average</span><strong className="text-xl text-emerald-100">{bestAverage !== null ? bestAverage.toFixed(1) : '—'}</strong></div><div className="flex items-center justify-between border-b border-white/10 pb-4"><span className="inline-flex items-center gap-2 text-sm text-zinc-400"><Sparkles className="h-4 w-4 text-amber-200" />180er</span><strong className="text-xl text-amber-100">{total180s}</strong></div></div></section><Link href="/leaderboard" className="player-profile-leaderboard-link group mt-10 flex items-center gap-4"><Trophy className="h-5 w-5 text-amber-200" /><span className="min-w-0 flex-1"><span className="player-profile-label text-amber-100">Season 01</span><span className="mt-1 block text-lg font-black text-white">Rangliste ansehen</span></span><ArrowUpRight className="h-5 w-5 text-emerald-200 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></Link></aside>
        </div>

        <section id="plattformen" className="player-profile-platforms mt-16 scroll-mt-28"><div className="border-b border-white/10 pb-5"><div className="player-profile-label">Plattformen</div><h2 className="mt-2 text-3xl font-black tracking-[-.065em]">Leistung im Vergleich.</h2><p className="mt-2 text-sm text-zinc-500">Bestätigte Werte – getrennt nach Scolia, DartCounter und AutoDarts.</p></div><div className="mt-7"><UnifiedDartsProfile statistics={platformStatistics} /></div></section>

        <section id="turniere" className="player-profile-tournaments mt-16 scroll-mt-28"><div className="flex flex-col gap-4 border-b border-amber-300/20 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="player-profile-label text-amber-100">Turnier-Akte</div><h2 className="mt-2 text-3xl font-black tracking-[-.065em]">Öffentliche Turnier-Historie.</h2></div><span className="player-profile-count border-amber-300/25 text-amber-100">{tournamentHistory.length} Events</span></div>{tournamentHistory.length === 0 ? <div className="py-12 text-sm text-zinc-500">Noch keine öffentlichen Turnierergebnisse.</div> : <div className="mt-4 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">{tournamentHistory.map((event) => <Link href="/tournaments" key={event.tournament_id} className="player-profile-tournament group bg-[#0b0f0e] p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="truncate font-black text-white">{event.title}</div><p className="mt-1 text-xs text-zinc-500">{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(event.starts_at))} · {event.tournament_format.replaceAll('_', ' ')}</p></div>{event.is_winner && <span className="shrink-0 bg-amber-300 px-2 py-1 text-[9px] font-black uppercase tracking-[.12em] text-[#221906]">Champion</span>}</div><div className="mt-5 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[.1em]"><span className="border border-emerald-300/20 px-2 py-1 text-emerald-100">{event.wins} Siege</span><span className="border border-rose-300/20 px-2 py-1 text-rose-100">{event.losses} Niederlagen</span><span className="border border-white/10 px-2 py-1 text-zinc-400">{event.scoring_platform}</span>{event.prize_title && <span className="border border-amber-300/20 px-2 py-1 text-amber-100">{event.prize_title}</span>}</div></Link>)}</div>}</section>
        <footer className="mt-16 border-t border-white/10 pt-7 text-center text-xs text-zinc-600">RankedDarts · Öffentliches Spielerprofil · Season 01</footer>
      </section>
    </main>
  );
}
