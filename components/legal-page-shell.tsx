import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, CircleHelp, Crown, FileText, Gavel, Scale, ShieldCheck, Swords } from 'lucide-react';

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  intro: string;
  activePath: string;
  children: ReactNode;
};

type LegalLink = {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const links: LegalLink[] = [
  { href: '/impressum', label: 'Impressum', description: 'Anbieter & Kontakt', icon: Scale },
  { href: '/datenschutz', label: 'Datenschutz', description: 'Deine Daten', icon: ShieldCheck },
  { href: '/agb', label: 'AGB', description: 'Plattformnutzung', icon: Gavel },
  { href: '/fairplay', label: 'Fair Play', description: 'Faire Wettbewerbe', icon: Swords },
  { href: '/turnierregeln', label: 'Turnierregeln', description: 'Ablauf & Wertung', icon: FileText },
  { href: '/premium/kuendigung', label: 'Premium kündigen', description: 'Abo & Laufzeit', icon: Crown },
];

export function LegalPageShell({ eyebrow, title, intro, activePath, children }: LegalPageShellProps) {
  return (
    <main className="rules-library min-h-screen overflow-hidden bg-[#070b0c] text-white">
      <div className="rules-library__glow rules-library__glow--one" aria-hidden="true" />
      <div className="rules-library__glow rules-library__glow--two" aria-hidden="true" />
      <div className="rules-library__grid" aria-hidden="true" />

      <div className="relative mx-auto max-w-[92rem] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <header className="rules-library__topbar">
          <Link href="/" className="group inline-flex min-w-0 items-center gap-3">
            <span className="rules-library__brand-mark" aria-hidden="true"><span>R</span><span>D</span></span>
            <span className="min-w-0"><span className="block truncate text-sm font-black tracking-[-0.04em] text-white sm:text-base">RANKEDDARTS</span><span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200/70">Spielbetrieb · Regelwerk</span></span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400 md:inline-flex">6 Bereiche</span>
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] font-black text-zinc-200 transition hover:border-emerald-300/35 hover:bg-emerald-300/10 hover:text-white sm:px-4 sm:text-xs"><ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Zur Plattform</span><span className="sm:hidden">Zurück</span></Link>
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:gap-6">
          <aside className="rules-library__rail hidden lg:flex">
            <div className="rules-library__rail-heading">
              <span className="rules-library__eyebrow"><Scale className="h-3.5 w-3.5" /> Orientierung</span>
              <h2>Alles klar.<br /><em>Alles an einem Ort.</em></h2>
              <p>Die Regeln, die deinen Account, Matches und Turniere betreffen.</p>
            </div>

            <nav className="rules-library__nav" aria-label="Rechtliches und Regeln">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = link.href === activePath;
                return <Link key={link.href} href={link.href} aria-current={isActive ? 'page' : undefined} className={`rules-library__nav-link group ${isActive ? 'is-active' : ''}`}>
                  <span className="rules-library__nav-icon"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-black">{link.label}</span><span className="mt-0.5 block truncate text-[10px] font-bold tracking-wide text-zinc-500">{link.description}</span></span>
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                </Link>;
              })}
            </nav>

            <div className="rules-library__support-card">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-300 text-black"><CircleHelp className="h-4 w-4" /></span>
              <div><p className="text-xs font-black text-white">Frage zu einem Fall?</p><Link href="/support" className="mt-1 inline-flex items-center gap-1 text-[11px] font-black text-emerald-200 hover:text-emerald-100">Support öffnen <ArrowUpRight className="h-3 w-3" /></Link></div>
            </div>
          </aside>

          <div className="min-w-0">
            <section className="rules-library__hero">
              <div className="rules-library__hero-copy">
                <span className="rules-library__eyebrow"><Scale className="h-3.5 w-3.5" /> {eyebrow}</span>
                <h1>{title}</h1>
                <p>{intro}</p>
                <div className="rules-library__hero-meta"><span>RANKEDDARTS</span><i /><span>VERBINDLICHE INFORMATIONEN</span></div>
              </div>
              <div className="rules-library__seal" aria-hidden="true"><div><Scale className="h-7 w-7" /><span>RD</span></div><p>SPIELREGELN<br />&amp; RECHT</p></div>
            </section>

            <nav className="rules-library__mobile-nav lg:hidden" aria-label="Rechtliches und Regeln">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = link.href === activePath;
                return <Link key={link.href} href={link.href} aria-current={isActive ? 'page' : undefined} className={`rules-library__mobile-link ${isActive ? 'is-active' : ''}`}><Icon className="h-3.5 w-3.5" />{link.label}</Link>;
              })}
            </nav>

            <article className="rules-library__content">{children}</article>

            <footer className="rules-library__footer">
              <span>RANKEDDARTS · COMPETITIVE DARTS</span>
              <span>Fragen zu Regeln oder deinem Account? <Link href="/support">Support kontaktieren <ArrowUpRight className="inline h-3 w-3" /></Link></span>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rules-library__section"><div className="rules-library__section-index" aria-hidden="true" /><div className="min-w-0"><p className="rules-library__section-label">Abschnitt</p><h2>{title}</h2><div className="rules-library__section-copy">{children}</div></div></section>;
}

export function PlaceholderNotice() {
  return <div className="rules-library__notice"><span className="rules-library__notice-mark">!</span><div><p className="font-black text-amber-100">Wichtiger Platzhalter</p><p className="mt-1 text-sm leading-6 text-amber-50/75">Die in eckigen Klammern stehenden Angaben sind absichtlich nicht echt. Ersetze sie vor dem Live-Betrieb durch deine korrekten Daten.</p></div></div>;
}
