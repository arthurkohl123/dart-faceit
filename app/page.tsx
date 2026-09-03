'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronRight, CircleDot, Menu, Swords, Trophy, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { ResultRoomPreview } from '@/components/ResultRoomPreview';
import { getRankRangeLabel, RANK_TIERS } from '@/lib/ranks';

type CommunityStats = { players: number; matches: number; cups: number; liveCups: number; };

const principles = [
  ['01', 'Gegner auf deinem Level', 'Die Suche startet eng bei deiner Elo. Erst mit der Zeit wird der Bereich erweitert.'],
  ['02', 'Ein Ergebnis, zwei Bestätigungen', 'Elo und Statistiken zählen erst, wenn das Resultat von beiden Seiten bestätigt wurde.'],
  ['03', 'Eine Saison mit Ziel', 'Season 01 läuft bis zum 01.11.2026. Jede Platzierung wird durch gespielte Matches verdient.'],
];

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
        if ([data.players, data.matches, data.cups, data.liveCups].every((value) => Number.isInteger(value) && value >= 0)) setCommunityStats(data);
      } catch {
        // Die Startseite bleibt auch bei einer kurzzeitig nicht erreichbaren Statistik nutzbar.
      }
    }
    void loadCommunityStats();
  }, []);

  const stats = [
    [communityStats ? String(communityStats.players) : '–', 'Spieler'],
    [communityStats ? String(communityStats.matches) : '–', 'Bestätigte Matches'],
    [communityStats ? String(communityStats.cups) : '–', 'Turniere'],
    [communityStats ? String(communityStats.liveCups) : '–', 'Turniere live'],
  ];
  const primaryTarget = isLoggedIn ? '/matchmaking' : '/auth/register';
  const primaryLabel = isLoggedIn ? 'Match suchen' : 'Kostenlos starten';

  return (
    <main className="min-h-screen overflow-hidden bg-[#0a0d0d] text-[#f5f3ee]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 sport-grid opacity-35" />
      <div aria-hidden className="pointer-events-none fixed -right-48 top-24 -z-10 h-[34rem] w-[34rem] sport-dartboard opacity-20" />

      <nav className="border-b border-white/10 bg-[#0a0d0d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 text-left" aria-label="Zur Startseite">
            <BrandLogo className="h-10 w-10 rounded-lg" />
            <span><span className="block text-lg font-black tracking-[-0.05em]">RANKEDDARTS</span><span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-300">Competitive darts</span></span>
          </button>
          <div className="hidden items-center gap-6 text-[13px] font-semibold text-zinc-300 lg:flex">
            <a href="/leaderboard" className="hover:text-white">Rangliste</a><a href="/matchmaking" className="hover:text-white">Matchmaking</a><a href="/tournaments" className="hover:text-white">Turniere</a><a href="/updates" className="hover:text-white">Updates</a>
            <span className="border-l border-white/15 pl-6 text-[11px] font-bold uppercase tracking-[.12em] text-zinc-500">Saison 01 · bis 01.11.2026</span>
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn ? <button onClick={() => router.push('/profile')} className="hidden border border-emerald-300 bg-emerald-300 px-4 py-2 text-sm font-black text-[#07100b] transition hover:bg-emerald-200 sm:block">Mein Profil</button> : <><button onClick={() => router.push('/auth/login')} className="hidden px-4 py-2 text-sm font-bold text-zinc-300 hover:text-white sm:block">Login</button><button onClick={() => router.push('/auth/register')} className="hidden border border-emerald-300 bg-emerald-300 px-4 py-2 text-sm font-black text-[#07100b] transition hover:bg-emerald-200 sm:block">Mitspielen</button></>}
            <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center border border-white/15 text-zinc-200 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-3 lg:hidden"><div className="mx-auto grid max-w-7xl gap-1 text-sm font-bold text-zinc-300">{['Rangliste|/leaderboard', 'Matchmaking|/matchmaking', 'Turniere|/tournaments', 'Updates|/updates', 'Premium|/premium'].map((entry) => { const [label, href] = entry.split('|'); return <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 hover:text-emerald-200">{label}</a>; })}</div></div>}
      </nav>

      <section className="relative mx-auto grid max-w-7xl gap-12 overflow-hidden px-5 pb-16 pt-14 md:px-8 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-[url('/rankeddarts-darts-club-hero-v2.png')] bg-cover bg-[72%_center] opacity-35" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#0a0d0d_0%,rgba(10,13,13,.94)_40%,rgba(10,13,13,.55)_72%,#0a0d0d_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0d0d] to-transparent" />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 border-l-2 border-emerald-300 pl-3 text-[11px] font-black uppercase tracking-[.19em] text-emerald-200"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Matchmaking geöffnet</div>
          <h1 className="mt-7 max-w-3xl text-[3.3rem] font-black leading-[.9] tracking-[-.075em] text-[#f5f3ee] sm:text-7xl xl:text-[6.2rem]">Kein Zufall.<br /><span className="text-emerald-300">Nur dein nächstes Match.</span></h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">RankedDarts bringt faire 1v1-Duelle, klare Ergebnisse und eine Rangliste zusammen. Du spielst gegen Leute in deiner Nähe – nicht gegen den Zufall.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button onClick={() => router.push(primaryTarget)} className="group inline-flex items-center justify-center gap-3 border border-emerald-300 bg-emerald-300 px-6 py-4 text-sm font-black uppercase tracking-[.12em] text-[#07100b] transition hover:bg-emerald-200">{primaryLabel} <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button><button onClick={() => router.push('/leaderboard')} className="border border-white/15 px-6 py-4 text-sm font-bold text-white transition hover:border-white/40 hover:bg-white/[.04]">Rangliste ansehen</button></div>
          <p className="mt-5 text-xs leading-5 text-zinc-500">Kostenlos: 4 Ranked-Matches pro Tag. Premium: ohne Tageslimit und mit Zugang zu Premium-Turnieren.</p>
        </div>
        <div className="relative z-10"><div className="mb-3 flex items-center justify-between border-y border-white/10 py-3 text-[10px] font-black uppercase tracking-[.16em] text-zinc-500"><span className="inline-flex items-center gap-2"><CircleDot className="h-3.5 w-3.5 text-emerald-300" /> So sieht ein Result Room aus</span><span>Beispielansicht</span></div><ResultRoomPreview onOpen={() => router.push('/matchmaking')} /></div>
      </section>

      <section className="border-y border-white/10 bg-[#0d1110]"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/10 md:grid-cols-4 md:divide-y-0">{stats.map(([value, label]) => <div key={label} className="px-5 py-6 md:px-8 md:py-8"><div className="text-3xl font-black tracking-[-.06em] text-white md:text-4xl">{value}</div><div className="mt-1 text-xs font-bold uppercase tracking-[.12em] text-zinc-500">{label}</div></div>)}</div></section>

      <section className="mx-auto max-w-7xl px-5 pt-20 md:px-8 md:pt-28">
        <div className="grid overflow-hidden border border-white/15 bg-[#0d1110] md:grid-cols-[1.15fr_.85fr]">
          <div className="min-h-72 bg-[url('/rankeddarts-darts-club-hero-v2.png')] bg-cover bg-[68%_center] md:min-h-[25rem]" />
          <div className="flex flex-col justify-between p-7 md:p-10">
            <div><p className="text-[11px] font-black uppercase tracking-[.2em] text-emerald-300">Competitive darts, ohne Theater</p><h2 className="mt-4 text-3xl font-black tracking-[-.055em] md:text-5xl">Dein Spiel. Klar gewertet.</h2><p className="mt-5 max-w-md leading-7 text-zinc-400">Du spielst über deine gewählte Plattform, reichst dein Ergebnis ein und dein Gegner bestätigt es. Erst dann zählt das Match für deine Saison.</p></div>
            <a href="/matchmaking" className="mt-9 inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-emerald-100">So funktioniert Matchmaking <ChevronRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28"><div className="max-w-2xl"><p className="text-[11px] font-black uppercase tracking-[.2em] text-emerald-300">Wie RankedDarts funktioniert</p><h2 className="mt-4 text-4xl font-black tracking-[-.06em] md:text-6xl">Ein System, das man versteht.</h2></div><div className="mt-12 grid border-t border-white/15 lg:grid-cols-3">{principles.map(([number, title, text], index) => <article key={number} className={`py-8 lg:px-8 ${index !== 0 ? 'lg:border-l lg:border-white/15' : 'lg:pr-8'}`}><span className="text-sm font-black text-emerald-300">{number}</span><h3 className="mt-7 text-2xl font-black tracking-[-.04em]">{title}</h3><p className="mt-3 max-w-sm leading-7 text-zinc-400">{text}</p></article>)}</div></section>

      <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8 md:pb-28"><div className="grid border border-white/15 bg-[#0d1110] lg:grid-cols-[.72fr_1.28fr]"><div className="border-b border-white/15 p-7 lg:border-b-0 lg:border-r lg:p-10"><div className="flex h-11 w-11 items-center justify-center border border-emerald-300/40 text-emerald-300"><Trophy className="h-5 w-5" /></div><p className="mt-7 text-[11px] font-black uppercase tracking-[.2em] text-zinc-500">Dein Ranking</p><h2 className="mt-3 text-3xl font-black tracking-[-.05em]">Level 1 bis Level 10.</h2><p className="mt-4 leading-7 text-zinc-400">Level 10 beginnt bei 2.000 Elo. Deine Platzierung richtet sich nach bestätigten Ranked-Matches.</p><button onClick={() => router.push('/matchmaking')} className="mt-7 inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-emerald-100">Zum Matchmaking <ChevronRight className="h-4 w-4" /></button></div><div className="grid sm:grid-cols-2">{RANK_TIERS.map((rank) => <div key={rank.level} className="border-b border-white/10 p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:p-6"><div className="flex items-baseline justify-between"><span className="text-xs font-black uppercase tracking-[.14em] text-zinc-500">Level {rank.level}</span><span className="text-xs font-black text-emerald-300">{getRankRangeLabel(rank)} Elo</span></div><div className="mt-3 text-2xl font-black tracking-[-.05em] text-white">{rank.name}</div></div>)}</div></div></section>

      <section className="border-t border-white/10 bg-[#0d1110] px-5 py-16 text-center md:px-8 md:py-20"><Swords className="mx-auto h-6 w-6 text-emerald-300" /><h2 className="mx-auto mt-5 max-w-3xl text-4xl font-black tracking-[-.06em] md:text-6xl">Bereit für das nächste Leg?</h2><p className="mx-auto mt-4 max-w-xl leading-7 text-zinc-400">Erstelle dein Profil, hinterlege deine Plattform und finde deinen nächsten Gegner.</p><button onClick={() => router.push(primaryTarget)} className="mt-8 border border-emerald-300 bg-emerald-300 px-7 py-4 text-sm font-black uppercase tracking-[.12em] text-[#07100b] transition hover:bg-emerald-200">{primaryLabel}</button></section>

      <footer className="border-t border-white/10 px-5 py-8 text-xs text-zinc-500 md:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between"><span className="font-bold text-zinc-300">RANKEDDARTS · COMPETITIVE DARTS</span><div className="flex flex-wrap gap-x-5 gap-y-2"><a href="/impressum" className="hover:text-white">Impressum</a><a href="/datenschutz" className="hover:text-white">Datenschutz</a><a href="/agb" className="hover:text-white">AGB</a><a href="/turnierregeln" className="hover:text-white">Turnierregeln</a><a href="/premium/kuendigung" className="hover:text-white">Premium kündigen</a></div></div></footer>
    </main>
  );
}
