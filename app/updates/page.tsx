'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

const updates = [
  {
    date: '21. Mai 2026',
    title: 'Premium Abonnement ist live!',
    category: 'Feature',
    content: 'Ab sofort kannst du RankedDarts Premium für 4,99 €/Monat abschließen. Vorteile: Keine Wartezeit, exklusive Ränge, detaillierte Stats und werbefreies Erlebnis.',
    highlight: true,
  },
  {
    date: '19. Mai 2026',
    title: 'Neues Design für Leaderboard',
    category: 'Design',
    content: 'Die Rangliste wurde komplett überarbeitet mit besserer Optik, Hover-Effekten und Premium-Hervorhebungen.',
  },
  {
    date: '18. Mai 2026',
    title: 'Matchmaking verbessert',
    category: 'Matchmaking',
    content: 'Die Wartezeit wurde reduziert und das System sucht jetzt noch genauer nach Gegnern mit ähnlichem Skill-Level.',
  },
  {
    date: '15. Mai 2026',
    title: 'Launch von RankedDarts',
    category: 'Announcement',
    content: 'Offizieller Start der Plattform. Willkommen in der Dart-Community!',
    highlight: true,
  },
];

export default function Updates() {
  const router = useRouter();
  const highlightedUpdates = updates.filter((update) => update.highlight).length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(6,182,212,0.14),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
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

          <button
            onClick={() => router.push('/profile')}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10"
          >
            Zurück zum Profil
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-14 md:px-8">
        <div className="mb-12 grid gap-8 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
              Changelog
            </div>
            <h1 className="mt-6 text-6xl font-black leading-[0.9] tracking-[-0.07em] md:text-8xl">Updates</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">Alle wichtigen Änderungen an RankedDarts: neue Features, Matchmaking-Verbesserungen, Design-Updates und Plattform-Ankündigungen.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl">
              <div className="text-5xl font-black tracking-[-0.06em]">{updates.length}</div>
              <div className="mt-2 text-sm font-bold text-emerald-300">Einträge</div>
              <div className="mt-1 text-sm text-zinc-500">im Changelog</div>
            </div>
            <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-400/[0.07] p-6 backdrop-blur-xl">
              <div className="text-5xl font-black tracking-[-0.06em]">{highlightedUpdates}</div>
              <div className="mt-2 text-sm font-bold text-emerald-300">Highlights</div>
              <div className="mt-1 text-sm text-zinc-500">besonders wichtig</div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute bottom-8 left-6 top-8 hidden w-px bg-gradient-to-b from-emerald-300/60 via-white/10 to-transparent md:block" />
          <div className="space-y-5">
            {updates.map((update, index) => (
              <article
                key={`${update.date}-${update.title}`}
                className={`group relative overflow-hidden rounded-[2rem] border bg-zinc-950/85 p-6 shadow-xl shadow-black/25 backdrop-blur-xl transition hover:-translate-y-1 md:ml-14 md:p-8 ${update.highlight ? 'border-emerald-300/30' : 'border-white/10 hover:border-emerald-300/25'}`}
              >
                <div className="absolute -left-[4.45rem] top-8 hidden h-8 w-8 rounded-full border border-emerald-300/35 bg-[#050607] p-1 md:block">
                  <div className="h-full w-full rounded-full bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.7)]" />
                </div>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />

                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-emerald-200">{update.category}</span>
                      {update.highlight && (
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Highlight</span>
                      )}
                    </div>
                    <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">{update.title}</h2>
                  </div>
                  <div className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-zinc-400">{update.date}</div>
                </div>

                <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-300">{update.content}</p>

                <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5 text-sm text-zinc-500">
                  <span>Update #{updates.length - index}</span>
                  <span className="font-bold text-emerald-300">RankedDarts</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-xl">
          <div className="text-sm font-black uppercase tracking-[0.3em] text-emerald-300">Roadmap</div>
          <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-zinc-300">Weitere Updates folgen regelmäßig. Als nächstes können Design, Profilstatistiken, Match-History und Admin-Flows Schritt für Schritt im gleichen Stil erweitert werden.</p>
        </div>
      </section>
    </main>
  );
}
