'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omnivault-team-test-'));
const dataDir = path.join(temp, 'panel-data');
const filesRoot = path.join(temp, 'server-content');
const agentConfig = path.join(temp, 'agent-config.json');
const port = 49300 + Math.floor(Math.random() * 500);
const rconPort = 49900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
const rconCommands = [];

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(filesRoot, 'maps'), { recursive: true });

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
          rconCommands.push(body);
          let reply = `OK: ${body}`;
          if (body === 'status') reply = 'Project Reclaimer\nRound 1\n';
          else if (body === 'players') reply = '#1 TestPlayer\n';
          else if (body === 'maps') reply = 'arena\n';
          else if (body === 'modes') reply = 'deathmatch\n';
          socket.write(encodeRconPacket(id, 0, reply));
          socket.end();
        }
      });
      socket.on('error', () => {});
    });
    mockRcon.listen(rconPort, '127.0.0.1', resolve);
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
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const data = await expectOk('/api/servers', ownerToken);
    const server = data.servers.find((item) => item.id === serverId);
    if (server && server.agentOnline) return server;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Agent did not connect.\n${logs.join('\n')}`);
}

async function register(username) {
  const data = await expectOk('/api/register', '', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'test-password-123' }),
  });
  return { token: data.token, user: data.user };
}

async function main() {
  await startMockRcon();
  panel = spawn(process.execPath, ['main.js'], {
    cwd: root,
    env: {
      ...process.env,
      PANEL_DATA_DIR: dataDir,
      PANEL_PORT: String(port),
      PANEL_BIND: '127.0.0.1',
      PANEL_MODE: 'local',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  panel.stdout.on('data', (chunk) => log(String(chunk).trim()));
  panel.stderr.on('data', (chunk) => log(String(chunk).trim()));
  await waitForPanel();

  const owner = await register('owner_test');
  const moderator = await register('moderator_test');
  const developer = await register('developer_test');
  const outsider = await register('outsider_test');

  const created = await expectOk('/api/servers', owner.token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Team Test Server', connectionMode: 'agent', rconPort }),
  });
  const serverId = created.server.id;
  assert.ok(created.pairingCode, 'pairing code missing');

  const packagedAgent = String(process.env.TEST_AGENT_EXE || '').trim();
  const agentArgs = [
    '--config', agentConfig,
    '--panel', base,
    '--pair', created.pairingCode,
    '--rcon-port', String(rconPort),
    '--rcon-password', 'test-rcon-password',
    '--files-dir', filesRoot,
  ];
  agent = packagedAgent
    ? spawn(packagedAgent, agentArgs, { cwd: path.dirname(packagedAgent), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn(process.execPath, ['agent.js', ...agentArgs], { cwd: path.join(root, 'agent'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  agent.stdout.on('data', (chunk) => log(`[agent] ${String(chunk).trim()}`));
  agent.stderr.on('data', (chunk) => log(`[agent] ${String(chunk).trim()}`));
  const online = await waitForAgent(owner.token, serverId);
  assert.strictEqual(online.role, 'owner');
  assert.strictEqual(online.permissions.filesDelete, true);
  assert.match(String(online.status), /Project Reclaimer/);
  assert.match(String(online.players), /TestPlayer/);

  const outsiderServers = await expectOk('/api/servers', outsider.token);
  assert.strictEqual(outsiderServers.servers.length, 0, 'outsider could see another account server');

  const modInvite = await expectOk(`/api/servers/${serverId}/access/invite`, owner.token, {
    method: 'POST',
    body: JSON.stringify({ role: 'moderator' }),
  });
  assert.match(modInvite.code, /^[A-F0-9]{4}-[A-F0-9]{4}$/);

  await expectStatus('/api/servers/join', moderator.token, {
    method: 'POST',
    body: JSON.stringify({ code: modInvite.code }),
  }, 200);
  await expectStatus('/api/servers/join', developer.token, {
    method: 'POST',
    body: JSON.stringify({ code: modInvite.code }),
  }, 404);

  const modServers = await expectOk('/api/servers', moderator.token);
  const modServer = modServers.servers.find((item) => item.id === serverId);
  assert.ok(modServer, 'moderator did not receive the shared server');
  assert.strictEqual(modServer.role, 'moderator');
  assert.strictEqual(modServer.permissions.kick, true);
  assert.strictEqual(modServer.permissions.endRound, true);
  assert.strictEqual(modServer.permissions.filesRead, false);
  assert.strictEqual(modServer.permissions.say, false);
  assert.strictEqual(modServer.members, undefined, 'moderator received owner-only member data');

  await expectStatus('/api/action', moderator.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'say', message: 'not allowed' }),
  }, 403);
  await expectStatus('/api/action', moderator.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'kick', player: 'Tester' }),
  }, 200);
  await expectStatus('/api/action', moderator.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'endround' }),
  }, 200);
  await expectStatus('/api/action', moderator.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'endgame' }),
  }, 200);
  await expectStatus('/api/action', moderator.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'map', map: 'arena', mode: 'deathmatch' }),
  }, 403);
  assert.ok(rconCommands.some((command) => /^kick /.test(command)), 'moderator kick did not reach RCON');
  assert.ok(rconCommands.includes('endround'), 'moderator endround did not reach RCON');
  assert.ok(rconCommands.includes('endgame'), 'moderator endgame did not reach RCON');
  await expectStatus(`/api/servers/${serverId}/files?path=`, moderator.token, {}, 403);
  await expectStatus(`/api/servers/${serverId}`, moderator.token, {
    method: 'DELETE',
  }, 404);
  await expectStatus(`/api/servers/${serverId}/agent-code`, moderator.token, {
    method: 'POST',
  }, 404);

  const devInvite = await expectOk(`/api/servers/${serverId}/access/invite`, owner.token, {
    method: 'POST',
    body: JSON.stringify({ role: 'developer' }),
  });
  await expectStatus('/api/servers/join', developer.token, {
    method: 'POST',
    body: JSON.stringify({ code: devInvite.code }),
  }, 200);

  const devServers = await expectOk('/api/servers', developer.token);
  const devServer = devServers.servers.find((item) => item.id === serverId);
  assert.ok(devServer, 'developer did not receive the shared server');
  assert.strictEqual(devServer.role, 'developer');
  assert.strictEqual(devServer.permissions.filesRead, true);
  assert.strictEqual(devServer.permissions.filesWrite, true);
  assert.strictEqual(devServer.permissions.filesDelete, false);
  assert.strictEqual(devServer.permissions.kick, false);
  assert.strictEqual(devServer.permissions.map, true);

  await expectStatus('/api/action', developer.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'kick', player: 'Tester' }),
  }, 403);
  await expectStatus('/api/action', developer.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'endgame' }),
  }, 403);
  await expectStatus(`/api/servers/${serverId}/access/invite`, developer.token, {
    method: 'POST',
    body: JSON.stringify({ role: 'moderator' }),
  }, 404);
  await expectStatus(`/api/servers/${serverId}/members/${moderator.user.userId}`, developer.token, {
    method: 'DELETE',
  }, 404);
  await expectStatus('/api/action', outsider.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'status' }),
  }, 404);
  await expectStatus('/api/action', developer.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'map', map: 'arena', mode: 'deathmatch' }),
  }, 200);
  await expectStatus('/api/action', owner.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'say', message: 'owner test' }),
  }, 200);
  await expectStatus('/api/action', owner.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'ban', player: 'Tester', time: '1h', reason: 'test' }),
  }, 200);
  await expectStatus('/api/action', owner.token, {
    method: 'POST',
    body: JSON.stringify({ serverId, action: 'unban', target: 'Tester' }),
  }, 200);
  assert.ok(rconCommands.some((command) => /^load .*arena/.test(command)), 'developer map did not reach RCON');
  assert.ok(rconCommands.some((command) => /^say owner test/.test(command)), 'owner say did not reach RCON');

  const list = await expectOk(`/api/servers/${serverId}/files?path=`, developer.token);
  assert.strictEqual(list.configured, true);
  assert.ok(list.entries.some((entry) => entry.name === 'maps' && entry.type === 'dir'));

  const mapBody = crypto.randomBytes(320 * 1024);
  const upload = await request(`/api/servers/${serverId}/files/upload?path=${encodeURIComponent('maps/arena.map')}`, developer.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: mapBody,
  });
  assert.ok(upload.response.ok, `upload failed: ${upload.response.status} ${upload.text}`);
  assert.strictEqual(fs.statSync(path.join(filesRoot, 'maps', 'arena.map')).size, mapBody.length);

  const mapList = await expectOk(`/api/servers/${serverId}/files?path=maps`, developer.token);
  const uploaded = mapList.entries.find((entry) => entry.name === 'arena.map');
  assert.ok(uploaded, 'uploaded map missing from listing');
  assert.strictEqual(uploaded.allowed, true);

  const download = await fetch(`${base}/api/servers/${serverId}/files/download?path=${encodeURIComponent('maps/arena.map')}`, {
    headers: { Authorization: `Bearer ${developer.token}` },
  });
  assert.strictEqual(download.status, 200);
  const downloaded = Buffer.from(await download.arrayBuffer());
  assert.strictEqual(downloaded.length, mapBody.length);
  assert.strictEqual(crypto.createHash('sha256').update(downloaded).digest('hex'), crypto.createHash('sha256').update(mapBody).digest('hex'));

  await expectStatus(`/api/servers/${serverId}/files/rename`, developer.token, {
    method: 'POST',
    body: JSON.stringify({ from: 'maps/arena.map', to: 'maps/arena_v2.map' }),
  }, 200);
  assert.ok(fs.existsSync(path.join(filesRoot, 'maps', 'arena_v2.map')));

  await expectStatus(`/api/servers/${serverId}/files`, developer.token, {
    method: 'DELETE',
    body: JSON.stringify({ path: 'maps/arena_v2.map' }),
  }, 403);
  const traversal = await request(`/api/servers/${serverId}/files/upload?path=${encodeURIComponent('../escape.map')}`, developer.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('escape'),
  });
  assert.strictEqual(traversal.response.status, 400);
  const executable = await request(`/api/servers/${serverId}/files/upload?path=${encodeURIComponent('maps/bad.exe')}`, developer.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('nope'),
  });
  assert.strictEqual(executable.response.status, 400);

  await expectStatus(`/api/servers/${serverId}/files/mkdir`, developer.token, {
    method: 'POST',
    body: JSON.stringify({ path: 'maps/new_folder' }),
  }, 200);
  assert.ok(fs.statSync(path.join(filesRoot, 'maps', 'new_folder')).isDirectory());

  await expectStatus(`/api/servers/${serverId}/files?path=${encodeURIComponent('maps/arena_v2.map')}`, owner.token, {
    method: 'DELETE',
  }, 200);
  assert.ok(!fs.existsSync(path.join(filesRoot, 'maps', 'arena_v2.map')));

  const access = await expectOk(`/api/servers/${serverId}/access`, owner.token);
  assert.ok(access.members.some((member) => member.userId === developer.user.userId));
  assert.ok(access.members.some((member) => member.userId === moderator.user.userId));

  await expectOk(`/api/servers/${serverId}/members/${moderator.user.userId}`, owner.token, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'developer' }),
  });
  const promoted = await expectOk('/api/servers', moderator.token);
  assert.strictEqual(promoted.servers.find((item) => item.id === serverId).role, 'developer');

  await expectOk(`/api/servers/${serverId}/members/${moderator.user.userId}`, owner.token, { method: 'DELETE' });
  const removed = await expectOk('/api/servers', moderator.token);
  assert.strictEqual(removed.servers.length, 0, 'removed moderator still has the server');
  await expectStatus('/api/servers/join', outsider.token, {
    method: 'POST',
    body: JSON.stringify({ code: '0000-0000' }),
  }, 404);

  log('PASS: roles, invitations, permissions, file upload/download/rename/delete');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
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
