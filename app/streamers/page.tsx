'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ExternalLink, Menu, Radio, X } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { RankBadge } from '@/components/RankBadge';
import { StreamerBadge } from '@/components/StreamerBadge';
import { createClient } from '@/lib/supabase';
import { getRankForElo } from '@/lib/ranks';

type Streamer = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  twitch_url: string | null;
  kick_url: string | null;
};

export default function StreamersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadStreamers() {
      const { data, error } = await supabase
        .from('public_visible_profiles')
        .select('username, elo, gamesPlayed, wins, twitch_url, kick_url')
        .eq('is_streamer', true)
        .order('elo', { ascending: false });

      if (!mounted) return;
      if (error) {
        console.error('Streamer konnten nicht geladen werden:', error);
        setStreamers([]);
      } else {
        setStreamers((data || []) as Streamer[]);
      }
      setLoading(false);
    }

    void loadStreamers();
    return () => { mounted = false; };
  }, [supabase]);

  return (
    <main className="arena-page min-h-screen text-[#f5f3ee]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 sport-grid opacity-30" />
      <nav className="arena-nav border-b border-white/10 bg-[#0a0d0d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3"><BrandLogo className="h-10 w-10 rounded-lg" /><span><span className="block text-lg font-black tracking-[-.05em]">RANKEDDARTS</span><span className="block text-[9px] font-bold uppercase tracking-[.25em] text-rose-200">Streamer</span></span></Link>
          <div className="hidden items-center gap-5 text-[13px] font-semibold text-zinc-300 lg:flex"><Link href="/matchmaking" className="hover:text-white">Matchmaking</Link><Link href="/leaderboard" className="hover:text-white">Rangliste</Link><Link href="/tournaments" className="hover:text-white">Turniere</Link><Link href="/streamers" className="text-rose-100">Streamer</Link><Link href="/premium" className="border border-emerald-300/35 px-3 py-1.5 text-emerald-200 hover:bg-emerald-300/10">Premium</Link></div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center border border-white/15 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-5 py-3 lg:hidden"><div className="grid gap-1 text-sm font-bold text-zinc-300">{[['Matchmaking', '/matchmaking'], ['Rangliste', '/leaderboard'], ['Turniere', '/tournaments'], ['Streamer', '/streamers'], ['Premium', '/premium']].map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 hover:text-rose-100">{label}</Link>)}</div></div>}
      </nav>

      <section className="arena-content mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <header className="arena-hero relative overflow-hidden border border-rose-300/20 bg-[#0d1110] px-6 py-10 sm:px-10 sm:py-12">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-rose-400/10 blur-3xl" />
          <div className="relative max-w-3xl"><div className="inline-flex items-center gap-2 border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-rose-100"><Radio className="h-3.5 w-3.5" /> Offizielle Creator</div><h1 className="mt-5 text-5xl font-black leading-[.9] tracking-[-.075em] sm:text-7xl">RankedDarts<br /><span className="text-rose-200">Streamer.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-400">Hier findest du alle offiziellen RankedDarts-Streamer und direkt ihre Kanäle. Die Streamer-Rolle wird vom Team vergeben.</p></div>
        </header>

        {loading ? <div className="mt-8 border border-white/10 bg-[#0d1110] px-6 py-16 text-center text-sm font-bold text-zinc-400">Streamer werden geladen …</div> : streamers.length === 0 ? <div className="mt-8 border border-dashed border-white/15 bg-[#0d1110] px-6 py-16 text-center"><Radio className="mx-auto h-8 w-8 text-zinc-600" /><h2 className="mt-4 text-xl font-black">Noch keine Streamer eingetragen</h2><p className="mt-2 text-sm text-zinc-500">Sobald ein offizieller Streamer freigeschaltet ist, erscheint er hier.</p></div> : <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{streamers.map((streamer) => {
          const rank = getRankForElo(Number(streamer.elo || 1000));
          const winrate = streamer.gamesPlayed > 0 ? Math.round((streamer.wins / streamer.gamesPlayed) * 100) : 0;
          return <article key={streamer.username} className="group relative overflow-hidden border border-white/10 bg-[#0d1110] p-6 transition hover:-translate-y-1 hover:border-rose-300/35 hover:bg-[#101112]"><div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-rose-400/[.06] blur-3xl transition group-hover:bg-rose-400/[.13]" /><div className="relative flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center border border-rose-300/25 bg-rose-400/10"><RankBadge level={rank.level} size="sm" /></div><div className="min-w-0"><Link href={`/players/${encodeURIComponent(streamer.username)}`} className="block truncate text-xl font-black tracking-[-.04em] text-white hover:text-rose-100">{streamer.username}</Link><div className="mt-1 flex flex-wrap items-center gap-2"><StreamerBadge compact /><span className={'text-xs font-black ' + rank.color}>Level {rank.level}</span></div></div></div><div className="text-right"><div className="text-xl font-black text-emerald-300">{streamer.elo}</div><div className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-500">Elo</div></div></div><div className="relative mt-6 grid grid-cols-3 border-y border-white/10 py-4 text-center"><div><div className="text-lg font-black">{streamer.gamesPlayed}</div><div className="mt-1 text-[9px] font-black uppercase tracking-[.13em] text-zinc-500">Spiele</div></div><div className="border-x border-white/10"><div className="text-lg font-black text-emerald-200">{streamer.wins}</div><div className="mt-1 text-[9px] font-black uppercase tracking-[.13em] text-zinc-500">Siege</div></div><div><div className="text-lg font-black text-cyan-200">{winrate}%</div><div className="mt-1 text-[9px] font-black uppercase tracking-[.13em] text-zinc-500">Winrate</div></div></div><div className="relative mt-5 flex flex-wrap gap-2">{streamer.twitch_url && <a href={streamer.twitch_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-violet-300/30 bg-violet-400/10 px-3 py-2 text-xs font-black text-violet-100 transition hover:border-violet-200 hover:bg-violet-400/20">Twitch <ExternalLink className="h-3.5 w-3.5" /></a>}{streamer.kick_url && <a href={streamer.kick_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-400/20">Kick <ExternalLink className="h-3.5 w-3.5" /></a>}<Link href={`/players/${encodeURIComponent(streamer.username)}`} className="ml-auto inline-flex items-center gap-1 text-xs font-black text-zinc-400 hover:text-white">Profil <ArrowUpRight className="h-3.5 w-3.5" /></Link></div></article>;
        })}</div>}

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-zinc-600">RankedDarts · Offizielle Streamer</div>
      </section>
    </main>
  );
}
