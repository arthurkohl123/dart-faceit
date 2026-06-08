import Link from 'next/link';
import { Wrench, ShieldCheck, Clock } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_30%)]" />
      <section className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-24 text-center">
        <div className="rounded-full border border-amber-300/25 bg-amber-400/10 p-5 text-amber-200 shadow-2xl shadow-amber-500/10">
          <Wrench className="h-10 w-10" />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.32em] text-amber-200/80">RankedDarts Wartungsmodus</p>
        <h1 className="mt-5 max-w-3xl text-5xl font-black tracking-[-0.07em] text-white md:text-7xl">
          Wir verbessern gerade die Plattform.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
          RankedDarts befindet sich aktuell in Wartungsarbeiten, welche bis ca. 6 Uhr gehen werden. Schaut gerne später erneut vorbei.
        </p>

        <div className="mt-10 grid w-full max-w-3xl gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h2 className="mt-4 text-lg font-black">Daten bleiben sicher</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Accounts, Elo-Werte, Matches und Tickets bleiben erhalten. Der Modus blockiert nur den normalen Zugriff während der Wartung.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left">
            <Clock className="h-5 w-5 text-cyan-300" />
            <h2 className="mt-4 text-lg font-black">Bald wieder online</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Sobald die Wartung beendet ist, kannst du dich wieder normal einloggen und die Queue nutzen.</p>
          </div>
        </div>
      </section>
    </main>
  );
}