'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Menu, Search, Trophy, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { OPEN_PLAYER_SEARCH_EVENT } from '@/lib/player-search';
import { getRankForElo, RANK_TIERS } from '@/lib/ranks';

const DISCORD_INVITE_URL = 'https://discord.gg/5qwUZQxjfV';

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': 'https://www.rankeddarts.de/#website', url: 'https://www.rankeddarts.de/', name: 'RankedDarts', alternateName: 'RankedDarts', inLanguage: 'de-DE' },
    { '@type': 'Organization', '@id': 'https://www.rankeddarts.de/#organization', name: 'RankedDarts', url: 'https://www.rankeddarts.de/', logo: 'https://www.rankeddarts.de/rankeddarts-logo-mark.png', sameAs: [DISCORD_INVITE_URL] },
  ],
};

type WeeklyPlayer = {
  place: number;
  username: string;
  elo: number;
  weekly_elo: number;
  matches: number;
  average: number | null;
  platform: 'Scolia' | 'AutoDarts' | 'DartCounter' | '—';
};

type WeeklyLeaderboard = {
  season_label: string;
  players: WeeklyPlayer[];
};

function formatElo(value: number) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value);
}

function formatWeeklyElo(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(rounded)}`;
}

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [weeklyPlayers, setWeeklyPlayers] = useState<WeeklyPlayer[]>([]);
  const [weeklySeason, setWeeklySeason] = useState('');
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [weeklyUnavailable, setWeeklyUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setIsLoggedIn(Boolean(session));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function loadWeeklyLeaderboard() {
      try {
        const response = await fetch('/api/leaderboard/weekly');
        if (!response.ok) throw new Error('Weekly leaderboard request failed');
        const data = await response.json() as WeeklyLeaderboard;
        if (!active) return;
        setWeeklyPlayers(Array.isArray(data.players) ? data.players : []);
        setWeeklySeason(typeof data.season_label === 'string' ? data.season_label : '');
      } catch {
        if (active) setWeeklyUnavailable(true);
      } finally {
        if (active) setWeeklyLoading(false);
      }
    }
    void loadWeeklyLeaderboard();
    return () => { active = false; };
  }, []);

  const featuredPlayer = weeklyPlayers[0] ?? null;
  const featuredRank = featuredPlayer ? getRankForElo(featuredPlayer.elo) : null;
  const primaryTarget = isLoggedIn ? '/matchmaking' : '/auth/register';
  const primaryLabel = isLoggedIn ? 'Match finden' : 'Rangliste beitreten';

  return (
    <main className="rankeddarts-landing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <header className="rdh-header">
        <nav className="rdh-nav rdh-shell" aria-label="Hauptnavigation">
          <Link href="/" className="rdh-wordmark" aria-label="RankedDarts Startseite">
            <span className="rdh-wordmark-mark" aria-hidden="true">RD</span>
            <span><strong>RANKED DARTS</strong><small>COMPETITIVE PLAY</small></span>
          </Link>

          <div className="rdh-nav-links">
            <Link href="/matchmaking">Matchmaking</Link>
            <Link href="/tournaments">Turniere</Link>
            <a href="#hardware">Hardware-Sync</a>
            <Link href="/leaderboard">Leaderboard</Link>
          </div>

          <div className="rdh-nav-actions">
            <button type="button" className="rdh-search" onClick={() => window.dispatchEvent(new Event(OPEN_PLAYER_SEARCH_EVENT))} aria-label="Spieler suchen">
              <Search size={15} /><span>Suchen</span>
            </button>
            <button type="button" className="rdh-account" onClick={() => router.push(isLoggedIn ? '/profile' : '/auth/login')}>
              {isLoggedIn ? 'Konto öffnen' : 'Login'} <ArrowUpRight size={15} />
            </button>
            <button type="button" className="rdh-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? 'Menü schließen' : 'Menü öffnen'} aria-expanded={mobileMenuOpen}>
              {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </nav>

        {mobileMenuOpen && <div className="rdh-mobile-menu rdh-shell">
          <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)}>Matchmaking <ArrowUpRight size={15} /></Link>
          <Link href="/tournaments" onClick={() => setMobileMenuOpen(false)}>Turniere <ArrowUpRight size={15} /></Link>
          <a href="#hardware" onClick={() => setMobileMenuOpen(false)}>Hardware-Sync <ArrowDownRight size={15} /></a>
          <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)}>Leaderboard <ArrowUpRight size={15} /></Link>
          <button type="button" onClick={() => { setMobileMenuOpen(false); window.dispatchEvent(new Event(OPEN_PLAYER_SEARCH_EVENT)); }}><Search size={15} /> Spieler suchen</button>
          <button type="button" onClick={() => router.push(isLoggedIn ? '/profile' : '/auth/login')}>{isLoggedIn ? 'Konto öffnen' : 'Login'} <ArrowUpRight size={15} /></button>
        </div>}
      </header>

      <section className="rdh-hero rdh-shell">
        <div className="rdh-hero-copy">
          <p className="rdh-eyebrow"><span className="rdh-eyebrow-mark" /> SMART DARTS. ONE RANKED FIELD.</p>
          <h1>THE COMPETITIVE LAYER FOR SMART DARTS.</h1>
          <p className="rdh-hero-description">Spiel auf deinem Board – Scolia, AutoDarts oder DartCounter. RankedDarts bündelt deine Ranked-Matches, berechnet dein globales Elo und bringt dich in die Ranked-Saison und Community-Turniere.</p>
          <div className="rdh-hero-actions">
            <button type="button" className="rdh-button-primary" onClick={() => router.push(primaryTarget)}>{primaryLabel}<ArrowUpRight size={16} /></button>
            <a className="rdh-button-secondary" href="#hardware">Hardware ansehen <ArrowDownRight size={16} /></a>
          </div>
          <div className="rdh-hero-meta"><span>DEIN BOARD BLEIBT DEINS</span><span>RANGLISTE · MATCHMAKING · TURNIERE</span></div>
        </div>

        <aside className="rdh-player-card" aria-label="Spielerkarte aus der aktuellen Wochenrangliste">
          <div className="rdh-card-topline"><span>WÖCHENTLICHER TOP-PLAYER</span><span>{weeklySeason || 'RANKED'}</span></div>
          {featuredPlayer ? <>
            <div className="rdh-player-identity">
              <span className="rdh-player-avatar" aria-hidden="true">{featuredPlayer.username.trim().charAt(0).toUpperCase()}</span>
              <span className="rdh-player-name"><strong>{featuredPlayer.username}</strong><small>{featuredRank?.name ?? 'Ranked-Spieler'}</small></span>
              <span className="rdh-rank-mark">{featuredRank?.badge}</span>
            </div>
            <div className="rdh-player-elo"><span>GLOBAL ELO</span><strong>{formatElo(featuredPlayer.elo)}</strong><span className="rdh-elo-change">{formatWeeklyElo(featuredPlayer.weekly_elo)} / 7 TAGE</span></div>
            <div className="rdh-player-stats">
              <div><span>3-DART-AVG</span><strong>{featuredPlayer.average === null ? '—' : featuredPlayer.average.toFixed(2)}</strong></div>
              <div><span>HARDWARE</span><strong>{featuredPlayer.platform}</strong></div>
              <div><span>RANKED-MATCHES</span><strong>{featuredPlayer.matches}</strong></div>
            </div>
            <div className="rdh-player-card-footer"><span className="rdh-live-indicator"><i /> LIVE RANGLISTEN-DATEN</span><Link href={`/players/${encodeURIComponent(featuredPlayer.username)}`}>Profil öffnen <ArrowUpRight size={14} /></Link></div>
          </> : <div className="rdh-player-empty">
            <span className="rdh-player-avatar rdh-avatar-placeholder" aria-hidden="true">RD</span>
            <strong>{weeklyLoading ? 'Wochenrangliste lädt' : weeklyUnavailable ? 'Daten gerade nicht verfügbar' : 'Noch keine qualifizierte Wochenpartie'}</strong>
            <p>{weeklyLoading ? 'Die öffentlichen Ranked-Daten werden abgerufen.' : 'Sobald öffentliche Ranked-Spieler Matches in den letzten sieben Tagen gespielt haben, erscheint hier die aktuelle Spitzenleistung.'}</p>
            <div className="rdh-empty-values"><span>ELO <b>—</b></span><span>3-DART-AVG <b>—</b></span></div>
          </div>}
        </aside>
      </section>

      <section className="rdh-integrations" id="hardware" aria-labelledby="rdh-integrations-heading">
        <div className="rdh-shell rdh-integrations-inner">
          <p id="rdh-integrations-heading">PASST ZU DEINEM SETUP</p>
          <div className="rdh-platforms" aria-label="Unterstützte Dart-Plattformen">
            <span>SCOLIA</span><span>AUTODARTS</span><span>DARTCOUNTER</span><span>TARGET OMNI <small>ÜBER DARTCOUNTER</small></span>
          </div>
        </div>
      </section>

      <section className="rdh-features rdh-shell" aria-labelledby="rdh-features-heading">
        <div className="rdh-section-heading">
          <div><p className="rdh-section-index">01 / DAS RANKED-SYSTEM</p><h2 id="rdh-features-heading">Dein Spiel. Ein klares Ranking.</h2></div>
          <p>Ein gemeinsamer Wettbewerb für Smart-Darts-Spieler – mit nachvollziehbarer Wertung, echten Statistiken und regelmäßigen Turnieren.</p>
        </div>

        <div className="rdh-bento-grid">
          <article className="rdh-feature rdh-feature-ranks">
            <div className="rdh-feature-label"><span>01</span><span>ELO & RÄNGE</span></div>
            <h3>Spiel dich nach oben.</h3>
            <p>Dein Elo zeigt, wo du im Ranked-Feld stehst. Jede bestätigte Ranked-Partie fließt in deine Wertung ein.</p>
            <div className="rdh-rank-ladder" aria-label="Alle RankedDarts-Ränge">
              {RANK_TIERS.map((rank) => <span key={rank.badge} className={featuredRank?.badge === rank.badge ? 'is-current' : ''}>{rank.name}</span>)}
            </div>
            <Link href="/leaderboard" className="rdh-feature-link">Rangliste ansehen <ArrowRight size={15} /></Link>
          </article>

          <article className="rdh-feature rdh-feature-flow">
            <div className="rdh-feature-label"><span>02</span><span>KLARE MATCHWERTUNG</span></div>
            <h3>Du spielst. Das Ergebnis zählt.</h3>
            <p>Im Result Room werden Score und Statistiken eingetragen. Nach der Bestätigung wird das Match gewertet und dein Elo aktualisiert.</p>
            <div className="rdh-match-flow" aria-label="Ablauf der Matchwertung">
              <span><i>01</i> MATCH</span><b />
              <span><i>02</i> ERGEBNIS</span><b />
              <span><i>03</i> ELO</span>
            </div>
            <Link href="/getting-started" className="rdh-feature-link">Ablauf kennenlernen <ArrowRight size={15} /></Link>
          </article>

          <article className="rdh-feature rdh-feature-tournaments">
            <div className="rdh-feature-label"><span>03</span><span>TURNIERE</span></div>
            <Trophy size={22} strokeWidth={1.5} className="rdh-feature-icon" aria-hidden="true" />
            <h3>Mehr als die Rangliste.</h3>
            <p>Spiele Community-Turniere, verfolge Brackets live und tritt saisonübergreifend gegen neue Gegner an.</p>
            <Link href="/tournaments" className="rdh-feature-link">Turniere entdecken <ArrowRight size={15} /></Link>
          </article>
        </div>
      </section>

      <section className="rdh-weekly" aria-labelledby="rdh-weekly-heading">
        <div className="rdh-shell">
          <div className="rdh-section-heading rdh-weekly-heading">
            <div><p className="rdh-section-index">02 / FORM DER LETZTEN 7 TAGE</p><h2 id="rdh-weekly-heading">Die Woche im Ranked.</h2></div>
            <Link href="/leaderboard" className="rdh-all-ranks">Gesamtes Leaderboard <ArrowUpRight size={15} /></Link>
          </div>

          <div className="rdh-table-wrap">
            <table className="rdh-leaderboard">
              <thead><tr><th scope="col">#</th><th scope="col">SPIELER</th><th scope="col">PLATTFORM</th><th scope="col">3-DART-AVG</th><th scope="col">ELO</th><th scope="col">7-TAGE-VERÄNDERUNG</th></tr></thead>
              <tbody>
                {weeklyLoading && <tr className="rdh-message-row"><td colSpan={6} className="rdh-table-message">Öffentliche Wochenrangliste wird geladen …</td></tr>}
                {!weeklyLoading && weeklyUnavailable && <tr className="rdh-message-row"><td colSpan={6} className="rdh-table-message">Die Wochenrangliste ist gerade nicht erreichbar. Bitte später erneut versuchen.</td></tr>}
                {!weeklyLoading && !weeklyUnavailable && weeklyPlayers.length === 0 && <tr className="rdh-message-row"><td colSpan={6} className="rdh-table-message">Diese Woche gibt es noch keine qualifizierten Ranked-Matches für die öffentliche Wochenübersicht.</td></tr>}
                {!weeklyLoading && !weeklyUnavailable && weeklyPlayers.map((player) => <tr key={player.username}>
                  <td className="rdh-place">{String(player.place).padStart(2, '0')}</td>
                  <td><Link className="rdh-table-player" href={`/players/${encodeURIComponent(player.username)}`}><span className="rdh-table-avatar">{player.username.trim().charAt(0).toUpperCase()}</span>{player.username}</Link></td>
                  <td className="rdh-platform-value">{player.platform}</td>
                  <td className="rdh-number">{player.average === null ? '—' : player.average.toFixed(2)}</td>
                  <td className="rdh-number rdh-current-elo">{formatElo(player.elo)}</td>
                  <td><span className={'rdh-trend ' + (player.weekly_elo > 0 ? 'is-positive' : '')}>{player.weekly_elo > 0 ? <ArrowUpRight size={15} /> : player.weekly_elo < 0 ? <ArrowDownRight size={15} /> : <span aria-hidden="true">—</span>}{formatWeeklyElo(player.weekly_elo)}</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="rdh-table-note"><Check size={13} /> Nur öffentliche Profile mit mindestens 10 Spielen in der aktuellen Season. Private Duelle zählen nicht in diese Übersicht.</p>
        </div>
      </section>

      <section className="rdh-close rdh-shell">
        <div><p className="rdh-section-index">DEIN BOARD. DEIN MATCH. DEIN RANG.</p><h2>Spiel dein nächstes Ranked.</h2></div>
        <button type="button" className="rdh-button-primary" onClick={() => router.push(primaryTarget)}>{primaryLabel}<ArrowUpRight size={16} /></button>
      </section>

      <footer className="rdh-footer">
        <div className="rdh-shell rdh-footer-inner">
          <Link href="/" className="rdh-wordmark"><span className="rdh-wordmark-mark" aria-hidden="true">RD</span><span><strong>RANKED DARTS</strong><small>COMPETITIVE PLAY</small></span></Link>
          <div className="rdh-footer-links"><Link href="/impressum">Impressum</Link><Link href="/datenschutz">Datenschutz</Link><Link href="/agb">AGB</Link><Link href="/fairplay">Fair Play</Link><Link href="/turnierregeln">Turnierregeln</Link><Link href="/premium">Premium</Link></div>
          <a className="rdh-discord" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Discord-Community <ArrowUpRight size={14} /></a>
          <span className="rdh-copyright">© RANKEDDARTS.DE</span>
        </div>
      </footer>
    </main>
  );
}
