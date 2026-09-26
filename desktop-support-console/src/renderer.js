import { emptyOperationsState, loadOperations, renderOperationsWorkspace } from './operations.js';

const app = document.querySelector('#app');
const config = window.RANKEDDARTS_SUPPORT_CONFIG;

const state = {
  session: readSession(),
  user: null,
  agent: null,
  conversations: [],
  selectedConversationId: null,
  messages: [],
  context: null,
  notes: [],
  agents: [],
  filter: 'all',
  loading: false,
  error: null,
  lastWaitingIds: null,
  pollingId: null,
  messagePollingId: null,
  view: 'support',
  operations: emptyOperationsState(),
};

function readSession() {
  try { return JSON.parse(localStorage.getItem('rankeddarts.support.session') || 'null'); } catch { return null; }
}

function saveSession(session) {
  state.session = session;
  if (session) localStorage.setItem('rankeddarts.support.session', JSON.stringify(session));
  else localStorage.removeItem('rankeddarts.support.session');
}

function hasValidConfig() {
  return Boolean(config?.supabaseUrl && config?.supabasePublishableKey && !config.supabaseUrl.includes('your-project'));
}

function apiUrl(path) {
  return `${config.supabaseUrl.replace(/\/$/, '')}${path}`;
}

async function request(path, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  headers.set('apikey', config.supabasePublishableKey);
  headers.set('Content-Type', 'application/json');
  if (state.session?.access_token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${state.session.access_token}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Die Verbindung zum Support-Dienst dauert zu lange. Bitte versuche es erneut.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401 && retry && state.session?.refresh_token) {
    await refreshSession();
    return request(path, options, false);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || 'Die Anfrage konnte nicht verarbeitet werden.');
  return payload;
}

async function refreshSession() {
  const refreshToken = state.session?.refresh_token;
  if (!refreshToken) throw new Error('Deine Sitzung ist abgelaufen.');
  const payload = await request('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.supabasePublishableKey}` },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, false);
  saveSession(payload);
}

async function rpc(name, args = {}) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
}

function humanizeError(error, fallback) {
  const message = error?.message || '';
  if (message.includes('LIVE_SUPPORT_CANNOT_ACCEPT_OWN_REQUEST') || message.includes('live_support_conversations_distinct_users')) {
    return 'Du kannst deine eigene Support-Anfrage nicht übernehmen. Teste den Ablauf mit einem zweiten Benutzerkonto.';
  }
  return message || fallback;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatWhen(value) {
  if (!value) return 'gerade eben';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'gerade eben';
  if (minutes === 1) return 'vor 1 Minute';
  if (minutes < 60) return `vor ${minutes} Minuten`;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function selectedConversation() {
  return state.conversations.find((conversation) => conversation.conversation_id === state.selectedConversationId) || null;
}

function filteredConversations() {
  if (state.filter === 'waiting') return state.conversations.filter((conversation) => conversation.status === 'waiting');
  if (state.filter === 'active') return state.conversations.filter((conversation) => conversation.status === 'active');
  return state.conversations;
}

function render() {
  if (!hasValidConfig()) return renderConfigurationRequired();
  if (!state.session?.access_token) return renderLogin();
  if (!state.user) return renderLoading('Dein sicherer Support-Arbeitsplatz wird vorbereitet …');
  return renderConsole();
}

function renderConfigurationRequired() {
  app.innerHTML = `
    <section class="setup-screen">
      <div class="brand-lockup"><span class="brand-mark">R</span><div><strong>RANKEDDARTS</strong><small>SUPPORT CONSOLE</small></div></div>
      <div class="setup-copy"><p class="eyebrow">ERSTE EINRICHTUNG</p><h1>Die Verbindung fehlt noch.</h1><p>Lege neben <code>index.html</code> eine Datei <code>runtime-config.js</code> an und übernimm die Vorlage aus <code>runtime-config.example.js</code>.</p><p>Benötigt werden nur die öffentliche Supabase-URL und der veröffentlichbare Schlüssel. Ein Service-Role-Key gehört niemals in diese App.</p></div>
    </section>`;
}

function renderLoading(message) {
  app.innerHTML = `<section class="loading-screen"><div class="brand-lockup"><span class="brand-mark">R</span><div><strong>RANKEDDARTS</strong><small>SUPPORT CONSOLE</small></div></div><div class="loading-orbit"></div><p>${escapeHtml(message)}</p></section>`;
}

function renderLogin() {
  app.innerHTML = `
    <section class="login-layout">
      <div class="login-side"><div class="brand-lockup"><span class="brand-mark">R</span><div><strong>RANKEDDARTS</strong><small>SUPPORT CONSOLE</small></div></div><div class="login-promise"><p class="eyebrow">LIVE SUPPORT DESK</p><h1>Konzentriert helfen.<br><em>Ohne Browser-Chaos.</em></h1><p>Die Console zeigt nur Support-Fälle, die du übernehmen darfst – direkt verbunden mit dem Live-Chat von RankedDarts.</p><ul><li>Desktop-Hinweise bei neuen Anfragen</li><li>Bleibt im Hintergrund erreichbar</li><li>Gleiche sichere Rechte wie auf der Website</li></ul></div><p class="login-note">Nur für autorisierte RankedDarts-Teammitglieder.</p></div>
      <form class="login-card" id="login-form"><p class="eyebrow">ANMELDUNG</p><h2>Willkommen zurück.</h2><p class="muted">Melde dich mit deinem normalen RankedDarts-Konto an.</p><label>E-Mail<input id="email" type="email" autocomplete="email" required placeholder="name@beispiel.de"></label><label>Passwort<input id="password" type="password" autocomplete="current-password" required placeholder="••••••••"></label><p id="login-error" class="form-error"${state.error ? '' : ' hidden'}>${state.error ? escapeHtml(state.error) : ''}</p><button class="primary-button" type="submit">Support Console öffnen <span>↗</span></button><p class="form-footnote">Deine Zugangsdaten werden nur direkt bei Supabase geprüft.</p></form>
    </section>`;
  document.querySelector('#login-form').addEventListener('submit', login);
}

function renderConsole() {
  if (state.view === 'operations') return renderOperationsConsole();
  const waiting = state.conversations.filter((conversation) => conversation.status === 'waiting');
  const active = state.conversations.filter((conversation) => conversation.status === 'active');
  const visible = filteredConversations();
  const selected = selectedConversation();
  const isAvailable = Boolean(state.agent?.is_available);
  const agentName = state.user?.user_metadata?.username || state.user?.email?.split('@')[0] || 'Support';

  app.innerHTML = `
    <section class="console-shell">
      <aside class="rail">
        <div class="rail-brand"><span class="brand-mark">R</span><span class="rail-wordmark">RD</span></div>
        <nav aria-label="Arbeitsbereiche"><button id="open-support" class="rail-button active" title="Live Support">◌</button><button id="open-operations" class="rail-button" title="Operations Console">⌘</button></nav>
        <div class="rail-bottom"><button id="hide-app" class="rail-button" title="In den Hintergrund">−</button><button id="sign-out" class="rail-button" title="Abmelden">⇥</button></div>
      </aside>
      <section class="workspace">
        <header class="topbar">
          <div><p class="eyebrow">SUPPORT · LIVE DESK</p><h1>Guten Tag, ${escapeHtml(agentName)}.</h1></div>
          <div class="availability"><div><span class="presence ${isAvailable ? 'online' : ''}"></span><strong>${isAvailable ? 'Bereit für neue Chats' : 'Nicht verfügbar'}</strong><small>${state.agent?.agents_online ?? 0} Teammitglieder online</small></div><button id="availability-toggle" class="availability-toggle ${isAvailable ? 'online' : ''}">${isAvailable ? 'Support pausieren' : 'Für Support anmelden'}</button></div>
        </header>
        ${state.error ? `<p class="inline-error">${escapeHtml(state.error)}</p>` : ''}
        <div class="desk-layout ${selected ? 'has-inspector' : ''}">
          <aside class="inbox-panel">
            <div class="inbox-head"><div><p class="eyebrow">EINGANG</p><h2>Deine Gespräche</h2></div><span class="inbox-count">${state.conversations.length}</span></div>
            <div class="inbox-tabs"><button data-filter="all" class="${state.filter === 'all' ? 'active' : ''}">Alle <span>${state.conversations.length}</span></button><button data-filter="waiting" class="${state.filter === 'waiting' ? 'active' : ''}">Wartend <span>${waiting.length}</span></button><button data-filter="active" class="${state.filter === 'active' ? 'active' : ''}">Aktiv <span>${active.length}</span></button></div>
            <div class="conversation-list">${visible.length ? visible.map(renderConversationRow).join('') : `<div class="inbox-empty">${state.filter === 'waiting' ? 'Keine offene Anfrage.' : 'Hier ist gerade alles ruhig.'}</div>`}</div>
            <footer class="inbox-footer"><span class="pulse-dot ${waiting.length ? 'urgent' : ''}"></span>${waiting.length ? `${waiting.length} warten auf Hilfe` : 'Kein Spieler wartet gerade'}</footer>
          </aside>
          <section class="conversation-stage">${selected ? renderConversation(selected) : renderNoConversation(waiting)}</section>
          ${selected ? renderInspector(selected) : ''}
        </div>
      </section>
    </section>`;

  bindConsoleEvents();
}

function renderConversationRow(conversation) {
  const isWaiting = conversation.status === 'waiting';
  const selected = conversation.conversation_id === state.selectedConversationId;
  return `<button class="conversation-row ${selected ? 'selected' : ''} ${isWaiting ? 'waiting' : ''}" data-open-conversation="${conversation.conversation_id}">
    <span class="avatar">${escapeHtml(conversation.requester_username.slice(0, 1).toUpperCase())}</span>
    <span class="conversation-copy"><span class="conversation-title"><strong>${escapeHtml(conversation.requester_username)}</strong>${isWaiting ? '<em>Neu</em>' : '<i></i>'}</span><span>${escapeHtml(isWaiting ? 'Wartet auf Übernahme' : (conversation.last_message || 'Live-Unterhaltung aktiv'))}</span></span>
    <time>${formatWhen(conversation.last_message_at || conversation.created_at)}</time>
  </button>`;
}

function renderNoConversation(waiting) {
  return `<div class="empty-stage"><div class="empty-art"><span></span><span></span><span></span></div><p class="eyebrow">SUPPORT DESK</p><h2>${waiting.length ? 'Eine Anfrage braucht dich.' : 'Alles unter Kontrolle.'}</h2><p>${waiting.length ? 'Wähle links eine wartende Anfrage und übernimm sie. Das Gespräch öffnet sich sofort in diesem Bereich.' : 'Sobald ein Spieler den Live-Support öffnet, erscheint die Anfrage hier. Du bekommst zusätzlich eine Desktop-Benachrichtigung.'}</p>${waiting.length ? `<button class="primary-button" data-open-conversation="${waiting[0].conversation_id}">Anfrage ansehen <span>↗</span></button>` : ''}</div>`;
}

function renderConversation(conversation) {
  const waiting = conversation.status === 'waiting';
  const messageMarkup = state.messages.length ? state.messages.map((message) => {
    const mine = message.sender_role === 'agent';
    return `<article class="message ${mine ? 'mine' : ''}"><div class="message-meta"><strong>${mine ? 'Du · Support' : escapeHtml(message.sender_name || conversation.requester_username)}</strong><time>${formatTime(message.created_at)}</time></div><p>${escapeHtml(message.content).replace(/\n/g, '<br>')}</p></article>`;
  }).join('') : `<div class="no-messages">Noch keine Nachricht – beginne das Gespräch, wenn du bereit bist.</div>`;
  return `<div class="conversation-view">
    <header class="conversation-header"><div class="customer-heading"><span class="customer-avatar">${escapeHtml(conversation.requester_username.slice(0, 1).toUpperCase())}</span><div><p class="eyebrow">${waiting ? 'NEUE SUPPORT-ANFRAGE' : 'LIVE-UNTERHALTUNG'}</p><h2>${escapeHtml(conversation.requester_username)}</h2><p>${waiting ? `Wartet seit ${formatWhen(conversation.created_at)}` : `Übernommen ${formatWhen(conversation.accepted_at)}`}</p></div></div><div class="conversation-actions">${waiting ? `<button class="primary-button" id="accept-conversation">Übernehmen <span>↗</span></button>` : `<><a href="https://www.rankeddarts.de/profile/${encodeURIComponent(conversation.requester_username)}" target="_blank" class="quiet-button">Profil öffnen</a><button id="close-conversation" class="danger-button">Chat schließen</button></>`}</div></header>
    ${waiting ? `<div class="waiting-view"><div><p class="eyebrow">BEREIT ZUR ÜBERNAHME</p><h3>Der Spieler sieht dich erst,<br>wenn du den Chat annimmst.</h3><p>Übernimm das Gespräch, um direkt als Support erreichbar zu sein. Es wird nicht automatisch geschlossen.</p></div></div>` : `<div id="messages" class="messages">${messageMarkup}</div><div class="reply-bar"><button data-reply="Hallo! Ich schaue mir das direkt an.">Begrüßung</button><button data-reply="Danke für die Infos. Gib mir bitte kurz einen Moment.">Prüfe es</button><button data-reply="Ist erledigt. Falls noch etwas offen ist, melde dich gern erneut.">Abschluss</button></div><form id="message-form" class="composer"><textarea id="message-input" rows="1" maxlength="1500" placeholder="Antwort schreiben …"></textarea><button class="send-button" type="submit" title="Nachricht senden">↗</button><small><kbd>Enter</kbd> senden · <kbd>Shift + Enter</kbd> neue Zeile</small></form>`}
  </div>`;
}

function renderInspector(conversation) {
  const player = state.context?.player;
  const support = state.context?.support || {};
  const notes = state.notes || [];
  const agents = (state.agents || []).filter((agent) => agent.user_id !== state.user?.id && agent.is_available);
  const category = support.category || 'general';
  const priority = support.priority || 'normal';
  const tags = Array.isArray(support.tags) ? support.tags.join(', ') : '';
  const selectedOption = (value, current) => value === current ? ' selected' : '';
  return `<aside class="inspector"><div class="inspector-head"><p class="eyebrow">SUPPORT-KONTEXT</p><h2>${escapeHtml(player?.username || conversation.requester_username)}</h2></div>
    <section class="inspector-block"><div class="player-stats"><span><strong>${player?.elo ?? '—'}</strong>Elo</span><span><strong>${player?.games_played ?? '—'}</strong>Spiele</span><span><strong>${player?.premium ? 'Ja' : 'Nein'}</strong>Premium</span></div><p class="inspector-muted">${player?.banned ? 'Account ist gesperrt.' : `${state.context?.previous_support_cases ?? 0} frühere Support-Fälle`}</p></section>
    <section class="inspector-block"><label>Kategorie<select id="desk-category"><option value="general"${selectedOption('general', category)}>Allgemein</option><option value="match"${selectedOption('match', category)}>Match</option><option value="tournament"${selectedOption('tournament', category)}>Turnier</option><option value="account"${selectedOption('account', category)}>Konto</option><option value="payment"${selectedOption('payment', category)}>Zahlung</option><option value="technical"${selectedOption('technical', category)}>Technik</option><option value="fairplay"${selectedOption('fairplay', category)}>Fairplay</option><option value="other"${selectedOption('other', category)}>Sonstiges</option></select></label><label>Priorität<select id="desk-priority"><option value="low"${selectedOption('low', priority)}>Niedrig</option><option value="normal"${selectedOption('normal', priority)}>Normal</option><option value="high"${selectedOption('high', priority)}>Hoch</option><option value="urgent"${selectedOption('urgent', priority)}>Dringend</option></select></label><label>Tags<input id="desk-tags" maxlength="180" value="${escapeHtml(tags)}" placeholder="z. B. login, scolia" /></label><button id="save-metadata" class="inspector-button">Einordnung speichern</button></section>
    <section class="inspector-block"><p class="inspector-title">INTERNE NOTIZEN</p><div class="note-list">${notes.length ? notes.map((note) => `<article><strong>${escapeHtml(note.author_username)}</strong><p>${escapeHtml(note.content)}</p></article>`).join('') : '<p class="inspector-muted">Noch keine interne Notiz.</p>'}</div><form id="note-form"><textarea id="note-input" maxlength="2000" placeholder="Nur fürs Team …"></textarea><button class="inspector-button" type="submit">Notiz speichern</button></form></section>
    ${conversation.status === 'active' ? `<section class="inspector-block"><p class="inspector-title">ÜBERGABE</p><select id="transfer-agent"><option value="">Supporter auswählen …</option>${agents.map((agent) => `<option value="${agent.user_id}">${escapeHtml(agent.username)}</option>`).join('')}</select><button id="transfer-conversation" class="inspector-button">Chat übergeben</button></section>` : ''}
  </aside>`;
}

function sessionAssuranceLevel() {
  const token = state.session?.access_token;
  if (!token) return 'aal1';
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).aal || 'aal1';
  } catch {
    return 'aal1';
  }
}

function renderOperationsConsole() {
  const agentName = state.user?.user_metadata?.username || state.user?.email?.split('@')[0] || 'Operations';
  const requiresMfa = state.operations.mfaRequired;
  app.innerHTML = `
    <section class="console-shell operations-shell">
      <aside class="rail">
        <div class="rail-brand"><span class="brand-mark">R</span><span class="rail-wordmark">RD</span></div>
        <nav aria-label="Arbeitsbereiche"><button id="open-support" class="rail-button" title="Live Support">◌</button><button id="open-operations" class="rail-button active" title="Operations Console">⌘</button></nav>
        <div class="rail-bottom"><button id="hide-app" class="rail-button" title="In den Hintergrund">−</button><button id="sign-out" class="rail-button" title="Abmelden">⇥</button></div>
      </aside>
      <section class="workspace ops-root">
        <header class="ops-topbar"><div><p class="eyebrow">DESKTOP OPERATIONS CONSOLE</p><h1>Hallo, ${escapeHtml(agentName)}.</h1></div><div><span class="ops-secure-dot"></span>Serverseitig geprüft · ${sessionAssuranceLevel().toUpperCase()}</div></header>
        ${requiresMfa ? renderOperationsMfa() : renderOperationsWorkspace(state.operations)}
      </section>
    </section>`;
  bindOperationsEvents();
}

function renderOperationsMfa() {
  return `<section class="ops-mfa"><div class="ops-mfa-symbol">⇢</div><p class="eyebrow">ZUSÄTZLICHE ABSICHERUNG</p><h2>Operations braucht MFA.</h2><p>Live Support bleibt verfügbar. Für Spieler-, Zahlungs- und Turnierverwaltung wird deine bestehende RankedDarts-Mehrfachauthentifizierung verlangt.</p><form id="ops-mfa-form"><label>Code aus deiner Authenticator-App<input id="ops-mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]*" placeholder="000000" required></label><p class="form-error" id="ops-mfa-error" hidden></p><button class="primary-button" type="submit">MFA bestätigen <span>↗</span></button></form><button id="ops-back-to-support" class="ops-text-button">Zurück zum Live Support</button></section>`;
}

async function isCurrentUserAdmin() {
  const userId = encodeURIComponent(state.user?.id || '');
  if (!userId) return false;
  const profiles = await request(`/rest/v1/profiles?select=is_admin&supabaseId=eq.${userId}&limit=1`);
  return Boolean(profiles?.[0]?.is_admin);
}

async function openOperations() {
  state.view = 'operations';
  state.operations.error = null;
  state.operations.loading = true;
  render();
  try {
    if (!await isCurrentUserAdmin()) throw new Error('Dieser Bereich ist nur für RankedDarts-Admins freigegeben.');
    if (sessionAssuranceLevel() !== 'aal2') {
      state.operations.mfaRequired = true;
      state.operations.loading = false;
      render();
      return;
    }
    await refreshOperations();
  } catch (error) {
    state.operations.loading = false;
    state.operations.error = humanizeError(error, 'Operations Console konnte nicht geöffnet werden.');
    render();
  }
}

function openSupport() {
  state.view = 'support';
  render();
}

async function refreshOperations() {
  state.operations.loading = true;
  state.operations.error = null;
  render();
  try {
    Object.assign(state.operations, await loadOperations({ rpc }));
  } catch (error) {
    state.operations.error = humanizeError(error, 'Operations-Daten konnten nicht geladen werden.');
  } finally {
    state.operations.loading = false;
    render();
  }
}

async function searchOperationsPlayer(event) {
  event.preventDefault();
  const input = document.querySelector('#ops-player-query');
  const query = input?.value.trim();
  if (!query) return;
  state.operations.playerQuery = query;
  try {
    const encoded = encodeURIComponent(`*${query.replace(/[*,()]/g, '')}*`);
    state.operations.playerResults = await request(`/rest/v1/profiles?select=id,username,elo&username=ilike.${encoded}&order=elo.desc&limit=8`) || [];
    state.operations.error = null;
  } catch (error) {
    state.operations.error = humanizeError(error, 'Spieler konnten nicht gesucht werden.');
  }
  render();
}

async function selectOperationsPlayer(profileId) {
  if (!profileId) return;
  try {
    state.operations.selectedPlayer = await rpc('admin_get_player_360', { p_profile_id: profileId });
    state.operations.error = null;
  } catch (error) {
    state.operations.error = humanizeError(error, 'Spieler-Kontext konnte nicht geladen werden.');
  }
  render();
}

async function beginMfaChallenge() {
  const factors = await request('/auth/v1/factors');
  const factor = (factors?.totp || factors?.all || []).find((entry) => entry.status === 'verified' && entry.factor_type === 'totp');
  if (!factor?.id) throw new Error('Für dieses Konto wurde keine bestätigte TOTP-Mehrfachauthentifizierung gefunden. Richte sie zuerst in den Kontoeinstellungen ein.');
  return { factor, challenge: await request(`/auth/v1/factors/${encodeURIComponent(factor.id)}/challenge`, { method: 'POST', body: '{}' }) };
}

async function verifyOperationsMfa(event) {
  event.preventDefault();
  const errorTarget = document.querySelector('#ops-mfa-error');
  const code = document.querySelector('#ops-mfa-code')?.value.trim();
  errorTarget.hidden = true;
  try {
    const { factor, challenge } = await beginMfaChallenge();
    const payload = await request(`/auth/v1/factors/${encodeURIComponent(factor.id)}/verify`, { method: 'POST', body: JSON.stringify({ challenge_id: challenge.id, code }) });
    if (payload?.access_token) saveSession(payload);
    if (sessionAssuranceLevel() !== 'aal2') throw new Error('MFA konnte nicht bestätigt werden. Bitte prüfe den Code und versuche es erneut.');
    state.operations.mfaRequired = false;
    await refreshOperations();
  } catch (error) {
    errorTarget.textContent = humanizeError(error, 'MFA-Code konnte nicht bestätigt werden.');
    errorTarget.hidden = false;
  }
}

function bindOperationsEvents() {
  document.querySelector('#open-support')?.addEventListener('click', openSupport);
  document.querySelector('#open-operations')?.addEventListener('click', openOperations);
  document.querySelector('#hide-app')?.addEventListener('click', () => window.supportConsole.hide());
  document.querySelector('#sign-out')?.addEventListener('click', signOut);
  document.querySelector('#ops-refresh')?.addEventListener('click', refreshOperations);
  document.querySelector('#ops-player-search')?.addEventListener('submit', searchOperationsPlayer);
  document.querySelectorAll('[data-ops-player]').forEach((button) => button.addEventListener('click', () => selectOperationsPlayer(button.dataset.opsPlayer)));
  document.querySelector('#ops-mfa-form')?.addEventListener('submit', verifyOperationsMfa);
  document.querySelector('#ops-back-to-support')?.addEventListener('click', openSupport);
}

function bindConsoleEvents() {
  document.querySelector('#open-support')?.addEventListener('click', openSupport);
  document.querySelector('#open-operations')?.addEventListener('click', openOperations);
  document.querySelector('#availability-toggle')?.addEventListener('click', () => setAvailability(!state.agent?.is_available));
  document.querySelector('#hide-app')?.addEventListener('click', () => window.supportConsole.hide());
  document.querySelector('#sign-out')?.addEventListener('click', signOut);
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; render(); }));
  document.querySelectorAll('[data-open-conversation]').forEach((button) => button.addEventListener('click', () => selectConversation(button.dataset.openConversation)));
  document.querySelector('#accept-conversation')?.addEventListener('click', () => acceptConversation(state.selectedConversationId));
  document.querySelector('#close-conversation')?.addEventListener('click', () => closeConversation(state.selectedConversationId));
  document.querySelector('#message-form')?.addEventListener('submit', sendMessage);
  document.querySelector('#message-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.querySelector('#message-form').requestSubmit(); } });
  document.querySelectorAll('[data-reply]').forEach((button) => button.addEventListener('click', () => { const input = document.querySelector('#message-input'); input.value = button.dataset.reply; input.focus(); }));
  document.querySelector('#note-form')?.addEventListener('submit', addNote);
  document.querySelector('#save-metadata')?.addEventListener('click', saveMetadata);
  document.querySelector('#transfer-conversation')?.addEventListener('click', transferConversation);
  const messages = document.querySelector('#messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const error = form.querySelector('#login-error');
  button.disabled = true;
  button.textContent = 'Anmeldung läuft …';
  error.hidden = true;
  try {
    const payload = await request('/auth/v1/token?grant_type=password', { method: 'POST', headers: { Authorization: `Bearer ${config.supabasePublishableKey}` }, body: JSON.stringify({ email: form.email.value.trim(), password: form.password.value }) }, false);
    saveSession(payload);
    await bootstrap();
  } catch (loginError) {
    error.textContent = loginError.message || 'Anmeldung fehlgeschlagen.';
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Support Console öffnen <span>↗</span>';
  }
}

async function bootstrap() {
  state.error = null;
  render();
  try {
    state.user = await request('/auth/v1/user');
    await sync();
    state.pollingId && clearInterval(state.pollingId);
    state.pollingId = setInterval(sync, 6_000);
    state.messagePollingId && clearInterval(state.messagePollingId);
    state.messagePollingId = setInterval(() => { if (state.selectedConversationId) loadMessages(state.selectedConversationId, false); }, 4_000);
  } catch (bootstrapError) {
    saveSession(null);
    state.user = null;
    state.agent = null;
    state.error = humanizeError(bootstrapError, 'Die gespeicherte Anmeldung konnte nicht wiederhergestellt werden. Bitte melde dich erneut an.');
    renderLogin();
  }
}

async function sync() {
  try {
    const [agentRows, conversations] = await Promise.all([rpc('live_support_get_agent_state'), rpc('live_support_admin_list_conversations')]);
    state.agent = agentRows?.[0] || null;
    state.conversations = conversations || [];
    const waitingIds = new Set(state.conversations.filter((conversation) => conversation.status === 'waiting').map((conversation) => conversation.conversation_id));
    if (state.lastWaitingIds && state.agent?.is_available) {
      const newRequest = [...waitingIds].find((id) => !state.lastWaitingIds.has(id));
      if (newRequest) {
        const conversation = state.conversations.find((item) => item.conversation_id === newRequest);
        window.supportConsole.notify({ title: 'Neue Live-Support-Anfrage', body: `${conversation?.requester_username || 'Ein Spieler'} wartet auf Hilfe.` });
      }
    }
    state.lastWaitingIds = waitingIds;
    if (state.selectedConversationId && !state.conversations.some((conversation) => conversation.conversation_id === state.selectedConversationId)) {
      state.selectedConversationId = null;
      state.messages = [];
    }
    state.error = null;
  } catch (syncError) {
    state.error = syncError.message || 'Verbindung unterbrochen.';
  }
  render();
  if (state.agent?.is_available) rpc('live_support_agent_heartbeat').catch(() => null);
}

async function selectConversation(conversationId) {
  const conversation = state.conversations.find((item) => item.conversation_id === conversationId);
  state.selectedConversationId = conversationId;
  state.messages = [];
  render();
  await Promise.all([conversation?.status === 'active' ? loadMessages(conversationId, false) : Promise.resolve(), loadDeskData(conversationId)]);
  if (state.selectedConversationId === conversationId) render();
}

async function loadDeskData(conversationId) {
  try {
    const [context, notes, agents] = await Promise.all([rpc('live_support_admin_get_context', { p_conversation_id: conversationId }), rpc('live_support_admin_list_notes', { p_conversation_id: conversationId }), rpc('live_support_admin_list_agents')]);
    state.context = context || null; state.notes = notes || []; state.agents = agents || [];
  } catch (error) { state.error = humanizeError(error, 'Support-Kontext konnte nicht geladen werden.'); }
}

async function addNote(event) { event.preventDefault(); const input = document.querySelector('#note-input'); const content = input.value.trim(); if (!content || !state.selectedConversationId) return; try { await rpc('live_support_admin_add_note', { p_conversation_id: state.selectedConversationId, p_content: content }); input.value = ''; await loadDeskData(state.selectedConversationId); render(); } catch (error) { state.error = humanizeError(error, 'Notiz konnte nicht gespeichert werden.'); render(); } }

async function saveMetadata() { if (!state.selectedConversationId) return; try { const tags = document.querySelector('#desk-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean); await rpc('live_support_admin_update_metadata', { p_conversation_id: state.selectedConversationId, p_category: document.querySelector('#desk-category').value, p_priority: document.querySelector('#desk-priority').value, p_tags: tags }); await loadDeskData(state.selectedConversationId); render(); } catch (error) { state.error = humanizeError(error, 'Einordnung konnte nicht gespeichert werden.'); render(); } }

async function transferConversation() { const agentId = document.querySelector('#transfer-agent').value; if (!agentId || !state.selectedConversationId) return; try { await rpc('live_support_admin_transfer', { p_conversation_id: state.selectedConversationId, p_agent_id: agentId }); state.selectedConversationId = null; state.context = null; state.notes = []; await sync(); } catch (error) { state.error = humanizeError(error, 'Chat konnte nicht übergeben werden.'); render(); } }

async function loadMessages(conversationId, rerender = true) {
  try {
    state.messages = await rpc('live_support_list_messages', { p_conversation_id: conversationId }) || [];
    state.error = null;
  } catch (error) { state.error = humanizeError(error, 'Nachrichten konnten nicht geladen werden.'); }
  if (rerender) render();
  else {
    const target = document.querySelector('#messages');
    if (target) { target.innerHTML = state.messages.map((message) => `<article class="message ${message.sender_role === 'agent' ? 'mine' : ''}"><div class="message-meta"><strong>${message.sender_role === 'agent' ? 'Du · Support' : escapeHtml(message.sender_name)}</strong><time>${formatTime(message.created_at)}</time></div><p>${escapeHtml(message.content).replace(/\n/g, '<br>')}</p></article>`).join(''); target.scrollTop = target.scrollHeight; }
  }
}

async function setAvailability(available) {
  state.loading = true;
  render();
  try { await rpc('live_support_set_agent_availability', { p_available: available }); await sync(); }
  catch (error) { state.error = humanizeError(error, 'Status konnte nicht geändert werden.'); render(); }
  finally { state.loading = false; }
}

async function acceptConversation(conversationId) {
  if (!conversationId) return;
  try { await rpc('live_support_accept_conversation', { p_conversation_id: conversationId }); await sync(); await Promise.all([loadMessages(conversationId, false), loadDeskData(conversationId)]); render(); }
  catch (error) { state.error = humanizeError(error, 'Unterhaltung konnte nicht übernommen werden.'); render(); }
}

async function sendMessage(event) {
  event.preventDefault();
  const input = document.querySelector('#message-input');
  const content = input.value.trim();
  if (!content || !state.selectedConversationId) return;
  input.value = '';
  try { await rpc('live_support_send_message', { p_conversation_id: state.selectedConversationId, p_content: content }); await loadMessages(state.selectedConversationId, false); await sync(); }
  catch (error) { state.error = humanizeError(error, 'Nachricht konnte nicht gesendet werden.'); input.value = content; render(); }
}

async function closeConversation(conversationId) {
  if (!conversationId || !confirm('Diese Live-Unterhaltung wirklich schließen?')) return;
  try { await rpc('live_support_close_conversation', { p_conversation_id: conversationId }); state.selectedConversationId = null; state.messages = []; await sync(); }
  catch (error) { state.error = humanizeError(error, 'Unterhaltung konnte nicht geschlossen werden.'); render(); }
}

function signOut() {
  clearInterval(state.pollingId);
  clearInterval(state.messagePollingId);
  saveSession(null);
  state.user = null;
  state.agent = null;
  state.conversations = [];
  state.selectedConversationId = null;
  state.messages = [];
  state.lastWaitingIds = null;
  render();
}

if (hasValidConfig() && state.session?.access_token) bootstrap();
else render();
