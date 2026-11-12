'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronRight, CircleDot, Link2, Menu, MessageCircle, Radio, Search, ShieldCheck, Swords, Target, Trophy, Video, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { ResultRoomPreview } from '@/components/ResultRoomPreview';
import { OPEN_PLAYER_SEARCH_EVENT } from '@/lib/player-search';

type CommunityStats = {
  players: number;
  matches: number;
  cups: number;
  liveCups: number;
  onlinePlayers: number;
  queuePlayers: number;
  livePlayers: number;
};

const DISCORD_INVITE_URL = 'https://discord.gg/5qwUZQxjfV';

const waysIn = [
  { id: 'ranked', icon: Swords, number: '01', eyebrow: 'Ranked', title: 'Ein gutes Match reicht.', text: 'Suche einen Gegner, spiele an deinem Board und nimm die Elo mit, die du dir erspielt hast.', href: '/matchmaking', action: 'Match suchen' },
  { id: 'tournaments', icon: Trophy, number: '02', eyebrow: 'Turniere', title: 'Wenn ein Abend mehr kann.', text: 'Melde dich an, spiel dich durchs Bracket und verfolge jede Runde direkt auf der Plattform.', href: '/tournaments', action: 'Turniere ansehen' },
  { id: 'streamers', icon: Video, number: '03', eyebrow: 'Streamer', title: 'Auch daneben passiert was.', text: 'Schau Spielern aus der Community zu und entdecke, wer gerade live ist.', href: '/streamers', action: 'Zu den Streamern' },
] as const;

const setupBenefits = [
  { icon: ShieldCheck, title: 'Beide bestätigen', text: 'Das Ergebnis zählt erst, wenn ihr beide es bestätigt habt.' },
  { icon: Target, title: 'Passende Gegner', text: 'Die Suche startet in deinem Elo-Bereich.' },
  { icon: Link2, title: 'Dein System', text: 'Du bleibst bei dem Setup, mit dem du ohnehin spielst.' },
] as const;

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': 'https://www.rankeddarts.de/#website', url: 'https://www.rankeddarts.de/', name: 'RankedDarts', alternateName: 'RankedDarts', inLanguage: 'de-DE' },
    { '@type': 'Organization', '@id': 'https://www.rankeddarts.de/#organization', name: 'RankedDarts', url: 'https://www.rankeddarts.de/', logo: 'https://www.rankeddarts.de/rankeddarts-logo-mark.png', sameAs: [DISCORD_INVITE_URL] },
  ],
};

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(Boolean(session)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setIsLoggedIn(Boolean(session)));
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    async function loadCommunityStats() {
      try {
        const response = await fetch('/api/community-stats');
        if (!response.ok) throw new Error('Community stats request failed');
        const data: CommunityStats = await response.json();
        if ([data.players, data.matches, data.cups, data.liveCups, data.onlinePlayers, data.queuePlayers, data.livePlayers].every((value) => Number.isInteger(value) && value >= 0)) setCommunityStats(data);
      } catch {
        // Auch ohne aktuelle Zahlen bleibt die Startseite vollständig nutzbar.
      }
    }
    void loadCommunityStats();
    const refresh = window.setInterval(() => void loadCommunityStats(), 30_000);
    return () => window.clearInterval(refresh);
  }, []);

  const primaryTarget = isLoggedIn ? '/matchmaking' : '/auth/register';
  const primaryLabel = isLoggedIn ? 'Match suchen' : 'Jetzt mitspielen';
  const headlineStats = [
    [communityStats ? String(communityStats.onlinePlayers) : '–', 'gerade online'],
    [communityStats ? String(communityStats.livePlayers) : '–', 'spielen gerade'],
    [communityStats ? String(communityStats.matches) : '–', 'bestätigte Matches'],
    [communityStats ? String(communityStats.cups) : '–', 'Turniere gespielt'],
  ];

  function modeStatus(id: string) {
    if (id === 'ranked') return communityStats ? String(communityStats.livePlayers) + (communityStats.livePlayers === 1 ? ' Match läuft gerade' : ' Matches laufen gerade') : 'Ranked-Matches';
    if (id === 'tournaments') return communityStats && communityStats.liveCups > 0 ? String(communityStats.liveCups) + (communityStats.liveCups === 1 ? ' Turnier läuft' : ' Turniere laufen') : 'Brackets und Cups';
    return 'Live und offline entdecken';
  }

  return (
    <main className="rdx-home">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <header className="rdx-header">
        <nav className="rdx-shell rdx-nav" aria-label="Hauptnavigation">
          <Link href="/" className="rdx-brand" aria-label="Zur Startseite">
            <BrandLogo className="rdx-brand-logo" />
            <span className="rdx-brand-copy"><strong>RANKEDDARTS</strong><small>Competitive darts</small></span>
          </Link>

          <div className="rdx-nav-links">
            <Link href="/leaderboard">Rangliste</Link>
            <Link href="/matchmaking">Matchmaking</Link>
            <Link href="/tournaments">Turniere</Link>
            <Link href="/streamers">Streamer</Link>
            <Link href="/updates">Updates</Link>
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="rdx-discord"><MessageCircle size={14} /> Discord</a>
            {!isLoggedIn && <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PLAYER_SEARCH_EVENT))} aria-label="Spieler suchen"><Search size={14} /> Suche</button>}
          </div>

          <div className="rdx-nav-actions">
            {!isLoggedIn && <>
              <button type="button" onClick={() => router.push('/auth/login')} className="rdx-login">Login</button>
              <button type="button" onClick={() => router.push('/auth/register')} className="rdx-join">Mitspielen</button>
            </>}
            <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="rdx-menu-toggle" aria-label="Menü öffnen" aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </nav>

        {mobileMenuOpen && <div className="rdx-mobile-menu">
          <div className="rdx-mobile-menu-inner">
            {['Rangliste|/leaderboard', 'Matchmaking|/matchmaking', 'Turniere|/tournaments', 'Streamer|/streamers', 'Updates|/updates', 'Premium|/premium'].map((entry) => {
              const [label, href] = entry.split('|');
              return <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)}>{label}<ChevronRight size={15} /></Link>;
            })}
            {!isLoggedIn && <button type="button" onClick={() => { setMobileMenuOpen(false); window.dispatchEvent(new Event(OPEN_PLAYER_SEARCH_EVENT)); }}><Search size={15} /> Spieler suchen</button>}
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" onClick={() => setMobileMenuOpen(false)}><MessageCircle size={15} /> Discord-Community</a>
          </div>
        </div>}
      </header>

      <section className="rdx-hero">
        <div aria-hidden className="rdx-hero-photo" />
        <div aria-hidden className="rdx-hero-shade" />
        <div aria-hidden className="rdx-hero-grid" />
        <div className="rdx-hero-marker" aria-hidden="true"><span /><i /></div>
        <div className="rdx-shell rdx-hero-inner">
          <div className="rdx-hero-copy">
            <p className="rdx-eyebrow"><span />Online Darts, richtig gespielt</p>
            <h1><span>Jedes Leg</span><span>zählt.</span></h1>
            <p className="rdx-hero-description">Such dir einen Gegner. Spiel an deinem Board. Bestätigt das Ergebnis gemeinsam – dann geht es direkt in deine Elo.</p>
            <div className="rdx-hero-actions">
              <button type="button" onClick={() => router.push(primaryTarget)} className="rdx-button-primary">{primaryLabel}<ArrowUpRight size={16} /></button>
              <Link href="/getting-started" className="rdx-button-secondary">So funktioniert&apos;s <ChevronRight size={16} /></Link>
            </div>
            <div className="rdx-queue-status">
              <span className="rdx-queue-copy"><Radio size={14} /> Gerade in der Spielersuche</span>
              <span className="rdx-queue-count">{communityStats ? communityStats.queuePlayers === 1 ? '1 Spieler sucht gerade.' : String(communityStats.queuePlayers) + ' Spieler suchen gerade.' : 'Aktivität wird geladen …'}</span>
            </div>
          </div>
        </div>
        <div className="rdx-stat-rail">
          <div className="rdx-shell rdx-stat-grid">
            {headlineStats.map(([value, label], index) => <div key={label} className="rdx-stat">
              <span className="rdx-stat-number">{value}</span>
              <span className="rdx-stat-label">{label}</span>
              <span aria-hidden className="rdx-stat-index">0{index + 1}</span>
            </div>)}
          </div>
        </div>
      </section>

      <section className="rdx-trust-strip">
        <div className="rdx-shell rdx-trust-inner">
          <span className="rdx-trust-highlight"><CircleDot size={14} /> Matchmaking auf deinem Elo-Level</span>
          <span>Ergebnisse erst nach Bestätigung</span>
          <span>Scolia · DartCounter · AutoDarts</span>
          <span className="rdx-trust-premium">Premium ab 4,99 € / Monat</span>
        </div>
      </section>

      <section className="rdx-intro rdx-shell">
        <div className="rdx-intro-copy">
          <p className="rdx-section-index">Nicht irgendeine Runde</p>
          <h2>Gegner finden.<br />Ergebnis festhalten.<br /><span>Weiterkommen.</span></h2>
          <p className="rdx-body-copy">RankedDarts bringt Ordnung in Online-Darts, ohne dein Spiel komplizierter zu machen. Du spielst wie immer – nur mit echten Gegnern, klaren Ergebnissen und einer Rangliste, die mitläuft.</p>
          <div className="rdx-benefits">
            {setupBenefits.map(({ icon: Icon, title, text }, index) => <div key={title} className="rdx-benefit">
              <span className="rdx-benefit-index">0{index + 1}</span>
              <span className="rdx-benefit-icon"><Icon size={17} /></span>
              <span className="rdx-benefit-copy"><strong>{title}</strong><small>{text}</small></span>
            </div>)}
          </div>
        </div>
        <div className="rdx-preview-column">
          <div className="rdx-preview-heading"><span><Radio size={14} /> So sieht ein Ergebnis aus</span><span>Beispiel</span></div>
          <div className="rdx-preview-frame"><span className="rdx-frame-corner rdx-frame-tl" /><span className="rdx-frame-corner rdx-frame-tr" /><span className="rdx-frame-corner rdx-frame-bl" /><span className="rdx-frame-corner rdx-frame-br" /><ResultRoomPreview onOpen={() => router.push('/matchmaking')} /></div>
        </div>
      </section>

      <section className="rdx-homeplay">
        <div aria-hidden className="rdx-homeplay-photo" />
        <div aria-hidden className="rdx-homeplay-shade" />
        <div className="rdx-shell rdx-homeplay-inner">
          <div className="rdx-homeplay-spacer" />
          <div className="rdx-homeplay-copy">
            <p className="rdx-section-index">Das gute daran</p>
            <h2>Zu Hause spielen.<br />Trotzdem mittendrin.</h2>
            <p className="rdx-body-copy">Ob Wohnzimmer, Keller oder eigenes Darts-Zimmer: Dein Match beginnt dort, wo dein Board hängt. Der Gegner spielt zur gleichen Zeit bei sich – und trotzdem seid ihr im selben Spiel.</p>
            <Link href="/matchmaking" className="rdx-text-link">Dein nächstes Match finden <ArrowUpRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="rdx-modes rdx-shell">
        <div className="rdx-section-heading">
          <div><p className="rdx-section-index">Dein Abend, dein Modus</p><h2>Mach das, worauf du Lust hast.</h2></div>
          <p>Ranked, Turnier oder einfach bei der Community reinschauen: Du entscheidest, wo du einsteigst.</p>
        </div>
        <div className="rdx-mode-list">
          {waysIn.map(({ id, icon: Icon, number, eyebrow, title, text, href, action }) => <Link key={id} href={href} className={'rdx-mode-row rdx-mode-' + id}>
            <span className="rdx-mode-number">{number}</span>
            <span className="rdx-mode-main">
              <span className="rdx-mode-meta"><span>{eyebrow}</span><span className="rdx-mode-status">{modeStatus(id)}</span></span>
              <span className="rdx-mode-title">{title}</span>
              <span className="rdx-mode-description">{text}</span>
            </span>
            <span className="rdx-mode-icon"><Icon size={23} /></span>
            <span className="rdx-mode-action">{action}<ArrowUpRight size={16} /></span>
            <span aria-hidden className="rdx-mode-line" />
          </Link>)}
        </div>
      </section>

      <section className="rdx-ranking">
        <div className="rdx-shell rdx-ranking-inner">
          <div className="rdx-ranking-heading"><p className="rdx-section-index">Die Rangliste läuft mit</p><h2>Nicht nur spielen.<br />Auch besser werden.</h2></div>
          <div className="rdx-ranking-points">
            {[['01', 'Jedes Match', 'Elo kommt erst nach bestätigtem Ergebnis.'], ['02', 'Jede Saison', 'Deine Platzierung bleibt nachvollziehbar.'], ['03', 'Jeder Schritt', 'Sieh, wohin dein nächster Sieg dich bringt.']].map(([number, title, text]) => <div key={number} className="rdx-ranking-point">
              <span className="rdx-point-number">{number}</span>
              <span className="rdx-point-rule" />
              <h3>{title}</h3>
              <p>{text}</p>
            </div>)}
          </div>
        </div>
      </section>

      <section className="rdx-final rdx-shell">
        <div aria-hidden className="rdx-final-grid" />
        <div className="rdx-final-content">
          <Swords className="rdx-final-icon" />
          <p className="rdx-section-index">Dein nächstes Leg</p>
          <h2>Bist du bereit,<br /><span>es zählen zu lassen?</span></h2>
          <p className="rdx-final-description">Profil erstellen, Gegner finden und losspielen. Der Rest passiert auf dem Board.</p>
          <div className="rdx-final-actions">
            <button type="button" onClick={() => router.push(primaryTarget)} className="rdx-button-primary">{primaryLabel}<ArrowUpRight size={16} /></button>
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="rdx-button-secondary"><MessageCircle size={16} /> Community beitreten</a>
          </div>
        </div>
      </section>

      <footer className="rdx-footer">
        <div className="rdx-shell rdx-footer-inner">
          <span className="rdx-footer-brand">RANKEDDARTS · COMPETITIVE DARTS</span>
          <div className="rdx-footer-links">
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Discord-Community</a>
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <Link href="/agb">AGB</Link>
            <Link href="/fairplay">Fair Play</Link>
            <Link href="/turnierregeln">Turnierregeln</Link>
          </div>
        </div>
      </footer>

      <div className="rdx-mobile-dock"><button type="button" onClick={() => router.push(primaryTarget)}>{primaryLabel}<ArrowUpRight size={16} /></button></div>
    </main>
  );
}
