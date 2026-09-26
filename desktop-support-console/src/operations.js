// The Operations module deliberately talks only to existing, RLS-protected RPCs.
// It never contains a service-role key and therefore cannot grant rights on its own.

export const emptyOperationsState = () => ({
  loading: false,
  error: null,
  overview: null,
  cases: [],
  notices: [],
  payouts: [],
  tournaments: [],
  riskFlags: [],
  playerQuery: '',
  playerResults: [],
  selectedPlayer: null,
  lastLoadedAt: null,
});

export async function loadOperations({ rpc }) {
  const results = await Promise.allSettled([
    rpc('admin_get_operations_workspace'),
    rpc('admin_list_cases', { p_status: null }),
    rpc('admin_list_site_notices'),
    rpc('admin_list_payouts', { p_status: null }),
    rpc('list_tournaments'),
    rpc('admin_get_fairness_risk_flags', { p_limit: 25 }),
  ]);

  const value = (index, fallback) => results[index].status === 'fulfilled' ? (results[index].value || fallback) : fallback;
  const failures = results.filter((result) => result.status === 'rejected');
  return {
    overview: value(0, null),
    cases: value(1, []),
    notices: value(2, []),
    payouts: value(3, []),
    tournaments: value(4, []),
    riskFlags: value(5, []),
    partialError: failures.length ? 'Ein Teil der Operations-Daten konnte nicht geladen werden. Deine Rechte oder die Verbindung bitte prüfen.' : null,
    lastLoadedAt: new Date().toISOString(),
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return new Intl.NumberFormat('de-DE').format(value);
  return String(value);
}

function date(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

export function renderOperationsWorkspace(operations) {
  if (operations.loading) return '<div class="ops-loading"><span></span><p>Operations-Daten werden geladen …</p></div>';
  const overview = operations.overview || {};
  const queue = overview.queue || overview.matchmaking || {};
  const activeCases = countByStatus(operations.cases, 'open') + countByStatus(operations.cases, 'in_progress');
  const upcoming = operations.tournaments.filter((tournament) => ['registration', 'check_in', 'upcoming'].includes(tournament.status)).length;

  return `
    <div class="ops-workspace">
      <section class="ops-hero">
        <div><p class="eyebrow">RANKEDDARTS · OPERATIONS</p><h1>Kontrollraum, nicht Kästchenwand.</h1><p>Spielbetrieb, Fairplay und Kommunikation an einem Ort – mit den bestehenden, serverseitig geprüften Rechten.</p></div>
        <div class="ops-hero-actions"><button id="ops-refresh" class="ops-action">Aktualisieren</button><span>${operations.lastLoadedAt ? `Stand ${date(operations.lastLoadedAt)}` : 'Noch nicht geladen'}</span></div>
      </section>
      ${operations.error || operations.partialError ? `<p class="ops-error">${escapeHtml(operations.error || operations.partialError)}</p>` : ''}

      <section class="ops-pulse" aria-label="Betriebsstatus">
        <article><span>OFFENE FÄLLE</span><strong>${fmt(activeCases)}</strong><small>${fmt(operations.cases.length)} dokumentiert</small></article>
        <article><span>FAIRPLAY-PRÜFUNG</span><strong>${fmt(operations.riskFlags.length)}</strong><small>aktuelle Hinweise</small></article>
        <article><span>TURNIERE</span><strong>${fmt(upcoming)}</strong><small>in Anmeldung / Check-in</small></article>
        <article><span>QUEUE</span><strong>${fmt(queue.players_in_queue ?? queue.count ?? overview.players_in_queue)}</strong><small>Spieler gerade suchend</small></article>
      </section>

      <div class="ops-columns">
        <section class="ops-stream">
          <header><div><p class="eyebrow">ARBEITSVORRAT</p><h2>Was jetzt Aufmerksamkeit braucht</h2></div><span>${fmt(activeCases)} offen</span></header>
          <div class="ops-list">${operations.cases.length ? operations.cases.slice(0, 7).map((item) => `<article class="ops-row"><div><strong>${escapeHtml(item.title || item.subject || 'Ohne Titel')}</strong><p>${escapeHtml(item.description || item.category || 'Operations-Fall')} · ${date(item.updated_at || item.created_at)}</p></div><em class="ops-status ${escapeHtml(item.status || 'open')}">${escapeHtml(item.status || 'offen')}</em></article>`).join('') : '<p class="ops-empty">Keine offenen Operations-Fälle. Sehr gut.</p>'}</div>
        </section>
        <aside class="ops-side">
          <section class="ops-panel">
            <p class="eyebrow">SPIELERSUCHE</p><h2>Spieler prüfen</h2>
            <form id="ops-player-search" class="ops-search"><input id="ops-player-query" value="${escapeHtml(operations.playerQuery)}" maxlength="64" placeholder="Benutzername eingeben …" autocomplete="off"><button type="submit">Suchen</button></form>
            <div class="ops-search-results">${operations.playerResults.length ? operations.playerResults.map((player) => `<button data-ops-player="${escapeHtml(player.id)}"><strong>${escapeHtml(player.username || 'Unbekannt')}</strong><span>${fmt(player.elo)} Elo</span></button>`).join('') : '<p>Suche nach einem Nutzer, um Profil, Match-Historie und Fairplay-Kontext zu öffnen.</p>'}</div>
            ${operations.selectedPlayer ? `<div class="ops-player-card"><strong>${escapeHtml(operations.selectedPlayer.username || operations.selectedPlayer.profile?.username || 'Spieler')}</strong><span>${fmt(operations.selectedPlayer.elo || operations.selectedPlayer.profile?.elo)} Elo · ${fmt(operations.selectedPlayer.games_played || operations.selectedPlayer.profile?.games_played)} Spiele</span><p>${escapeHtml(operations.selectedPlayer.summary || 'Spieler-360 geladen. Vollständiger Kontext bleibt über die serverseitige Prüfung geschützt.')}</p></div>` : ''}
          </section>
          <section class="ops-panel ops-mini-list"><p class="eyebrow">AUSZAHLUNGEN</p><h2>Zu prüfen</h2>${operations.payouts.length ? operations.payouts.slice(0, 4).map((payout) => `<div><strong>${escapeHtml(payout.username || payout.recipient_username || 'Empfänger')}</strong><span>${escapeHtml(payout.status || 'offen')} · ${fmt(payout.amount)} €</span></div>`).join('') : '<p>Keine Auszahlungsvorgänge geladen.</p>'}</section>
        </aside>
      </div>
      <section class="ops-bottom-grid">
        <article><p class="eyebrow">FAIRPLAY-SIGNAL</p><h2>Interne Hinweise</h2>${operations.riskFlags.length ? operations.riskFlags.slice(0, 4).map((flag) => `<p class="ops-line"><strong>${escapeHtml(flag.username || flag.player_username || 'Spieler')}</strong><span>${escapeHtml(flag.reason || flag.flag_type || 'Hinweis')}</span></p>`).join('') : '<p class="ops-empty">Keine aktuellen Fairplay-Hinweise.</p>'}</article>
        <article><p class="eyebrow">SITE-HINWEISE</p><h2>Aktive Kommunikation</h2>${operations.notices.length ? operations.notices.slice(0, 4).map((notice) => `<p class="ops-line"><strong>${escapeHtml(notice.title || 'Hinweis')}</strong><span>${escapeHtml(notice.status || 'aktiv')}</span></p>`).join('') : '<p class="ops-empty">Keine aktiven Hinweise.</p>'}</article>
        <article><p class="eyebrow">TURNIERKALENDER</p><h2>Nächste Formate</h2>${operations.tournaments.length ? operations.tournaments.slice(0, 4).map((tournament) => `<p class="ops-line"><strong>${escapeHtml(tournament.name || 'Turnier')}</strong><span>${date(tournament.start_time || tournament.starts_at || tournament.registration_deadline)}</span></p>`).join('') : '<p class="ops-empty">Keine Turniere geladen.</p>'}</article>
      </section>
    </div>`;
}
