'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const stats = [
  { value: '0', label: 'Aktive Spieler', detail: 'Online & bereit für Matches' },
  { value: '0', label: 'Matches gespielt', detail: 'Ranked Legs in der Community' },
  { value: '0', label: 'Preisgelder', detail: 'Monatlich für Top-Platzierungen' },
  { value: '4.9', label: 'Bewertung', detail: 'Von ambitionierten Dartspielern' },
];

const features = [
  {
    eyebrow: 'Ranked System',
    title: 'Elo, das sich verdient anfühlt.',
    text: 'Jedes bestätigte Match beeinflusst dein Rating nachvollziehbar. Gewinne gegen starke Gegner bringen dich schneller nach oben.',
  },
  {
    eyebrow: 'Live Queue',
    title: 'Gegner auf deinem Niveau.',
    text: 'Das Matchmaking verbindet Spieler mit ähnlicher Stärke und vermeidet sinnlose Mismatches, bevor das erste Leg beginnt.',
  },
  {
    eyebrow: 'Proof & Review',
    title: 'Fairness vor Elo.',
    text: 'Ergebnisse werden bestätigt. Bei Widerspruch kann ein Admin den Fall prüfen, korrigieren oder ohne Elo annullieren.',
  },
];

const ranks = [
  { name: 'Bronze', range: '800 - 999', tone: 'from-orange-500/20 to-zinc-950' },
  { name: 'Silver', range: '1000 - 1199', tone: 'from-slate-300/20 to-zinc-950' },
  { name: 'Elite', range: '1200 - 1499', tone: 'from-emerald-400/20 to-zinc-950' },
  { name: 'Legend', range: '1500+', tone: 'from-cyan-400/20 to-zinc-950' },
];

export default function Home() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.16),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_78%)]" />
        <div className="absolute left-1/2 top-0 h-[760px] w-[760px] -translate-x-1/2 rounded-full border border-emerald-400/10 bg-emerald-400/[0.03] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <button onClick={() => router.push('/')} className="group flex items-center gap-3" aria-label="Zur Startseite">
            <div className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">
              <span>R</span>
              <div className="absolute inset-x-0 bottom-0 h-px bg-white/70" />
            </div>
            <div className="text-left">
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Competitive Darts</div>
            </div>
          </button>

          <div className="hidden items-center gap-8 text-sm font-medium text-zinc-300 lg:flex">
            <a href="/leaderboard" className="transition hover:text-white">Leaderboard</a>
            <a href="/matchmaking" className="transition hover:text-white">Matchmaking</a>
            <a href="/updates" className="transition hover:text-white">Updates</a>
            <a href="/premium" className="transition hover:text-white">Premium</a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/auth/login')}
              className="hidden rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10 sm:block"
            >
              Login
            </button>
            <button
              onClick={() => router.push('/auth/register')}
              className="hidden rounded-full bg-white px-5 py-2.5 text-sm font-black text-black shadow-[0_0_28px_rgba(255,255,255,0.16)] transition hover:scale-[1.03] hover:bg-emerald-200 sm:block md:px-6"
            >
              Kostenlos starten
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
            <div className="flex flex-col gap-1">
              <a href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Leaderboard</a>
              <a href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Matchmaking</a>
              <a href="/updates" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Updates</a>
              <a href="/premium" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Premium</a>
              <div className="mt-2 border-t border-white/10 pt-2 flex flex-col gap-1">
                <a href="/auth/login" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Login</a>
                <a href="/auth/register" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl bg-emerald-400/15 px-4 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/25">Kostenlos starten →</a>
              </div>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center gap-14 px-5 pb-20 pt-32 md:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:pt-28">
        <div>
          <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-[0_0_30px_rgba(34,197,94,0.12)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
            </span>
            Live Matchmaking für ambitionierte Dartspieler
          </div>

          <h1 className="max-w-5xl text-5xl font-black leading-[0.9] tracking-[-0.08em] text-white sm:text-6xl md:text-8xl xl:text-[9.5rem]">
            Darts wird jetzt ranked.
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-8 text-zinc-300 md:text-2xl md:leading-10">
            Finde faire Gegner, spiele bestätigte Matches und klettere mit einem transparenten Elo-System durch die RankedDarts-Leaderboards.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button
              onClick={() => router.push('/auth/register')}
              className="group rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-8 py-5 text-base font-black uppercase tracking-[0.18em] text-black shadow-[0_24px_80px_rgba(34,197,94,0.28)] transition hover:-translate-y-1 hover:shadow-[0_28px_90px_rgba(34,197,94,0.42)]"
            >
              Account erstellen
              <span className="ml-3 inline-block transition group-hover:translate-x-1">→</span>
            </button>
            <button
              onClick={() => router.push('/leaderboard')}
              className="rounded-3xl border border-white/15 bg-white/[0.04] px-8 py-5 text-base font-bold text-white backdrop-blur transition hover:-translate-y-1 hover:border-white/35 hover:bg-white/[0.08]"
            >
              Leaderboard ansehen
            </button>
          </div>

          <div className="mt-12 grid max-w-2xl grid-cols-3 gap-3 text-sm text-zinc-400">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-2xl font-black text-white">Elo</div>
              <div className="mt-1">Skillbasiertes Ranking</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-2xl font-black text-white">1v1</div>
              <div className="mt-1">Direkte Duelle</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-2xl font-black text-white">Fair</div>
              <div className="mt-1">Bestätigte Ergebnisse</div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div className="absolute -inset-8 rounded-[3rem] bg-emerald-400/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/80 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900 via-black to-zinc-950 p-6 md:p-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <div className="text-sm font-bold uppercase tracking-[0.24em] text-emerald-300">Live Match</div>
                  <div className="mt-1 text-2xl font-black tracking-tight">Best of 11 Legs</div>
                </div>
                <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">Queue 0:14</div>
              </div>

              <div className="mt-7 grid gap-4">
                <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.06] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-zinc-400">Spieler A</div>
                      <div className="mt-1 text-3xl font-black tracking-tight">CheckoutKing</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-zinc-400">Elo</div>
                      <div className="mt-1 text-3xl font-black text-emerald-300">1284</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 py-1">
                  <div className="h-px flex-1 bg-white/10" />
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-zinc-400">versus</div>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="rounded-3xl border border-cyan-400/25 bg-cyan-400/[0.05] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-zinc-400">Spieler B</div>
                      <div className="mt-1 text-3xl font-black tracking-tight">TripleTwenty</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-zinc-400">Elo</div>
                      <div className="mt-1 text-3xl font-black text-cyan-300">1271</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-7 rounded-3xl border border-white/10 bg-black/45 p-5">
                <div className="mb-4 flex items-center justify-between text-sm">
                  <span className="font-bold text-zinc-300">Matchqualität</span>
                  <span className="font-black text-emerald-300">98%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-zinc-400">
                  <div className="rounded-2xl bg-white/[0.04] p-3"><span className="block text-lg font-black text-white">13</span>Elo Abstand</div>
                  <div className="rounded-2xl bg-white/[0.04] p-3"><span className="block text-lg font-black text-white">EU</span>Region</div>
                  <div className="rounded-2xl bg-white/[0.04] p-3"><span className="block text-lg font-black text-white">Live</span>Bereit</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/10 bg-white/[0.025] py-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-5 md:grid-cols-4 md:px-8">
          {stats.map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/10 bg-black/25 p-5 text-center backdrop-blur">
              <div className="text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">{item.value}</div>
              <div className="mt-2 font-bold text-emerald-300">{item.label}</div>
              <div className="mt-1 text-sm text-zinc-500">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-24 md:px-8">
        <div className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.3em] text-emerald-300">Warum RankedDarts</div>
            <h2 className="mt-4 max-w-3xl text-5xl font-black tracking-[-0.06em] md:text-7xl">Gebaut für echte Competitive-Matches.</h2>
          </div>
          <p className="max-w-md text-lg leading-8 text-zinc-400">Die Startseite erklärt sofort, warum Spieler sich registrieren sollen: faire Gegner, saubere Ergebnisse und sichtbarer Fortschritt.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {features.map((feature, index) => (
            <article key={feature.title} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/80 p-7 transition hover:-translate-y-2 hover:border-emerald-300/35">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="mb-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl font-black text-emerald-300">0{index + 1}</div>
              <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300/80">{feature.eyebrow}</div>
              <h3 className="mt-4 text-3xl font-black tracking-[-0.04em]">{feature.title}</h3>
              <p className="mt-5 leading-7 text-zinc-400">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-6 md:p-10">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.3em] text-cyan-300">Rank Progression</div>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] md:text-6xl">Jeder Sieg verändert deinen Status.</h2>
              <p className="mt-6 text-lg leading-8 text-zinc-400">Spieler sehen nicht nur Zahlen, sondern ein klares Ziel: bessere Gegner schlagen, Rating verbessern und sichtbar im Ranking aufsteigen.</p>
              <button
                onClick={() => router.push('/matchmaking')}
                className="mt-8 rounded-3xl border border-emerald-300/30 bg-emerald-400/10 px-7 py-4 font-black text-emerald-100 transition hover:bg-emerald-400/20"
              >
                Matchmaking öffnen
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {ranks.map((rank) => (
                <div key={rank.name} className={`rounded-3xl border border-white/10 bg-gradient-to-br ${rank.tone} p-6`}>
                  <div className="text-sm font-bold uppercase tracking-[0.24em] text-zinc-400">Division</div>
                  <div className="mt-4 text-4xl font-black tracking-[-0.06em]">{rank.name}</div>
                  <div className="mt-2 text-zinc-400">{rank.range} Elo</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-emerald-300/20 bg-emerald-400/[0.08] p-8 text-center md:p-14">
          <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="relative">
            <div className="text-sm font-black uppercase tracking-[0.35em] text-emerald-200">Bereit für dein erstes Ranked Match?</div>
            <h2 className="mx-auto mt-5 max-w-4xl text-5xl font-black tracking-[-0.06em] md:text-7xl">Erstelle deinen Account und starte in die Queue.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-300">RankedDarts ist darauf ausgelegt, aus einzelnen Dart-Abenden eine echte Competitive-Season zu machen.</p>
            <div className="mt-9 flex flex-col justify-center gap-4 sm:flex-row">
              <button
                onClick={() => router.push('/auth/register')}
                className="rounded-3xl bg-white px-9 py-5 font-black uppercase tracking-[0.16em] text-black transition hover:scale-[1.03] hover:bg-emerald-100"
              >
                Kostenlos registrieren
              </button>
              <button
                onClick={() => router.push('/auth/login')}
                className="rounded-3xl border border-white/15 px-9 py-5 font-bold text-white transition hover:border-white/35 hover:bg-white/10"
              >
                Ich habe bereits ein Konto
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 bg-black/40 px-5 py-10 text-center text-sm text-zinc-500 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="font-bold text-zinc-300">RANKEDDARTS</div>
          <div>© 2026 RankedDarts. Das Matchmaking für Dartspieler.</div>
          <div className="flex gap-5">
            <a href="/leaderboard" className="transition hover:text-white">Leaderboard</a>
            <a href="/updates" className="transition hover:text-white">Updates</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
