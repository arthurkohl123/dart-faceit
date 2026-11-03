'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Archive, ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronRight, Crosshair, LayoutDashboard, MessageCircle, Radio, Server, Sparkles, Trophy, UsersRound, Zap } from 'lucide-react';

type UpdateCategory = 'Gameplay' | 'Competition' | 'Platform' | 'Design' | 'Community';

type UpdateEntry = {
  date: string;
  month: string;
  release: string;
  title: string;
  summary: string;
  category: UpdateCategory;
  details: string[];
  featured?: boolean;
  href?: string;
  hrefLabel?: string;
};

const categoryMeta: Record<UpdateCategory, { label: string; icon: typeof Crosshair; tone: string }> = {
  Gameplay: { label: 'Spielbetrieb', icon: Crosshair, tone: 'is-gameplay' },
  Competition: { label: 'Wettbewerb', icon: Trophy, tone: 'is-competition' },
  Platform: { label: 'Plattform', icon: Server, tone: 'is-platform' },
  Design: { label: 'Design', icon: Sparkles, tone: 'is-design' },
  Community: { label: 'Community', icon: UsersRound, tone: 'is-community' },
};

const updates: UpdateEntry[] = [
  {
    date: '03. November 2026',
    month: 'November 2026',
    release: 'RD // 2.6',
    title: 'Mehr Klarheit im Spielbetrieb',
    summary: 'Matchrooms, Turniere und der direkte Draht zum Team wurden an den Stellen verbessert, an denen es während eines laufenden Spiels wirklich darauf ankommt.',
    category: 'Gameplay',
    details: [
      'Der Matchroom wurde als klarerer Spielbereich überarbeitet – Ergebnis, Chat, Meldungen und Hilfe liegen näher zusammen.',
      '„Admin rufen“ ist verfügbar, sobald ein Admin oder Moderator online ist. Das Team erhält dazu eine direkte interne Benachrichtigung.',
      'Eine No-Show-Meldung kann kein laufendes Spiel mehr automatisch verlieren lassen, wenn der gemeldete Spieler den Matchroom bereits betreten hat.',
    ],
    featured: true,
    href: '/matchmaking',
    hrefLabel: 'Matchmaking öffnen',
  },
  {
    date: '02. November 2026',
    month: 'November 2026',
    release: 'RD // S2',
    title: 'Season 2 ist gestartet',
    summary: 'Die neue Season läuft. Saisonwerte beginnen neu, während deine gesamte Matchhistorie und deine All-Time-Statistiken erhalten bleiben.',
    category: 'Competition',
    details: [
      'Die Rangliste der vorherigen Season bleibt über die Saison-Auswahl einsehbar.',
      'Für die aktuelle Rangliste werden zehn absolvierte Spiele benötigt – danach bist du in der Ladder sichtbar.',
      'Die Saisonstatistik startet getrennt von deiner gesamten Karrierehistorie.',
    ],
    featured: true,
    href: '/leaderboard',
    hrefLabel: 'Zur Season-Rangliste',
  },
  {
    date: '01. November 2026',
    month: 'November 2026',
    release: 'RD // DUO',
    title: 'Duo Ranked für DartCounter',
    summary: '2vs2 kommt zu RankedDarts: Du kannst solo suchen und einen zufälligen Mate bekommen oder gemeinsam mit einem Freund als Team in die Queue gehen.',
    category: 'Gameplay',
    details: [
      'Duo Ranked ist direkt im Matchmaking auswählbar – es gibt keine zusätzliche, versteckte Seite dafür.',
      'Die Duo-Elo ist bewusst getrennt von deiner 1vs1-Elo, damit beide Spielmodi fair bleiben.',
      'Für die Duo-Queue gibt es eigene Betriebs-Schalter, damit sie bei Bedarf sauber pausiert werden kann.',
    ],
    href: '/matchmaking',
    hrefLabel: 'Duo Queue ansehen',
  },
  {
    date: '26. Oktober 2026',
    month: 'Oktober 2026',
    release: 'RD // CUP',
    title: 'Turniere: besserer Überblick und AutoDarts',
    summary: 'Der Turnierbereich führt dich klarer durch Anmeldung, Check-in, Turnierbaum und Match. Außerdem können Turniere jetzt auch über AutoDarts gespielt werden.',
    category: 'Competition',
    details: [
      'Die Turnierübersicht führt Spieler schneller zum nächsten sinnvollen Schritt: anmelden, einchecken, Match öffnen oder Turnierbaum ansehen.',
      'Bei einem aktiven Turniermatch kann ein Vorfall direkt aus dem Spiel heraus an das Team gemeldet werden.',
      'AutoDarts ist neben Scolia und DartCounter als Turnier-Plattform verfügbar.',
      'Im Turnier-Matchroom gibt es einen klaren Weg, bei einem Problem das Team dazuzuholen.',
    ],
    href: '/tournaments',
    hrefLabel: 'Zum Turnierbereich',
  },
  {
    date: '23. Oktober 2026',
    month: 'Oktober 2026',
    release: 'RD // ELO',
    title: 'Elo: transparenter und mit mehr Spielraum',
    summary: 'Die Elo-Logik und die Anzeige im Matchroom wurden vereinheitlicht, damit Vorschau und tatsächliche Wertung zusammenpassen.',
    category: 'Gameplay',
    details: [
      'Je nach Elo-Unterschied sind jetzt bis zu +50 beziehungsweise -50 Elo möglich.',
      'Die Vorschau vor einem Match kommt direkt vom Server und nutzt dieselbe Berechnung wie die finale Wertung.',
      'Die Matchroom-Anzeige wurde auch für kleinere Displays robuster gemacht.',
    ],
    href: '/history',
    hrefLabel: 'Elo-Verlauf ansehen',
  },
  {
    date: '22. Oktober 2026',
    month: 'Oktober 2026',
    release: 'RD // LIVE',
    title: 'Streamer, Startseite und Ladder im neuen Look',
    summary: 'Die wichtigsten öffentlichen Bereiche wurden von Grund auf neu gestaltet und die Community bekommt eine eigene Streaming-Übersicht.',
    category: 'Design',
    details: [
      'Auf /streamers siehst du aktive RankedDarts-Streamer mit Live-/Offline-Status und öffnest gezielt einen Stream statt fünf gleichzeitig.',
      'Startseite, Matchmaking, Rangliste und Profile erhielten eine neue visuelle Struktur.',
      'Streamer werden im Profil und auf der Rangliste gekennzeichnet und erhalten die Premium-Vorteile auf der Website.',
    ],
    href: '/streamers',
    hrefLabel: 'Streamer entdecken',
  },
  {
    date: '18. Oktober 2026',
    month: 'Oktober 2026',
    release: 'RD // PLUS',
    title: 'Mehr aus Premium und Match-History',
    summary: 'Premium und die persönliche Match-History wurden erweitert, ohne dass Free-Spieler den Überblick verlieren.',
    category: 'Platform',
    details: [
      'Die letzten sieben Tage im Elo-Verlauf stehen allen Spielern zur Verfügung; längere Zeiträume sind ein Premium-Vorteil.',
      'Premium kann als Geschenk gekauft und sicher über einen Code eingelöst werden.',
      'Laufzeit und Verlängerungsstatus von Premium-Abos werden transparenter angezeigt.',
    ],
    href: '/premium',
    hrefLabel: 'Premium ansehen',
  },
  {
    date: '16. Oktober 2026',
    month: 'Oktober 2026',
    release: 'RD // FORM',
    title: 'Dein Elo-Verlauf wird sichtbar',
    summary: 'Die Match-History ist von einer Ergebnisliste zu einem echten Rückblick auf deine Form geworden.',
    category: 'Gameplay',
    details: [
      'Elo-Gewinne und -Verluste lassen sich für 24 Stunden, sieben, 30 und 90 Tage auswerten.',
      'Filter für Gegner, Plattform, Modus und Zeitraum machen alte Matches schneller auffindbar.',
      'Beim Finden eines Matches kann ein Hinweiston abgespielt werden.',
    ],
    href: '/history',
    hrefLabel: 'Match-Verlauf öffnen',
  },
  {
    date: '21. Mai 2026',
    month: 'Mai 2026',
    release: 'RD // 0.1',
    title: 'RankedDarts Beta geht an den Start',
    summary: 'Die erste Version von RankedDarts mit echter Matchmaking-Queue, Profilen und einer gemeinsamen Ranked-Erfahrung ist gestartet.',
    category: 'Community',
    details: [
      'Die Grundlage für faire 1vs1-Paarungen über die angebundenen Darts-Plattformen wurde gelegt.',
      'Seitdem wird RankedDarts gemeinsam mit der Community Schritt für Schritt erweitert.',
    ],
  },
];

const filters: Array<'All' | UpdateCategory> = ['All', 'Gameplay', 'Competition', 'Platform', 'Design', 'Community'];

export default function UpdatesPage() {
  const [filter, setFilter] = useState<'All' | UpdateCategory>('All');
  const latest = updates[0];
  const filteredUpdates = useMemo(() => updates.filter((update) => filter === 'All' || update.category === filter), [filter]);
  const monthGroups = useMemo(() => {
    const grouped = filteredUpdates.reduce<Record<string, UpdateEntry[]>>((result, update) => {
      result[update.month] = [...(result[update.month] || []), update];
      return result;
    }, {});
    return Object.entries(grouped);
  }, [filteredUpdates]);

  return (
    <main className="updates-chronicle min-h-screen overflow-hidden bg-[#080d0e] text-white">
      <div className="updates-chronicle__grid" aria-hidden="true" />
      <div className="updates-chronicle__orb updates-chronicle__orb--north" aria-hidden="true" />
      <div className="updates-chronicle__orb updates-chronicle__orb--south" aria-hidden="true" />

      <header className="updates-chronicle__topbar">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            <span className="updates-chronicle__mark" aria-hidden="true"><i>R</i><i>D</i></span>
            <span><strong>RANKEDDARTS</strong><small>Release Archiv</small></span>
          </Link>
          <Link href="/" className="updates-chronicle__back"><ArrowLeft className="h-3.5 w-3.5" /> <span>Zur Plattform</span></Link>
        </div>
      </header>

      <div className="relative mx-auto max-w-[90rem] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <section className="updates-chronicle__hero">
          <div className="updates-chronicle__hero-copy">
            <p><Radio className="h-3.5 w-3.5" /> RELEASE ARCHIVE · IMMER NACHVOLLZIEHBAR</p>
            <h1>Was sich bei<br /><em>RankedDarts</em> bewegt.</h1>
            <span>Hier halten wir fest, was neu ist, was besser läuft und warum sich etwas für dich verändert.</span>
          </div>
          <div className="updates-chronicle__hero-index" aria-label={`${updates.length} Releases im Archiv`}>
            <div><small>ARCHIV</small><strong>{String(updates.length).padStart(2, '0')}</strong><span>Releases</span></div>
            <div><small>AKTUELL</small><strong>02</strong><span>Season</span></div>
          </div>
        </section>

        <section className="updates-chronicle__spotlight">
          <div className="updates-chronicle__spotlight-radar" aria-hidden="true"><span><Zap className="h-5 w-5" /></span></div>
          <div className="updates-chronicle__spotlight-copy">
            <div className="flex flex-wrap items-center gap-2"><span className="updates-chronicle__live-label"><span /> Neuester Release</span><CategoryBadge category={latest.category} /></div>
            <p className="updates-chronicle__release-code">{latest.release} · {latest.date}</p>
            <h2>{latest.title}</h2>
            <p>{latest.summary}</p>
            {latest.href && <Link href={latest.href} className="updates-chronicle__spotlight-action">{latest.hrefLabel}<ArrowUpRight className="h-4 w-4" /></Link>}
          </div>
          <div className="updates-chronicle__spotlight-list"><p>In diesem Release</p>{latest.details.map((detail) => <span key={detail}><Check className="h-3.5 w-3.5" />{detail}</span>)}</div>
        </section>

        <div className="mt-7 grid gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
          <aside className="updates-chronicle__filters">
            <div className="updates-chronicle__filter-heading"><Archive className="h-4 w-4" /><span>Archiv filtern</span></div>
            <div className="updates-chronicle__filter-list" role="group" aria-label="Update-Kategorie auswählen">
              {filters.map((item) => {
                const meta = item === 'All' ? null : categoryMeta[item];
                const isActive = filter === item;
                const Icon = meta?.icon || LayoutDashboard;
                return <button key={item} type="button" aria-pressed={isActive} onClick={() => setFilter(item)} className={isActive ? 'is-active' : ''}><Icon className="h-4 w-4" /><span>{item === 'All' ? 'Alle Releases' : meta?.label}</span><ChevronRight className="h-3.5 w-3.5" /></button>;
              })}
            </div>
            <div className="updates-chronicle__filter-note"><CalendarDays className="h-4 w-4" /><p><strong>Letzter Eintrag</strong><br />{latest.date}</p></div>
          </aside>

          <section className="min-w-0" aria-live="polite">
            <div className="updates-chronicle__timeline-heading"><div><p>Changelog</p><h2>{filter === 'All' ? 'Alle Releases' : categoryMeta[filter].label}</h2></div><span>{filteredUpdates.length} Einträge</span></div>
            <div className="updates-chronicle__timeline">
              {monthGroups.map(([month, entries]) => <section key={month} className="updates-chronicle__month"><div className="updates-chronicle__month-label"><span>{month}</span><i /></div><div className="space-y-3">{entries.map((update) => <ReleaseCard key={`${update.release}-${update.title}`} update={update} />)}</div></section>)}
              {monthGroups.length === 0 && <div className="updates-chronicle__empty">Für diese Kategorie gibt es noch keinen Eintrag.</div>}
            </div>
          </section>
        </div>

        <section className="updates-chronicle__footer-callout"><div><p>Kein Update verpassen</p><h2>Folge RankedDarts auf Discord.</h2><span>Wichtige Ankündigungen, Turniere und Season-Infos kommen dort direkt aus dem Team.</span></div><Link href="/notifications">Benachrichtigungen öffnen <MessageCircle className="h-4 w-4" /></Link></section>
      </div>
    </main>
  );
}

function CategoryBadge({ category }: { category: UpdateCategory }) {
  const meta = categoryMeta[category];
  const Icon = meta.icon;
  return <span className={`updates-chronicle__category ${meta.tone}`}><Icon className="h-3 w-3" />{meta.label}</span>;
}

function ReleaseCard({ update }: { update: UpdateEntry }) {
  return <article className={`updates-chronicle__release ${update.featured ? 'is-featured' : ''}`}>
    <div className="updates-chronicle__release-date"><span>{update.date.split(' ')[0]}</span><small>{update.date.split(' ').slice(1).join(' ')}</small></div>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CategoryBadge category={update.category} /><span className="updates-chronicle__release-code">{update.release}</span></div><h3>{update.title}</h3><p className="updates-chronicle__release-summary">{update.summary}</p><ul>{update.details.map((detail) => <li key={detail}><span><Check className="h-3 w-3" /></span>{detail}</li>)}</ul>{update.href && <Link href={update.href} className="updates-chronicle__release-link">{update.hrefLabel}<ArrowUpRight className="h-3.5 w-3.5" /></Link>}</div>
  </article>;
}
