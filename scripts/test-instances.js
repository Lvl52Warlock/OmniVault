'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const instances = require('../agent/instances');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omnivault-instances-test-'));
const instancesRoot = path.join(temp, 'managed');
const fakeReclaimer = path.join(__dirname, 'fake-reclaimer.js');
const port = 49700 + Math.floor(Math.random() * 150);

fs.mkdirSync(instancesRoot, { recursive: true });
fs.mkdirSync(path.join(temp, 'game'), { recursive: true });

let manager = instances.createManager({
  config: {
    instancesRoot,
    reclaimerExe: fakeReclaimer,
    serverRoot: temp,
  },
  startTimeoutMs: 20000,
  stopTimeoutMs: 8000,
});

function game(map, mode) {
  return { name: `${map} ${mode}`, map, game: mode, antiCheat: false };
}

async function main() {
  const empty = await manager.list();
  assert.strictEqual(empty.configured, true);
  assert.deepStrictEqual(empty.instances, []);

  const created = await manager.create({
    name: 'Managed Test Server',
    port,
    maxPlayers: 8,
    start: true,
    playlist: {
      name: 'Managed Test Rotation',
      voteSeconds: 15,
      games: [game('Guardian', 'Slayer'), game('Sandbox', 'CTF'), game('Valhalla', 'Slayer')],
    },
  });
  assert.strictEqual(created.configured, true);
  assert.strictEqual(created.started, true, created.startError || 'instance did not start');
  assert.strictEqual(created.instance.name, 'Managed Test Server');
  assert.strictEqual(created.instance.running, true);
  assert.strictEqual(created.instance.playlist.games.length, 3);
  assert.ok(!Object.prototype.hasOwnProperty.call(created.instance, 'rconPassword'), 'password leaked to panel payload');
  const instanceId = created.instance.id;
  const directory = path.join(instancesRoot, instanceId);
  const configPath = path.join(temp, `.omnivault-${instanceId}.toml`);
  assert.ok(fs.existsSync(configPath));
  assert.ok(fs.existsSync(path.join(directory, 'playlist.json')));
  assert.ok(fs.existsSync(path.join(directory, 'server.log')));
  const configText = fs.readFileSync(configPath, 'utf8');
  assert.match(configText, /\[\[server\]\]/);
  assert.match(configText, new RegExp(`port = ${port}`));
  assert.match(configText, /rcon_port = \d+/);
  assert.ok(!/rconPassword/i.test(configText));

  const list = await manager.list();
  const listed = list.instances.find((item) => item.id === instanceId);
  assert.ok(listed);
  assert.strictEqual(listed.running, true);
  assert.strictEqual(listed.port, port);

  const status = await manager.instanceStatus(instanceId);
  assert.strictEqual(status.running, true);
  assert.match(String(status.status), /OmniVault Fake Reclaimer/);
  assert.match(String(status.players), /TestPlayer/);

  // A restarted agent must recognize and be able to stop a process it did not spawn in this process.
  const recovered = instances.createManager({
    config: { instancesRoot, reclaimerExe: fakeReclaimer, serverRoot: temp },
    startTimeoutMs: 20000,
    stopTimeoutMs: 8000,
  });
  const recoveredList = await recovered.list();
  assert.strictEqual(recoveredList.instances.find((item) => item.id === instanceId).running, true);
  await recovered.stop(instanceId);
  assert.strictEqual((await recovered.list()).instances.find((item) => item.id === instanceId).running, false);
  await recovered.start(instanceId);
  assert.strictEqual((await recovered.list()).instances.find((item) => item.id === instanceId).running, true);
  manager = recovered;

  const updated = await manager.update(instanceId, {
    name: 'Managed Test Server v2',
    playlist: {
      name: 'Updated Rotation',
      voteSeconds: 30,
      games: [game('Guardian', 'Slayer'), game('Sandbox', 'CTF'), game('Valhalla', 'CTF')],
    },
  });
  assert.strictEqual(updated.instance.name, 'Managed Test Server v2');
  assert.strictEqual(updated.instance.playlist.games.length, 3);
  assert.strictEqual(updated.restarted, true);
  const statusAfterUpdate = await manager.instanceStatus(instanceId);
  assert.strictEqual(statusAfterUpdate.running, true);
  assert.match(String(statusAfterUpdate.status), /OmniVault Fake Reclaimer/);

  const logs = await manager.logs(instanceId);
  assert.match(String(logs.text), /fake-reclaimer: listening/);

  await manager.stop(instanceId);
  const stopped = await manager.list();
  assert.strictEqual(stopped.instances.find((item) => item.id === instanceId).running, false);
  const stoppedStatus = await manager.instanceStatus(instanceId);
  assert.strictEqual(stoppedStatus.running, false);

  await manager.start(instanceId);
  const restarted = await manager.list();
  assert.strictEqual(restarted.instances.find((item) => item.id === instanceId).running, true);

  await assert.rejects(
    manager.create({
      name: 'Managed Test Server v2',
      port: port + 1,
      playlist: { games: [game('Guardian', 'Slayer'), game('Sandbox', 'CTF'), game('Valhalla', 'Slayer')] },
    }),
    /already exists/,
  );

  await assert.rejects(
    manager.create({
      name: 'Two Game Rotation',
      port: port + 2,
      playlist: { games: [game('Guardian', 'Slayer'), game('Sandbox', 'CTF')] },
    }),
    /at least three games/i,
  );

  await assert.rejects(
    manager.create({
      name: 'Duplicate Game Rotation',
      port: port + 3,
      playlist: { games: [game('Guardian', 'Slayer'), game('Sandbox', 'CTF'), game('Guardian', 'Slayer')] },
    }),
    /different map and game type/i,
  );

  await manager.remove(instanceId);
  assert.ok(!fs.existsSync(directory), 'instance directory was not removed');
  assert.ok(!fs.existsSync(configPath), 'generated config was not removed');
  assert.strictEqual((await manager.list()).instances.length, 0);

  const unconfigured = instances.createManager({ config: {} });
  const unconfiguredList = await unconfigured.list();
  assert.strictEqual(unconfiguredList.configured, false);
  assert.match(String(unconfiguredList.reason), /instances-dir|instances folder/i);
  await assert.rejects(
    unconfigured.create({ name: 'No setup', playlist: { games: [game('Guardian', 'Slayer'), game('Sandbox', 'CTF'), game('Valhalla', 'Slayer')] } }),
    /instances folder/i,
  );

  console.log('PASS: managed instance create/start/status/update/stop/restart/delete and disabled setup');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  try {
    const list = await manager.list();
    for (const instance of list.instances || []) {
      try { await manager.stop(instance.id); } catch {}
    }
  } catch {}
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
});
