import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Scale, ShieldCheck } from 'lucide-react';

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

const links = [
  { href: '/impressum', label: 'Impressum' },
  { href: '/datenschutz', label: 'Datenschutz' },
  { href: '/agb', label: 'AGB' },
  { href: '/turnierregeln', label: 'Turnierregeln' },
  { href: '/premium/kuendigung', label: 'Premium kündigen' },
];

export function LegalPageShell({ eyebrow, title, intro, children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-[#06080c] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.13),transparent_27%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.11),transparent_34%)]" />
      <div className="relative mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-black tracking-tight text-white transition hover:text-emerald-200">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"><ShieldCheck className="h-4 w-4" /></span>
            RANKEDDARTS
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Zur Plattform</Link>
        </header>

        <section className="mt-12 border-b border-white/10 pb-10 sm:mt-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-amber-200"><Scale className="h-3.5 w-3.5" /> {eyebrow}</div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.06em] sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg">{intro}</p>
        </section>

        <div className="my-8 flex flex-wrap gap-2 border-b border-white/10 pb-8">
          {links.map((link) => <Link key={link.href} href={link.href} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-zinc-300 transition hover:border-emerald-300/25 hover:bg-emerald-400/10 hover:text-emerald-100">{link.label}</Link>)}
        </div>

        <article className="space-y-9 pb-16 text-sm leading-7 text-zinc-300 sm:text-base">{children}</article>

      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="text-xl font-black tracking-[-0.03em] text-white sm:text-2xl">{title}</h2><div className="mt-3 space-y-3">{children}</div></section>;
}

export function PlaceholderNotice() {
  return <div className="rounded-2xl border border-amber-300/25 bg-amber-400/[0.08] p-5 text-amber-50"><p className="font-black text-amber-200">Wichtiger Platzhalter</p><p className="mt-1 text-sm leading-6 text-amber-50/80">Die in eckigen Klammern stehenden Angaben sind absichtlich nicht echt. Ersetze sie vor dem Live-Betrieb durch deine korrekten Daten.</p></div>;
}
