'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronRight, CircleDot, Link2, Menu, MessageCircle, Radio, ShieldCheck, Swords, Target, Trophy, Video, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { ResultRoomPreview } from '@/components/ResultRoomPreview';

type CommunityStats = {
  players: number;
  matches: number;
  cups: number;
  liveCups: number;
  onlinePlayers: number;
  queuePlayers: number;
  livePlayers: number;
};

const DISCORD_INVITE_URL = 'https://discord.gg/5qwUZQxjfV';

const waysIn = [
  { id: 'ranked', icon: Swords, number: '01', eyebrow: 'Ranked', title: 'Ein gutes Match reicht.', text: 'Suche einen Gegner, spiele an deinem Board und nimm die Elo mit, die du dir erspielt hast.', href: '/matchmaking', action: 'Match suchen', accent: 'text-emerald-300' },
  { id: 'tournaments', icon: Trophy, number: '02', eyebrow: 'Turniere', title: 'Wenn ein Abend mehr kann.', text: 'Melde dich an, spiel dich durchs Bracket und verfolge jede Runde direkt auf der Plattform.', href: '/tournaments', action: 'Turniere ansehen', accent: 'text-amber-200' },
  { id: 'streamers', icon: Video, number: '03', eyebrow: 'Streamer', title: 'Auch daneben passiert was.', text: 'Schau Spielern aus der Community zu und entdecke, wer gerade live ist.', href: '/streamers', action: 'Zu den Streamern', accent: 'text-violet-200' },
] as const;

const setupBenefits = [
  { icon: ShieldCheck, title: 'Beide bestätigen', text: 'Das Ergebnis zählt erst, wenn ihr beide es bestätigt habt.' },
  { icon: Target, title: 'Passende Gegner', text: 'Die Suche startet in deinem Elo-Bereich.' },
  { icon: Link2, title: 'Dein System', text: 'Du bleibst bei dem Setup, mit dem du ohnehin spielst.' },
] as const;

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': 'https://www.rankeddarts.de/#website', url: 'https://www.rankeddarts.de/', name: 'RankedDarts', alternateName: 'RankedDarts', inLanguage: 'de-DE' },
    { '@type': 'Organization', '@id': 'https://www.rankeddarts.de/#organization', name: 'RankedDarts', url: 'https://www.rankeddarts.de/', logo: 'https://www.rankeddarts.de/rankeddarts-logo-mark.png', sameAs: [DISCORD_INVITE_URL] },
  ],
};

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
        // Auch ohne aktuelle Zahlen bleibt die Startseite vollständig nutzbar.
      }
    }
    void loadCommunityStats();
    const refresh = window.setInterval(() => void loadCommunityStats(), 30_000);
    return () => window.clearInterval(refresh);
  }, []);

  const primaryTarget = isLoggedIn ? '/matchmaking' : '/auth/register';
  const primaryLabel = isLoggedIn ? 'Match suchen' : 'Jetzt mitspielen';
  const headlineStats = [
    [communityStats ? String(communityStats.onlinePlayers) : '–', 'gerade online'],
    [communityStats ? String(communityStats.livePlayers) : '–', 'spielen gerade'],
    [communityStats ? String(communityStats.matches) : '–', 'bestätigte Matches'],
    [communityStats ? String(communityStats.cups) : '–', 'Turniere gespielt'],
  ];

  function modeStatus(id: string) {
    if (id === 'ranked') return communityStats ? String(communityStats.livePlayers) + (communityStats.livePlayers === 1 ? ' Match läuft gerade' : ' Matches laufen gerade') : 'Ranked-Matches';
    if (id === 'tournaments') return communityStats && communityStats.liveCups > 0 ? String(communityStats.liveCups) + (communityStats.liveCups === 1 ? ' Turnier läuft' : ' Turniere laufen') : 'Brackets und Cups';
    return 'Live und offline entdecken';
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#080b0a] text-[#f7f5ef]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <nav className="absolute inset-x-0 top-0 z-30 border-b border-white/10 bg-[#080b0a]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-5 py-4 md:px-8 lg:px-10">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 text-left" aria-label="Zur Startseite"><BrandLogo className="h-10 w-10 rounded-lg" /><span><span className="block text-lg font-black tracking-[-.05em]">RANKEDDARTS</span><span className="block text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-300">Competitive darts</span></span></button>
          <div className="hidden items-center gap-7 text-[13px] font-bold text-zinc-300 lg:flex"><Link href="/leaderboard" className="transition hover:text-white">Rangliste</Link><Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link><Link href="/tournaments" className="transition hover:text-white">Turniere</Link><Link href="/streamers" className="transition hover:text-white">Streamer</Link><Link href="/updates" className="transition hover:text-white">Updates</Link><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-indigo-200 transition hover:text-white"><MessageCircle className="h-3.5 w-3.5" /> Discord</a></div>
          <div className="flex items-center gap-2">{!isLoggedIn && <><button onClick={() => router.push('/auth/login')} className="hidden px-4 py-2 text-sm font-bold text-zinc-300 transition hover:text-white sm:block">Login</button><button onClick={() => router.push('/auth/register')} className="hidden bg-[#9af0bc] px-4 py-2 text-sm font-black text-[#07100b] transition hover:bg-[#c4f9d7] sm:block">Mitspielen</button></>}<button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center border border-white/15 text-zinc-200 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button></div>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 bg-[#080b0a]/95 px-5 py-3 lg:hidden"><div className="mx-auto grid max-w-7xl gap-1 text-sm font-bold text-zinc-300">{['Rangliste|/leaderboard', 'Matchmaking|/matchmaking', 'Turniere|/tournaments', 'Streamer|/streamers', 'Updates|/updates', 'Premium|/premium'].map((entry) => { const [label, href] = entry.split('|'); return <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 transition hover:text-emerald-200">{label}</Link>; })}<a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-2 py-3 text-indigo-200"><MessageCircle className="h-4 w-4" /> Discord-Community</a></div></div>}
      </nav>

      <section className="relative isolate flex min-h-[54rem] items-end overflow-hidden border-b border-white/10 pt-24 sm:min-h-[52rem] lg:min-h-[min(56rem,100svh)]">
        <div aria-hidden className="absolute inset-0 bg-[url('/rankeddarts-hero-throw-v1.png')] bg-cover bg-[66%_center]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,#080b0a_0%,rgba(8,11,10,.94)_33%,rgba(8,11,10,.3)_68%,rgba(8,11,10,.16)_100%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-[#080b0a] via-[#080b0a]/65 to-transparent" />
        <div aria-hidden className="absolute left-[7%] top-[27%] h-40 w-40 rounded-full border border-emerald-100/15 shadow-[0_0_0_42px_rgba(85,229,158,.025),0_0_100px_rgba(85,229,158,.1)]" />
        <div className="relative z-10 mx-auto w-full max-w-[90rem] px-5 pb-10 pt-20 md:px-8 md:pb-12 lg:px-10">
          <div className="w-full max-w-4xl"><p className="inline-flex items-center gap-2 border-l-2 border-emerald-300 pl-3 text-[10px] font-black uppercase tracking-[.22em] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.95)]" /> Online Darts, richtig gespielt</p><h1 className="mt-7 max-w-4xl text-[4.1rem] font-black leading-[.82] tracking-[-.09em] text-white sm:text-[5.7rem] md:text-[7.4rem] lg:text-[8.35rem]"><span className="sm:whitespace-nowrap">Jedes Leg</span><br /><span className="text-emerald-300">zählt.</span></h1><p className="mt-7 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">Such dir einen Gegner. Spiel an deinem Board. Bestätigt das Ergebnis gemeinsam – dann geht es direkt in deine Elo.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><button onClick={() => router.push(primaryTarget)} className="group inline-flex items-center justify-center gap-3 bg-[#9af0bc] px-6 py-4 text-sm font-black uppercase tracking-[.13em] text-[#07100b] transition hover:bg-[#c4f9d7]">{primaryLabel}<ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button><Link href="/getting-started" className="inline-flex items-center justify-center gap-2 border border-white/25 bg-black/20 px-6 py-4 text-sm font-black text-white transition hover:border-white/50 hover:bg-white/10">So funktioniert&apos;s <ChevronRight className="h-4 w-4" /></Link></div><div className="mt-5 inline-flex max-w-xl flex-wrap items-center gap-x-3 gap-y-1 border-l border-emerald-300/45 pl-3 text-xs"><span className="inline-flex items-center gap-2 font-black text-emerald-100"><Radio className="h-3.5 w-3.5" /> Gerade in der Spielersuche</span><span className="text-zinc-400">{communityStats ? communityStats.queuePlayers === 1 ? '1 Spieler sucht gerade.' : String(communityStats.queuePlayers) + ' Spieler suchen gerade.' : 'Aktivität wird geladen …'}</span></div></div>
        </div>
        <div className="relative z-10 w-full border-t border-white/15 bg-[#080b0a]/80 backdrop-blur-md"><div className="mx-auto grid max-w-[90rem] grid-cols-2 divide-x divide-y divide-white/10 md:grid-cols-4 md:divide-y-0">{headlineStats.map(([value, label]) => <div key={label} className="px-5 py-4 md:px-8 md:py-5 lg:px-10"><span className="block text-2xl font-black tracking-[-.06em] text-white md:text-3xl">{value}</span><span className="mt-1 block text-[9px] font-black uppercase tracking-[.15em] text-zinc-500">{label}</span></div>)}</div></div>
      </section>

      <section className="relative border-b border-white/10 bg-[#0b0f0d]"><div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-4 text-[10px] font-black uppercase tracking-[.18em] text-zinc-500 md:justify-between md:px-8 lg:px-10"><span className="inline-flex items-center gap-2 text-emerald-200"><CircleDot className="h-3.5 w-3.5" /> Matchmaking auf deinem Elo-Level</span><span>Ergebnisse erst nach Bestätigung</span><span>Scolia · DartCounter · AutoDarts</span><span className="text-zinc-300">Premium ab 4,99 € / Monat</span></div></section>

      <section className="mx-auto grid max-w-[90rem] gap-12 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:px-10">
        <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-300">Nicht irgendeine Runde</p><h2 className="mt-5 max-w-xl text-4xl font-black leading-[.92] tracking-[-.07em] text-white md:text-6xl">Gegner finden.<br />Ergebnis festhalten.<br /><span className="text-zinc-500">Weiterkommen.</span></h2><p className="mt-6 max-w-md leading-7 text-zinc-400">RankedDarts bringt Ordnung in Online-Darts, ohne dein Spiel komplizierter zu machen. Du spielst wie immer – nur mit echten Gegnern, klaren Ergebnissen und einer Rangliste, die mitläuft.</p><div className="mt-8 space-y-4 border-t border-white/10 pt-6">{setupBenefits.map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center border border-emerald-300/25 bg-emerald-300/[.06] text-emerald-200"><Icon className="h-4 w-4" /></span><span><strong className="text-sm font-black text-white">{title}</strong><span className="mt-1 block text-sm leading-6 text-zinc-500">{text}</span></span></div>)}</div></div>
        <div className="relative"><div aria-hidden className="absolute -inset-5 -z-10 bg-[radial-gradient(circle_at_55%_30%,rgba(94,234,154,.13),transparent_58%)] blur-2xl" /><div className="mb-3 flex items-center justify-between border-y border-white/10 py-3 text-[10px] font-black uppercase tracking-[.16em] text-zinc-500"><span className="inline-flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-emerald-300" /> So sieht ein Ergebnis aus</span><span>Beispiel</span></div><ResultRoomPreview onOpen={() => router.push('/matchmaking')} /></div>
      </section>

      <section className="relative min-h-[48rem] overflow-hidden border-y border-white/10 bg-[#0a0d0c] py-16 md:min-h-[42rem] md:py-24"><div aria-hidden className="absolute inset-0 bg-[url('/rankeddarts-home-match-v1.png')] bg-cover bg-[29%_center] opacity-70" /><div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,11,10,.1)_0%,rgba(8,11,10,.26)_37%,#080b0a_72%)]" /><div className="relative mx-auto grid min-h-[32rem] max-w-[90rem] px-5 md:px-8 lg:grid-cols-[1fr_.9fr] lg:px-10"><div /><div className="self-center border-l-2 border-emerald-300 pl-6 md:pl-8"><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-300">Das gute daran</p><h2 className="mt-5 max-w-lg text-4xl font-black leading-[.92] tracking-[-.07em] text-white md:text-6xl">Zu Hause spielen.<br />Trotzdem mittendrin.</h2><p className="mt-6 max-w-md text-base leading-7 text-zinc-300">Ob Wohnzimmer, Keller oder eigenes Darts-Zimmer: Dein Match beginnt dort, wo dein Board hängt. Der Gegner spielt zur gleichen Zeit bei sich – und trotzdem seid ihr im selben Spiel.</p><Link href="/matchmaking" className="group mt-8 inline-flex items-center gap-2 text-sm font-black text-emerald-200 transition hover:text-white">Dein nächstes Match finden <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link></div></div></section>

      <section className="mx-auto max-w-[90rem] px-5 py-20 md:px-8 md:py-28 lg:px-10"><div className="flex flex-col gap-5 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-300">Dein Abend, dein Modus</p><h2 className="mt-5 text-4xl font-black leading-[.92] tracking-[-.07em] text-white md:text-6xl">Mach das, worauf du Lust hast.</h2></div><p className="max-w-sm text-sm leading-6 text-zinc-500">Ranked, Turnier oder einfach bei der Community reinschauen: Du entscheidest, wo du einsteigst.</p></div><div className="grid border-b border-white/10 lg:grid-cols-3">{waysIn.map(({ id, icon: Icon, number, eyebrow, title, text, href, action, accent }, index) => <Link key={id} href={href} className={'group relative min-h-80 overflow-hidden px-0 py-9 transition lg:px-8 ' + (index !== 0 ? 'border-t border-white/10 lg:border-l lg:border-t-0' : 'lg:pr-8')}><span className="absolute -right-1 -top-8 text-[9rem] font-black leading-none tracking-[-.14em] text-white/[.035] transition duration-500 group-hover:-translate-y-2 group-hover:text-white/[.07]">{number}</span><div className="relative flex items-start justify-between"><span className={'grid h-11 w-11 place-items-center border border-white/15 bg-white/[.03] ' + accent}><Icon className="h-5 w-5" /></span><span className="max-w-[9rem] text-right text-[9px] font-black uppercase leading-4 tracking-[.14em] text-zinc-600">{modeStatus(id)}</span></div><div className="relative mt-16"><p className={'text-[10px] font-black uppercase tracking-[.2em] ' + accent}>{eyebrow}</p><h3 className="mt-3 max-w-xs text-3xl font-black leading-none tracking-[-.055em] text-white">{title}</h3><p className="mt-4 max-w-sm text-sm leading-6 text-zinc-400">{text}</p><span className={'mt-7 inline-flex items-center gap-2 text-sm font-black ' + accent}>{action}<ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></div></Link>)}</div></section>

      <section className="border-y border-white/10 bg-[#0d1310]"><div className="mx-auto grid max-w-[90rem] gap-10 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[.75fr_1.25fr] lg:items-center lg:px-10"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-300">Die Rangliste läuft mit</p><h2 className="mt-5 text-4xl font-black leading-[.92] tracking-[-.07em] text-white md:text-5xl">Nicht nur spielen.<br />Auch besser werden.</h2></div><div className="grid gap-5 sm:grid-cols-3">{[['01', 'Jedes Match', 'Elo kommt erst nach bestätigtem Ergebnis.'], ['02', 'Jede Saison', 'Deine Platzierung bleibt nachvollziehbar.'], ['03', 'Jeder Schritt', 'Sieh, wohin dein nächster Sieg dich bringt.']].map(([number, title, text]) => <div key={number} className="border-l border-white/15 pl-5"><span className="text-sm font-black text-emerald-300">{number}</span><h3 className="mt-5 text-xl font-black tracking-[-.04em] text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p></div>)}</div></div></section>

      <section className="relative overflow-hidden px-5 py-24 text-center md:px-8 md:py-32"><div aria-hidden className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/10 shadow-[0_0_0_75px_rgba(88,226,151,.025),0_0_140px_rgba(88,226,151,.1)]" /><div className="relative mx-auto max-w-3xl"><Swords className="mx-auto h-7 w-7 text-emerald-300" /><p className="mt-6 text-[10px] font-black uppercase tracking-[.22em] text-emerald-300">Dein nächstes Leg</p><h2 className="mt-5 text-5xl font-black leading-[.88] tracking-[-.075em] text-white md:text-7xl">Bist du bereit,<br /><span className="text-emerald-300">es zählen zu lassen?</span></h2><p className="mx-auto mt-6 max-w-xl leading-7 text-zinc-400">Profil erstellen, Gegner finden und losspielen. Der Rest passiert auf dem Board.</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={() => router.push(primaryTarget)} className="group inline-flex items-center justify-center gap-3 bg-[#9af0bc] px-7 py-4 text-sm font-black uppercase tracking-[.13em] text-[#07100b] transition hover:bg-[#c4f9d7]">{primaryLabel}<ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 border border-white/20 px-7 py-4 text-sm font-bold text-zinc-100 transition hover:border-indigo-200 hover:bg-indigo-300/10"><MessageCircle className="h-4 w-4 text-indigo-200" /> Community beitreten</a></div></div></section>

      <footer className="border-t border-white/10 px-5 py-8 text-xs text-zinc-500 md:px-8 lg:px-10"><div className="mx-auto flex max-w-[90rem] flex-col gap-5 md:flex-row md:items-center md:justify-between"><span className="font-bold text-zinc-300">RANKEDDARTS · COMPETITIVE DARTS</span><div className="flex flex-wrap gap-x-5 gap-y-2"><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="font-bold text-indigo-200 hover:text-white">Discord-Community</a><Link href="/impressum" className="hover:text-white">Impressum</Link><Link href="/datenschutz" className="hover:text-white">Datenschutz</Link><Link href="/agb" className="hover:text-white">AGB</Link><Link href="/fairplay" className="hover:text-white">Fair Play</Link><Link href="/turnierregeln" className="hover:text-white">Turnierregeln</Link></div></div></footer>
      <div className="fixed inset-x-3 bottom-3 z-40 md:hidden"><button onClick={() => router.push(primaryTarget)} className="flex w-full items-center justify-between bg-[#9af0bc] px-4 py-3.5 text-sm font-black uppercase tracking-[.12em] text-[#07100b] shadow-[0_12px_32px_rgba(0,0,0,.5)]"><span>{primaryLabel}</span><ArrowUpRight className="h-4 w-4" /></button></div>
    </main>
  );
}
