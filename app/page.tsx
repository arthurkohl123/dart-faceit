'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowDownRight, ArrowUpRight, CircleDot, Gauge, Menu, MessageCircle, Radio, Search, Swords, Target, Trophy, Video, X, Zap } from 'lucide-react';
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

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': 'https://www.rankeddarts.de/#website', url: 'https://www.rankeddarts.de/', name: 'RankedDarts', alternateName: 'RankedDarts', inLanguage: 'de-DE' },
    { '@type': 'Organization', '@id': 'https://www.rankeddarts.de/#organization', name: 'RankedDarts', url: 'https://www.rankeddarts.de/', logo: 'https://www.rankeddarts.de/rankeddarts-logo-mark.png', sameAs: [DISCORD_INVITE_URL] },
  ],
};

const modes = [
  { id: 'ranked', code: '01', icon: Swords, title: 'Ranked', detail: 'Finde einen Gegner auf deinem Level. Spielt euer Match und bestätigt das Ergebnis gemeinsam.', href: '/matchmaking', action: 'Gegner finden', tone: 'mint' },
  { id: 'tournaments', code: '02', icon: Trophy, title: 'Turniere', detail: 'Melde dich an, verfolge das Bracket und spiel dich Runde für Runde nach vorne.', href: '/tournaments', action: 'Turniere ansehen', tone: 'amber' },
  { id: 'streamers', code: '03', icon: Video, title: 'Live dabei', detail: 'Entdecke Streamer aus der Community und schau bei ihren Matches zu.', href: '/streamers', action: 'Streamer entdecken', tone: 'blue' },
] as const;

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
        // Die Startseite bleibt auch dann nutzbar, wenn aktuelle Zahlen nicht erreichbar sind.
      }
    }
    void loadCommunityStats();
    const refresh = window.setInterval(() => void loadCommunityStats(), 30_000);
    return () => window.clearInterval(refresh);
  }, []);

  const primaryTarget = isLoggedIn ? '/matchmaking' : '/auth/register';
  const primaryLabel = isLoggedIn ? 'Match finden' : 'Jetzt mitspielen';
  const queueCount = communityStats?.queuePlayers;
  const liveCount = communityStats?.livePlayers;
  const metrics = [
    { value: communityStats ? String(communityStats.players) : '–', label: 'Spieler', note: 'in der Community' },
    { value: communityStats ? String(communityStats.matches) : '–', label: 'Matches', note: 'bestätigt gespielt' },
    { value: communityStats ? String(communityStats.cups) : '–', label: 'Turniere', note: 'bereits gespielt' },
    { value: communityStats ? String(communityStats.onlinePlayers) : '–', label: 'Online', note: 'gerade aktiv' },
  ];

  return (
    <main className="rd-home min-h-screen overflow-hidden bg-[#0d0d11] text-[#f4f3ef]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <nav className="rd-nav" aria-label="Hauptnavigation">
        <div className="rd-nav-inner">
          <button onClick={() => router.push('/')} className="rd-brand" aria-label="RankedDarts Startseite">
            <BrandLogo className="h-10 w-10 rounded-xl" />
            <span className="rd-brand-copy"><strong>RANKEDDARTS</strong><small>COMPETITIVE DARTS</small></span>
          </button>
          <div className="rd-nav-links">
            <Link href="/leaderboard">Rangliste</Link>
            <Link href="/matchmaking">Matchmaking</Link>
            <Link href="/tournaments">Turniere</Link>
            <Link href="/streamers">Streamer</Link>
            <Link href="/updates">Updates</Link>
            <a className="rd-discord-link" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Discord</a>
            {!isLoggedIn && <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PLAYER_SEARCH_EVENT))} className="rd-search-trigger" aria-label="Spieler suchen"><Search size={15} /> <span>Suche</span></button>}
          </div>
          <div className="rd-nav-actions">
            {!isLoggedIn && <>
              <button onClick={() => router.push('/auth/login')} className="rd-login">Login</button>
              <button onClick={() => router.push('/auth/register')} className="rd-nav-cta">Mitspielen <ArrowUpRight size={15} /></button>
            </>}
            <button onClick={() => setMobileMenuOpen((open) => !open)} className="rd-menu-button" aria-label={mobileMenuOpen ? 'Menü schließen' : 'Menü öffnen'} aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}</button>
          </div>
        </div>
        {mobileMenuOpen && <div className="rd-mobile-menu">
          <div className="rd-mobile-menu-links">{[
            ['Rangliste', '/leaderboard'], ['Matchmaking', '/matchmaking'], ['Turniere', '/tournaments'],
            ['Streamer', '/streamers'], ['Updates', '/updates'], ['Premium', '/premium'],
          ].map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)}>{label}<ArrowUpRight size={14} /></Link>)}
          {!isLoggedIn && <button type="button" onClick={() => { setMobileMenuOpen(false); window.dispatchEvent(new Event(OPEN_PLAYER_SEARCH_EVENT)); }}><Search size={15} /> Spieler suchen</button>}
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" onClick={() => setMobileMenuOpen(false)}><MessageCircle size={15} /> Discord-Community</a>
          </div>
        </div>}
      </nav>

      <section className="rd-hero">
        <div className="rd-hero-photo" aria-hidden="true" />
        <div className="rd-hero-shade" aria-hidden="true" />
        <div className="rd-hero-grid" aria-hidden="true" />
        <div className="rd-hero-orbit" aria-hidden="true"><div className="rd-target-core"><span /></div></div>
        <div className="rd-hero-marker rd-marker-top" aria-hidden="true"><span className="rd-live-dot" /> RANKED SYSTEM <b>ONLINE</b></div>
        <div className="rd-hero-marker rd-marker-bottom" aria-hidden="true"><span>PRECISION</span><b>01 / 03</b></div>
        <div className="rd-hero-content">
          <p className="rd-kicker"><span>RANKED DARTS PLATFORM</span><i /> FÜR DEIN NÄCHSTES MATCH</p>
          <h1>Dein Board.<br />Dein Gegner.<br /><em>Dein Rang.</em></h1>
          <div className="rd-hero-copy">
            <p>Finde faire Gegner, spiel dein Match an deinem eigenen Board und mach aus jedem Ergebnis Fortschritt.</p>
            <div className="rd-hero-actions">
              <button onClick={() => router.push(primaryTarget)} className="rd-button-primary">{primaryLabel}<ArrowUpRight size={17} /></button>
              <Link href="/leaderboard" className="rd-button-quiet">Rangliste ansehen <ArrowDownRight size={16} /></Link>
            </div>
          </div>
          <div className="rd-queue-status"><Radio size={15} /><span>{queueCount === undefined ? 'Spielersuche' : queueCount === 1 ? '1 Spieler sucht gerade' : queueCount + ' Spieler suchen gerade'}</span><b>LIVE</b></div>
        </div>
        <div className="rd-hero-index"><span>RANKEDDARTS.DE</span><span>YOUR BOARD / YOUR MATCH</span><span>01 — COMPETE</span></div>
      </section>

      <section className="rd-metrics" aria-label="Aktuelle Community-Zahlen">
        <div className="rd-section-code"><span>COMMUNITY / LIVE DATA</span><span><Activity size={13} /> REFRESH 30 SEC</span></div>
        <div className="rd-metrics-grid">{metrics.map((item, index) => <div className="rd-metric" key={item.label}>
          <span className="rd-metric-index">0{index + 1}</span><strong>{item.value}</strong><span className="rd-metric-label">{item.label}</span><small>{item.note}</small>
        </div>)}</div>
      </section>

      <section className="rd-intro">
        <div className="rd-intro-label"><span>01</span><span>THE GAME, CONNECTED</span></div>
        <div className="rd-intro-main">
          <h2>Der nächste<br />Wurf liegt <em>bei dir.</em></h2>
          <div><p>Online-Darts funktioniert am besten, wenn der Rest einfach läuft. RankedDarts verbindet Spielersuche, Matchroom und Rangliste – damit du dich aufs Board konzentrieren kannst.</p><Link href="/getting-started">So funktioniert RankedDarts <ArrowUpRight size={16} /></Link></div>
        </div>
      </section>

      <section className="rd-arena-section">
        <div className="rd-section-heading">
          <div><p className="rd-kicker"><span>02 / MATCHROOM</span><i /> LIVE MATCH FLOW</p><h2>Jeder Wurf.<br /><em>Sauber erfasst.</em></h2></div>
          <p>Gegner gefunden, Match gespielt, Ergebnis bestätigt. Das System hält den Ablauf zusammen – du spielst einfach weiter.</p>
        </div>
        <div className="rd-bento">
          <article className="rd-bento-result">
            <div className="rd-bento-topline"><span><CircleDot size={13} /> RESULT ROOM / PREVIEW</span><span>01—03</span></div>
            <div className="rd-result-preview"><ResultRoomPreview onOpen={() => router.push('/matchmaking')} /></div>
            <div className="rd-bento-caption"><strong>Ein klarer Ablauf.</strong><span>Beide bestätigen. Ergebnis steht. Elo wird aktualisiert.</span></div>
          </article>
          <article className="rd-bento-target">
            <div className="rd-bento-topline"><span><Target size={13} /> MATCH QUALITY</span><span>02—03</span></div>
            <div className="rd-board-graphic" aria-hidden="true"><div className="rd-board-lines"><span /><span /><span /><span /><b /></div><div className="rd-board-cross rd-cross-one" /><div className="rd-board-cross rd-cross-two" /><div className="rd-board-label">20<br /><small>TRIPLE</small></div></div>
            <div className="rd-bento-caption"><strong>Fair auf Augenhöhe.</strong><span>Die Spielersuche orientiert sich an deinem Elo-Bereich.</span></div>
          </article>
          <article className="rd-bento-live">
            <div className="rd-live-orbit" aria-hidden="true"><span /><span /><span /></div>
            <div className="rd-bento-topline"><span><Radio size={13} /> COMMUNITY PULSE</span><span>LIVE</span></div>
            <strong className="rd-live-number">{liveCount === undefined ? '–' : liveCount}</strong>
            <span className="rd-live-title">{liveCount === undefined ? 'Live-Status lädt' : liveCount === 1 ? 'Match läuft gerade' : 'Matches laufen gerade'}</span>
            <p>Spieler sind gerade aktiv. Schau bei den Matches vorbei oder starte dein eigenes.</p>
            <Link href="/matchmaking">Zur Spielersuche <ArrowUpRight size={15} /></Link>
          </article>
          <article className="rd-bento-platforms">
            <div className="rd-bento-topline"><span><Gauge size={13} /> MADE FOR YOUR SETUP</span><span>03—03</span></div>
            <div className="rd-platform-list"><span>SCOLIA</span><i /><span>DARTCOUNTER</span><i /><span>AUTODARTS</span></div>
            <p>Dein Board bleibt deins. Verbinde dich mit Spielern, die genauso spielen wie du.</p>
          </article>
        </div>
      </section>

      <section className="rd-ways-section">
        <div className="rd-ways-heading"><div><p className="rd-kicker"><span>03 / CHOOSE YOUR ARENA</span><i /> THREE WAYS IN</p><h2>Worauf hast du<br /><em>heute Lust?</em></h2></div><span className="rd-ways-side-note">FIND YOUR<br />NEXT GAME <ArrowDownRight size={18} /></span></div>
        <div className="rd-mode-list">{modes.map(({ id, code, icon: Icon, title, detail, href, action, tone }) => {
          const status = id === 'ranked'
            ? queueCount === undefined ? 'RANKED QUEUE' : queueCount === 1 ? '1 SUCHT GERADE' : queueCount + ' SUCHEN GERADE'
            : id === 'tournaments'
              ? communityStats?.liveCups ? communityStats.liveCups + (communityStats.liveCups === 1 ? ' TURNIER LIVE' : ' TURNIERE LIVE') : 'BRACKETS & CUPS'
              : 'LIVE & OFFLINE';
          return <Link key={id} href={href} className={'rd-mode-row rd-tone-' + tone}>
            <span className="rd-mode-code">{code}</span><span className="rd-mode-icon"><Icon size={21} /></span>
            <span className="rd-mode-copy"><span className="rd-mode-status">{status}</span><strong>{title}</strong><small>{detail}</small></span>
            <span className="rd-mode-action">{action}<ArrowUpRight size={16} /></span>
          </Link>;
        })}</div>
        <div className="rd-premium-note"><span>RANKEDDARTS PREMIUM</span><p>Mehr Ranked-Matches ab <strong>4,99&nbsp;€</strong> im Monat.</p><Link href="/premium">Premium ansehen <ArrowUpRight size={14} /></Link></div>
      </section>

      <section className="rd-community">
        <div className="rd-community-visual" aria-hidden="true"><div className="rd-community-board"><span>RD</span></div><div className="rd-community-lines" /></div>
        <div className="rd-community-copy"><p className="rd-kicker"><span>04 / SEASON NEVER STOPS</span><i /> YOUR NEXT LEG STARTS HERE</p><h2>Spiel nicht<br />nur <em>für dich.</em></h2><p>Jede Partie bringt dich weiter. Klettere in der Rangliste, tritt in Turnieren an und werde Teil einer Community, die das Spiel ernst nimmt – und den Spaß nicht vergisst.</p><div className="rd-community-links"><Link href="/leaderboard">Rangliste öffnen <ArrowUpRight size={16} /></Link><Link href="/tournaments">Turniere entdecken <ArrowUpRight size={16} /></Link></div></div>
      </section>

      <section className="rd-final">
        <div className="rd-final-ring" aria-hidden="true" />
        <div className="rd-final-content"><p className="rd-kicker"><span>NO MORE PRACTICE MATCHES</span><i /> MAKE IT COUNT</p><h2>Dein nächstes<br /><em>Match wartet.</em></h2><button onClick={() => router.push(primaryTarget)} className="rd-button-primary">{primaryLabel}<ArrowUpRight size={17} /></button><span className="rd-final-note"><Zap size={14} /> Kostenlos starten. Am eigenen Board spielen.</span></div>
        <div className="rd-final-vertical">RANKEDDARTS / COMPETITIVE DARTS / 2026</div>
      </section>

      <footer className="rd-footer">
        <div className="rd-footer-main"><div><BrandLogo className="h-11 w-11 rounded-xl" /><span className="rd-brand-copy"><strong>RANKEDDARTS</strong><small>COMPETITIVE DARTS</small></span></div><span className="rd-footer-tagline">DEIN BOARD. DEIN GEGNER. DEIN RANG.</span><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="rd-footer-discord"><MessageCircle size={15} /> Community auf Discord <ArrowUpRight size={14} /></a></div>
        <div className="rd-footer-bottom"><span>© RankedDarts</span><div><Link href="/impressum">Impressum</Link><Link href="/datenschutz">Datenschutz</Link><Link href="/agb">AGB</Link><Link href="/fairplay">Fair Play</Link><Link href="/turnierregeln">Turnierregeln</Link><Link href="/premium">Premium</Link></div><span>BUILT FOR THE THROW</span></div>
      </footer>
      <div className="rd-mobile-dock"><button onClick={() => router.push(primaryTarget)}>{primaryLabel}<ArrowUpRight size={16} /></button></div>
    </main>
  );
}

