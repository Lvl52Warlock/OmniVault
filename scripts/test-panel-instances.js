'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omnivault-panel-instances-test-'));
const dataDir = path.join(temp, 'panel-data');
const filesRoot = path.join(temp, 'content');
const instancesRoot = path.join(temp, 'managed');
const mccPath = path.join(temp, 'mcc');
const agentConfig = path.join(temp, 'agent-config.json');
const fakeReclaimer = path.join(__dirname, 'fake-reclaimer.js');
const panelPort = 49300 + Math.floor(Math.random() * 300);
const baseRconPort = 49900 + Math.floor(Math.random() * 80);
const instancePort = 50100 + Math.floor(Math.random() * 150);
const secondInstancePort = instancePort + 1;
const base = `http://127.0.0.1:${panelPort}`;
const baseCommands = [];

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(filesRoot, 'maps'), { recursive: true });
fs.mkdirSync(instancesRoot, { recursive: true });
fs.mkdirSync(path.join(mccPath, 'game'), { recursive: true });

let panel = null;
let agent = null;
let mockRcon = null;
const logs = [];

function encodeRconPacket(id, type, body) {
  const bodyBuffer = Buffer.from(String(body || ''), 'utf8');
  const buffer = Buffer.alloc(14 + bodyBuffer.length);
  buffer.writeInt32LE(buffer.length - 4, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  bodyBuffer.copy(buffer, 12);
  return buffer;
}

function startMockRcon() {
  return new Promise((resolve) => {
    mockRcon = net.createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
          const size = buffer.readInt32LE(0);
          if (size < 10 || buffer.length < 4 + size) break;
          const id = buffer.readInt32LE(4);
          const type = buffer.readInt32LE(8);
          const body = buffer.subarray(12, 4 + size - 2).toString('utf8');
          buffer = buffer.subarray(4 + size);
          if (type === 3) {
            socket.write(encodeRconPacket(id, 2, ''));
            continue;
          }
          if (type !== 2) continue;
          baseCommands.push(body);
          let reply = `OK: ${body}`;
          if (body === 'status') reply = 'Base Host Server\n0/127 players';
          else if (body === 'players') reply = '#9 BasePlayer';
          else if (body === 'maps') reply = 'Guardian\nSandbox\n';
          else if (body === 'modes') reply = 'Slayer\nCTF\n';
          socket.write(encodeRconPacket(id, 0, reply));
          socket.end();
        }
      });
      socket.on('error', () => {});
    });
    mockRcon.listen(baseRconPort, '127.0.0.1', resolve);
  });
}

function log(message) {
  logs.push(message);
  console.log(message);
}

function waitForExit(child, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve();
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function request(pathname, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof Buffer) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${base}${pathname}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { response, data, text };
}

async function expectOk(pathname, token, options) {
  const result = await request(pathname, token, options);
  assert.ok(result.response.ok, `${pathname} failed: ${result.response.status} ${result.text}`);
  return result.data;
}

async function expectStatus(pathname, token, options, status) {
  const result = await request(pathname, token, options);
  assert.strictEqual(result.response.status, status, `${pathname} returned ${result.response.status}: ${result.text}`);
  return result.data;
}

async function waitForPanel() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/auth/state`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Panel did not start.\n${logs.join('\n')}`);
}

async function waitForAgent(ownerToken, serverId) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const data = await expectOk('/api/servers', ownerToken);
    const server = data.servers.find((item) => item.id === serverId);
    if (server && server.agentOnline && server.instancesEnabled) return server;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Agent did not connect with instances enabled.\n${logs.join('\n')}`);
}

async function register(username) {
  const data = await expectOk('/api/register', '', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'test-password-123' }),
  });
  return { token: data.token, user: data.user };
}

function playlist(name, map = 'Guardian', mode = 'Slayer') {
  const games = [{ name: `${map} ${mode}`, map, game: mode, antiCheat: false }];
  for (const [nextMap, nextMode] of [['Sandbox', 'CTF'], ['Guardian', 'Slayer'], ['Valhalla', 'Slayer'], ['The Pit', 'Slayer']]) {
    if (games.some((game) => game.map.toLowerCase() === nextMap.toLowerCase() && game.game.toLowerCase() === nextMode.toLowerCase())) continue;
    games.push({ name: `${nextMap} ${nextMode}`, map: nextMap, game: nextMode, antiCheat: false });
    if (games.length === 3) break;
  }
  return { name, voteSeconds: 20, games };
}

async function main() {
  await startMockRcon();
  panel = spawn(process.execPath, ['main.js'], {
    cwd: root,
    env: {
      ...process.env,
      PANEL_DATA_DIR: dataDir,
      PANEL_PORT: String(panelPort),
      PANEL_BIND: '127.0.0.1',
      PANEL_MODE: 'local',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  panel.stdout.on('data', (chunk) => log(String(chunk).trim()));
  panel.stderr.on('data', (chunk) => log(String(chunk).trim()));
  await waitForPanel();

  const owner = await register('owner_instances');
  const moderator = await register('moderator_instances');
  const developer = await register('developer_instances');
  const customUser = await register('custom_instances');
  const outsider = await register('outsider_instances');

  const created = await expectOk('/api/servers', owner.token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Instance Host', connectionMode: 'agent', rconPort: baseRconPort }),
  });
  const serverId = created.server.id;
  assert.ok(Array.isArray(created.server.roles), 'new server did not get role records');
  assert.strictEqual(created.server.roles.length, 2);

  agent = spawn(process.execPath, [
    'agent.js',
    '--config', agentConfig,
    '--panel', base,
    '--pair', created.pairingCode,
    '--rcon-port', String(baseRconPort),
    '--rcon-password', 'test-rcon-password',
    '--files-dir', filesRoot,
    '--instances-dir', instancesRoot,
    '--reclaimer-exe', fakeReclaimer,
    '--server-root', mccPath,
  ], {
    cwd: path.join(root, 'agent'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  agent.stdout.on('data', (chunk) => log(`[agent] ${String(chunk).trim()}`));
  agent.stderr.on('data', (chunk) => log(`[agent] ${String(chunk).trim()}`));

  const online = await waitForAgent(owner.token, serverId);
  assert.strictEqual(online.instancesEnabled, true);
  assert.strictEqual(online.permissions.instancesDelete, true);
  assert.match(String(online.status), /Base Host Server/);

  // Custom role: can view/create/control instances and kick, cannot delete
  // instances, manage roles, or read files.
  const role = await expectOk(`/api/servers/${serverId}/roles`, owner.token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Event Manager',
      permissions: ['view', 'kick', 'instancesCreate', 'instancesControl'],
    }),
  });
  assert.ok(role.role.id);
  assert.ok(role.role.permissions.includes('instancesCreate'));
  assert.ok(role.role.permissions.includes('instancesView'), 'create/control did not imply instance view');
  assert.ok(!role.role.permissions.includes('filesDelete'));

  const escalated = await expectOk(`/api/servers/${serverId}/roles`, owner.token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Escalation Attempt',
      permissions: ['view', 'filesDelete', 'instancesDelete'],
    }),
  });
  assert.ok(!escalated.role.permissions.includes('filesDelete'), 'owner-only delete permission was grantable');
  assert.ok(!escalated.role.permissions.includes('instancesDelete'), 'owner-only instance deletion was grantable');
  await expectOk(`/api/servers/${serverId}/roles/${escalated.role.id}`, owner.token, { method: 'DELETE' });

  await expectStatus(`/api/servers/${serverId}/instances`, owner.token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Too Short Playlist',
      port: instancePort + 9,
      playlist: { name: 'Two Games', games: [
        { name: 'Guardian Slayer', map: 'Guardian', game: 'Slayer', antiCheat: false },
        { name: 'Sandbox CTF', map: 'Sandbox', game: 'CTF', antiCheat: false },
      ] },
    }),
  }, 400);

  const customInvite = await expectOk(`/api/servers/${serverId}/access/invite`, owner.token, {
    method: 'POST',
    body: JSON.stringify({ roleId: role.role.id }),
  });
  await expectStatus('/api/servers/join', customUser.token, {
    method: 'POST',
    body: JSON.stringify({ code: customInvite.code }),
  }, 200);
  const customServers = await expectOk('/api/servers', customUser.token);
  const customServer = customServers.servers.find((item) => item.id === serverId);
  assert.strictEqual(customServer.role, 'custom');
  assert.strictEqual(customServer.roleName, 'Event Manager');
  assert.strictEqual(customServer.permissions.instancesCreate, true);
  assert.strictEqual(customServer.permissions.instancesDelete, false);
  assert.strictEqual(customServer.permissions.filesRead, false);

  // Built-in moderator cannot create, but the custom role can.
  const moderatorInvite = await expectOk(`/api/servers/${serverId}/access/invite`, owner.token, {
    method: 'POST',
    body: JSON.stringify({ role: 'moderator' }),
  });
  await expectStatus('/api/servers/join', moderator.token, {
    method: 'POST',
    body: JSON.stringify({ code: moderatorInvite.code }),
  }, 200);
  await expectStatus(`/api/servers/${serverId}/instances`, moderator.token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Blocked', port: instancePort + 3, playlist: playlist('Blocked') }),
  }, 403);

  // Developer can create by default.
  const developerInvite = await expectOk(`/api/servers/${serverId}/access/invite`, owner.token, {
    method: 'POST',
    body: JSON.stringify({ role: 'developer' }),
  });
  await expectStatus('/api/servers/join', developer.token, {
    method: 'POST',
    body: JSON.stringify({ code: developerInvite.code }),
  }, 200);
  const developerInstance = await expectOk(`/api/servers/${serverId}/instances`, developer.token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Developer Instance',
      port: secondInstancePort,
      maxPlayers: 8,
      start: true,
      playlist: playlist('Developer Rotation'),
    }),
  });
  assert.strictEqual(developerInstance.started, true, developerInstance.startError || 'developer instance failed to start');
  assert.strictEqual(developerInstance.instance.running, true);

  // Custom role creates and controls an instance.
  const customInstance = await expectOk(`/api/servers/${serverId}/instances`, customUser.token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Event Instance',
      port: instancePort,
      maxPlayers: 8,
      start: true,
      playlist: playlist('Event Rotation', 'Sandbox', 'CTF'),
    }),
  });
  assert.strictEqual(customInstance.started, true, customInstance.startError || 'custom instance failed to start');
  const instanceId = customInstance.instance.id;
  assert.strictEqual(customInstance.instance.running, true);
  assert.strictEqual(customInstance.instance.port, instancePort);
  assert.ok(!('rconPassword' in customInstance.instance));

  const instanceList = await expectOk(`/api/servers/${serverId}/instances`, customUser.token);
  assert.strictEqual(instanceList.configured, true);
  assert.strictEqual(instanceList.instances.length, 2);
  assert.ok(instanceList.instances.some((item) => item.id === instanceId && item.running));

  const instanceStatus = await expectOk(`/api/servers/${serverId}/instances/${instanceId}/status`, customUser.token);
  assert.strictEqual(instanceStatus.running, true);
  assert.match(String(instanceStatus.status), /OmniVault Fake Reclaimer/);
  assert.match(String(instanceStatus.players), /TestPlayer/);

  const rconStatus = await expectOk('/api/action', owner.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'status', instanceId }),
  });
  assert.match(String(rconStatus.result), /OmniVault Fake Reclaimer/);
  const rconSay = await expectOk('/api/action', owner.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'say', message: 'instance hello', instanceId }),
  });
  assert.match(String(rconSay.result), /Message sent/);

  const logs = await expectOk(`/api/servers/${serverId}/instances/${instanceId}/logs`, customUser.token);
  assert.match(String(logs.text), /fake-reclaimer: listening/);

  await expectStatus(`/api/servers/${serverId}/instances/${instanceId}/restart`, customUser.token, { method: 'POST' }, 200);
  await expectStatus(`/api/servers/${serverId}/instances/${instanceId}/stop`, customUser.token, { method: 'POST' }, 200);
  const stopped = await expectOk(`/api/servers/${serverId}/instances/${instanceId}/status`, customUser.token);
  assert.strictEqual(stopped.running, false);
  await expectOk(`/api/servers/${serverId}/instances/${instanceId}/start`, customUser.token, { method: 'POST' });
  const restarted = await expectOk(`/api/servers/${serverId}/instances/${instanceId}/status`, customUser.token);
  assert.strictEqual(restarted.running, true);

  const updated = await expectOk(`/api/servers/${serverId}/instances/${instanceId}`, customUser.token, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Event Instance Updated',
      playlist: playlist('Updated Rotation', 'Guardian', 'Slayer'),
    }),
  });
  assert.strictEqual(updated.instance.name, 'Event Instance Updated');
  assert.strictEqual(updated.instance.playlist.games.length, 3);

  await expectStatus(`/api/servers/${serverId}/instances/${instanceId}`, customUser.token, { method: 'DELETE' }, 403);
  await expectStatus(`/api/servers/${serverId}/roles`, customUser.token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Escalation', permissions: ['instancesDelete'] }),
  }, 404);
  await expectStatus(`/api/servers/${serverId}/access/invite`, customUser.token, {
    method: 'POST',
    body: JSON.stringify({ roleId: role.role.id }),
  }, 404);
  await expectStatus(`/api/servers/${serverId}/instances/not-an-instance/status`, customUser.token, {}, 400);
  await expectStatus('/api/servers', outsider.token, {}, 200);
  const outsiderServers = await expectOk('/api/servers', outsider.token);
  assert.strictEqual(outsiderServers.servers.length, 0);

  const roles = await expectOk(`/api/servers/${serverId}/roles`, owner.token);
  assert.ok(roles.roles.some((item) => item.id === role.role.id && item.name === 'Event Manager'));
  await expectStatus(`/api/servers/${serverId}/roles/role_moderator`, owner.token, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'Changed', permissions: [] }),
  }, 400);
  await expectStatus(`/api/servers/${serverId}/roles/${role.role.id}`, owner.token, { method: 'DELETE' }, 409);
  await expectOk(`/api/servers/${serverId}/roles/${role.role.id}`, owner.token, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Event Manager',
      permissions: ['view', 'kick', 'instancesView'],
    }),
  });
  await expectStatus(`/api/servers/${serverId}/instances`, customUser.token, {
    method: 'POST',
    body: JSON.stringify({ name: 'No Longer Allowed', port: instancePort + 4, playlist: playlist('No') }),
  }, 403);
  await expectOk(`/api/servers/${serverId}/roles/${role.role.id}`, owner.token, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Event Manager',
      permissions: ['view', 'kick', 'instancesView', 'instancesCreate', 'instancesControl'],
    }),
  });

  await expectStatus(`/api/servers/${serverId}/members/${customUser.user.userId}`, owner.token, { method: 'DELETE' }, 200);
  await expectStatus(`/api/servers/${serverId}/roles/${role.role.id}`, owner.token, { method: 'DELETE' }, 200);

  await expectOk(`/api/servers/${serverId}/instances/${instanceId}`, owner.token, { method: 'DELETE' });
  await expectOk(`/api/servers/${serverId}/instances/${developerInstance.instance.id}`, owner.token, { method: 'DELETE' });
  const finalList = await expectOk(`/api/servers/${serverId}/instances`, owner.token);
  assert.strictEqual(finalList.instances.length, 0);
  assert.ok(!fs.existsSync(path.join(instancesRoot, instanceId)));

  log('PASS: panel custom roles, invitations, permission enforcement, managed instances, per-instance RCON, lifecycle, and isolation');
}

function killRegistryInstances() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(instancesRoot, 'instances.json'), 'utf8'));
    for (const instance of list) {
      if (!Number.isInteger(Number(instance.pid))) continue;
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(instance.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        try { process.kill(Number(instance.pid), 'SIGTERM'); } catch {}
      }
    }
  } catch {}
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  killRegistryInstances();
  if (agent) {
    try { agent.kill(); } catch {}
    await waitForExit(agent);
  }
  if (panel) {
    try { panel.kill(); } catch {}
    await waitForExit(panel);
  }
  if (mockRcon) {
    await new Promise((resolve) => mockRcon.close(resolve));
  }
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
});
