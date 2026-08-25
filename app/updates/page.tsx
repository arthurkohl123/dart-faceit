'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowUpRight, BellRing, CheckCircle2, Rocket, Sparkles, Wrench } from 'lucide-react';

type UpdateCategory = 'Feature' | 'System' | 'Experience' | 'Announcement';

const updates: Array<{
  date: string;
  title: string;
  category: UpdateCategory;
  content: string;
  highlight: boolean;
  label: string;
}> = [
  {
    date: '26. August 2026',
    title: 'Ranked Arena: Matchmaking neu gedacht',
    category: 'Experience',
    content: 'Matchmaking ist jetzt als fokussierte Ranked Arena aufgebaut: Live-Queue, Plattformwahl, Queue-Control und eine deutlich klarere Match-Suche. Scolia und DartCounter bleiben selbstverständlich getrennt.',
    highlight: true,
    label: 'LIVE NOW',
  },
  {
    date: '26. August 2026',
    title: 'Dein Career Archive ist da',
    category: 'Experience',
    content: 'Die Match History wurde zum persönlichen Karriere-Archiv erweitert. Season Snapshot, Form, Elo-Bilanz, detaillierte Matchkarten und schnelle Filter machen Fortschritt endlich sichtbar.',
    highlight: true,
    label: 'IMPROVED',
  },
  {
    date: '25. August 2026',
    title: 'Premium & tägliches Match-Limit',
    category: 'System',
    content: 'Free-Spieler können bis zu vier Ranked Matches pro Tag starten. Das Kontingent wird um 00:00 Uhr zurückgesetzt; Premium-Mitglieder spielen unbegrenzt. Das Limit wird zuverlässig serverseitig geprüft.',
    highlight: false,
    label: 'SYSTEM',
  },
  {
    date: '10. Juni 2026',
    title: 'Neue Statistiken & Match-Informationen',
    category: 'Feature',
    content: 'Spielerstatistiken wurden erweitert: Average im Leaderboard, Gegner-Average im Match, 180er, Best-Average und mehr Kontext in der Match-History.',
    highlight: false,
    label: 'FEATURE',
  },
  {
    date: '05. Juni 2026',
    title: 'Launch von RankedDarts Beta',
    category: 'Announcement',
    content: 'Der offizielle Beta-Start von RankedDarts. Willkommen in der Community – von Spielern für Spieler.',
    highlight: false,
    label: 'BETA',
  },
];

const categoryStyles: Record<UpdateCategory, string> = {
  Feature: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
  System: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
  Experience: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  Announcement: 'border-violet-300/25 bg-violet-400/10 text-violet-100',
};

export default function Updates() {
  const router = useRouter();
  const [filter, setFilter] = useState<'All' | UpdateCategory>('All');
  const highlightedUpdates = updates.filter((update) => update.highlight).length;
  const latestUpdate = updates[0];
  const timelineUpdates = useMemo(
    () => updates.slice(1).filter((update) => filter === 'All' || update.category === filter),
    [filter],
  );

  return (
    <main className="relative min-h-screen isolate overflow-hidden bg-[#030506] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_82%_50%_at_50%_-10%,rgba(52,211,153,.22),transparent_70%),radial-gradient(circle_at_4%_38%,rgba(6,182,212,.15),transparent_25%),radial-gradient(circle_at_94%_26%,rgba(168,85,247,.11),transparent_25%),linear-gradient(180deg,#07100d_0%,#030506_56%,#030506_100%)]" />
        <div className="absolute left-1/2 top-[-31rem] h-[67rem] w-[67rem] -translate-x-1/2 rounded-full border border-emerald-300/[0.07] shadow-[0_0_0_8rem_rgba(110,231,183,.012),0_0_160px_rgba(16,185,129,.10)]" />
        <div className="absolute inset-0 opacity-[0.075] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_86%)]" />
      </div>

      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Updates</div>
            </div>
          </Link>

          <button onClick={() => router.push('/profile')} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10">
            <BellRing className="h-4 w-4 text-emerald-300" /> Zurück zum Profil
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-14 md:px-8">
        <div className="mb-10 grid gap-5 lg:grid-cols-[1fr_0.72fr] lg:items-stretch">
          <div>
            <div className="relative h-full overflow-hidden rounded-[2.25rem] border border-white/[0.10] bg-black/20 p-6 backdrop-blur-xl sm:p-8">
              <div className="absolute -right-14 -top-14 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />
              <div className="relative inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100">
                <Sparkles className="h-3.5 w-3.5" /> Product feed
              </div>
              <div className="relative mt-7 flex items-end gap-4"><div className="font-mono text-[10px] font-bold tracking-[0.28em] text-emerald-300/70">RANKEDDARTS // RELEASE NOTES</div><div className="mb-1 h-px flex-1 bg-gradient-to-r from-emerald-300/45 to-transparent" /></div>
              <h1 className="relative mt-3 text-5xl font-black leading-[0.84] tracking-[-0.075em] md:text-7xl">Was ist<br /><span className="bg-gradient-to-r from-emerald-200 via-lime-200 to-cyan-200 bg-clip-text text-transparent">neu?</span></h1>
              <p className="relative mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">Neue Features, sichtbare Verbesserungen und wichtige System-Updates aus der RankedDarts Arena.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[2rem] border border-white/10 bg-black/25 p-6 backdrop-blur-xl">
              <Rocket className="h-5 w-5 text-cyan-200" />
              <div className="mt-5 text-5xl font-black tracking-[-0.07em]">{updates.length}</div>
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Releases</div>
              <div className="mt-1 text-xs text-zinc-500">im Product Feed</div>
            </div>
            <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-400/[0.08] p-6 backdrop-blur-xl">
              <CheckCircle2 className="h-5 w-5 text-emerald-200" />
              <div className="mt-5 text-5xl font-black tracking-[-0.07em]">{highlightedUpdates}</div>
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Highlights</div>
              <div className="mt-1 text-xs text-zinc-500">direkt im Fokus</div>
            </div>
          </div>
        </div>

        <article className="group relative mb-12 overflow-hidden rounded-[2.5rem] border border-emerald-300/25 bg-gradient-to-br from-emerald-400/[0.12] via-[#07100e]/90 to-cyan-400/[0.06] p-6 shadow-[0_30px_80px_rgba(0,0,0,.32)] backdrop-blur-xl sm:p-8 md:p-10">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border border-emerald-200/15 bg-emerald-300/[0.04]" />
          <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-emerald-200/70 to-transparent" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_.48fr] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3"><span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Latest release</span><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${categoryStyles[latestUpdate.category]}`}>{latestUpdate.category}</span></div>
              <h2 className="mt-6 max-w-3xl text-4xl font-black leading-[0.94] tracking-[-0.06em] sm:text-5xl">{latestUpdate.title}</h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300">{latestUpdate.content}</p>
            </div>
            <div className="rounded-[1.8rem] border border-white/[0.10] bg-black/20 p-5 backdrop-blur-xl"><div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Release status</div><div className="mt-3 flex items-center gap-2 text-lg font-black text-emerald-100"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.9)]" />{latestUpdate.label}</div><div className="mt-5 border-t border-white/[0.08] pt-4 text-sm font-bold text-zinc-400">{latestUpdate.date}</div><Link href="/matchmaking" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-200 transition hover:text-white">Zur Ranked Arena <ArrowUpRight className="h-4 w-4" /></Link></div>
          </div>
        </article>

        <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Release timeline</div><h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Alle Änderungen</h2></div><div className="flex flex-wrap gap-2">{(['All', 'Experience', 'Feature', 'System', 'Announcement'] as const).map((category) => <button key={category} onClick={() => setFilter(category)} className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${filter === category ? 'border-emerald-300/35 bg-emerald-400/12 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-white'}`}>{category === 'All' ? 'Alle' : category}</button>)}</div></div>

        <div className="relative">
          <div className="absolute bottom-8 left-6 top-8 hidden w-px bg-gradient-to-b from-emerald-300/60 via-white/10 to-transparent md:block" />
          <div className="space-y-5">
            {timelineUpdates.map((update, index) => (
              <article
                key={`${update.date}-${update.title}`}
                className={`group relative overflow-hidden rounded-[2rem] border bg-black/35 p-6 shadow-xl shadow-black/25 backdrop-blur-xl transition hover:-translate-y-1 md:ml-14 md:p-8 ${update.highlight ? 'border-emerald-300/30' : 'border-white/10 hover:border-emerald-300/25'}`}
              >
                <div className="absolute -left-[4.45rem] top-8 hidden h-8 w-8 rounded-full border border-emerald-300/35 bg-[#050607] p-1 md:block">
                  <div className="h-full w-full rounded-full bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.7)]" />
                </div>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />

                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${categoryStyles[update.category]}`}>{update.category}</span>
                      {update.highlight && (
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Highlight</span>
                      )}
                    </div>
                    <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">{update.title}</h2>
                  </div>
                  <div className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-zinc-400">{update.date}</div>
                </div>

                <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-300">{update.content}</p>

                <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5 text-sm text-zinc-500">
                  <span className="font-mono text-[10px] font-bold tracking-[0.16em]">RELEASE // {update.label}</span>
                  <span className="font-bold text-emerald-300">RankedDarts</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
