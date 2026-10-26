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
const desktopUpdateBtn = document.querySelector('#desktop-update');
const pushAgentUpdateBtn = document.querySelector('#push-agent-update');
const main = document.querySelector('#main');
const serverList = document.querySelector('#server-list');
const emptyState = document.querySelector('#empty-state');
const serverWorkspace = document.querySelector('#server-workspace');
const serverSelect = document.querySelector('#server-select');
const selectedName = document.querySelector('#selected-name');
const selectedRole = document.querySelector('#selected-role');
const selectedStatus = document.querySelector('#selected-status');
const playerCount = document.querySelector('#player-count');
const playerList = document.querySelector('#players');
const lastUpdated = document.querySelector('#last-updated');
const detailMode = document.querySelector('#detail-mode');
const detailHost = document.querySelector('#detail-host');
const detailPort = document.querySelector('#detail-port');
const detailAgent = document.querySelector('#detail-agent');
const detailRole = document.querySelector('#detail-role');
const detailCreated = document.querySelector('#detail-created');
const connectionHint = document.querySelector('#connection-hint');
const editServerBtn = document.querySelector('#edit-server');
const deleteServerBtn = document.querySelector('#delete-server');
const agentSetupBtn = document.querySelector('#agent-setup');
const manageAccessBtn = document.querySelector('#manage-access');
const serverFilesBtn = document.querySelector('#server-files');
const serverInstancesBtn = document.querySelector('#server-instances');
const instancePicker = document.querySelector('#instance-picker');
const instanceSelect = document.querySelector('#instance-select');
const joinTeamBtn = document.querySelector('#join-team');
const emptyJoinTeamBtn = document.querySelector('#empty-join-team');
const guideAdd = document.querySelector('#guide-add');
const guideAgentHelp = document.querySelector('#guide-agent-help');

const sayForm = document.querySelector('#say-form');
const mapForm = document.querySelector('#map-form');
const endRoundBtn = document.querySelector('#btn-endround');
const endGameBtn = document.querySelector('#btn-endgame');
const kickForm = document.querySelector('#kick-form');
const banForm = document.querySelector('#ban-form');
const unbanForm = document.querySelector('#unban-form');
const moderationEmpty = document.querySelector('#moderation-empty');

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

const joinTeamModal = document.querySelector('#join-team-modal');
const joinTeamForm = document.querySelector('#join-team-form');
const joinTeamCode = document.querySelector('#join-team-code');
const joinTeamError = document.querySelector('#join-team-error');
const joinTeamCancel = document.querySelector('#join-team-cancel');
const joinTeamSubmit = document.querySelector('#join-team-submit');

const accessModal = document.querySelector('#access-modal');
const accessForm = document.querySelector('#access-form');
const accessDescription = document.querySelector('#access-description');
const accessMembers = document.querySelector('#access-members');
const inviteRole = document.querySelector('#invite-role');
const createInviteBtn = document.querySelector('#create-invite');
const inviteResult = document.querySelector('#invite-result');
const inviteCodeEl = document.querySelector('#invite-code');
const inviteExpiry = document.querySelector('#invite-expiry');
const inviteActive = document.querySelector('#invite-active');
const copyInviteBtn = document.querySelector('#copy-invite');
const accessError = document.querySelector('#access-error');
const accessClose = document.querySelector('#access-close');
const accessRoles = document.querySelector('#access-roles');
const manageRolesBtn = document.querySelector('#manage-roles');

const roleModal = document.querySelector('#role-modal');
const roleForm = document.querySelector('#role-form');
const roleModalTitle = document.querySelector('#role-modal-title');
const roleNameInput = document.querySelector('#role-name');
const rolePermissions = document.querySelector('#role-permissions');
const roleLockedNote = document.querySelector('#role-locked-note');
const roleError = document.querySelector('#role-error');
const roleDelete = document.querySelector('#role-delete');
const roleCancel = document.querySelector('#role-cancel');
const roleSave = document.querySelector('#role-save');

const instancesModal = document.querySelector('#instances-modal');
const instancesForm = document.querySelector('#instances-form');
const instancesServerName = document.querySelector('#instances-server-name');
const instancesClose = document.querySelector('#instances-close');
const instancesRefresh = document.querySelector('#instances-refresh');
const instancesCount = document.querySelector('#instances-count');
const instancesSetup = document.querySelector('#instances-setup');
const instancesSetupCommand = document.querySelector('#instances-setup-command');
const instancesCopySetup = document.querySelector('#instances-copy-setup');
const instanceList = document.querySelector('#instance-list');
const instanceNewBtn = document.querySelector('#instance-new');
const instanceEditor = document.querySelector('#instance-editor');
const instanceEditorTitle = document.querySelector('#instance-editor-title');
const instanceCancelEdit = document.querySelector('#instance-cancel-edit');
const instanceName = document.querySelector('#instance-name');
const instancePort = document.querySelector('#instance-port');
const instanceMaxPlayers = document.querySelector('#instance-max-players');
const instanceVoteSeconds = document.querySelector('#instance-vote-seconds');
const instancePlaylistName = document.querySelector('#instance-playlist-name');
const instanceGamesEl = document.querySelector('#instance-games');
const instanceAddGame = document.querySelector('#instance-add-game');
const instanceStartAfter = document.querySelector('#instance-start-after');
const instanceEditorError = document.querySelector('#instance-editor-error');
const instanceSave = document.querySelector('#instance-save');
const instanceLogPanel = document.querySelector('#instance-log-panel');
const instanceLogTitle = document.querySelector('#instance-log-title');
const instanceLogText = document.querySelector('#instance-log-text');
const instanceLogClose = document.querySelector('#instance-log-close');
const instancesError = document.querySelector('#instances-error');
const instanceMapOptions = document.querySelector('#instance-map-options');
const instanceModeOptions = document.querySelector('#instance-mode-options');

const filesModal = document.querySelector('#files-modal');
const filesForm = document.querySelector('#files-form');
const filesServerName = document.querySelector('#files-server-name');
const filesClose = document.querySelector('#files-close');
const filesUp = document.querySelector('#files-up');
const filesUploadButton = document.querySelector('#files-upload-button');
const filesUploadInput = document.querySelector('#files-upload-input');
const filesNewFolder = document.querySelector('#files-new-folder');
const filesRefresh = document.querySelector('#files-refresh');
const filesPath = document.querySelector('#files-path');
const filesHint = document.querySelector('#files-hint');
const filesError = document.querySelector('#files-error');
const fileList = document.querySelector('#file-list');

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
let accessServerId = '';
let currentInviteCode = '';
let roleEditingId = '';
let roleCatalog = [];
let instanceServerId = '';
let instanceEditingId = '';
let selectedInstanceId = '';
let managedInstances = [];
let instancesBusy = false;
let fileServerId = '';
let filePath = '';
let filesBusy = false;
let desktopBridge = null;
let desktopUpdateBusy = false;
let desktopUpdateAvailable = false;

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

const ROLE_PERMISSION_FALLBACK = [
  { key: 'view', label: 'View server', description: 'See status, map, and players.' },
  { key: 'kick', label: 'Kick players', description: 'Remove a player from the current game.' },
  { key: 'endRound', label: 'End round', description: 'End the current round.' },
  { key: 'endGame', label: 'End game', description: 'End the current game.' },
  { key: 'say', label: 'Broadcast messages', description: 'Message everyone on the server.' },
  { key: 'ban', label: 'Ban players', description: 'Ban by name, ID, or address.' },
  { key: 'unban', label: 'Unban players', description: 'Lift a ban.' },
  { key: 'map', label: 'Change maps', description: 'Load a map or set the next map.' },
  { key: 'catalog', label: 'Browse maps and modes', description: 'Read available map and game names.' },
  { key: 'filesRead', label: 'Read server files', description: 'Browse and download allowed files.' },
  { key: 'filesWrite', label: 'Change server files', description: 'Upload, overwrite, rename, and create folders.' },
  { key: 'filesDelete', label: 'Delete server files', description: 'Permanently delete files. Owner only.', ownerOnly: true },
  { key: 'instancesView', label: 'View server instances', description: 'See panel-managed Reclaimer instances.' },
  { key: 'instancesCreate', label: 'Create server instances', description: 'Create instances and playlists.' },
  { key: 'instancesControl', label: 'Start and stop instances', description: 'Start, stop, and restart instances.' },
  { key: 'instancesDelete', label: 'Delete server instances', description: 'Remove an instance and its files. Owner only.', ownerOnly: true },
];

function roleLabel(role, roleName) {
  if (roleName) return roleName;
  if (role === 'owner') return 'Owner';
  if (role === 'moderator') return 'Moderator';
  if (role === 'developer') return 'Developer';
  if (role === 'custom') return 'Custom role';
  return '';
}
function serverRoleLabel(server) {
  return server ? roleLabel(server.role, server.roleName) : '';
}
function permissionCatalog() {
  return roleCatalog.length ? roleCatalog : ROLE_PERMISSION_FALLBACK;
}
function permissionDescription(key) {
  const found = permissionCatalog().find((item) => item.key === key);
  return found ? found.description : '';
}
function hasPermission(server, permission) {
  return !!(server && server.permissions && server.permissions[permission]);
}
function canCreateInstance() {
  return hasPermission(currentServer(), 'instancesCreate');
}
function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}
function joinFilePath(dir, name) {
  return [dir, name].filter(Boolean).join('/');
}
function applyServerPermissions(server) {
  if (selectedRole) {
    const label = serverRoleLabel(server);
    selectedRole.textContent = label;
    selectedRole.hidden = !label;
    selectedRole.className = `role-badge${server && server.role ? ` ${server.role}` : ''}`;
  }
  for (const element of document.querySelectorAll('#main [data-permission]')) {
    element.hidden = !hasPermission(server, element.dataset.permission);
  }
  const canModerate = ['kick', 'ban', 'unban'].some((permission) => hasPermission(server, permission));
  if (moderationEmpty) moderationEmpty.hidden = !server || canModerate;
  const isOwner = !!server && server.role === 'owner';
  if (manageAccessBtn) manageAccessBtn.hidden = !isOwner;
  if (editServerBtn) editServerBtn.hidden = !isOwner;
  if (deleteServerBtn) deleteServerBtn.hidden = !isOwner;
  if (agentSetupBtn) agentSetupBtn.hidden = !isOwner || !server || server.connectionMode !== 'agent';
  if (serverFilesBtn) serverFilesBtn.hidden = !hasPermission(server, 'filesRead') || !server || server.connectionMode !== 'agent';
  if (serverInstancesBtn) serverInstancesBtn.hidden = !hasPermission(server, 'instancesView') || !server || server.connectionMode !== 'agent';
  if (instanceNewBtn) instanceNewBtn.hidden = !hasPermission(server, 'instancesCreate');
  if (instancePicker) instancePicker.hidden = !server || server.connectionMode !== 'agent' || !hasPermission(server, 'instancesView') || !managedInstances.length;
}
function populateInstanceSelect(server) {
  if (!instanceSelect) return;
  const previous = selectedInstanceId;
  instanceSelect.replaceChildren(new Option('Default RCON', ''));
  if (!server || server.connectionMode !== 'agent' || !hasPermission(server, 'instancesView')) {
    selectedInstanceId = '';
    if (instancePicker) instancePicker.hidden = true;
    return;
  }
  for (const instance of managedInstances) {
    instanceSelect.append(new Option(`${instance.name}${instance.running ? '' : ' (stopped)'}`, instance.id));
  }
  if (managedInstances.some((instance) => instance.id === previous)) {
    selectedInstanceId = previous;
    instanceSelect.value = previous;
  } else {
    selectedInstanceId = '';
    instanceSelect.value = '';
  }
  if (instancePicker) instancePicker.hidden = server.connectionMode !== 'agent' || !managedInstances.length;
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
  if (accessModal && accessModal.open) accessModal.close();
  if (roleModal && roleModal.open) roleModal.close();
  if (instancesModal && instancesModal.open) instancesModal.close();
  if (filesModal && filesModal.open) filesModal.close();
  if (joinTeamModal && joinTeamModal.open) joinTeamModal.close();
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
  accessServerId = '';
  roleEditingId = '';
  instanceServerId = '';
  instanceEditingId = '';
  selectedInstanceId = '';
  managedInstances = [];
  currentInviteCode = '';
  if (accessModal && accessModal.open) accessModal.close();
  if (roleModal && roleModal.open) roleModal.close();
  if (instancesModal && instancesModal.open) instancesModal.close();
  if (filesModal && filesModal.open) filesModal.close();
  if (serverList) serverList.replaceChildren();
  if (serverSelect) serverSelect.replaceChildren();
  if (serverWorkspace) serverWorkspace.hidden = true;
  if (emptyState) emptyState.hidden = true;
  selectedName.textContent = 'No server selected';
  if (selectedRole) selectedRole.hidden = true;
  selectedStatus.textContent = 'Sign in to load servers.';
  selectedStatus.classList.remove('connected', 'disconnected');
  playerList.textContent = 'No server selected.';
  playerCount.textContent = '—';
  detailMode.textContent = '—';
  detailHost.textContent = '—';
  detailPort.textContent = '—';
  detailAgent.textContent = '—';
  if (detailRole) detailRole.textContent = '—';
  detailCreated.textContent = '—';
  connectionHint.textContent = 'The RCON password is stored on the panel server and is never sent back to your browser.';
  applyServerPermissions(null);
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
    if (detailRole) detailRole.textContent = '—';
    detailCreated.textContent = '—';
    connectionHint.textContent = 'The RCON password is stored on the panel server and is never sent back to your browser.';
    applyServerPermissions(null);
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
  if (detailRole) detailRole.textContent = serverRoleLabel(server) || '—';
  detailCreated.textContent = formatDate(server.createdAt);
  populateInstanceSelect(server);
  connectionHint.textContent = isAgent
    ? 'The agent runs next to your game server and connects out to this panel. Your RCON password stays on the game-server PC.'
    : 'The RCON password is stored on the panel server and is never sent back to your browser.';
  applyServerPermissions(server);
  setActionsEnabled(isAgent ? !!server.agentOnline : !server.error);
  if (serverFilesBtn) serverFilesBtn.disabled = !isAgent || !server.agentOnline;
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

function fillInstanceOptions(data) {
  if (!instanceMapOptions || !instanceModeOptions) return;
  const maps = catalogNames(data && data.maps);
  const modes = catalogNames(data && data.modes);
  instanceMapOptions.replaceChildren(...maps.map((name) => new Option(name, name)));
  instanceModeOptions.replaceChildren(...modes.map((name) => new Option(name, name)));
}

async function loadCatalog(server, notify = false, force = false) {
  if (!server || !hasPermission(server, 'catalog')) return;
  const instanceId = server.id === selectedServerId ? selectedInstanceId : '';
  const requestedId = `${server.id}:${instanceId || 'default'}`;
  if (!force && catalogServerId === requestedId) return;
  catalogServerId = requestedId;
  const fetchCatalog = async (targetInstanceId) => {
    const query = new URLSearchParams({ serverId: server.id });
    if (targetInstanceId) query.set('instanceId', targetInstanceId);
    return api(`/api/catalog?${query.toString()}`);
  };
  try {
    let data;
    try {
      data = await fetchCatalog(instanceId);
    } catch (error) {
      if (!instanceId) throw error;
      data = await fetchCatalog('');
    }
    if (catalogServerId !== requestedId) return;
    fillSelect(mapForm.elements.map, 'Select map…', catalogNames(data.maps));
    fillSelect(mapForm.elements.mode, 'Select mode…', catalogNames(data.modes));
    fillInstanceOptions(data);
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
  selectedInstanceId = '';
  managedInstances = [];
  catalogServerId = '';
  renderTiles();
  renderSelected();
  const server = currentServer();
  if (server && hasPermission(server, 'instancesView')) loadInstances(server, true).catch(() => {});
  if (server && hasPermission(server, 'catalog')) loadCatalog(server, true, true).catch(() => {});
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
    if (selected && hasPermission(selected, 'instancesView')) await loadInstances(selected, true).catch(() => {});
    if (selected && selectedInstanceId) await refreshInstanceStatus(selected).catch(() => {});
    if (selected && hasPermission(selected, 'catalog')) loadCatalog(selected, false, true).catch(() => {});
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
  const body = { ...payload, serverId: server.id };
  if (selectedInstanceId && server.id === selectedServerId) body.instanceId = selectedInstanceId;
  const data = await api('/api/action', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (data && data.result) showToast(String(data.result));
  return data;
}

function showInstancesError(message) {
  if (!instancesError) return;
  instancesError.textContent = message || '';
  instancesError.hidden = !message;
}

function showInstanceEditorError(message) {
  if (!instanceEditorError) return;
  instanceEditorError.textContent = message || '';
  instanceEditorError.hidden = !message;
}

function defaultInstancePort() {
  const used = new Set(managedInstances.map((instance) => Number(instance.port)));
  for (let port = 49200; port <= 49299; port += 1) {
    if (!used.has(port)) return port;
  }
  return 49300;
}

async function loadInstances(server, silent = false) {
  if (!server || server.connectionMode !== 'agent' || !hasPermission(server, 'instancesView') || instancesBusy) return;
  instancesBusy = true;
  try {
    const data = await api(`/api/servers/${encodeURIComponent(server.id)}/instances`);
    if (!currentServer() || currentServer().id !== server.id) return;
    managedInstances = Array.isArray(data.instances) ? data.instances : [];
    server.instancesEnabled = data.configured !== false;
    populateInstanceSelect(server);
    if (instancesModal && instancesModal.open) renderInstancesList();
    if (instancesSetup) instancesSetup.hidden = data.configured !== false;
    if (instancesCount) {
      instancesCount.textContent = data.configured === false
        ? 'Agent setup required'
        : `${managedInstances.length} of ${data.maxInstances || 20} instance${managedInstances.length === 1 ? '' : 's'}`;
    }
    if (data.configured === false && data.reason && !silent) showInstancesError(data.reason);
  } catch (error) {
    if (!currentServer() || currentServer().id !== server.id) return;
    managedInstances = [];
    populateInstanceSelect(server);
    if (instancesModal && instancesModal.open) renderInstancesList();
    if (instancesSetup) instancesSetup.hidden = false;
    if (!silent) showInstancesError(error.message);
  } finally {
    instancesBusy = false;
  }
}

async function refreshInstanceStatus(server) {
  if (!server || !selectedInstanceId) return;
  const instanceId = selectedInstanceId;
  try {
    const data = await api(`/api/servers/${encodeURIComponent(server.id)}/instances/${encodeURIComponent(instanceId)}/status`);
    if (selectedInstanceId !== instanceId || !currentServer() || currentServer().id !== server.id) return;
    selectedStatus.classList.remove('connected', 'disconnected');
    if (data.running) {
      selectedStatus.textContent = data.error || data.status || 'Instance is running.';
      selectedStatus.classList.toggle('disconnected', !!data.error);
      selectedStatus.classList.toggle('connected', !data.error);
      playerList.textContent = data.players || 'No players connected.';
      playerCount.textContent = playerTotal(data.players);
    } else {
      selectedStatus.textContent = 'This managed instance is stopped. Start it from Server instances.';
      selectedStatus.classList.add('disconnected');
      playerList.textContent = 'Instance stopped.';
      playerCount.textContent = '—';
    }
  } catch (error) {
    if (selectedInstanceId !== instanceId) return;
    selectedStatus.textContent = error.message;
    selectedStatus.classList.remove('connected');
    selectedStatus.classList.add('disconnected');
    playerList.textContent = 'Instance status unavailable.';
    playerCount.textContent = '—';
  }
}

function instanceOperationButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${className}`;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderInstancesList() {
  if (!instanceList) return;
  instanceList.replaceChildren();
  if (!managedInstances.length) {
    const empty = document.createElement('div');
    empty.className = 'instance-empty';
    empty.textContent = canCreateInstance()
      ? 'No managed Reclaimer servers yet. Create one above with a playlist; the agent will write the config and start it.'
      : 'No managed Reclaimer servers yet. The server owner or a role with Create server instances can add one.';
    instanceList.append(empty);
    return;
  }
  const server = currentServer();
  for (const instance of managedInstances) {
    const row = document.createElement('div');
    row.className = 'instance-row';
    const main = document.createElement('div');
    main.className = 'instance-main';
    const title = document.createElement('div');
    title.className = 'instance-title-line';
    const name = document.createElement('span');
    name.className = 'instance-name';
    name.textContent = instance.name;
    const state = document.createElement('span');
    state.className = `instance-state${instance.running ? ' online' : ''}`;
    state.textContent = instance.running ? 'Running' : 'Stopped';
    title.append(name, state);
    if (server && server.id === selectedServerId && selectedInstanceId === instance.id) {
      const active = document.createElement('span');
      active.className = 'role-chip custom';
      active.textContent = 'Controlled';
      title.append(active);
    }
    const meta = document.createElement('div');
    meta.className = 'instance-meta';
    const gameCount = instance.playlist && Array.isArray(instance.playlist.games) ? instance.playlist.games.length : 0;
    meta.textContent = `Port ${instance.port} · ${gameCount} game${gameCount === 1 ? '' : 's'} · ${instance.playlist ? instance.playlist.name : 'No playlist'}`;
    main.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'instance-actions';
    if (instance.running) {
      actions.append(instanceOperationButton('Control', 'button-secondary', () => {
        selectedInstanceId = instance.id;
        populateInstanceSelect(server);
        if (instancesModal && instancesModal.open) instancesModal.close();
        catalogServerId = '';
        if (server) loadCatalog(server, true, true).catch(() => {});
        refreshInstanceStatus(server).catch(() => {});
        showToast(`Now controlling ${instance.name}.`);
      }));
    }
    if (hasPermission(server, 'instancesControl')) {
      if (instance.running) {
        actions.append(instanceOperationButton('Stop', 'button-danger', () => runInstanceOperation(instance, 'stop')));
        actions.append(instanceOperationButton('Restart', 'button-quiet', () => runInstanceOperation(instance, 'restart')));
      } else {
        actions.append(instanceOperationButton('Start', 'button-primary', () => runInstanceOperation(instance, 'start')));
      }
    }
    if (hasPermission(server, 'instancesCreate')) {
      actions.append(instanceOperationButton('Edit', 'button-quiet', () => openInstanceEditor(instance)));
    }
    if (hasPermission(server, 'instancesView')) {
      actions.append(instanceOperationButton('Logs', 'button-quiet', () => showInstanceLogs(instance)));
    }
    if (hasPermission(server, 'instancesDelete')) {
      actions.append(instanceOperationButton('Delete', 'button-danger', () => deleteInstance(instance)));
    }
    row.append(main, actions);
    instanceList.append(row);
  }
}

async function runInstanceOperation(instance, operation) {
  const server = currentServer();
  if (!server) return;
  if (operation === 'stop' && !window.confirm(`Stop "${instance.name}"? Players will disconnect.`)) return;
  if (operation === 'restart' && !window.confirm(`Restart "${instance.name}"? Players will disconnect briefly.`)) return;
  showInstancesError('');
  try {
    await api(`/api/servers/${encodeURIComponent(server.id)}/instances/${encodeURIComponent(instance.id)}/${operation}`, { method: 'POST' });
    showToast(`Instance ${operation === 'start' ? 'started' : operation === 'stop' ? 'stopped' : 'restarted'}.`);
    await loadInstances(server, true);
    if (selectedInstanceId === instance.id || operation === 'start') await refreshInstanceStatus(server);
  } catch (error) {
    showInstancesError(error.message);
  }
}

async function deleteInstance(instance) {
  const server = currentServer();
  if (!server) return;
  if (!window.confirm(`Delete "${instance.name}" and its managed server files? This cannot be undone.`)) return;
  showInstancesError('');
  try {
    await api(`/api/servers/${encodeURIComponent(server.id)}/instances/${encodeURIComponent(instance.id)}`, { method: 'DELETE' });
    if (selectedInstanceId === instance.id) selectedInstanceId = '';
    showToast('Instance deleted.');
    await loadInstances(server, true);
    renderSelected();
  } catch (error) {
    showInstancesError(error.message);
  }
}

async function showInstanceLogs(instance) {
  const server = currentServer();
  if (!server || !instanceLogPanel) return;
  try {
    const data = await api(`/api/servers/${encodeURIComponent(server.id)}/instances/${encodeURIComponent(instance.id)}/logs`);
    instanceLogTitle.textContent = `${instance.name} log`;
    instanceLogText.textContent = data.text || 'No log output yet.';
    instanceLogPanel.hidden = false;
    instanceLogPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    showInstancesError(error.message);
  }
}

function addInstanceGame(game = {}) {
  if (!instanceGamesEl) return;
  const row = document.createElement('div');
  row.className = 'game-row';
  const makeField = (labelText, value, placeholder, listId) => {
    const label = document.createElement('label');
    label.className = 'field';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.value = value || '';
    input.placeholder = placeholder;
    input.maxLength = 160;
    if (listId) input.setAttribute('list', listId);
    label.append(input);
    return { label, input };
  };
  const gameName = makeField('Name (optional)', game.name, 'Game name', '');
  const map = makeField('Map', game.map, 'Map name', 'instance-map-options');
  const mode = makeField('Game type', game.game, 'Slayer, Capture the Flag…', 'instance-mode-options');
  gameName.input.dataset.field = 'name';
  map.input.dataset.field = 'map';
  mode.input.dataset.field = 'game';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button button-danger game-remove';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => row.remove());
  row.append(gameName.label, map.label, mode.label, remove);
  instanceGamesEl.append(row);
}

function collectInstanceGames() {
  if (!instanceGamesEl) return [];
  return [...instanceGamesEl.querySelectorAll('.game-row')].map((row) => {
    const values = {};
    for (const input of row.querySelectorAll('input[data-field]')) values[input.dataset.field] = input.value.trim();
    return {
      name: values.name || '',
      map: values.map || '',
      game: values.game || '',
      antiCheat: false,
    };
  }).filter((game) => game.name || game.map || game.game);
}

function resetInstanceEditor() {
  instanceEditingId = '';
  if (instanceEditor) instanceEditor.hidden = true;
  if (instanceLogPanel) instanceLogPanel.hidden = true;
  if (instanceGamesEl) instanceGamesEl.replaceChildren();
  if (instanceName) instanceName.value = '';
  if (instancePort) instancePort.value = '';
  if (instanceMaxPlayers) instanceMaxPlayers.value = '16';
  if (instanceVoteSeconds) instanceVoteSeconds.value = '20';
  if (instancePlaylistName) instancePlaylistName.value = '';
  if (instanceStartAfter) instanceStartAfter.checked = true;
  if (instanceSave)  instanceSave.textContent = 'Create server';
  showInstanceEditorError('');
}

function openInstanceEditor(instance = null) {
  if (!instanceEditor) return;
  resetInstanceEditor();
  instanceEditor.hidden = false;
  instanceLogPanel.hidden = true;
  if (instance) {
    instanceEditingId = instance.id;
    instanceEditorTitle.textContent = `Edit ${instance.name}`;
    instanceName.value = instance.name;
    instancePort.value = String(instance.port || '');
    instanceMaxPlayers.value = String(instance.maxPlayers || 16);
    instancePlaylistName.value = instance.playlist ? instance.playlist.name : '';
    instanceVoteSeconds.value = String(instance.playlist ? instance.playlist.voteSeconds : 20);
    instanceStartAfter.checked = false;
    instanceSave.textContent = 'Save changes';
    for (const game of (instance.playlist && instance.playlist.games) || []) addInstanceGame(game);
    while (instanceGamesEl.children.length < 3) addInstanceGame();
  } else {
    instanceEditorTitle.textContent = 'New Reclaimer server';
    instancePort.value = String(defaultInstancePort());
    for (let index = 0; index < 3; index += 1) addInstanceGame();
  }
  instanceName.focus();
}

async function saveInstance(event) {
  event.preventDefault();
  const server = currentServer();
  if (!server) return;
  const name = instanceName.value.trim();
  const games = collectInstanceGames();
  if (name.length < 2) return showInstanceEditorError('Server name must be 2-80 characters.');
  if (games.length < 3) return showInstanceEditorError('A playlist needs at least three different games. Add a third map/game type.');
  if (games.some((game) => !game.map || !game.game)) return showInstanceEditorError('Every game needs a map and a game type.');
  const gameKeys = new Set(games.map((game) => `${game.map.toLowerCase()}\u0000${game.game.toLowerCase()}`));
  if (gameKeys.size !== games.length) return showInstanceEditorError('Each playlist game must use a different map and game type.');
  const portValue = instancePort.value.trim();
  const body = {
    name,
    maxPlayers: Number(instanceMaxPlayers.value) || 16,
    playlist: {
      name: instancePlaylistName.value.trim() || `${name} playlist`,
      voteSeconds: Number(instanceVoteSeconds.value) || 20,
      games,
    },
  };
  if (portValue) body.port = Number(portValue);
  showInstanceEditorError('');
  instanceSave.disabled = true;
  try {
    let data;
    if (instanceEditingId) {
      data = await api(`/api/servers/${encodeURIComponent(server.id)}/instances/${encodeURIComponent(instanceEditingId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      showToast('Instance playlist updated.');
    } else {
      body.start = !!instanceStartAfter.checked;
      data = await api(`/api/servers/${encodeURIComponent(server.id)}/instances`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      showToast(data && data.started ? 'Server created and online.' : 'Server created. Start it when you are ready.');
      if (data && data.startError) showInstancesError(data.startError);
    }
    resetInstanceEditor();
    await loadInstances(server, true);
    if (data && data.instance && data.instance.running) {
      selectedInstanceId = data.instance.id;
      populateInstanceSelect(server);
      await refreshInstanceStatus(server);
    }
  } catch (error) {
    showInstanceEditorError(error.message);
  } finally {
    instanceSave.disabled = false;
  }
}

async function openInstancesModal() {
  const server = currentServer();
  if (!server || server.connectionMode !== 'agent' || !hasPermission(server, 'instancesView') || !instancesModal) return;
  instanceServerId = server.id;
  instancesServerName.textContent = server.name;
  showInstancesError('');
  resetInstanceEditor();
  renderInstancesList();
  instancesSetup.hidden = server.instancesEnabled !== false;
  if (!instancesModal.open) instancesModal.showModal();
  if (hasPermission(server, 'catalog')) loadCatalog(server, false, true).catch(() => {});
  await loadInstances(server, true).catch(() => {});
}

function closeInstancesModal() {
  if (instancesModal && instancesModal.open) instancesModal.close();
  resetInstanceEditor();
  showInstancesError('');
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

function showJoinTeamError(message) {
  if (!joinTeamError) return;
  joinTeamError.textContent = message || '';
  joinTeamError.hidden = !message;
}

function openJoinTeam() {
  if (!joinTeamModal) return;
  joinTeamForm.reset();
  showJoinTeamError('');
  if (!joinTeamModal.open) joinTeamModal.showModal();
  setTimeout(() => joinTeamCode.focus(), 40);
}

async function handleJoinTeam(event) {
  event.preventDefault();
  showJoinTeamError('');
  const code = joinTeamCode.value.trim().toUpperCase();
  if (!code) {
    showJoinTeamError('Enter the access code from the server owner.');
    return;
  }
  joinTeamSubmit.disabled = true;
  try {
    const data = await api('/api/servers/join', { method: 'POST', body: JSON.stringify({ code }) });
    joinTeamModal.close();
    joinTeamForm.reset();
    if (data && data.server && data.server.id) selectedServerId = data.server.id;
    await refresh();
    showToast(`Joined "${data.server.name}" as ${serverRoleLabel(data.server)}.`);
  } catch (error) {
    showJoinTeamError(error.message);
  } finally {
    joinTeamSubmit.disabled = false;
  }
}

function showAccessError(message) {
  if (!accessError) return;
  accessError.textContent = message || '';
  accessError.hidden = !message;
}

function defaultClientRoles() {
  return [
    {
      id: 'role_moderator', key: 'moderator', name: 'Moderator', builtin: true,
      permissions: ['view', 'kick', 'endRound', 'endGame'],
    },
    {
      id: 'role_developer', key: 'developer', name: 'Developer', builtin: true,
      permissions: ['view', 'catalog', 'map', 'filesRead', 'filesWrite', 'instancesView', 'instancesCreate', 'instancesControl'],
    },
  ];
}

function clientRoles(server) {
  if (!server) return defaultClientRoles();
  if (!Array.isArray(server.roles) || !server.roles.length) server.roles = defaultClientRoles();
  return server.roles;
}

function populateRoleSelect(select, roles, selectedId) {
  if (!select) return;
  select.replaceChildren(...roles.map((role) => new Option(role.name, role.id)));
  if (roles.some((role) => role.id === selectedId)) select.value = selectedId;
  else if (roles.length) select.value = roles[0].id;
}

async function openAccessModal() {
  const server = currentServer();
  if (!server || server.role !== 'owner' || !accessModal) return;
  accessServerId = server.id;
  currentInviteCode = '';
  inviteResult.hidden = true;
  inviteCodeEl.textContent = '----';
  accessDescription.textContent = `Control who can help with "${server.name}". Create roles, tick their permissions, and invite people with a single-use code.`;
  showAccessError('');
  renderRoleList(server);
  renderAccessMembers(server);
  renderInviteRoles(server);
  renderInviteState(server);
  if (!accessModal.open) accessModal.showModal();
  try {
    const data = await api(`/api/servers/${encodeURIComponent(server.id)}/access`);
    if (!currentServer() || currentServer().id !== server.id || !accessModal.open) return;
    if (Array.isArray(data.roles)) server.roles = data.roles;
    if (Array.isArray(data.members)) server.members = data.members;
    if (Array.isArray(data.permissions) && data.permissions.length) roleCatalog = data.permissions;
    server.memberInvite = data.invite || null;
    renderRoleList(server);
    renderAccessMembers(server);
    renderInviteRoles(server);
    renderInviteState(server);
  } catch (error) {
    showAccessError(error.message);
  }
}

function renderInviteRoles(server) {
  const roles = clientRoles(server);
  const previous = inviteRole.value || (server.memberInvite && server.memberInvite.roleId) || 'role_moderator';
  populateRoleSelect(inviteRole, roles, previous);
}

function renderRoleList(server) {
  if (!accessRoles) return;
  accessRoles.replaceChildren();
  const roles = clientRoles(server);
  for (const role of roles) {
    const row = document.createElement('div');
    row.className = 'role-row';
    const copy = document.createElement('div');
    copy.className = 'role-copy';
    const name = document.createElement('div');
    name.className = 'role-name';
    name.textContent = role.name;
    const summary = document.createElement('small');
    const permissions = Array.isArray(role.permissions) ? role.permissions : [];
    const labels = permissions.slice(0, 4).map((key) => permissionDescription(key) || key);
    summary.textContent = permissions.length
      ? `${permissions.length} permission${permissions.length === 1 ? '' : 's'} · ${labels.join(', ')}${permissions.length > 4 ? '…' : ''}`
      : 'No permissions selected';
    copy.append(name, summary);
    const chip = document.createElement('span');
    chip.className = `role-chip${role.builtin ? '' : ' custom'}`;
    chip.textContent = role.builtin ? 'Built-in' : 'Custom';
    row.append(copy, chip);
    if (!role.builtin) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'button button-quiet';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openRoleEditor(role.id));
      row.append(edit);
    } else {
      const spacer = document.createElement('span');
      row.append(spacer);
    }
    accessRoles.append(row);
  }
}

function renderInviteState(server) {
  const invite = server && server.memberInvite;
  if (!invite) {
    inviteActive.hidden = true;
    inviteActive.textContent = '';
    return;
  }
  inviteActive.hidden = false;
  const label = invite.roleName || roleLabel(invite.role);
  inviteActive.textContent = `An active ${label} invitation expires ${formatDateTime(invite.expiresAt)}. Creating a new code replaces it.`;
}

function renderAccessMembers(server) {
  accessMembers.replaceChildren();

  const ownerRow = document.createElement('div');
  ownerRow.className = 'member-row';
  const ownerName = document.createElement('div');
  ownerName.className = 'member-name';
  ownerName.textContent = server.ownerName || 'Server owner';
  const ownerNote = document.createElement('small');
  ownerNote.textContent = 'Server owner · every permission';
  ownerName.append(ownerNote);
  const ownerSpacer = document.createElement('span');
  const ownerBadge = document.createElement('span');
  ownerBadge.className = 'member-owner';
  ownerBadge.textContent = 'Owner';
  ownerRow.append(ownerName, ownerSpacer, ownerBadge);
  accessMembers.append(ownerRow);

  const members = Array.isArray(server.members) ? server.members : [];
  if (!members.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No one has joined this server team yet. Create a code below after you make the role you want.';
    accessMembers.append(empty);
    return;
  }

  const roles = clientRoles(server);
  for (const member of members) {
    const row = document.createElement('div');
    row.className = 'member-row';
    const name = document.createElement('div');
    name.className = 'member-name';
    name.textContent = member.username || 'Team member';
    const note = document.createElement('small');
    note.textContent = member.addedAt ? `Joined ${formatDateTime(member.addedAt)}` : 'Team member';
    name.append(note);

    const roleSelect = document.createElement('select');
    roleSelect.setAttribute('aria-label', `Role for ${member.username || 'team member'}`);
    const selectedId = member.roleId || `role_${member.role}`;
    populateRoleSelect(roleSelect, roles, selectedId);
    const previousId = roleSelect.value;
    roleSelect.addEventListener('change', () => {
      changeMemberRole(member, roleSelect.value).catch((error) => {
        showAccessError(error.message);
        roleSelect.value = previousId;
      });
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeMember(member).catch((error) => showAccessError(error.message)));

    row.append(name, roleSelect, remove);
    accessMembers.append(row);
  }
}

async function changeMemberRole(member, roleId) {
  const server = currentServer();
  if (!server || !accessServerId) return;
  const data = await api(`/api/servers/${encodeURIComponent(accessServerId)}/members/${encodeURIComponent(member.userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ roleId }),
  });
  if (Array.isArray(data.members)) server.members = data.members;
  if (Array.isArray(data.roles)) server.roles = data.roles;
  renderAccessMembers(server);
  renderRoleList(server);
  renderInviteRoles(server);
  const role = clientRoles(server).find((item) => item.id === roleId);
  showToast(`${member.username || 'Team member'} is now ${role ? role.name : 'assigned a new role'}.`);
}

async function removeMember(member) {
  const server = currentServer();
  if (!server || !accessServerId) return;
  if (!window.confirm(`Remove ${member.username || 'this person'} from "${server.name}"?`)) return;
  const data = await api(`/api/servers/${encodeURIComponent(accessServerId)}/members/${encodeURIComponent(member.userId)}`, { method: 'DELETE' });
  server.members = Array.isArray(data.members) ? data.members : [];
  renderAccessMembers(server);
  showToast(`${member.username || 'Team member'} removed.`);
}

async function createTeamInvite() {
  const server = currentServer();
  if (!server || !accessServerId) return;
  createInviteBtn.disabled = true;
  showAccessError('');
  try {
    const data = await api(`/api/servers/${encodeURIComponent(accessServerId)}/access/invite`, {
      method: 'POST',
      body: JSON.stringify({ roleId: inviteRole.value }),
    });
    currentInviteCode = data.code;
    inviteCodeEl.textContent = data.code;
    inviteExpiry.textContent = `Expires ${formatDateTime(data.expiresAt)}. It works once.`;
    inviteResult.hidden = false;
    server.memberInvite = { roleId: data.roleId, role: data.role, roleName: data.roleName, expiresAt: data.expiresAt };
    renderInviteState(server);
    showToast(`${data.roleName || roleLabel(data.role)} access code created.`);
  } catch (error) {
    showAccessError(error.message);
  } finally {
    createInviteBtn.disabled = false;
  }
}

function showRoleError(message) {
  if (!roleError) return;
  roleError.textContent = message || '';
  roleError.hidden = !message;
}

function renderRolePermissionGrid(selected = []) {
  if (!rolePermissions) return;
  rolePermissions.replaceChildren();
  const selectedSet = new Set(Array.isArray(selected) ? selected : []);
  for (const permission of permissionCatalog()) {
    if (permission.ownerOnly) continue;
    const label = document.createElement('label');
    label.className = 'permission-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = permission.key;
    checkbox.checked = selectedSet.has(permission.key);
    const copy = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = permission.label;
    const small = document.createElement('small');
    small.textContent = permission.description || '';
    copy.append(strong, small);
    label.append(checkbox, copy);
    rolePermissions.append(label);
  }
  const implied = { instancesCreate: 'instancesView', instancesControl: 'instancesView', filesWrite: 'filesRead', map: 'catalog' };
  for (const checkbox of rolePermissions.querySelectorAll('input[type="checkbox"]')) {
    checkbox.addEventListener('change', () => {
      const dependency = implied[checkbox.value];
      if (!checkbox.checked || !dependency) return;
      const target = rolePermissions.querySelector(`input[value="${dependency}"]`);
      if (target) target.checked = true;
    });
  }
  if (roleLockedNote) roleLockedNote.hidden = false;
}

function openRoleEditor(roleId = '') {
  const server = currentServer();
  if (!server || server.role !== 'owner' || !roleModal) return;
  const role = roleId ? clientRoles(server).find((item) => item.id === roleId) : null;
  if (role && role.builtin) return;
  roleEditingId = role ? role.id : '';
  roleModalTitle.textContent = role ? `Edit ${role.name}` : 'Create a role';
  roleNameInput.value = role ? role.name : '';
  roleDelete.hidden = !role;
  roleSave.textContent = role ? 'Save role' : 'Create role';
  showRoleError('');
  renderRolePermissionGrid(role ? role.permissions : ['view']);
  if (!roleModal.open) roleModal.showModal();
  roleNameInput.focus();
}

async function saveRole(event) {
  event.preventDefault();
  const server = currentServer();
  if (!server) return;
  const name = roleNameInput.value.trim();
  if (name.length < 2) return showRoleError('Role name must be 2-32 characters.');
  const permissions = [...rolePermissions.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  roleSave.disabled = true;
  showRoleError('');
  try {
    const payload = { name, permissions };
    const path = roleEditingId
      ? `/api/servers/${encodeURIComponent(server.id)}/roles/${encodeURIComponent(roleEditingId)}`
      : `/api/servers/${encodeURIComponent(server.id)}/roles`;
    const data = await api(path, { method: roleEditingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    if (Array.isArray(data.roles)) server.roles = data.roles;
    if (Array.isArray(data.permissions) && data.permissions.length) roleCatalog = data.permissions;
    renderRoleList(server);
    renderAccessMembers(server);
    renderInviteRoles(server);
    roleModal.close();
    showToast(roleEditingId ? 'Role updated.' : 'Role created.');
  } catch (error) {
    showRoleError(error.message);
  } finally {
    roleSave.disabled = false;
  }
}

async function deleteRole() {
  const server = currentServer();
  if (!server || !roleEditingId) return;
  const role = clientRoles(server).find((item) => item.id === roleEditingId);
  if (!role) return;
  if (!window.confirm(`Delete the "${role.name}" role?`)) return;
  roleDelete.disabled = true;
  try {
    const data = await api(`/api/servers/${encodeURIComponent(server.id)}/roles/${encodeURIComponent(roleEditingId)}`, { method: 'DELETE' });
    if (Array.isArray(data.roles)) server.roles = data.roles;
    renderRoleList(server);
    renderAccessMembers(server);
    renderInviteRoles(server);
    roleModal.close();
    showToast('Role deleted.');
  } catch (error) {
    showRoleError(error.message);
  } finally {
    roleDelete.disabled = false;
  }
}

function showFilesError(message) {
  if (!filesError) return;
  filesError.textContent = message || '';
  filesError.hidden = !message;
}

function openFilesModal() {
  const server = currentServer();
  if (!server || !hasPermission(server, 'filesRead') || !filesModal) return;
  fileServerId = server.id;
  filePath = '';
  filesServerName.textContent = server.name;
  showFilesError('');
  filesHint.textContent = hasPermission(server, 'filesDelete')
    ? 'Only server-content file types are accepted. Uploads overwrite files with the same name. You can delete files and empty folders as the owner.'
    : 'Only server-content file types are accepted. Uploads overwrite files with the same name. Developers can add and change files, but only the owner can delete them.';
  if (!filesModal.open) filesModal.showModal();
  if (server.filesEnabled === false) {
    filesPath.textContent = '/';
    filesUp.hidden = true;
    const empty = document.createElement('div');
    empty.className = 'file-empty';
    empty.textContent = 'The agent is connected, but its file manager is off. On the game-server PC, stop the agent and run OmniVaultAgent.exe --set-files-dir "C:\\Path\\To\\Your\\Server\\Content", then start the agent again and reopen this window.';
    fileList.replaceChildren(empty);
    return;
  }
  loadFiles('').catch((error) => showFilesError(error.message));
}

async function loadFiles(path = filePath) {
  if (!fileServerId || filesBusy) return;
  filesBusy = true;
  filesRefresh.disabled = true;
  showFilesError('');
  try {
    const data = await api(`/api/servers/${encodeURIComponent(fileServerId)}/files?path=${encodeURIComponent(path)}`);
    filePath = data.path || '';
    filesPath.textContent = `/${filePath}`;
    filesUp.hidden = !filePath;
    renderFileList(Array.isArray(data.entries) ? data.entries : [], data.configured !== false);
  } finally {
    filesBusy = false;
    filesRefresh.disabled = false;
  }
}

function renderFileList(entries, configured) {
  fileList.replaceChildren();
  if (!configured) {
    const empty = document.createElement('div');
    empty.className = 'file-empty';
    empty.textContent = 'The file manager is not configured on this agent. Re-run agent setup with --files-dir pointing at the server content folder.';
    fileList.append(empty);
    return;
  }
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'file-empty';
    empty.textContent = 'This folder is empty. Upload maps or create a folder to get started.';
    fileList.append(empty);
    return;
  }

  const server = findServer(fileServerId);
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'file-row';

    const main = document.createElement('div');
    main.className = 'file-main';
    const icon = document.createElement('span');
    icon.className = `file-icon${entry.type === 'dir' ? ' dir' : ''}`;
    icon.textContent = entry.type === 'dir' ? 'D' : 'F';
    const copy = document.createElement('div');
    copy.style.minWidth = '0';
    if (entry.type === 'dir') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'file-name button-link';
      button.textContent = entry.name;
      button.addEventListener('click', () => loadFiles(joinFilePath(filePath, entry.name)).catch((error) => showFilesError(error.message)));
      copy.append(button);
    } else {
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = entry.name;
      copy.append(name);
    }
    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.textContent = entry.type === 'dir'
      ? 'Folder'
      : `${formatBytes(entry.size)} · ${formatDateTime(entry.modifiedAt)}${entry.allowed === false ? ' · unsupported type' : ''}`;
    copy.append(meta);
    main.append(icon, copy);

    const actions = document.createElement('div');
    actions.className = 'file-actions';
    if (entry.type === 'dir') {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'button button-quiet';
      open.textContent = 'Open';
      open.addEventListener('click', () => loadFiles(joinFilePath(filePath, entry.name)).catch((error) => showFilesError(error.message)));
      actions.append(open);
    } else if (entry.allowed !== false) {
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'button button-quiet';
      download.textContent = 'Download';
      download.addEventListener('click', () => downloadServerFile(entry).catch((error) => showToast(error.message, true)));
      actions.append(download);
    }

    if (server && hasPermission(server, 'filesWrite')) {
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'button button-quiet';
      rename.textContent = 'Rename';
      rename.addEventListener('click', () => renameServerFile(entry).catch((error) => showFilesError(error.message)));
      actions.append(rename);
    }
    if (server && hasPermission(server, 'filesDelete')) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => deleteServerFile(entry).catch((error) => showFilesError(error.message)));
      actions.append(remove);
    }

    row.append(main, actions);
    fileList.append(row);
  }
}

async function uploadServerFile(file) {
  if (!fileServerId) throw new Error('Open a server first.');
  if (file.size > 32 * 1024 * 1024) throw new Error(`"${file.name}" is larger than the 32 MB limit.`);
  const target = joinFilePath(filePath, file.name);
  const response = await fetch(`${API_BASE}/api/servers/${encodeURIComponent(fileServerId)}/files/upload?path=${encodeURIComponent(target)}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/octet-stream',
    },
    body: file,
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error((data && data.error) || text || 'Upload failed.');
  return data;
}

async function handleFileUpload(event) {
  const files = [...(filesUploadInput.files || [])];
  filesUploadInput.value = '';
  if (!files.length) return;
  filesUploadButton.disabled = true;
  showFilesError('');
  try {
    for (const file of files) {
      await uploadServerFile(file);
      showToast(`Uploaded ${file.name}.`);
    }
    await loadFiles(filePath);
  } catch (error) {
    showFilesError(error.message);
  } finally {
    filesUploadButton.disabled = false;
  }
}

async function downloadServerFile(entry) {
  const response = await fetch(`${API_BASE}/api/servers/${encodeURIComponent(fileServerId)}/files/download?path=${encodeURIComponent(joinFilePath(filePath, entry.name))}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try { message = JSON.parse(text).error || text; } catch {}
    throw new Error(message || 'Download failed.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = entry.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function renameServerFile(entry) {
  const next = window.prompt(`Rename "${entry.name}" to:`, entry.name);
  if (!next || next === entry.name) return;
  const from = joinFilePath(filePath, entry.name);
  const to = joinFilePath(filePath, next);
  await api(`/api/servers/${encodeURIComponent(fileServerId)}/files/rename`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
  showToast('Renamed.');
  await loadFiles(filePath);
}

async function deleteServerFile(entry) {
  if (!window.confirm(`Permanently delete "${entry.name}"? This cannot be undone.`)) return;
  await api(`/api/servers/${encodeURIComponent(fileServerId)}/files?path=${encodeURIComponent(joinFilePath(filePath, entry.name))}`, { method: 'DELETE' });
  showToast('Deleted.');
  await loadFiles(filePath);
}

async function createServerFolder() {
  const name = window.prompt('New folder name:');
  if (!name) return;
  await api(`/api/servers/${encodeURIComponent(fileServerId)}/files/mkdir`, {
    method: 'POST',
    body: JSON.stringify({ path: joinFilePath(filePath, name) }),
  });
  showToast('Folder created.');
  await loadFiles(filePath);
}

function goUpFolder() {
  const parts = filePath.split('/').filter(Boolean);
  parts.pop();
  loadFiles(parts.join('/')).catch((error) => showFilesError(error.message));
}

function setupDesktopUpdates() {
  const params = new URLSearchParams(window.location.search);
  desktopBridge = window.omniVaultDesktop || null;
  if (!desktopBridge || params.get('desktop') !== '1' || !desktopUpdateBtn) return;

  desktopUpdateBtn.hidden = false;
  desktopUpdateBtn.addEventListener('click', handleDesktopUpdate);
  checkDesktopUpdate(false);
  setInterval(() => checkDesktopUpdate(false), 6 * 60 * 60 * 1000);
}

async function checkDesktopUpdate(manual = false) {
  if (!desktopBridge || desktopUpdateBusy) return;
  desktopUpdateBusy = true;
  if (manual) {
    desktopUpdateBtn.disabled = true;
    desktopUpdateBtn.textContent = 'Checking…';
  }

  try {
    const result = await desktopBridge.checkUpdate({ force: manual });
    desktopUpdateAvailable = !!result.available;
    desktopUpdateBtn.classList.toggle('update-ready', desktopUpdateAvailable);
    desktopUpdateBtn.textContent = desktopUpdateAvailable
      ? `Update to ${result.latestVersion}`
      : 'Check for updates';
    desktopUpdateBtn.title = desktopUpdateAvailable
      ? `OmniVault ${result.latestVersion} is available. You have ${result.currentVersion}.`
      : `OmniVault ${result.currentVersion} is up to date.`;
    if (manual) {
      showToast(desktopUpdateAvailable
        ? `OmniVault ${result.latestVersion} is available.`
        : `OmniVault ${result.currentVersion} is up to date.`);
    }
  } catch (error) {
    desktopUpdateAvailable = false;
    desktopUpdateBtn.classList.remove('update-ready');
    desktopUpdateBtn.textContent = 'Check for updates';
    desktopUpdateBtn.title = 'Check GitHub for a newer OmniVault build.';
    if (manual) showToast(`Update check failed: ${error.message}`, true);
  } finally {
    desktopUpdateBusy = false;
    desktopUpdateBtn.disabled = false;
  }
}

async function handleDesktopUpdate() {
  if (!desktopBridge || desktopUpdateBusy) return;
  desktopUpdateBusy = true;
  desktopUpdateBtn.disabled = true;
  desktopUpdateBtn.textContent = 'Checking…';

  try {
    const result = await desktopBridge.checkUpdate({ force: true });
    if (!result.available) {
      desktopUpdateAvailable = false;
      desktopUpdateBtn.classList.remove('update-ready');
      desktopUpdateBtn.textContent = 'Check for updates';
      showToast(`OmniVault ${result.currentVersion} is up to date.`);
      return;
    }

    const proceed = window.confirm(
      `Install OmniVault ${result.latestVersion}?\n\n` +
      'The app will close, install the update, and reopen automatically. Your servers are stored on the panel, so they will still be there.',
    );
    if (!proceed) {
      desktopUpdateBtn.textContent = `Update to ${result.latestVersion}`;
      return;
    }

    desktopUpdateBtn.textContent = 'Downloading update…';
    const install = await desktopBridge.installUpdate();
    if (install.starting === false || install.started === false) {
      if (install.upToDate) showToast(`OmniVault ${install.version} is up to date.`);
      else showToast('The update did not start. Try again.', true);
      return;
    }
    showToast(`Installing OmniVault ${install.version}. The app will reopen when it finishes.`);
  } catch (error) {
    showToast(`Update failed: ${error.message}`, true);
    desktopUpdateBtn.textContent = desktopUpdateAvailable ? 'Retry update' : 'Check for updates';
  } finally {
    desktopUpdateBusy = false;
    desktopUpdateBtn.disabled = false;
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
  if (joinTeamBtn) joinTeamBtn.addEventListener('click', openJoinTeam);
  if (emptyJoinTeamBtn) emptyJoinTeamBtn.addEventListener('click', openJoinTeam);
  if (joinTeamForm) joinTeamForm.addEventListener('submit', handleJoinTeam);
  if (joinTeamCancel) joinTeamCancel.addEventListener('click', () => joinTeamModal.close());
  if (joinTeamModal) {
    joinTeamModal.addEventListener('cancel', (event) => { event.preventDefault(); joinTeamModal.close(); });
    joinTeamModal.addEventListener('click', (event) => { if (event.target === joinTeamModal) joinTeamModal.close(); });
  }
  if (manageAccessBtn) manageAccessBtn.addEventListener('click', openAccessModal);
  if (serverFilesBtn) serverFilesBtn.addEventListener('click', openFilesModal);
  if (serverInstancesBtn) serverInstancesBtn.addEventListener('click', () => openInstancesModal().catch((error) => showToast(error.message, true)));
  if (instanceSelect) instanceSelect.addEventListener('change', () => {
    selectedInstanceId = instanceSelect.value;
    catalogServerId = '';
    const server = currentServer();
    if (!server) return;
    if (selectedInstanceId) {
      selectedStatus.textContent = 'Loading managed instance status…';
      selectedStatus.classList.remove('connected', 'disconnected');
      playerList.textContent = 'Loading players…';
      playerCount.textContent = '—';
      if (hasPermission(server, 'catalog')) loadCatalog(server, true, true).catch(() => {});
      refreshInstanceStatus(server).catch(() => {});
    } else {
      refresh().catch(() => {});
    }
  });
  if (accessForm) accessForm.addEventListener('submit', (event) => event.preventDefault());
  if (accessClose) accessClose.addEventListener('click', () => accessModal.close());
  if (createInviteBtn) createInviteBtn.addEventListener('click', createTeamInvite);
  if (manageRolesBtn) manageRolesBtn.addEventListener('click', () => openRoleEditor());
  if (roleForm) roleForm.addEventListener('submit', saveRole);
  if (roleCancel) roleCancel.addEventListener('click', () => roleModal.close());
  if (roleDelete) roleDelete.addEventListener('click', deleteRole);
  if (roleModal) {
    roleModal.addEventListener('cancel', (event) => { event.preventDefault(); roleModal.close(); });
    roleModal.addEventListener('click', (event) => { if (event.target === roleModal) roleModal.close(); });
  }
  if (instancesForm) instancesForm.addEventListener('submit', saveInstance);
  if (instancesClose) instancesClose.addEventListener('click', closeInstancesModal);
  if (instancesRefresh) instancesRefresh.addEventListener('click', () => {
    const server = currentServer();
    if (server) loadInstances(server, false).catch((error) => showInstancesError(error.message));
  });
  if (instanceNewBtn) instanceNewBtn.addEventListener('click', () => openInstanceEditor());
  if (instanceAddGame) instanceAddGame.addEventListener('click', () => addInstanceGame());
  if (instanceCancelEdit) instanceCancelEdit.addEventListener('click', resetInstanceEditor);
  if (instanceLogClose) instanceLogClose.addEventListener('click', () => { instanceLogPanel.hidden = true; });
  if (instancesCopySetup) instancesCopySetup.addEventListener('click', () => copyText(instancesSetupCommand.textContent, 'Setup command'));
  if (instancesModal) {
    instancesModal.addEventListener('cancel', (event) => { event.preventDefault(); closeInstancesModal(); });
    instancesModal.addEventListener('click', (event) => { if (event.target === instancesModal) closeInstancesModal(); });
  }
  if (copyInviteBtn) copyInviteBtn.addEventListener('click', () => copyText(currentInviteCode, 'Access code'));
  if (accessModal) {
    accessModal.addEventListener('cancel', (event) => { event.preventDefault(); accessModal.close(); });
    accessModal.addEventListener('click', (event) => { if (event.target === accessModal) accessModal.close(); });
  }
  if (filesForm) filesForm.addEventListener('submit', (event) => event.preventDefault());
  if (filesClose) filesClose.addEventListener('click', () => filesModal.close());
  if (filesUp) filesUp.addEventListener('click', goUpFolder);
  if (filesRefresh) filesRefresh.addEventListener('click', () => loadFiles(filePath).catch((error) => showFilesError(error.message)));
  if (filesUploadButton) filesUploadButton.addEventListener('click', () => filesUploadInput.click());
  if (filesUploadInput) filesUploadInput.addEventListener('change', handleFileUpload);
  if (filesNewFolder) filesNewFolder.addEventListener('click', () => createServerFolder().catch((error) => showFilesError(error.message)));
  if (filesModal) {
    filesModal.addEventListener('cancel', (event) => { event.preventDefault(); filesModal.close(); });
    filesModal.addEventListener('click', (event) => { if (event.target === filesModal) filesModal.close(); });
  }
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
  setupDesktopUpdates();
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
