const app = document.querySelector('#app');
const config = window.RANKEDDARTS_SUPPORT_CONFIG;

const state = {
  session: readSession(),
  user: null,
  agent: null,
  conversations: [],
  selectedConversationId: null,
  messages: [],
  filter: 'all',
  loading: false,
  error: null,
  lastWaitingIds: null,
  pollingId: null,
  messagePollingId: null,
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
  const response = await fetch(apiUrl(path), { ...options, headers });
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
      <form class="login-card" id="login-form"><p class="eyebrow">ANMELDUNG</p><h2>Willkommen zurück.</h2><p class="muted">Melde dich mit deinem normalen RankedDarts-Konto an.</p><label>E-Mail<input id="email" type="email" autocomplete="email" required placeholder="name@beispiel.de"></label><label>Passwort<input id="password" type="password" autocomplete="current-password" required placeholder="••••••••"></label><p id="login-error" class="form-error" hidden></p><button class="primary-button" type="submit">Support Console öffnen <span>↗</span></button><p class="form-footnote">Deine Zugangsdaten werden nur direkt bei Supabase geprüft.</p></form>
    </section>`;
  document.querySelector('#login-form').addEventListener('submit', login);
}

function renderConsole() {
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
        <nav aria-label="Arbeitsbereiche"><button class="rail-button active" title="Live Support">◌</button><a class="rail-button" href="https://www.rankeddarts.de/admin" title="Admin-Panel">↗</a></nav>
        <div class="rail-bottom"><button id="hide-app" class="rail-button" title="In den Hintergrund">−</button><button id="sign-out" class="rail-button" title="Abmelden">⇥</button></div>
      </aside>
      <section class="workspace">
        <header class="topbar">
          <div><p class="eyebrow">SUPPORT · LIVE DESK</p><h1>Guten Tag, ${escapeHtml(agentName)}.</h1></div>
          <div class="availability"><div><span class="presence ${isAvailable ? 'online' : ''}"></span><strong>${isAvailable ? 'Bereit für neue Chats' : 'Nicht verfügbar'}</strong><small>${state.agent?.agents_online ?? 0} Teammitglieder online</small></div><button id="availability-toggle" class="availability-toggle ${isAvailable ? 'online' : ''}">${isAvailable ? 'Support pausieren' : 'Für Support anmelden'}</button></div>
        </header>
        ${state.error ? `<p class="inline-error">${escapeHtml(state.error)}</p>` : ''}
        <div class="desk-layout">
          <aside class="inbox-panel">
            <div class="inbox-head"><div><p class="eyebrow">EINGANG</p><h2>Deine Gespräche</h2></div><span class="inbox-count">${state.conversations.length}</span></div>
            <div class="inbox-tabs"><button data-filter="all" class="${state.filter === 'all' ? 'active' : ''}">Alle <span>${state.conversations.length}</span></button><button data-filter="waiting" class="${state.filter === 'waiting' ? 'active' : ''}">Wartend <span>${waiting.length}</span></button><button data-filter="active" class="${state.filter === 'active' ? 'active' : ''}">Aktiv <span>${active.length}</span></button></div>
            <div class="conversation-list">${visible.length ? visible.map(renderConversationRow).join('') : `<div class="inbox-empty">${state.filter === 'waiting' ? 'Keine offene Anfrage.' : 'Hier ist gerade alles ruhig.'}</div>`}</div>
            <footer class="inbox-footer"><span class="pulse-dot ${waiting.length ? 'urgent' : ''}"></span>${waiting.length ? `${waiting.length} warten auf Hilfe` : 'Kein Spieler wartet gerade'}</footer>
          </aside>
          <section class="conversation-stage">${selected ? renderConversation(selected) : renderNoConversation(waiting)}</section>
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
    ${waiting ? `<div class="waiting-view"><div><p class="eyebrow">BEREIT ZUR ÜBERNAHME</p><h3>Der Spieler sieht dich erst,<br>wenn du den Chat annimmst.</h3><p>Übernimm das Gespräch, um direkt als Support erreichbar zu sein. Es wird nicht automatisch geschlossen.</p></div></div>` : `<div id="messages" class="messages">${messageMarkup}</div><form id="message-form" class="composer"><textarea id="message-input" rows="1" maxlength="1500" placeholder="Antwort schreiben …"></textarea><button class="send-button" type="submit" title="Nachricht senden">↗</button><small><kbd>Enter</kbd> senden · <kbd>Shift + Enter</kbd> neue Zeile</small></form>`}
  </div>`;
}

function bindConsoleEvents() {
  document.querySelector('#availability-toggle')?.addEventListener('click', () => setAvailability(!state.agent?.is_available));
  document.querySelector('#hide-app')?.addEventListener('click', () => window.supportConsole.hide());
  document.querySelector('#sign-out')?.addEventListener('click', signOut);
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; render(); }));
  document.querySelectorAll('[data-open-conversation]').forEach((button) => button.addEventListener('click', () => selectConversation(button.dataset.openConversation)));
  document.querySelector('#accept-conversation')?.addEventListener('click', () => acceptConversation(state.selectedConversationId));
  document.querySelector('#close-conversation')?.addEventListener('click', () => closeConversation(state.selectedConversationId));
  document.querySelector('#message-form')?.addEventListener('submit', sendMessage);
  document.querySelector('#message-input')?.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.querySelector('#message-form').requestSubmit(); } });
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
    state.error = bootstrapError.message || 'Support Console konnte nicht verbunden werden.';
    render();
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
  if (conversation?.status === 'active') await loadMessages(conversationId);
}

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
  try { await rpc('live_support_accept_conversation', { p_conversation_id: conversationId }); await sync(); await loadMessages(conversationId); }
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
