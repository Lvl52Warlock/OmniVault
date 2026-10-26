'use strict';

const API_BASE = window.location.origin;
const TOKEN_KEY = 'wp_token';

const authModal = document.querySelector('#auth-modal');
const authForm = document.querySelector('#auth-form');
const authUsername = document.querySelector('#auth-username');
const authPassword = document.querySelector('#auth-password');
const authError = document.querySelector('#auth-error');
const authSubmit = document.querySelector('#auth-submit');

const signOutBtn = document.querySelector('#sign-out');
const userInfo = document.querySelector('#user-info');
const userDisplay = document.querySelector('#user-display');
const addServerBtn = document.querySelector('#add-server');
const emptyAddServerBtn = document.querySelector('#empty-add-server');

const refreshBtn = document.querySelector('#refresh');
const pushAgentUpdateBtn = document.querySelector('#push-agent-update');
const main = document.querySelector('#main');
const serverList = document.querySelector('#server-list');
const emptyState = document.querySelector('#empty-state');
const serverWorkspace = document.querySelector('#server-workspace');
const serverSelect = document.querySelector('#server-select');
const selectedName = document.querySelector('#selected-name');
const selectedStatus = document.querySelector('#selected-status');
const playerCount = document.querySelector('#player-count');
const playerList = document.querySelector('#players');
const lastUpdated = document.querySelector('#last-updated');
const detailMode = document.querySelector('#detail-mode');
const detailHost = document.querySelector('#detail-host');
const detailPort = document.querySelector('#detail-port');
const detailAgent = document.querySelector('#detail-agent');
const detailCreated = document.querySelector('#detail-created');
const connectionHint = document.querySelector('#connection-hint');
const editServerBtn = document.querySelector('#edit-server');
const deleteServerBtn = document.querySelector('#delete-server');
const agentSetupBtn = document.querySelector('#agent-setup');
const guideAdd = document.querySelector('#guide-add');
const guideAgentHelp = document.querySelector('#guide-agent-help');

const sayForm = document.querySelector('#say-form');
const mapForm = document.querySelector('#map-form');
const endRoundBtn = document.querySelector('#btn-endround');
const endGameBtn = document.querySelector('#btn-endgame');
const kickForm = document.querySelector('#kick-form');
const banForm = document.querySelector('#ban-form');
const unbanForm = document.querySelector('#unban-form');

const addServerModal = document.querySelector('#add-server-modal');
const addServerForm = document.querySelector('#add-server-form');
const addServerTitle = document.querySelector('#add-server-title');
const addServerDescription = document.querySelector('#add-server-description');
const addServerCancel = document.querySelector('#add-server-cancel');
const addServerSubmit = document.querySelector('#add-server-submit');
const addServerName = document.querySelector('#add-server-name');
const addServerMode = document.querySelector('#add-server-mode');
const addServerRconPort = document.querySelector('#add-server-rcon-port');
const agentFields = document.querySelector('#agent-fields');
const directFields = document.querySelector('#direct-fields');
const addServerHost = document.querySelector('#add-server-host');
const addServerPort = document.querySelector('#add-server-port');
const addServerPassword = document.querySelector('#add-server-password');
const addServerPasswordHint = document.querySelector('#add-server-password-hint');
const addServerError = document.querySelector('#add-server-error');

const agentModal = document.querySelector('#agent-modal');
const agentModalForm = document.querySelector('#agent-modal-form');
const agentModalTitle = document.querySelector('#agent-modal-title');
const agentModalDescription = document.querySelector('#agent-modal-description');
const agentCodeBlock = document.querySelector('#agent-code-block');
const agentCode = document.querySelector('#agent-code');
const agentCodeExpiry = document.querySelector('#agent-code-expiry');
const agentCopyCode = document.querySelector('#agent-copy-code');
const agentCommandBlock = document.querySelector('#agent-command-block');
const agentCommand = document.querySelector('#agent-command');
const agentCopyCommand = document.querySelector('#agent-copy-command');
const agentLiveStatus = document.querySelector('#agent-live-status');
const agentError = document.querySelector('#agent-error');
const agentNewCode = document.querySelector('#agent-new-code');
const agentRefresh = document.querySelector('#agent-refresh');
const agentClose = document.querySelector('#agent-close');

const toastEl = document.querySelector('#toast');

let token = localStorage.getItem(TOKEN_KEY) || '';
let panelActive = false;
let servers = [];
let selectedServerId = '';
let catalogServerId = '';
let editingServerId = '';
let refreshTimer = null;
let refreshing = false;
let toastTimer = null;
let agentModalServerId = '';
let agentCodeExpiresAt = 0;
let agentCodeTimer = null;
let currentAgentCode = '';
let isAdminUser = false;

function displayAuthError(message) {
  if (!authError) return;
  authError.textContent = message || '';
  authError.hidden = !message;
}

function showAddServerError(message) {
  if (!addServerError) return;
  addServerError.textContent = message || '';
  addServerError.hidden = !message;
}

function showToast(message, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  let text;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
    text = await response.text();
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('The panel server did not respond in time.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (response.status === 401 && panelActive) {
    endSession('Your session expired. Please sign in again.');
  }
  if (!response.ok) {
    const message = (data && data.error) || text || `Request failed (${response.status}).`;
    const error = new Error(typeof message === 'string' ? message : 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function playerTotal(text) {
  const value = String(text || '');
  const firstLine = value.split(/\r?\n/, 1)[0] || '';
  const count = firstLine.match(/(\d+)\s*(?:\/|of)\s*\d+/i);
  if (count) return count[1];
  return String((value.match(/^#\d+/gm) || []).length);
}

function statusSummary(server) {
  const lines = String(server.status || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[1] || 'Online';
}

function catalogNames(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s{2,}\([^()]*\)\s*$/, '').trim())
    .filter(Boolean);
}

function agentStatus(server) {
  if (!server || server.connectionMode !== 'agent') return { label: 'Direct RCON', className: '' };
  if (server.agentOnline) return { label: 'Agent online', className: 'online' };
  if (server.agentPaired) return { label: 'Agent paired, offline', className: 'offline' };
  if (server.pairingPending) return { label: 'Waiting for agent', className: '' };
  return { label: 'Agent not paired', className: 'offline' };
}

function currentServer() {
  return servers.find((server) => server.id === selectedServerId) || null;
}

function findServer(id) {
  return servers.find((server) => server.id === id) || null;
}

function updateAddServerMode() {
  if (!addServerMode || !agentFields || !directFields) return;
  const directOption = document.querySelector('#add-server-direct-option');
  if (directOption) {
    directOption.hidden = !isAdminUser;
    directOption.disabled = !isAdminUser;
  }
  if (!isAdminUser && addServerMode.value !== 'agent') addServerMode.value = 'agent';
  const agent = addServerMode.value === 'agent';
  agentFields.hidden = !agent;
  directFields.hidden = agent;
  addServerHost.required = !agent;
  addServerPort.required = !agent;
  addServerPassword.required = !agent && !editingServerId;
  addServerPasswordHint.hidden = agent || !editingServerId;
  if (!editingServerId) {
    addServerDescription.textContent = agent
      ? 'The agent connects out from your game-server PC, so no port forwarding is needed. You will get a pairing code after adding it.'
      : 'Enter the public RCON address and password for your Project Reclaimer server.';
  }
}

function stopAgentCodeTimer() {
  if (agentCodeTimer) clearInterval(agentCodeTimer);
  agentCodeTimer = null;
}

function updateAgentExpiry() {
  if (!agentCodeExpiry) return;
  if (!agentCodeExpiresAt) {
    agentCodeExpiry.textContent = '';
    agentCode.classList.remove('expired');
    return;
  }
  const remaining = Math.max(0, agentCodeExpiresAt - Date.now());
  if (remaining <= 0) {
    agentCodeExpiry.textContent = 'This code has expired. Generate a new code to pair the agent.';
    agentCode.classList.add('expired');
    return;
  }
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  agentCodeExpiry.textContent = `Code expires in ${minutes}:${String(seconds).padStart(2, '0')}. Codes are single-use.`;
  agentCode.classList.remove('expired');
}

function buildAgentCommand(server, code) {
  const port = Number(server && server.rconPort) || 49176;
  return `.\\OmniVaultAgent.exe --panel "${window.location.origin}" --pair "${code}" --rcon-port ${port}`;
}

function updateAgentModalStatus() {
  if (!agentLiveStatus) return;
  const server = agentModalServerId ? findServer(agentModalServerId) : null;
  agentLiveStatus.classList.remove('online', 'offline');
  if (!server) {
    agentLiveStatus.textContent = 'Add a server with Agent mode to get a pairing code and setup command.';
    return;
  }
  if (server.agentOnline) {
    agentLiveStatus.classList.add('online');
    agentLiveStatus.textContent = `Agent connected${server.agentName ? ` (${server.agentName})` : ''}. You can close this window.`;
  } else if (server.agentPaired) {
    agentLiveStatus.classList.add('offline');
    agentLiveStatus.textContent = 'Agent is paired but offline. Start OmniVaultAgent.exe on the game-server PC.';
  } else if (server.pairingPending) {
    agentLiveStatus.textContent = 'Waiting for the agent to pair. Run the setup command before the code expires.';
  } else {
    agentLiveStatus.classList.add('offline');
    agentLiveStatus.textContent = 'No agent is paired yet. Generate a new code if this one expired.';
  }
}

function openAgentSetup(server, code = '', expiresAt = '') {
  if (!agentModal) return;
  stopAgentCodeTimer();
  const isServer = !!(server && server.id);
  agentModalServerId = isServer ? server.id : '';
  currentAgentCode = code || '';
  agentCodeExpiresAt = expiresAt ? new Date(expiresAt).getTime() : 0;
  agentModalTitle.textContent = isServer ? 'Set up the agent' : 'Agent setup guide';
  if (!isServer) {
    agentModalDescription.textContent = 'Agent mode lets a Reclaimer server behind a normal router connect without port forwarding. Add a server with Agent mode to get its pairing code and exact setup command.';
  } else if (server.agentPaired && !code) {
    agentModalDescription.textContent = `"${server.name}" is already paired. These steps are for reinstalling or replacing its agent. Use Generate new code only when you are ready to disconnect the old agent.`;
  } else {
    agentModalDescription.textContent = `Run the agent on the same PC as "${server.name}". It connects out to this panel, so your router does not need an open port.`;
  }

  const hasCode = !!currentAgentCode;
  agentCodeBlock.hidden = !hasCode;
  agentCommandBlock.hidden = !hasCode;
  agentNewCode.hidden = !isServer;
  agentRefresh.hidden = !isServer;
  agentError.hidden = true;
  agentError.textContent = '';
  agentCode.classList.remove('expired');

  if (hasCode) {
    agentCode.textContent = currentAgentCode;
    agentCommand.textContent = buildAgentCommand(server, currentAgentCode);
    updateAgentExpiry();
    agentCodeTimer = setInterval(updateAgentExpiry, 1000);
  } else {
    agentCode.textContent = '----';
    agentCommand.textContent = '';
    agentCodeExpiry.textContent = '';
  }

  updateAgentModalStatus();
  agentCodeBlock.hidden = !hasCode;
  if (agentModal && !agentModal.open) agentModal.showModal();
}

async function copyText(value, label) {
  const text = String(value || '');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } finally { area.remove(); }
  }
  showToast(`${label} copied.`);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function setActionsEnabled(enabled) {
  const forms = [sayForm, mapForm, kickForm, banForm, unbanForm];
  for (const form of forms) {
    if (!form) continue;
    form.querySelectorAll('input, select, button').forEach((element) => {
      element.disabled = !enabled;
    });
  }
  if (endRoundBtn) endRoundBtn.disabled = !enabled;
  if (endGameBtn) endGameBtn.disabled = !enabled;
  if (agentSetupBtn) agentSetupBtn.disabled = false;
}

function showAuthDialog(message) {
  panelActive = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  main.hidden = true;
  userInfo.hidden = true;
  if (addServerModal && addServerModal.open) addServerModal.close();
  if (agentModal && agentModal.open) closeAgentModal();
  if (authModal && !authModal.open) authModal.showModal();
  displayAuthError(message || '');
  if (authUsername && !authUsername.value) {
    setTimeout(() => authUsername.focus(), 40);
  }
}

function clearPanelState() {
  servers = [];
  selectedServerId = '';
  catalogServerId = '';
  editingServerId = '';
  if (serverList) serverList.replaceChildren();
  if (serverSelect) serverSelect.replaceChildren();
  if (serverWorkspace) serverWorkspace.hidden = true;
  if (emptyState) emptyState.hidden = true;
  selectedName.textContent = 'No server selected';
  selectedStatus.textContent = 'Sign in to load servers.';
  selectedStatus.classList.remove('connected', 'disconnected');
  playerList.textContent = 'No server selected.';
  playerCount.textContent = '—';
  detailMode.textContent = '—';
  detailHost.textContent = '—';
  detailPort.textContent = '—';
  detailAgent.textContent = '—';
  detailCreated.textContent = '—';
  connectionHint.textContent = 'The RCON password is stored on the panel server and is never sent back to your browser.';
  if (agentSetupBtn) agentSetupBtn.hidden = true;
}

function endSession(message) {
  token = '';
  isAdminUser = false;
  localStorage.removeItem(TOKEN_KEY);
  refreshing = false;
  refreshBtn.disabled = false;
  clearPanelState();
  showAuthDialog(message);
}

async function enterPanel(user) {
  panelActive = true;
  isAdminUser = !!(user && user.isAdmin);
  if (authModal && authModal.open) authModal.close();
  displayAuthError('');
  main.hidden = false;
  userInfo.hidden = false;
  addServerBtn.hidden = false;
  if (userDisplay) userDisplay.textContent = (user && user.username) || '';
  if (pushAgentUpdateBtn) pushAgentUpdateBtn.hidden = !(user && user.isAdmin);
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (panelActive) refresh().catch(() => {});
    }, 30000);
  }
  await refresh();
}

function renderTiles() {
  serverList.replaceChildren();

  if (!servers.length) {
    emptyState.hidden = false;
    serverWorkspace.hidden = true;
    return;
  }

  emptyState.hidden = true;
  serverWorkspace.hidden = false;

  for (const server of servers) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `server-tile${server.id === selectedServerId ? ' selected' : ''}`;
    tile.setAttribute('aria-pressed', String(server.id === selectedServerId));
    tile.addEventListener('click', () => selectServer(server.id));

    const top = document.createElement('div');
    top.className = 'tile-top';
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = server.name || 'Unnamed server';
    const badge = document.createElement('span');
    badge.className = `tile-mode${server.connectionMode === 'agent' ? ' agent' : ''}`;
    badge.textContent = server.connectionMode === 'agent' ? 'Agent' : 'Direct';
    name.append(badge);
    const count = document.createElement('span');
    count.className = 'tile-count';
    count.textContent = server.connectionMode === 'agent' && !server.agentOnline
      ? '—'
      : (server.error || server.playersError) ? '—' : `${playerTotal(server.players)} online`;
    const status = document.createElement('div');
    if (server.connectionMode === 'agent') {
      const info = agentStatus(server);
      status.className = `tile-status${info.className === 'offline' ? ' error' : ''}`;
      status.textContent = info.label;
    } else {
      status.className = `tile-status${server.error ? ' error' : ''}`;
      status.textContent = server.error ? 'RCON unreachable' : statusSummary(server);
    }

    top.append(name, count);
    tile.append(top, status);
    serverList.append(tile);
  }
}

function renderServerSelect() {
  serverSelect.replaceChildren(...servers.map((server) => new Option(server.name, server.id)));
  if (servers.some((server) => server.id === selectedServerId)) {
    serverSelect.value = selectedServerId;
  } else if (servers.length) {
    selectedServerId = servers[0].id;
    serverSelect.value = selectedServerId;
  } else {
    selectedServerId = '';
  }
}

function renderSelected() {
  const server = currentServer();
  if (!server) {
    selectedName.textContent = 'No server selected';
    selectedStatus.textContent = 'Add a server to get started.';
    selectedStatus.classList.remove('connected', 'disconnected');
    playerList.textContent = 'No servers configured.';
    playerCount.textContent = '—';
    detailMode.textContent = '—';
    detailHost.textContent = '—';
    detailPort.textContent = '—';
    detailAgent.textContent = '—';
    detailCreated.textContent = '—';
    connectionHint.textContent = 'The RCON password is stored on the panel server and is never sent back to your browser.';
    if (agentSetupBtn) agentSetupBtn.hidden = true;
    setActionsEnabled(false);
    return;
  }

  const isAgent = server.connectionMode === 'agent';
  const status = agentStatus(server);
  serverSelect.value = server.id;
  selectedName.textContent = server.name;
  selectedStatus.textContent = isAgent && server.pairingPending
    ? 'Waiting for the agent to pair. Open Agent setup for the pairing code.'
    : (server.error || server.status || (isAgent ? status.label : 'No status reply.'));
  selectedStatus.classList.toggle('muted', !server.error);
  selectedStatus.classList.toggle('connected', !server.error);
  selectedStatus.classList.toggle('disconnected', !!server.error);
  playerList.textContent = server.playersError || server.players || (server.error ? 'Player list unavailable.' : 'No players connected.');
  playerCount.textContent = (server.error || server.playersError) ? '—' : playerTotal(server.players);
  detailMode.textContent = isAgent ? 'Agent (outbound)' : 'Direct RCON';
  detailHost.textContent = isAgent ? 'Local to the agent' : (server.host || '—');
  detailPort.textContent = isAgent
    ? (server.rconPort ? `${server.rconPort} (suggested)` : '—')
    : (server.port ? String(server.port) : '—');
  detailAgent.textContent = status.label;
  detailAgent.className = status.className ? `agent-state ${status.className}` : '';
  detailCreated.textContent = formatDate(server.createdAt);
  connectionHint.textContent = isAgent
    ? 'The agent runs next to your game server and connects out to this panel. Your RCON password stays on the game-server PC.'
    : 'The RCON password is stored on the panel server and is never sent back to your browser.';
  if (agentSetupBtn) agentSetupBtn.hidden = !isAgent;
  setActionsEnabled(isAgent ? !!server.agentOnline : !server.error);
}

function renderPanel() {
  renderServerSelect();
  renderTiles();
  renderSelected();
}

function fillSelect(select, placeholder, names) {
  if (!select) return;
  const previous = select.value;
  select.replaceChildren(new Option(placeholder, ''));
  for (const name of names) {
    if (name) select.append(new Option(name, name));
  }
  if (names.includes(previous)) select.value = previous;
}

async function loadCatalog(server, notify = false, force = false) {
  if (!server) return;
  if (!force && catalogServerId === server.id) return;
  const requestedId = server.id;
  catalogServerId = requestedId;
  try {
    const data = await api(`/api/catalog?serverId=${encodeURIComponent(requestedId)}`);
    if (catalogServerId !== requestedId) return;
    fillSelect(mapForm.elements.map, 'Select map…', catalogNames(data.maps));
    fillSelect(mapForm.elements.mode, 'Select mode…', catalogNames(data.modes));
  } catch (error) {
    if (catalogServerId !== requestedId) return;
    fillSelect(mapForm.elements.map, 'Map list unavailable', []);
    fillSelect(mapForm.elements.mode, 'Mode list unavailable', []);
    if (notify && panelActive) showToast(`Could not load maps/modes: ${error.message}`, true);
  }
}

function selectServer(id) {
  if (!servers.some((server) => server.id === id)) return;
  selectedServerId = id;
  catalogServerId = '';
  renderTiles();
  renderSelected();
  const server = currentServer();
  if (server) loadCatalog(server, true, true).catch(() => {});
}

async function refresh() {
  if (!panelActive || refreshing) return;
  refreshing = true;
  refreshBtn.disabled = true;
  try {
    const data = await api('/api/servers');
    servers = Array.isArray(data && data.servers) ? data.servers : [];
    renderPanel();
    if (agentModal && agentModal.open) updateAgentModalStatus();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    const selected = currentServer();
    if (selected) loadCatalog(selected, false, true).catch(() => {});
  } catch (error) {
    if (panelActive) {
      showToast(error.message, true);
      lastUpdated.textContent = 'Status unavailable';
    }
  } finally {
    refreshing = false;
    refreshBtn.disabled = false;
  }
}

async function sendAction(payload) {
  const server = currentServer();
  if (!server) throw new Error('Select a server first.');
  const data = await api('/api/action', {
    method: 'POST',
    body: JSON.stringify({ ...payload, serverId: server.id }),
  });
  if (data && data.result) showToast(String(data.result));
  return data;
}

async function handleLogin(event) {
  event.preventDefault();
  displayAuthError('');
  const username = authUsername.value.trim();
  const password = authPassword.value;
  if (!username || !password) {
    displayAuthError('Enter your username and password.');
    return;
  }

  authSubmit.disabled = true;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!data || !data.token) throw new Error('The server did not return a login token.');
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    authPassword.value = '';
    await enterPanel(data.user);
  } catch (error) {
    displayAuthError(error.message);
  } finally {
    authSubmit.disabled = false;
  }
}

async function signOut() {
  signOutBtn.disabled = true;
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {
    // The local token is cleared even if the server is unreachable.
  } finally {
    signOutBtn.disabled = false;
  }
  endSession('');
  authForm.reset();
  showToast('Signed out.');
}

function openAddServer() {
  editingServerId = '';
  addServerForm.reset();
  addServerMode.disabled = false;
  addServerMode.value = 'agent';
  addServerRconPort.value = '49176';
  addServerTitle.textContent = 'Add server';
  addServerDescription.textContent = 'Choose how the panel should reach your Reclaimer server.';
  addServerSubmit.textContent = 'Add server';
  showAddServerError('');
  updateAddServerMode();
  if (!addServerModal.open) addServerModal.showModal();
  addServerName.focus();
}

function openEditServer() {
  const server = currentServer();
  if (!server) return;
  editingServerId = server.id;
  addServerForm.reset();
  addServerName.value = server.name || '';
  addServerMode.value = server.connectionMode === 'agent' ? 'agent' : 'direct';
  addServerMode.disabled = true;
  addServerRconPort.value = server.rconPort || '49176';
  addServerHost.value = server.host || '';
  addServerPort.value = server.port || '';
  addServerPassword.value = '';
  addServerTitle.textContent = 'Edit server';
  addServerDescription.textContent = server.connectionMode === 'agent'
    ? 'Update the server name or local RCON port used by the agent.'
    : 'Update the RCON connection for this server.';
  addServerSubmit.textContent = 'Save changes';
  showAddServerError('');
  updateAddServerMode();
  if (!addServerModal.open) addServerModal.showModal();
  addServerName.focus();
}

async function handleAddServer(event) {
  event.preventDefault();
  showAddServerError('');
  const name = addServerName.value.trim();
  if (!name) {
    showAddServerError('Server name is required.');
    return;
  }

  const editing = editingServerId;
  const editingServer = editing ? findServer(editing) : null;
  const mode = editing ? (editingServer && editingServer.connectionMode) || 'direct' : addServerMode.value;
  if (mode === 'direct' && !isAdminUser) {
    showAddServerError('Direct RCON is restricted to the panel administrator. Choose Agent mode; it needs no port forwarding.');
    return;
  }
  const payload = { name, connectionMode: mode };

  if (mode === 'agent') {
    const rconPort = Number(addServerRconPort.value);
    if (!Number.isInteger(rconPort) || rconPort < 1 || rconPort > 65535) {
      showAddServerError('Enter the local RCON port (1-65535). You can change it later in Agent setup.');
      return;
    }
    payload.rconPort = rconPort;
  } else {
    const host = addServerHost.value.trim();
    const port = Number(addServerPort.value);
    const password = addServerPassword.value;
    if (!host || !addServerPort.value) {
      showAddServerError('Name, host and port are required.');
      return;
    }
    if (!editing && !password) {
      showAddServerError('RCON password is required for a new direct server.');
      return;
    }
    payload.host = host;
    payload.port = port;
    if (password || !editing) payload.password = password;
  }

  addServerSubmit.disabled = true;
  try {
    const data = editing
      ? await api(`/api/servers/${encodeURIComponent(editing)}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/servers', { method: 'POST', body: JSON.stringify(payload) });
    if (data && data.server && data.server.id) selectedServerId = data.server.id;
    else if (editing) selectedServerId = editing;
    catalogServerId = '';
    addServerModal.close();
    addServerForm.reset();
    await refresh();
    if (!editing && mode === 'agent' && data && data.pairingCode) {
      openAgentSetup(data.server, data.pairingCode, data.pairingExpiresAt);
    } else {
      showToast(editing ? 'Server updated.' : `Server "${name}" added.`);
    }
  } catch (error) {
    showAddServerError(error.message);
  } finally {
    addServerSubmit.disabled = false;
  }
}

async function handleDeleteServer() {
  const server = currentServer();
  if (!server) return;
  if (!window.confirm(`Remove "${server.name}" from your account? This does not affect the game server itself.`)) return;
  deleteServerBtn.disabled = true;
  try {
    await api(`/api/servers/${encodeURIComponent(server.id)}`, { method: 'DELETE' });
    selectedServerId = '';
    catalogServerId = '';
    if (agentModalServerId === server.id) closeAgentModal();
    await refresh();
    showToast('Server removed.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    deleteServerBtn.disabled = false;
  }
}

function closeAgentModal() {
  stopAgentCodeTimer();
  if (agentModal && agentModal.open) agentModal.close();
}

async function generateAgentCode() {
  const server = agentModalServerId ? findServer(agentModalServerId) : currentServer();
  if (!server || server.connectionMode !== 'agent') {
    showToast('Choose an agent server first.', true);
    return;
  }
  if (server.agentPaired && !window.confirm('A new code revokes the current agent token. The existing agent will disconnect and must be reinstalled. Continue?')) return;
  agentNewCode.disabled = true;
  agentError.hidden = true;
  try {
    const data = await api(`/api/servers/${encodeURIComponent(server.id)}/agent-code`, { method: 'POST' });
    await refresh();
    const updated = findServer(server.id) || data.server || server;
    openAgentSetup(updated, data.pairingCode, data.pairingExpiresAt);
    showToast('New pairing code created.');
  } catch (error) {
    agentError.textContent = error.message;
    agentError.hidden = false;
  } finally {
    agentNewCode.disabled = false;
  }
}

async function openAgentSetupForSelected() {
  const server = currentServer();
  if (!server || server.connectionMode !== 'agent') return;
  // Do not revoke a working agent just because its owner opened the guide.
  if (server.agentPaired) {
    openAgentSetup(server);
    return;
  }
  agentSetupBtn.disabled = true;
  try {
    const data = await api(`/api/servers/${encodeURIComponent(server.id)}/agent-code`, { method: 'POST' });
    await refresh();
    const updated = findServer(server.id) || data.server || server;
    openAgentSetup(updated, data.pairingCode, data.pairingExpiresAt);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    agentSetupBtn.disabled = false;
  }
}

async function handleSay(event) {
  event.preventDefault();
  const message = sayForm.elements.message.value.trim();
  if (!message) return;
  try {
    await sendAction({ action: 'say', message });
    sayForm.reset();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleMap(event) {
  event.preventDefault();
  const submitter = event.submitter || mapForm.querySelector('button[value="load"]');
  const action = submitter && submitter.value === 'nextmap' ? 'nextmap' : 'load';
  const map = mapForm.elements.map.value;
  const mode = mapForm.elements.mode.value;
  if (!map) {
    showToast('Choose a map first.', true);
    return;
  }
  if (action === 'load' && !window.confirm(`Load ${map}${mode ? ` / ${mode}` : ''} now? This ends the current game.`)) return;
  try {
    await sendAction({ action, map, mode });
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleKick(event) {
  event.preventDefault();
  const player = kickForm.elements.player.value.trim();
  const reason = kickForm.elements.reason.value.trim();
  if (!player) {
    showToast('Enter a player to kick.', true);
    return;
  }
  try {
    await sendAction({ action: 'kick', player, reason });
    kickForm.reset();
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleBan(event) {
  event.preventDefault();
  const player = banForm.elements.player.value.trim();
  const time = banForm.elements.time.value;
  const reason = banForm.elements.reason.value.trim();
  if (!player) {
    showToast('Enter a player to ban.', true);
    return;
  }
  const durationLabel = time === 'none' ? 'permanent' : time;
  if (!window.confirm(`Ban "${player}" (${durationLabel})?`)) return;
  try {
    await sendAction({ action: 'ban', player, time, reason });
    banForm.reset();
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleUnban(event) {
  event.preventDefault();
  const target = unbanForm.elements.target.value.trim();
  if (!target) {
    showToast('Enter a player or address to unban.', true);
    return;
  }
  try {
    await sendAction({ action: 'unban', target });
    unbanForm.reset();
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleEndRound() {
  if (!window.confirm('End the current round?')) return;
  try {
    await sendAction({ action: 'endround' });
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleEndGame() {
  if (!window.confirm('End the current game now?')) return;
  try {
    await sendAction({ action: 'endgame' });
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handlePushAgentUpdate() {
  if (!window.confirm('Send the signed update announcement to every connected agent?')) return;
  pushAgentUpdateBtn.disabled = true;
  try {
    const data = await api('/api/admin/agent-update/push', { method: 'POST' });
    showToast(`Agent ${data.version || 'update'} announced to ${data.sent || 0} connected agent(s).`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    pushAgentUpdateBtn.disabled = false;
  }
}

function bindEvents() {
  refreshBtn.addEventListener('click', () => refresh().catch(() => {}));
  if (pushAgentUpdateBtn) pushAgentUpdateBtn.addEventListener('click', handlePushAgentUpdate);
  signOutBtn.addEventListener('click', signOut);
  authForm.addEventListener('submit', handleLogin);
  // The sign-in dialog is the only way back into the panel, so Escape must not
  // dismiss it and leave a blank page.
  authModal.addEventListener('cancel', (event) => event.preventDefault());

  addServerBtn.addEventListener('click', openAddServer);
  emptyAddServerBtn.addEventListener('click', openAddServer);
  if (guideAdd) guideAdd.addEventListener('click', openAddServer);
  if (guideAgentHelp) guideAgentHelp.addEventListener('click', () => openAgentSetup(null));
  editServerBtn.addEventListener('click', openEditServer);
  deleteServerBtn.addEventListener('click', handleDeleteServer);
  if (agentSetupBtn) agentSetupBtn.addEventListener('click', openAgentSetupForSelected);
  addServerCancel.addEventListener('click', () => addServerModal.close());
  addServerModal.addEventListener('click', (event) => {
    if (event.target === addServerModal) addServerModal.close();
  });
  addServerMode.addEventListener('change', updateAddServerMode);
  addServerForm.addEventListener('submit', handleAddServer);

  if (agentClose) agentClose.addEventListener('click', closeAgentModal);
  if (agentModalForm) agentModalForm.addEventListener('submit', (event) => event.preventDefault());
  if (agentModal) {
    agentModal.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeAgentModal();
    });
    agentModal.addEventListener('click', (event) => {
      if (event.target === agentModal) closeAgentModal();
    });
  }
  if (agentNewCode) agentNewCode.addEventListener('click', generateAgentCode);
  if (agentRefresh) agentRefresh.addEventListener('click', () => refresh().catch(() => {}));
  if (agentCopyCode) agentCopyCode.addEventListener('click', () => copyText(currentAgentCode, 'Pairing code'));
  if (agentCopyCommand) agentCopyCommand.addEventListener('click', () => copyText(agentCommand.textContent, 'Command'));

  sayForm.addEventListener('submit', handleSay);
  mapForm.addEventListener('submit', handleMap);
  kickForm.addEventListener('submit', handleKick);
  banForm.addEventListener('submit', handleBan);
  unbanForm.addEventListener('submit', handleUnban);
  endRoundBtn.addEventListener('click', handleEndRound);
  endGameBtn.addEventListener('click', handleEndGame);
  serverSelect.addEventListener('change', () => selectServer(serverSelect.value));
}

async function init() {
  bindEvents();
  if (!token) {
    showAuthDialog();
    return;
  }
  try {
    const state = await api('/api/auth/state');
    if (!state || !state.authenticated) {
      endSession('Your session has expired. Please sign in again.');
      return;
    }
    await enterPanel(state.user);
  } catch (error) {
    if (error.status === 401) {
      endSession('Your session has expired. Please sign in again.');
    } else {
      showAuthDialog(`Could not reach the panel server: ${error.message}`);
    }
  }
}

init();
