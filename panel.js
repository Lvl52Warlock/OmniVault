'use strict';

const serverSelect = document.querySelector('#server-select');
const serverList = document.querySelector('#server-list');
const selectedName = document.querySelector('#selected-name');
const selectedStatus = document.querySelector('#selected-status');
const playerList = document.querySelector('#players');
const playerCount = document.querySelector('#player-count');
const lastUpdated = document.querySelector('#last-updated');
const toast = document.querySelector('#toast');
const addServerBtn = document.querySelector('#add-server');
const addServerModal = document.querySelector('#add-server-modal');
const addServerForm = document.querySelector('#add-server-form');
const addServerCancel = document.querySelector('#add-server-cancel');
const addServerName = document.querySelector('#add-server-name');
const addServerHost = document.querySelector('#add-server-host');
const addServerPort = document.querySelector('#add-server-port');
const addServerPassword = document.querySelector('#add-server-password');
const addServerError = document.querySelector('#add-server-error');
let cachedServers = [];
let toastTimer;
let catalogServer = '';
let gameOptionsServer = '';
let pollingStarted = false;

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  if (!response.ok) throw new Error(await response.json().then(b => b.error || `Request failed (${response.status}).`));
  return response.json();
}

async function enterPanel() {
  if (!pollingStarted) {
    pollingStarted = true;
    setInterval(() => refresh().catch((error) => showToast(error.message, true)), 30000);
  }
  await refresh();
}

function currentServer() {
  return cachedServers.find((server) => server.name === serverSelect.value);
}

function catalogNames(output) {
  return output.split(/\r?\n/)
    .map((line) => line.trim().replace(/\s{2,}\([^()]*\)\s*$/, '').trim())
    .filter(Boolean);
}

function playerTotal(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = firstLine.match(/(\d+)\s*(?:\/|of)\s*\d+/i);
  return count ? count[1] : String((text.match(/^#\d+/gm) || []).length);
}

function renderTiles(servers) {
  serverList.replaceChildren();
  for (const server of servers) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `server-tile${server.name === serverSelect.value ? ' selected' : ''}`;
    tile.addEventListener('click', () => {
      serverSelect.value = server.name;
      catalogServer = '';
      gameOptionsServer = '';
      renderSelected();
      renderTiles(cachedServers);
      loadCatalog();
      loadGameOptions();
    });

    const top = document.createElement('div');
    top.className = 'tile-top';
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = server.name;
    const count = document.createElement('span');
    count.className = 'tile-count';
    count.textContent = server.playersError ? '—' : `${playerTotal(server.players)} online`;
    const status = document.createElement('div');
    status.className = `tile-status${server.error ? ' error' : ''}`;
    status.textContent = server.error ? 'RCON unavailable' : (server.status.split(/\r?\n/)[1] || server.status || 'Online');

    top.append(name, count);
    tile.append(top, status);
    serverList.append(tile);
  }
}

function renderSelected() {
  const server = currentServer();
  if (!server) return;
  selectedName.textContent = server.name;
  selectedStatus.textContent = server.error || server.status || 'No status reply.';
  selectedStatus.classList.toggle('muted', !server.error);
  playerList.textContent = server.playersError || server.players || 'No players connected.';
  playerCount.textContent = server.playersError ? 'Error' : playerTotal(server.players);
}

async function loadCatalog() {
  const server = currentServer();
  if (!server || catalogServer === server.name) return;
  catalogServer = server.name;
  try {
    const data = await requestJson(`/api/catalog?server=${encodeURIComponent(server.name)}`);
    document.querySelector('#map-options').replaceChildren(
      ...catalogNames(data.maps).map((name) => new Option('', name))
    );
    document.querySelector('#mode-options').replaceChildren(
      ...catalogNames(data.modes).map((name) => new Option('', name))
    );
  } catch (error) {
    catalogServer = '';
    showToast(`Could not load map/mode suggestions: ${error.message}`, true);
  }
}

async function loadGameOptions() {
  const server = currentServer();
  if (!server || gameOptionsServer === server.name) return;
  gameOptionsServer = server.name;
  const form = document.querySelector('#game-options-form');
  const message = document.querySelector('#game-options-message');
  form.hidden = true;
  message.textContent = 'Loading the selected preset…';
  try {
    const data = await requestJson(`/api/game-options?server=${encodeURIComponent(server.name)}`);
    if (!data.available) {
      message.textContent = data.reason;
      return;
    }
    document.querySelector('#vehicle-set').value = String(data.mapVehicles);
    document.querySelector('#weapon-set').value = String(data.mapWeapons);
    message.textContent = `Settings for ${data.game}. Changes apply to the next game, not the current match.`;
    form.hidden = false;
  } catch (error) {
    gameOptionsServer = '';
    message.textContent = `Could not load game settings: ${error.message}`;
    showToast(error.message, true);
  }
}

async function refresh() {
  const button = document.querySelector('#refresh');
  button.disabled = true;
  try {
    const data = await requestJson('/api/servers');
    cachedServers = data.servers;
    const selected = serverSelect.value;
    serverSelect.replaceChildren(...cachedServers.map((server) => new Option(server.name, server.name)));
    if (cachedServers.some((server) => server.name === selected)) serverSelect.value = selected;
    renderTiles(cachedServers);
    renderSelected();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    await Promise.all([loadCatalog(), loadGameOptions()]);
  } catch (error) {
    showToast(error.message, true);
    lastUpdated.textContent = 'Status unavailable';
  } finally {
    button.disabled = false;
  }
}

async function sendAction(payload) {
  const server = currentServer();
  if (!server) throw new Error('Select a server first.');
  const result = await requestJson('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, server: server.name }),
  });
  showToast(result.result);
  await refresh();
}

function submitButton(form, event) {
  return event.submitter || form.querySelector('button[type="submit"]');
}

document.querySelector('#refresh').addEventListener('click', refresh);
serverSelect.addEventListener('change', () => {
  catalogServer = '';
  gameOptionsServer = '';
  renderSelected();
  renderTiles(cachedServers);
  loadCatalog();
  loadGameOptions();
});

addServerBtn.addEventListener('click', () => {
  addServerName.value = '';
  addServerHost.value = '';
  addServerPort.value = '';
  addServerPassword.value = '';
  addServerError.hidden = true;
  addServerModal.showModal();
});

addServerCancel.addEventListener('click', (event) => {
  event.preventDefault();
  addServerModal.close();
});

// Close modal when clicking the backdrop (outside the form)
addServerModal.addEventListener('click', (event) => {
  if (event.target === addServerModal) addServerModal.close();
});

document.querySelector('#logout').addEventListener('click', async () => {
  localStorage.removeItem('wp_token');
  location.reload();
});

addServerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  addServerError.hidden = true;
  const name = addServerName.value.trim();
  const host = addServerHost.value.trim();
  const port = addServerPort.value.trim();
  const password = addServerPassword.value;
  try {
    const result = await requestJson('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, host, port, password }),
    });
    addServerForm.reset();
    addServerModal.close();
    cachedServers = [];
    await refresh();
    showToast(`Server "${result.server.name}" added.`);
  } catch (error) {
    addServerError.textContent = error.message;
    addServerError.hidden = false;
  }
});

document.querySelector('#say-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await sendAction({ action: 'say', message: form.elements.message.value });
    form.reset();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#map-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const action = submitButton(form, event).value;
  const map = form.elements.map.value;
  const mode = form.elements.mode.value;
  if (action === 'load' && !window.confirm(`Load ${map}${mode ? ` / ${mode}` : ''} now? This ends the current game.`)) return;
  try {
    await sendAction({ action, map, mode });
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#game-options-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const server = currentServer();
  if (!server) {
    showToast('Select a server first.', true);
    return;
  }
  const mapVehicles = Number(event.currentTarget.elements.mapVehicles.value);
  const mapWeapons = Number(event.currentTarget.elements.mapWeapons.value);
  if (!window.confirm('Save these map vehicle and weapon sets for the next game? This will not spawn anything in the current match.')) return;
  try {
    const result = await requestJson('/api/game-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: server.name, mapVehicles, mapWeapons }),
    });
    showToast(result.result);
    gameOptionsServer = '';
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#moderation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const action = submitButton(form, event).value;
  const player = form.elements.player.value;
  if (action === 'ban' && !window.confirm(`Ban ${player} for ${form.elements.duration.value || '30m'}?`)) return;
  try {
    await sendAction({
      action,
      player,
      duration: form.elements.duration.value,
      reason: form.elements.reason.value,
    });
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#unban').addEventListener('click', async () => {
  const player = window.prompt('Enter the player ID, device fingerprint, IP address, or range to unban:');
  if (!player) return;
  try {
    await sendAction({ action: 'unban', player });
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#end-round').addEventListener('click', async () => {
  if (!window.confirm('End the current round?')) return;
  try {
    await sendAction({ action: 'endround' });
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector('#end-game').addEventListener('click', async () => {
  if (!window.confirm('End the current game now?')) return;
  try {
    await sendAction({ action: 'endgame' });
  } catch (error) {
    showToast(error.message, true);
  }
});

enterPanel().catch((error) => {
  console.error(error);
});
