'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, CheckCircle2, ChevronRight, CircleDot, ClipboardCheck, Link2, Menu, MessageCircle, Radio, ShieldCheck, Swords, Target, Trophy, UsersRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { RankBadge } from '@/components/RankBadge';
import { ResultRoomPreview } from '@/components/ResultRoomPreview';
import { getRankRangeLabel, RANK_TIERS } from '@/lib/ranks';

type CommunityStats = { players: number; matches: number; cups: number; liveCups: number; onlinePlayers: number; queuePlayers: number; livePlayers: number; };

const principles = [
  ['01', 'Gegner auf deinem Level', 'Die Suche startet eng bei deiner Elo. Erst mit der Zeit wird der Bereich erweitert.'],
  ['02', 'Ein Ergebnis, zwei Bestätigungen', 'Elo und Statistiken zählen erst, wenn das Resultat von beiden Seiten bestätigt wurde.'],
  ['03', 'Eine Saison mit Ziel', 'Season 01 läuft bis zum 01.11.2026. Jede Platzierung wird durch gespielte Matches verdient.'],
];

const scoringPlatforms = [
  { name: 'Scolia', mark: 'S', detail: 'Auto-Scoring', tone: 'border-cyan-200/25 bg-cyan-200/[0.07] text-cyan-100' },
  { name: 'DartCounter', mark: 'D', detail: 'Live-Score', tone: 'border-violet-200/25 bg-violet-200/[0.07] text-violet-100' },
  { name: 'AutoDarts', mark: 'A', detail: 'Board-Setup', tone: 'border-amber-200/25 bg-amber-200/[0.07] text-amber-100' },
] as const;

const homepageSteps = [
  { number: '01', title: 'Profil erstellen', text: 'Kostenlos registrieren, Plattform auswählen und deinen Spielernamen hinterlegen.', icon: UsersRound },
  { number: '02', title: 'Queue öffnen', text: 'Matchmaking starten und Gegner auf deinem Elo-Level finden.', icon: Target },
  { number: '03', title: 'Match bestätigen', text: 'Ergebnis einreichen, bestätigen lassen und direkt in der Rangliste steigen.', icon: ClipboardCheck },
] as const;

const DISCORD_INVITE_URL = 'https://discord.gg/V6u29zEhp';

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(Boolean(session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setIsLoggedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    async function loadCommunityStats() {
      try {
        const response = await fetch('/api/community-stats');
        if (!response.ok) throw new Error('Community stats request failed');
        const data: CommunityStats = await response.json();
        if ([data.players, data.matches, data.cups, data.liveCups, data.onlinePlayers, data.queuePlayers, data.livePlayers].every((value) => Number.isInteger(value) && value >= 0)) setCommunityStats(data);
      } catch {
        // Die Startseite bleibt auch bei einer kurzzeitig nicht erreichbaren Statistik nutzbar.
      }
    }
    void loadCommunityStats();
    const refresh = window.setInterval(() => void loadCommunityStats(), 30_000);
    return () => window.clearInterval(refresh);
  }, []);

  const stats = [
    [communityStats ? String(communityStats.players) : '–', 'Spieler gesamt'],
    [communityStats ? String(communityStats.matches) : '–', 'Bestätigte Matches'],
    [communityStats ? String(communityStats.onlinePlayers) : '–', 'Gerade online'],
    [communityStats ? String(communityStats.livePlayers) : '–', 'Aktiv im Match'],
  ];
  const primaryTarget = isLoggedIn ? '/matchmaking' : '/auth/register';
  const primaryLabel = isLoggedIn ? 'Match suchen' : 'Kostenlos starten';

  return (
    <main className="rankeddarts-home min-h-screen overflow-hidden bg-[#0a0d0d] text-[#f5f3ee]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 sport-grid opacity-35" />
      <div aria-hidden className="pointer-events-none fixed -right-48 top-24 -z-10 h-[34rem] w-[34rem] sport-dartboard opacity-20" />

      <nav className="rd-home-nav border-b border-white/10 bg-[#0a0d0d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 text-left" aria-label="Zur Startseite">
            <BrandLogo className="h-10 w-10 rounded-lg" />
            <span><span className="block text-lg font-black tracking-[-0.05em]">RANKEDDARTS</span><span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-300">Competitive darts</span></span>
          </button>
          <div className="hidden items-center gap-6 text-[13px] font-semibold text-zinc-300 lg:flex">
            <a href="/leaderboard" className="hover:text-white">Rangliste</a><a href="/matchmaking" className="hover:text-white">Matchmaking</a><Link href="/tournaments" className="hover:text-white">Turniere</Link><a href="/updates" className="hover:text-white">Updates</a><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-indigo-200 transition hover:text-white"><MessageCircle className="h-3.5 w-3.5" /> Discord</a>
            <span className="border-l border-white/15 pl-6 text-[11px] font-bold uppercase tracking-[.12em] text-zinc-500">Saison 01 · bis 01.11.2026</span>
          </div>
          <div className="flex items-center gap-2">
            {!isLoggedIn && <><button onClick={() => router.push('/auth/login')} className="hidden px-4 py-2 text-sm font-bold text-zinc-300 hover:text-white sm:block">Login</button><button onClick={() => router.push('/auth/register')} className="hidden border border-emerald-300 bg-emerald-300 px-4 py-2 text-sm font-black text-[#07100b] transition hover:bg-emerald-200 sm:block">Mitspielen</button></>}
            <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-3 lg:hidden"><div className="mx-auto grid max-w-7xl gap-1 text-sm font-bold text-zinc-300">{['Rangliste|/leaderboard', 'Matchmaking|/matchmaking', 'Turniere|/tournaments', 'Updates|/updates', 'Premium|/premium'].map((entry) => { const [label, href] = entry.split('|'); return <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 hover:text-emerald-200">{label}</a>; })}<a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-2 border-b border-white/5 py-3 text-indigo-200 hover:text-white"><MessageCircle className="h-4 w-4" /> Discord-Community</a></div></div>}
      </nav>

      <section className="rd-home-hero relative mx-auto grid max-w-7xl gap-12 overflow-hidden px-5 pb-16 pt-14 md:px-8 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-[url('/rankeddarts-darts-club-hero-v2.png')] bg-cover bg-[72%_center] opacity-35" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0a0d0d_0%,rgba(10,13,13,.94)_40%,rgba(10,13,13,.55)_72%,#0a0d0d_100%)]" />
          <div className="absolute -right-24 top-12 h-80 w-80 rounded-full border border-emerald-200/15 shadow-[0_0_100px_rgba(52,211,153,.14)] lg:right-10 lg:top-24" />
          <div className="absolute -right-10 top-28 h-52 w-52 rounded-full border border-cyan-200/20 shadow-[0_0_80px_rgba(103,232,249,.12)] lg:right-24 lg:top-40" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0d0d] to-transparent" />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 border-l-2 border-emerald-300 pl-3 text-[11px] font-black uppercase tracking-[.19em] text-emerald-200"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Matchmaking geöffnet</div>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-zinc-500"><span className="text-zinc-400">Dein Board.</span><span className="text-emerald-300">Deine Plattform.</span><span className="text-zinc-700">/</span><span>Scolia</span><span className="text-zinc-700">·</span><span>DartCounter</span><span className="text-zinc-700">·</span><span>AutoDarts</span></div>
          <h1 className="mt-7 max-w-3xl text-[3.3rem] font-black leading-[.9] tracking-[-.075em] text-[#f5f3ee] sm:text-7xl xl:text-[6.2rem]">Kein Zufall.<br /><span className="text-emerald-300">Nur dein nächstes Match.</span></h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">RankedDarts bringt faire 1v1-Duelle, klare Ergebnisse und eine Rangliste zusammen. <strong className="font-black text-zinc-200">Spiele über Scolia, DartCounter oder AutoDarts</strong> und finde Gegner auf deinem Niveau.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button onClick={() => router.push(primaryTarget)} className="group inline-flex items-center justify-center gap-3 border border-emerald-300 bg-emerald-300 px-6 py-4 text-sm font-black uppercase tracking-[.12em] text-[#07100b] transition hover:bg-emerald-200">{primaryLabel} <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 border border-indigo-300/35 bg-indigo-300/10 px-6 py-4 text-sm font-bold text-indigo-100 transition hover:border-indigo-200 hover:bg-indigo-300/20"><MessageCircle className="h-4 w-4" /> Community beitreten</a></div>
          <button onClick={() => router.push(primaryTarget)} className="rd-live-banner group mt-5 grid w-full max-w-xl overflow-hidden border border-emerald-300/25 bg-[#0d1110]/90 text-left transition hover:border-emerald-300/50 hover:bg-[#101614] sm:grid-cols-[1fr_auto]" aria-label="Aktuelle Arena-Aktivität ansehen und Matchmaking öffnen">
            <span className="flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5"><span className="grid h-10 w-10 shrink-0 place-items-center border border-emerald-300/25 bg-emerald-400/10 text-emerald-200"><Radio className="h-4 w-4" /></span><span className="min-w-0"><span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.95)]" /> Live in der Arena</span><span className="mt-1 block text-sm font-bold leading-5 text-zinc-200">{communityStats ? communityStats.queuePlayers > 0 ? `${communityStats.queuePlayers} ${communityStats.queuePlayers === 1 ? 'Spieler sucht' : 'Spieler suchen'} gerade.` : 'Noch niemand sucht – starte die Queue.' : 'Arena-Aktivität wird geladen …'}</span></span></span>
            <span className="grid grid-cols-2 border-t border-white/10 bg-black/20 sm:border-l sm:border-t-0"><span className="px-4 py-3 text-center"><span className="block text-xl font-black tracking-[-.05em] text-white">{communityStats ? communityStats.onlinePlayers : '–'}</span><span className="mt-0.5 block text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Aktiv</span></span><span className="border-l border-white/10 px-4 py-3 text-center"><span className="block text-xl font-black tracking-[-.05em] text-emerald-200">{communityStats ? communityStats.livePlayers : '–'}</span><span className="mt-0.5 block text-[9px] font-black uppercase tracking-[.12em] text-zinc-500">Im Match</span></span></span>
          </button>
          <p className="mt-5 text-xs leading-5 text-zinc-500">Kostenlos: 4 Ranked-Matches pro Tag. Premium: ohne Tageslimit und mit Zugang zu Premium-Turnieren.</p>
        </div>
        <div className="relative z-10"><div className="mb-3 flex items-center justify-between border-y border-white/10 py-3 text-[10px] font-black uppercase tracking-[.16em] text-zinc-500"><span className="inline-flex items-center gap-2"><CircleDot className="h-3.5 w-3.5 text-emerald-300" /> So sieht ein Result Room aus</span><span>Beispielansicht</span></div><ResultRoomPreview onOpen={() => router.push('/matchmaking')} /></div>
      </section>

      <section className="rd-home-stats border-y border-white/10 bg-[#0d1110]"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/10 md:grid-cols-4 md:divide-y-0">{stats.map(([value, label], index) => <div key={label} className="relative px-5 py-6 md:px-8 md:py-8"><div className="absolute left-5 top-4 h-1 w-1 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)] md:left-8" /><div className="text-3xl font-black tracking-[-.06em] text-white md:text-4xl">{value}</div><div className="mt-1 text-xs font-bold uppercase tracking-[.12em] text-zinc-500">{label}</div>{index === 1 && <div className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.12em] text-emerald-200/70"><CheckCircle2 className="h-3 w-3" /> Fair bestätigt</div>}</div>)}</div></section>

      <section className="rd-home-platforms relative overflow-hidden border-y border-white/10 bg-[#0d1110]">
        <div aria-hidden className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-emerald-300/[0.06] blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[.22em] text-emerald-300">Drei Plattformen. Ein Ranking.</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-.065em] md:text-6xl">Du spielst, wo dein Board steht.</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400">Scolia, DartCounter oder AutoDarts: Deine bevorzugte Scoring-Plattform bleibt dein Zuhause. RankedDarts verbindet die Ergebnisse zu fairen Matches, bestätigten Stats und einer gemeinsamen Rangliste.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 self-start border border-emerald-200/20 bg-emerald-200/[0.06] px-4 py-2 text-[10px] font-black uppercase tracking-[.16em] text-emerald-100 lg:self-end"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" /> Plattformübergreifend bereit</span>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {scoringPlatforms.map((platform) => <div key={platform.name} className={`rd-platform-card group relative overflow-hidden border p-5 transition hover:-translate-y-1 hover:border-white/30 ${platform.tone}`}><div aria-hidden className="absolute -right-6 -top-8 h-24 w-24 rounded-full border border-current/20 transition group-hover:scale-125" /><div className="relative flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center border border-current/35 bg-black/20 text-xl font-black shadow-[0_0_20px_rgba(255,255,255,.04)]">{platform.mark}</span><span><span className="block text-lg font-black tracking-[-.03em] text-white">{platform.name}</span><span className="mt-1 block text-[10px] font-black uppercase tracking-[.16em] opacity-70">{platform.detail}</span></span></div><div className="relative mt-5 flex items-center gap-2 text-xs font-bold text-zinc-300"><span className="h-1.5 w-1.5 rounded-full bg-current" /> Mit RankedDarts verbunden <ArrowUpRight className="ml-auto h-4 w-4 opacity-60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div></div>)}
          </div>
        </div>
      </section>

      <section id="so-funktionierts" className="rd-home-flow mx-auto max-w-7xl scroll-mt-10 px-5 py-20 md:px-8 md:py-28">
        <div className="flex flex-col justify-between gap-6 border-b border-white/15 pb-8 md:flex-row md:items-end">
          <div className="max-w-2xl"><p className="text-[11px] font-black uppercase tracking-[.22em] text-emerald-300">In drei Schritten auf die Bühne</p><h2 className="mt-4 text-4xl font-black tracking-[-.065em] md:text-6xl">Vom Board direkt ins Ranking.</h2><p className="mt-5 max-w-xl leading-7 text-zinc-400">Keine komplizierte Liga-Verwaltung und kein Papierkram. Dein Scoring bleibt auf deiner Plattform – RankedDarts hält den Wettbewerb zusammen.</p></div>
          <Link href="/getting-started" className="inline-flex shrink-0 items-center gap-2 text-sm font-black text-emerald-200 hover:text-white">Ablauf ansehen <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid border-b border-white/15 lg:grid-cols-3">
          {homepageSteps.map(({ number, title, text, icon: Icon }, index) => <article key={number} className={`group py-8 lg:px-8 ${index !== 0 ? 'lg:border-l lg:border-white/15' : 'lg:pr-8'}`}><div className="flex items-start justify-between gap-4"><span className="text-sm font-black text-emerald-300">{number}</span><span className="grid h-10 w-10 place-items-center border border-emerald-300/25 bg-emerald-300/[.06] text-emerald-200 transition group-hover:-translate-y-1 group-hover:border-emerald-200/60 group-hover:bg-emerald-300/15"><Icon className="h-4 w-4" /></span></div><h3 className="mt-8 text-2xl font-black tracking-[-.04em]">{title}</h3><p className="mt-3 max-w-sm leading-7 text-zinc-400">{text}</p></article>)}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold text-zinc-500"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Ergebnisse werden erst nach Bestätigung gewertet</span><span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4 text-cyan-300" /> Scolia · DartCounter · AutoDarts</span></div>
      </section>

      <section className="rd-home-proof mx-auto max-w-7xl px-5 pt-20 md:px-8 md:pt-28">
        <div className="grid overflow-hidden border border-white/15 bg-[#0d1110] md:grid-cols-[1.15fr_.85fr]">
          <div className="min-h-72 bg-[url('/rankeddarts-darts-club-hero-v2.png')] bg-cover bg-[68%_center] md:min-h-[25rem]" />
          <div className="flex flex-col justify-between p-7 md:p-10">
            <div><p className="text-[11px] font-black uppercase tracking-[.2em] text-emerald-300">Competitive darts, ohne Theater</p><h2 className="mt-4 text-3xl font-black tracking-[-.055em] md:text-5xl">Dein Spiel. Klar gewertet.</h2><p className="mt-5 max-w-md leading-7 text-zinc-400">Scolia, DartCounter oder AutoDarts liefern dir das Spielgefühl, das du kennst. RankedDarts übernimmt den fairen Rahmen: Ergebnis einreichen, bestätigen lassen und für deine Saison zählen.</p></div>
            <a href="/matchmaking" className="mt-9 inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-emerald-100">So funktioniert Matchmaking <ChevronRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>

      <section className="rd-home-principles mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28"><div className="max-w-2xl"><p className="text-[11px] font-black uppercase tracking-[.2em] text-emerald-300">Der Rahmen für jedes Match</p><h2 className="mt-4 text-4xl font-black tracking-[-.06em] md:text-6xl">Klar spielen. Klar aufsteigen.</h2></div><div className="mt-12 grid border-t border-white/15 lg:grid-cols-3">{principles.map(([number, title, text], index) => <article key={number} className={`py-8 lg:px-8 ${index !== 0 ? 'lg:border-l lg:border-white/15' : 'lg:pr-8'}`}><span className="text-sm font-black text-emerald-300">{number}</span><h3 className="mt-7 text-2xl font-black tracking-[-.04em]">{title}</h3><p className="mt-3 max-w-sm leading-7 text-zinc-400">{text}</p></article>)}</div></section>

      <section className="rd-home-ranks mx-auto max-w-7xl px-5 pb-20 md:px-8 md:pb-28"><div className="grid border border-white/15 bg-[#0d1110] lg:grid-cols-[.72fr_1.28fr]"><div className="border-b border-white/15 p-7 lg:border-b-0 lg:border-r lg:p-10"><div className="flex h-11 w-11 items-center justify-center border border-emerald-300/40 text-emerald-300"><Trophy className="h-5 w-5" /></div><p className="mt-7 text-[11px] font-black uppercase tracking-[.2em] text-zinc-500">Dein Ranking</p><h2 className="mt-3 text-3xl font-black tracking-[-.05em]">Level 1 bis Level 10.</h2><p className="mt-4 leading-7 text-zinc-400">Level 10 beginnt bei 2.000 Elo. Deine Platzierung richtet sich nach bestätigten Ranked-Matches.</p><button onClick={() => router.push('/matchmaking')} className="mt-7 inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-emerald-100">Zum Matchmaking <ChevronRight className="h-4 w-4" /></button></div><div className="grid sm:grid-cols-2">{RANK_TIERS.map((rank) => <div key={rank.level} className="group flex items-center gap-4 border-b border-white/10 p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:p-6"><RankBadge level={rank.level} size="sm" className="transition duration-300 group-hover:-translate-y-1 group-hover:scale-105" /><div className="min-w-0"><div className="flex items-baseline justify-between gap-3"><span className="text-xs font-black uppercase tracking-[.14em] text-zinc-500">Level {rank.level}</span><span className="shrink-0 text-[10px] font-black text-emerald-300">{getRankRangeLabel(rank)} Elo</span></div><div className="mt-2 text-2xl font-black tracking-[-.05em] text-white">{rank.name}</div></div></div>)}</div></div></section>

      <section className="rd-home-cta border-t border-white/10 bg-[#0d1110] px-5 py-16 text-center md:px-8 md:py-20"><Swords className="mx-auto h-6 w-6 text-emerald-300" /><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-black tracking-[-.06em] md:text-6xl">Bereit für das nächste Leg?</h2><p className="mx-auto mt-4 max-w-xl leading-7 text-zinc-400">Erstelle dein Profil, hinterlege deine Plattform und finde deinen nächsten Gegner.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={() => router.push(primaryTarget)} className="border border-emerald-300 bg-emerald-300 px-7 py-4 text-sm font-black uppercase tracking-[.12em] text-[#07100b] transition hover:bg-emerald-200">{primaryLabel}</button><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 border border-white/15 px-7 py-4 text-sm font-bold text-zinc-100 transition hover:border-indigo-200 hover:bg-indigo-300/10"><MessageCircle className="h-4 w-4 text-indigo-200" /> Auf Discord mitspielen</a></div></section>

      <footer className="border-t border-white/10 px-5 py-8 text-xs text-zinc-500 md:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between"><span className="font-bold text-zinc-300">RANKEDDARTS · COMPETITIVE DARTS</span><div className="flex flex-wrap gap-x-5 gap-y-2"><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="font-bold text-indigo-200 hover:text-white">Discord-Community</a><a href="/impressum" className="hover:text-white">Impressum</a><a href="/datenschutz" className="hover:text-white">Datenschutz</a><a href="/agb" className="hover:text-white">AGB</a><a href="/fairplay" className="hover:text-white">Fair Play</a><a href="/turnierregeln" className="hover:text-white">Turnierregeln</a><a href="/premium/kuendigung" className="hover:text-white">Premium kündigen</a></div></div></footer>
      <div className="fixed inset-x-3 bottom-3 z-40 md:hidden"><button onClick={() => router.push(primaryTarget)} className="flex w-full items-center justify-between border border-emerald-200 bg-emerald-300 px-4 py-3.5 text-sm font-black uppercase tracking-[.12em] text-[#07100b] shadow-[0_12px_32px_rgba(0,0,0,.5)]"><span>{primaryLabel}</span><ArrowUpRight className="h-4 w-4" /></button></div>
    </main>
  );
}
