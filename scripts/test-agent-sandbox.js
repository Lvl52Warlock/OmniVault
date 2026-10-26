'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const root = path.resolve(__dirname, '..');
const agentExe = process.env.TEST_AGENT_EXE || path.join(root, 'agent-dist', 'OmniVaultAgent.exe');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omnivault-agent-sandbox-'));
const filesRoot = path.join(temp, 'content');
const configPath = path.join(temp, 'agent-config.json');
const port = 49800 + Math.floor(Math.random() * 300);

fs.mkdirSync(path.join(filesRoot, 'maps'), { recursive: true });
fs.writeFileSync(path.join(filesRoot, 'maps', 'allowed.map'), Buffer.from('map-data'));
fs.writeFileSync(path.join(filesRoot, 'notes.txt'), 'hello');

const config = {
  panelUrl: `http://127.0.0.1:${port}`,
  serverId: 'srv_sandbox_test',
  agentToken: 'sandbox-test-token',
  agentName: 'Sandbox Test Agent',
  rcon: { host: '127.0.0.1', port: 49176, password: 'not-used' },
  filesRoot,
};
fs.writeFileSync(configPath, JSON.stringify(config));

const server = http.createServer((req, res) => {
  if (req.url === '/api/agent/update-exe') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not configured' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  if (!request.url || !request.url.startsWith('/api/agent/socket')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

let agent = null;
const pending = new Map();

function sendCommand(ws, action, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = `cmd_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${action}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'command', id, action, payload }));
  });
}

function waitForConnection() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Agent did not connect to mock panel.')), 20000);
    wss.once('connection', (ws) => {
      clearTimeout(timer);
      resolve(ws);
    });
  });
}

async function main() {
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  if (!fs.existsSync(agentExe)) throw new Error(`Packaged agent not found: ${agentExe}`);
  agent = spawn(agentExe, ['--config', configPath], {
    cwd: path.dirname(agentExe),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  agent.stdout.on('data', (chunk) => process.stdout.write(`[agent] ${chunk}`));
  agent.stderr.on('data', (chunk) => process.stderr.write(`[agent] ${chunk}`));

  const ws = await waitForConnection();
  ws.on('message', (data) => {
    let message = null;
    try { message = JSON.parse(String(data)); } catch { return; }
    if (message.type !== 'result' || !message.id) return;
    const item = pending.get(String(message.id));
    if (!item) return;
    pending.delete(String(message.id));
    clearTimeout(item.timer);
    if (message.ok) item.resolve({ ok: true, result: message.result });
    else item.resolve({ ok: false, error: message.error });
  });
  ws.send(JSON.stringify({ type: 'welcome', serverId: 'srv_sandbox_test', serverName: 'Sandbox' }));

  const traversalList = await sendCommand(ws, 'files-list', { path: '../../outside' });
  assert.strictEqual(traversalList.ok, false);
  assert.match(traversalList.error, /cannot leave|relative/i);

  const absoluteList = await sendCommand(ws, 'files-list', { path: 'C:\\Windows' });
  assert.strictEqual(absoluteList.ok, false);
  assert.match(absoluteList.error, /relative|leave/i);

  const traversalBegin = await sendCommand(ws, 'files-upload-begin', { path: '../escape.map', size: 1 });
  assert.strictEqual(traversalBegin.ok, false);
  assert.match(traversalBegin.error, /cannot leave|relative/i);

  const traversalDelete = await sendCommand(ws, 'files-delete', { path: '../escape.map' });
  assert.strictEqual(traversalDelete.ok, false);
  assert.match(traversalDelete.error, /cannot leave|relative/i);

  const disallowedUpload = await sendCommand(ws, 'files-upload-begin', { path: 'bad.exe', size: 1 });
  assert.strictEqual(disallowedUpload.ok, false);
  assert.match(disallowedUpload.error, /not allowed/i);

  const list = await sendCommand(ws, 'files-list', { path: '' });
  assert.strictEqual(list.ok, true);
  const entries = JSON.parse(list.result).entries;
  assert.ok(entries.some((entry) => entry.name === 'maps' && entry.type === 'dir'));
  assert.ok(entries.some((entry) => entry.name === 'notes.txt' && entry.type === 'file'));

  const read = await sendCommand(ws, 'files-read', { path: 'maps/allowed.map', offset: 0, length: 128 });
  assert.strictEqual(read.ok, true);
  const readData = Buffer.from(JSON.parse(read.result).data, 'base64').toString();
  assert.strictEqual(readData, 'map-data');

  const emptyPath = await sendCommand(ws, 'files-list', { path: '' });
  assert.strictEqual(emptyPath.ok, true);
  assert.ok(fs.existsSync(path.join(filesRoot, 'maps', 'allowed.map')), 'sandbox test modified the real file');

  ws.close();
  console.log('PASS: packaged agent file sandbox rejects traversal, absolute paths, and executable uploads');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (agent) {
    try { agent.kill(); } catch {}
  }
  await new Promise((resolve) => server.close(resolve));
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
});
