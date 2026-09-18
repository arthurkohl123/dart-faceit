'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleHelp, ClipboardCheck, Crosshair, Gamepad2, ShieldCheck, Swords, Trophy } from 'lucide-react';
import { useAuth } from '@/app/providers';

const steps = [
  {
    number: '01',
    title: 'Bereit machen',
    text: 'Hinterlege mindestens eine Plattform – Scolia, DartCounter oder AutoDarts. Nur damit kann die Queue einen passenden Gegner finden.',
    href: '/profile#platforms',
    action: 'Plattform einrichten',
    icon: Crosshair,
  },
  {
    number: '02',
    title: 'Queue wählen',
    text: 'Wähle eine oder mehrere Plattformen. Bei mehreren Queues sucht RankedDarts parallel; das erste gültige Match gewinnt und beendet die übrigen Suchen.',
    href: '/matchmaking',
    action: 'Matchmaking öffnen',
    icon: Gamepad2,
  },
  {
    number: '03',
    title: 'Match spielen',
    text: 'Wenn ein Gegner gefunden wurde, haben beide 30 Sekunden zum Annehmen. Danach spielst du auf der gewählten Plattform und trägst das Ergebnis im Matchroom ein.',
    href: '/matchmaking',
    action: 'So funktioniert die Queue',
    icon: Swords,
  },
];

export default function GettingStartedPage() {
  const { profile, loading } = useAuth();
  const hasPlatform = Boolean(profile?.scolia_username || profile?.dartcounter_username || profile?.autodarts_username);
  const isReady = Boolean(profile?.phone_verified && hasPlatform);

  return (
    <main className="min-h-screen bg-[#070909] px-5 py-12 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/profile" className="text-sm font-bold text-zinc-500 transition hover:text-white">← Zurück zum Profil</Link>
        <header className="mt-6 overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.17),transparent_48%),linear-gradient(135deg,#0d1211,#090a0b)] p-7 shadow-2xl shadow-black/40 sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100"><CircleHelp className="h-3.5 w-3.5" /> Dein erster Ranked-Run</div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.07em] sm:text-6xl">Von der Anmeldung bis zum ersten Ergebnis.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">Kein unnötiger Kram: Plattform verbinden, Queue starten, Match bestätigen. Dieser Ablauf erklärt dir genau, was wann passiert.</p>
          {!loading && profile && <div className={`mt-6 inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${isReady ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'}`}>
            {isReady ? <CheckCircle2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {isReady ? 'Dein Profil ist für die Ranked-Queue bereit.' : 'Vervollständige die Schritte unten, damit du in die Ranked-Queue kannst.'}
          </div>}
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return <article key={step.number} className="flex min-h-[17rem] flex-col rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-6 transition hover:border-emerald-300/25 hover:bg-emerald-400/[0.045]">
              <div className="flex items-start justify-between"><span className="text-xs font-black tracking-[0.22em] text-emerald-300">{step.number}</span><span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/20 text-emerald-200"><Icon className="h-5 w-5" /></span></div>
              <h2 className="mt-8 text-2xl font-black tracking-[-0.05em]">{step.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-zinc-400">{step.text}</p>
              <Link href={step.href} className="mt-6 inline-flex items-center gap-2 text-sm font-black text-emerald-200 transition hover:text-white">{step.action} <ArrowRight className="h-4 w-4" /></Link>
            </article>;
          })}
        </section>

        <section className="mt-6 grid gap-5 rounded-[1.75rem] border border-white/10 bg-[#0c1010] p-6 sm:p-8 lg:grid-cols-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Im Matchroom</div>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.05em]">Das Ergebnis ist erst nach Bestätigung final.</h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-zinc-400">
              <li className="flex gap-3"><span className="font-black text-amber-200">1.</span><span>Nach dem Spiel trägt einer von euch das Ergebnis und – falls verfügbar – die Averages ein.</span></li>
              <li className="flex gap-3"><span className="font-black text-amber-200">2.</span><span>Der Gegner erhält sofort einen Hinweis und bestätigt das Ergebnis oder widerspricht bei einem Fehler.</span></li>
              <li className="flex gap-3"><span className="font-black text-amber-200">3.</span><span>Erst dann werden Match, Elo und Statistik zuverlässig abgeschlossen. Private Spiele bleiben unrated.</span></li>
            </ol>
          </div>
          <div className="border border-white/10 bg-black/20 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-white"><Trophy className="h-4 w-4 text-yellow-200" /> Für Turniere gilt derselbe Kernablauf</div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Dein Check-in, ein fertiger Turniermatch und ein offenes Ergebnis erscheinen zusätzlich in deinen Benachrichtigungen. Du musst also nicht dauernd die Turnierseite aktualisieren.</p>
            <Link href="/notifications" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-200 transition hover:text-white">Benachrichtigungen öffnen <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>

        <section className="mt-6 rounded-[1.75rem] border border-cyan-300/15 bg-cyan-400/[0.045] p-6 sm:p-8">
          <div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><h2 className="font-black text-white">Woran du erkennst, dass alles läuft</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Die Queue zeigt die aktuelle Aktivität je Plattform und erweitert den Elo-Radius Schritt für Schritt. Es gibt deshalb keine künstliche Wartezeit und kein blindes „Matchmaking läuft“ – du siehst jederzeit, welche Plattformen aktiv sind und wie weit die Suche schon geöffnet ist.</p></div></div>
        </section>
      </div>
    </main>
  );
}
