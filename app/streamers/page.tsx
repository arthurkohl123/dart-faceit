'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ExternalLink, Menu, Play, Radio, Users, X } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { RankBadge } from '@/components/RankBadge';
import { StreamerBadge } from '@/components/StreamerBadge';
import { getRankForElo } from '@/lib/ranks';
import { getTwitchEmbedUrl } from '@/lib/twitch';

type StreamStatus = 'live' | 'offline' | 'unavailable';

type Streamer = {
  username: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  twitch_url: string | null;
  twitch_channel: string | null;
  stream_status: StreamStatus;
};

type StreamerResponse = {
  streamers: Streamer[];
  twitchStatusConfigured: boolean;
};

function getStatusLabel(streamer: Streamer) {
  if (streamer.stream_status === 'live') return 'LIVE';
  if (streamer.stream_status === 'offline') return 'OFFLINE';
  return 'TWITCH FEHLT';
}

function StatusPill({ streamer }: { streamer: Streamer }) {
  const label = getStatusLabel(streamer);
  const styles = streamer.stream_status === 'live'
    ? 'border-rose-300/45 bg-rose-400/15 text-rose-100'
    : streamer.stream_status === 'offline'
      ? 'border-white/10 bg-white/[0.04] text-zinc-500'
      : 'border-amber-300/20 bg-amber-300/10 text-amber-100';

  return <span className={'inline-flex items-center gap-1.5 border px-2.5 py-1 text-[9px] font-black tracking-[.14em] ' + styles}><span className={'h-1.5 w-1.5 rounded-full ' + (streamer.stream_status === 'live' ? 'bg-rose-300 animate-pulse' : streamer.stream_status === 'offline' ? 'bg-zinc-600' : 'bg-amber-300')} />{label}</span>;
}

export default function StreamersPage() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStreamers() {
      try {
        const minute = Math.floor(Date.now() / 60_000);
        const response = await fetch(`/api/streamers?minute=${minute}`);
        const payload = await response.json() as StreamerResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Streamer-Status ist gerade nicht verfügbar.');
        if (mounted) {
          setStreamers(payload.streamers || []);
          setError(null);
        }
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Streamer-Status ist gerade nicht verfügbar.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadStreamers();
    const refresh = window.setInterval(() => { void loadStreamers(); }, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(refresh);
    };
  }, []);

  const orderedStreamers = useMemo(() => [...streamers].sort((a, b) => {
    if (a.stream_status === 'live' && b.stream_status !== 'live') return -1;
    if (a.stream_status !== 'live' && b.stream_status === 'live') return 1;
    return Number(b.elo || 0) - Number(a.elo || 0);
  }), [streamers]);
  const liveCount = orderedStreamers.filter((streamer) => streamer.stream_status === 'live').length;
  const activeUsername = selectedUsername && orderedStreamers.some((streamer) => streamer.username === selectedUsername)
    ? selectedUsername
    : orderedStreamers.find((streamer) => streamer.stream_status === 'live')?.username ?? orderedStreamers[0]?.username ?? null;
  const selectedStreamer = orderedStreamers.find((streamer) => streamer.username === activeUsername) || null;

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
          <div className="relative max-w-3xl"><div className="inline-flex items-center gap-2 border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-rose-100"><Radio className="h-3.5 w-3.5" /> Offizielle Creator</div><h1 className="mt-5 text-5xl font-black leading-[.9] tracking-[-.075em] sm:text-7xl">RankedDarts<br /><span className="text-rose-200">Streamer.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-400">Alle offiziellen Streamer an einem Ort. Wähle einen Creator aus – nur der ausgewählte Live-Stream wird geladen.</p><div className="mt-7 flex flex-wrap gap-3"><span className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-zinc-200"><Users className="h-3.5 w-3.5 text-rose-200" />{orderedStreamers.length} Creator</span><span className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-zinc-200"><Radio className="h-3.5 w-3.5 text-rose-200" />{liveCount} live</span></div></div>
        </header>

        {loading ? <div className="mt-8 border border-white/10 bg-[#0d1110] px-6 py-16 text-center text-sm font-bold text-zinc-400">Streamer werden geladen …</div> : error ? <div className="mt-8 border border-red-300/20 bg-red-400/[.06] px-6 py-10 text-center text-sm font-bold text-red-100">{error}</div> : orderedStreamers.length === 0 ? <div className="mt-8 border border-dashed border-white/15 bg-[#0d1110] px-6 py-16 text-center"><Radio className="mx-auto h-8 w-8 text-zinc-600" /><h2 className="mt-4 text-xl font-black">Noch keine Streamer eingetragen</h2><p className="mt-2 text-sm text-zinc-500">Sobald ein offizieller Streamer freigeschaltet ist, erscheint er hier.</p></div> : <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(18rem,0.76fr)_minmax(0,1.7fr)]">
          <aside className="border border-white/10 bg-[#0d1110] p-3" aria-label="Streamer auswählen">
            <div className="flex items-center justify-between border-b border-white/10 px-3 pb-3"><span className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Alle Streamer</span><span className="text-xs font-black text-rose-100">{liveCount} live</span></div>
            <div className="mt-2 grid gap-2">{orderedStreamers.map((streamer) => {
              const rank = getRankForElo(Number(streamer.elo || 1000));
              const selected = streamer.username === selectedUsername;
              return <button key={streamer.username} type="button" onClick={() => setSelectedUsername(streamer.username)} aria-pressed={selected} className={'w-full border p-3 text-left transition ' + (selected ? 'border-rose-300/45 bg-rose-400/10' : 'border-white/8 bg-black/15 hover:border-white/20 hover:bg-white/[.035]')}><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center border border-rose-300/20 bg-rose-400/[.08]"><RankBadge level={rank.level} size="sm" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate font-black text-white">{streamer.username}</span><StatusPill streamer={streamer} /></div><div className="mt-1 flex items-center gap-2"><StreamerBadge compact /><span className={'text-[10px] font-black ' + rank.color}>{streamer.elo} Elo</span></div></div></div></button>;
            })}</div>
            <p className="px-3 pb-1 pt-4 text-[11px] leading-5 text-zinc-600">Der Twitch-Status aktualisiert sich automatisch etwa jede Minute.</p>
          </aside>

          <div className="min-w-0 border border-white/10 bg-[#0d1110] p-5 sm:p-6">
            {selectedStreamer && <><div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-3xl font-black tracking-[-.05em]">{selectedStreamer.username}</h2><StatusPill streamer={selectedStreamer} /></div><div className="mt-2 flex flex-wrap items-center gap-2"><StreamerBadge compact /><span className="text-xs font-bold text-zinc-500">{selectedStreamer.elo} Elo · {selectedStreamer.gamesPlayed} Spiele</span></div></div><Link href={`/players/${encodeURIComponent(selectedStreamer.username)}`} className="inline-flex items-center gap-1 text-xs font-black text-zinc-400 transition hover:text-white">Profil öffnen <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
              {selectedStreamer.stream_status === 'live' && selectedStreamer.twitch_channel ? <div className="mt-5"><div className="aspect-video overflow-hidden border border-rose-300/30 bg-black"><iframe title={`Twitch-Stream von ${selectedStreamer.username}`} src={getTwitchEmbedUrl(selectedStreamer.twitch_channel, ['rankeddarts.de', 'www.rankeddarts.de'])} className="h-full w-full" allowFullScreen allow="autoplay; fullscreen; picture-in-picture" /></div><p className="mt-3 text-xs text-zinc-500">Live auf Twitch · Ton startet erst nach deiner Eingabe.</p></div> : <div className="mt-5 grid min-h-72 place-items-center border border-dashed border-white/15 bg-black/20 p-8 text-center"><div><Play className="mx-auto h-9 w-9 text-zinc-600" /><h3 className="mt-4 text-xl font-black">{selectedStreamer.stream_status === 'offline' ? 'Gerade offline' : 'Kein Twitch-Kanal hinterlegt'}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500">{selectedStreamer.stream_status === 'offline' ? 'Sobald dieser Streamer live geht, wird der Stream hier eingeblendet.' : 'Der Streamer kann seinen Twitch-Kanal in seinem Profil hinterlegen.'}</p></div></div>}
              <div className="mt-5 flex flex-wrap gap-2">{selectedStreamer.twitch_url && <a href={selectedStreamer.twitch_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-violet-300/30 bg-violet-400/10 px-3 py-2 text-xs font-black text-violet-100 transition hover:border-violet-200 hover:bg-violet-400/20">Twitch öffnen <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
            </>}
          </div>
        </div>}

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-zinc-600">RankedDarts · Offizielle Streamer</div>
      </section>
    </main>
  );
}
