'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const rcon = require('./rcon');

const INSTANCE_ID_RE = /^inst_[a-f0-9]{16}$/;
const MAX_INSTANCES = 20;
const MAX_PLAYLIST_GAMES = 30;
const MAX_LOG_BYTES = 8 * 1024 * 1024;
const DEFAULT_START_TIMEOUT_MS = 45000;
const DEFAULT_STOP_TIMEOUT_MS = 8000;
const LOG_TAIL_BYTES = 24 * 1024;

function cleanPath(value) {
  return String(value || '').trim().replace(/^"(.*)"$/, '$1');
}

function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function tomlString(value) {
  return JSON.stringify(String(value == null ? '' : value));
}

function readJson(file, fallback) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(temp, 0o600); } catch {}
    try {
      fs.renameSync(temp, file);
    } catch {
      fs.rmSync(file, { force: true });
      fs.renameSync(temp, file);
    }
  } finally {
    try { fs.rmSync(temp, { force: true }); } catch {}
  }
}

function isPidAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function normalizePlaylist(input) {
  const source = input && typeof input === 'object' ? input : {};
  const rawGames = Array.isArray(source.games) ? source.games : [];
  if (rawGames.length < 3) throw new Error('A playlist needs at least three games. Project Reclaimer votes between three different games.');
  if (rawGames.length > MAX_PLAYLIST_GAMES) {
    throw new Error(`A playlist can contain at most ${MAX_PLAYLIST_GAMES} games.`);
  }
  const seen = new Set();
  const games = rawGames.map((game, index) => {
    const map = cleanText(game && game.map, 160);
    const mode = cleanText(game && (game.game || game.mode), 160);
    if (!map) throw new Error(`Game ${index + 1} is missing a map.`);
    if (!mode) throw new Error(`Game ${index + 1} is missing a game type.`);
    const key = `${map.toLowerCase()}\u0000${mode.toLowerCase()}`;
    if (seen.has(key)) throw new Error('Each playlist game must use a different map and game type.');
    seen.add(key);
    return {
      name: cleanText(game && game.name, 80) || `${map} · ${mode}`,
      map,
      game: mode,
      anti_cheat: !!(game && game.antiCheat),
    };
  });
  const rawVote = Number(source.voteSeconds);
  const voteSeconds = Number.isInteger(rawVote) && rawVote >= 5 && rawVote <= 300 ? rawVote : 20;
  return {
    version: 2,
    name: cleanText(source.name, 80) || 'OmniVault Playlist',
    vote_seconds: voteSeconds,
    games,
  };
}

function publicPlaylist(playlist) {
  return {
    name: playlist.name,
    voteSeconds: playlist.vote_seconds,
    games: playlist.games.map((game) => ({
      name: game.name,
      map: game.map,
      game: game.game,
      antiCheat: !!game.anti_cheat,
    })),
  };
}

function createManager(options = {}) {
  const state = {
    config: options.config || null,
    running: new Map(),
    spawnImpl: options.spawn || spawn,
    spawnSyncImpl: options.spawnSync || spawnSync,
    rconFactory: options.rconFactory || ((server) => rcon.make(server, { allowPrivate: true })),
    wait: options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    platform: options.platform || process.platform,
    startTimeoutMs: options.startTimeoutMs || DEFAULT_START_TIMEOUT_MS,
    stopTimeoutMs: options.stopTimeoutMs || DEFAULT_STOP_TIMEOUT_MS,
    skipPortCheck: !!options.skipPortCheck,
    now: options.now || (() => Date.now()),
  };

  function setConfig(config) {
    state.config = config || null;
  }

  function configuration() {
    const config = state.config || {};
    const rootText = cleanPath(config.instancesRoot);
    const exeText = cleanPath(config.reclaimerExe);
    if (!rootText) {
      return { configured: false, reason: 'The agent has no managed-instances folder. Run setup with --instances-dir.' };
    }
    if (!exeText) {
      return { configured: false, reason: 'The agent does not know where the Project Reclaimer executable is. Run setup with --reclaimer-exe.' };
    }
    let root;
    let exe;
    try {
      root = fs.realpathSync(rootText);
    } catch (error) {
      return { configured: false, reason: `The managed-instances folder could not be opened: ${error.message}` };
    }
    try {
      exe = fs.realpathSync(exeText);
    } catch (error) {
      return { configured: false, reason: `The Project Reclaimer executable could not be opened: ${error.message}` };
    }
    try {
      if (!fs.statSync(root).isDirectory()) {
        return { configured: false, reason: 'The managed-instances path is not a directory.' };
      }
      if (!fs.statSync(exe).isFile()) {
        return { configured: false, reason: 'The Project Reclaimer path is not a file.' };
      }
    } catch (error) {
      return { configured: false, reason: error.message };
    }
    let serverRoot;
    const serverRootText = cleanPath(config.serverRoot) || path.dirname(exe);
    try {
      serverRoot = fs.realpathSync(serverRootText);
      if (!fs.statSync(serverRoot).isDirectory()) throw new Error('not a directory');
    } catch (error) {
      return { configured: false, reason: `The Reclaimer server folder could not be opened: ${error.message}` };
    }
    const gameFolder = path.join(serverRoot, 'game');
    if (!fs.existsSync(gameFolder) || !fs.statSync(gameFolder).isDirectory()) {
      return { configured: false, reason: `The Reclaimer server folder ${serverRoot} is missing the game folder. Point the agent at the folder that contains game/ and content/.` };
    }
    let mccPath = '';
    const mccText = cleanPath(config.mccPath);
    if (mccText) {
      try {
        mccPath = fs.realpathSync(mccText);
        if (!fs.statSync(mccPath).isDirectory()) throw new Error('not a directory');
      } catch (error) {
        return { configured: false, reason: `The MCC game folder could not be opened: ${error.message}` };
      }
    }
    return { configured: true, root, exe, serverRoot, mccPath };
  }

  function requireConfiguration() {
    const config = configuration();
    if (!config.configured) throw new Error(config.reason);
    return config;
  }

  function registryPath(root) {
    return path.join(root, 'instances.json');
  }

  function readRegistry(root) {
    const list = readJson(registryPath(root), []);
    if (!Array.isArray(list)) return [];
    return list.filter((instance) => instance && INSTANCE_ID_RE.test(String(instance.id || '')));
  }

  function writeRegistry(root, list) {
    writeJson(registryPath(root), list);
  }

  function instanceDirectory(root, id) {
    if (!INSTANCE_ID_RE.test(String(id || ''))) throw new Error('Invalid instance id.');
    const target = path.resolve(root, id);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('The instance path is outside the managed-instances folder.');
    }
    return target;
  }

  function findInstance(root, id) {
    const list = readRegistry(root);
    const instance = list.find((item) => item.id === id);
    if (!instance) throw new Error('Server instance not found.');
    return { list, instance };
  }

  function runningInfo(instance) {
    const tracked = state.running.get(instance.id);
    if (tracked && tracked.child && tracked.child.exitCode === null) {
      return { pid: tracked.pid, tracked: true, child: tracked.child };
    }
    if (isPidAlive(instance.pid)) {
      return { pid: Number(instance.pid), tracked: false, child: null };
    }
    return null;
  }

  function publicInstance(instance) {
    const running = runningInfo(instance);
    return {
      id: instance.id,
      name: instance.name,
      port: Number(instance.port),
      maxPlayers: Number(instance.maxPlayers) || 127,
      playlist: publicPlaylist(instance.playlist),
      createdAt: instance.createdAt || null,
      updatedAt: instance.updatedAt || null,
      running: !!running,
      pid: running ? running.pid : null,
      lastStartAt: instance.lastStartAt || null,
      lastExitAt: instance.lastExitAt || null,
      logAvailable: !!instance.directory && fs.existsSync(path.join(instance.directory, 'server.log')),
    };
  }

  function managedConfigPath(serverRoot, id) {
    return path.join(serverRoot, `.omnivault-${id}.toml`);
  }

  function writeInstanceFiles(root, instance, serverRoot) {
    const directory = instanceDirectory(root, instance.id);
    fs.mkdirSync(directory, { recursive: true });
    const playlistPath = path.join(directory, 'playlist.json');
    const configPath = managedConfigPath(serverRoot, instance.id);
    const bansPath = path.join(directory, 'bans.json');
    const chatPath = path.join(directory, 'chat');

    writeJson(playlistPath, instance.playlist);
    if (!fs.existsSync(bansPath)) fs.writeFileSync(bansPath, '[]\n', { encoding: 'utf8', mode: 0o600 });

    const lines = [
      '# Managed by OmniVault. Manual edits are overwritten.',
      `host_name = ${tomlString(instance.hostName || instance.name)}`,
      `bans = ${tomlString(bansPath)}`,
      '',
      '[rcon]',
      `password = ${tomlString(instance.rconPassword)}`,
      '',
      '[defaults]',
      'max_players = 127',
      'share_mods = false',
      'share_rate = 60',
      '',
      '[[server]]',
      `name = ${tomlString(instance.name)}`,
      `port = ${Number(instance.port)}`,
      `rcon_port = ${Number(instance.port)}`,
      `playlist = ${tomlString(playlistPath)}`,
      `max_players = ${Number(instance.maxPlayers) || 127}`,
      'anti_cheat = "off"',
      'chat_log = true',
      'votes = true',
      'enabled = true',
      '',
    ];
    fs.writeFileSync(configPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(configPath, 0o600); } catch {}
    try { fs.chmodSync(playlistPath, 0o600); } catch {}
    fs.mkdirSync(chatPath, { recursive: true });
    instance.directory = directory;
    instance.playlistPath = playlistPath;
    instance.configPath = configPath;
    instance.updatedAt = new Date(state.now()).toISOString();
  }

  async function assertTcpPortFree(port) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      const timer = setTimeout(() => {
        try { server.close(); } catch {}
        reject(new Error('Timed out while checking the server port.'));
      }, 3000);
      server.once('error', (error) => {
        clearTimeout(timer);
        reject(error.code === 'EADDRINUSE'
          ? new Error(`Port ${port} is already in use on the agent PC. Choose another port.`)
          : new Error(`Could not check port ${port}: ${error.message}`));
      });
      server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
        clearTimeout(timer);
        server.close(() => resolve());
      });
    });
  }

  async function assertUdpPortFree(port) {
    await new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const timer = setTimeout(() => {
        try { socket.close(); } catch {}
        reject(new Error('Timed out while checking the server UDP port.'));
      }, 3000);
      socket.once('error', (error) => {
        clearTimeout(timer);
        try { socket.close(); } catch {}
        reject(error.code === 'EADDRINUSE'
          ? new Error(`UDP port ${port} is already in use on the agent PC. Choose another port.`)
          : new Error(`Could not check UDP port ${port}: ${error.message}`));
      });
      socket.bind(port, '0.0.0.0', () => {
        clearTimeout(timer);
        try { socket.close(() => resolve()); } catch { resolve(); }
      });
    });
  }

  async function assertPortAvailable(port, list, excludeId) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error('Choose a server port between 1024 and 65535.');
    }
    const duplicate = list.find((item) => item.id !== excludeId && Number(item.port) === port);
    if (duplicate) throw new Error(`Port ${port} is already assigned to "${duplicate.name}".`);
    if (state.skipPortCheck) return;
    await assertTcpPortFree(port);
    await assertUdpPortFree(port);
  }

  async function choosePort(list) {
    for (let port = 49200; port <= 49299; port += 1) {
      if (list.some((item) => Number(item.port) === port)) continue;
      try {
        await assertPortAvailable(port, list, '');
        return port;
      } catch {}
    }
    for (let port = 49300; port <= 65535; port += 1) {
      if (list.some((item) => Number(item.port) === port)) continue;
      try {
        await assertPortAvailable(port, list, '');
        return port;
      } catch {}
    }
    throw new Error('No free server port was found. Enter a port manually.');
  }

  function launchCommand(config, instance) {
    const args = ['dedicated', '--config', instance.configPath, 'run', '--verbose'];
    if (/\.(?:c|m)?js$/i.test(config.exe)) {
      return { file: process.execPath, args: [config.exe, ...args] };
    }
    return { file: config.exe, args };
  }

  function rotateLog(directory) {
    const logPath = path.join(directory, 'server.log');
    try {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
        fs.rmSync(`${logPath}.1`, { force: true });
        fs.renameSync(logPath, `${logPath}.1`);
      }
    } catch {}
    return logPath;
  }

  function updateRegistryInstance(root, id, patch) {
    const list = readRegistry(root);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return null;
    Object.assign(list[index], patch);
    writeRegistry(root, list);
    return list[index];
  }

  async function waitForRcon(instance) {
    const deadline = state.now() + state.startTimeoutMs;
    let lastError = null;
    while (state.now() < deadline) {
      const tracked = state.running.get(instance.id);
      if (tracked && tracked.child && tracked.child.exitCode !== null) break;
      if (!tracked && instance.pid && !isPidAlive(instance.pid)) break;
      try {
        const status = await state.rconFactory({
          host: '127.0.0.1',
          port: Number(instance.port),
          password: instance.rconPassword,
        }).status();
        return { ready: true, status: String(status || '') };
      } catch (error) {
        lastError = error;
      }
      await state.wait(1000);
    }
    return { ready: false, error: lastError ? String(lastError.message || lastError) : 'The server did not answer RCON yet.' };
  }

  async function waitForExit(child, timeoutMs) {
    if (!child || child.exitCode !== null) return true;
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);
      child.once('exit', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  function killProcessTree(pid) {
    const value = Number(pid);
    if (!Number.isInteger(value) || value <= 0) return;
    if (state.platform === 'win32') {
      state.spawnSyncImpl('taskkill.exe', ['/PID', String(value), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      return;
    }
    try {
      process.kill(value, 'SIGTERM');
    } catch {}
  }

  async function verifyExternalProcess(instance, pid) {
    if (!isPidAlive(pid)) return false;
    if (state.platform !== 'win32') return true;
    const script = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}").CommandLine`;
    const result = state.spawnSyncImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    const commandLine = String(result && result.stdout ? result.stdout : '');
    const owned = !!instance.configPath && commandLine.includes(instance.configPath);
    return !!commandLine && owned && /reclaimer/i.test(commandLine);
  }

  async function stopInstance(root, instance) {
    const info = runningInfo(instance);
    if (info) {
      if (info.tracked && info.child) {
        killProcessTree(info.pid);
        const exited = await waitForExit(info.child, state.stopTimeoutMs);
        if (!exited) {
          try { info.child.kill('SIGKILL'); } catch {}
          await waitForExit(info.child, 3000);
        }
      } else {
        const verified = await verifyExternalProcess(instance, info.pid);
        if (!verified) {
          throw new Error('Refusing to stop an unverified process. Stop it from the game-server PC.');
        }
        killProcessTree(info.pid);
      }
      state.running.delete(instance.id);
    }
    updateRegistryInstance(root, instance.id, {
      pid: null,
      lastExitAt: new Date(state.now()).toISOString(),
    });
    return { ok: true };
  }

  async function list() {
    const config = configuration();
    if (!config.configured) {
      return { configured: false, reason: config.reason, instances: [], maxInstances: MAX_INSTANCES };
    }
    const instances = readRegistry(config.root)
      .map((instance) => {
        try {
          instance.directory = instanceDirectory(config.root, instance.id);
          return publicInstance(instance);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
    return { configured: true, instances, maxInstances: MAX_INSTANCES };
  }

  async function create(input) {
    const config = requireConfiguration();
    const list = readRegistry(config.root);
    if (list.length >= MAX_INSTANCES) {
      throw new Error(`The agent can manage at most ${MAX_INSTANCES} server instances.`);
    }
    const name = cleanText(input && input.name, 80);
    if (name.length < 2) throw new Error('Server name must be 2-80 characters.');
    if (list.some((instance) => String(instance.name).toLowerCase() === name.toLowerCase())) {
      throw new Error('A managed instance with that name already exists.');
    }
    const rawMax = Number(input && input.maxPlayers);
    const maxPlayers = Number.isInteger(rawMax) && rawMax >= 1 && rawMax <= 127 ? rawMax : 16;
    let port = Number(input && input.port);
    if (!Number.isInteger(port) || port <= 0) port = await choosePort(list);
    await assertPortAvailable(port, list, '');
    const playlist = normalizePlaylist(input && input.playlist);
    const now = new Date(state.now()).toISOString();
    const instance = {
      id: `inst_${crypto.randomBytes(8).toString('hex')}`,
      name,
      hostName: name,
      port,
      maxPlayers,
      rconPassword: crypto.randomBytes(18).toString('base64url'),
      playlist,
      pid: null,
      createdAt: now,
      updatedAt: now,
      lastStartAt: null,
      lastExitAt: null,
    };
    writeInstanceFiles(config.root, instance, config.serverRoot);
    list.push(instance);
    writeRegistry(config.root, list);
    let startResult = null;
    if (input && input.start) {
      startResult = await start(instance.id);
    }
    return {
      configured: true,
      instance: publicInstance(instance),
      started: !!(startResult && startResult.ready),
      startError: startResult && !startResult.ready ? startResult.message : null,
    };
  }

  async function update(id, input) {
    const config = requireConfiguration();
    const { list, instance } = findInstance(config.root, id);
    const running = runningInfo(instance);
    const name = input && input.name != null ? cleanText(input.name, 80) : instance.name;
    if (name.length < 2) throw new Error('Server name must be 2-80 characters.');
    if (list.some((item) => item.id !== instance.id && String(item.name).toLowerCase() === name.toLowerCase())) {
      throw new Error('A managed instance with that name already exists.');
    }
    let port = input && input.port != null ? Number(input.port) : Number(instance.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a server port between 1024 and 65535.');
    if (port !== Number(instance.port)) {
      if (running) throw new Error('Stop the instance before changing its port.');
      await assertPortAvailable(port, list, instance.id);
    }
    const playlist = input && input.playlist ? normalizePlaylist(input.playlist) : instance.playlist;
    const playlistChanged = JSON.stringify(playlist) !== JSON.stringify(instance.playlist);
    const rawMax = input && input.maxPlayers != null ? Number(input.maxPlayers) : Number(instance.maxPlayers);
    if (!Number.isInteger(rawMax) || rawMax < 1 || rawMax > 127) throw new Error('Max players must be 1-127.');
    instance.name = name;
    instance.hostName = name;
    instance.port = port;
    instance.maxPlayers = rawMax;
    instance.playlist = playlist;
    writeInstanceFiles(config.root, instance, config.serverRoot);
    const index = list.findIndex((item) => item.id === instance.id);
    list[index] = instance;
    writeRegistry(config.root, list);
    let restarted = false;
    if (running && playlistChanged) {
      await stopInstance(config.root, instance);
      const started = await start(instance.id);
      restarted = !!started.ready;
    }
    return { configured: true, instance: publicInstance(instance), restarted };
  }

  async function start(id) {
    const config = requireConfiguration();
    const { list, instance } = findInstance(config.root, id);
    const info = runningInfo(instance);
    if (info) {
      const probe = await waitForRcon({ ...instance, pid: info.pid });
      return {
        configured: true,
        instance: publicInstance(instance),
        ready: !!probe.ready,
        message: probe.ready ? 'Server is already running.' : (probe.error || 'Server process is running but RCON is not ready.'),
      };
    }
    await assertPortAvailable(Number(instance.port), list, instance.id);
    const directory = instance.directory || instanceDirectory(config.root, instance.id);
    fs.mkdirSync(directory, { recursive: true });
    instance.directory = directory;
    instance.configPath = managedConfigPath(config.serverRoot, instance.id);
    instance.playlistPath = path.join(directory, 'playlist.json');
    if (!fs.existsSync(instance.configPath)) writeInstanceFiles(config.root, instance, config.serverRoot);
    const logPath = rotateLog(directory);
    const launch = launchCommand(config, instance);
    let child;
    let logFd = null;
    try {
      logFd = fs.openSync(logPath, 'a');
      child = state.spawnImpl(launch.file, launch.args, {
        cwd: config.serverRoot || directory,
        windowsHide: true,
        stdio: ['ignore', logFd, logFd],
        detached: false,
      });
    } catch (error) {
      throw new Error(`Could not start Project Reclaimer: ${error.message}`);
    } finally {
      if (logFd !== null) {
        try { fs.closeSync(logFd); } catch {}
      }
    }
    if (!child || !Number.isInteger(child.pid)) {
      throw new Error('Project Reclaimer did not return a process id.');
    }
    const record = {
      child,
      pid: child.pid,
      startedAt: new Date(state.now()).toISOString(),
    };
    state.running.set(instance.id, record);
    instance.pid = child.pid;
    instance.lastStartAt = record.startedAt;
    instance.lastExitAt = null;
    updateRegistryInstance(config.root, instance.id, {
      pid: child.pid,
      lastStartAt: record.startedAt,
      lastExitAt: null,
    });
    child.once('error', (error) => {
      state.running.delete(instance.id);
      updateRegistryInstance(config.root, instance.id, {
        pid: null,
        lastExitAt: new Date(state.now()).toISOString(),
      });
      try {
        fs.appendFileSync(logPath, `\n[OmniVault] Process error: ${error.message}\n`);
      } catch {}
    });
    child.once('exit', (code, signal) => {
      if (state.running.get(instance.id) === record) state.running.delete(instance.id);
      updateRegistryInstance(config.root, instance.id, {
        pid: null,
        lastExitAt: new Date(state.now()).toISOString(),
      });
      try {
        fs.appendFileSync(logPath, `\n[OmniVault] Process exited (code ${code == null ? 'unknown' : code}, signal ${signal || 'none'}).\n`);
      } catch {}
    });
    if (child.unref) child.unref();
    const probe = await waitForRcon(instance);
    if (!probe.ready && child.exitCode !== null) {
      const tail = readLogs(instance, 2000);
      throw new Error(`Project Reclaimer exited during startup.${tail ? `\n${tail}` : ''}`);
    }
    return {
      configured: true,
      instance: publicInstance(instance),
      ready: !!probe.ready,
      message: probe.ready ? 'Server is online.' : (probe.error || 'Server is starting. Check the instance logs if it does not come online.'),
    };
  }

  async function stop(id) {
    const config = requireConfiguration();
    const { instance } = findInstance(config.root, id);
    await stopInstance(config.root, instance);
    return { configured: true, instance: publicInstance(instance) };
  }

  async function restart(id) {
    const config = requireConfiguration();
    const { instance } = findInstance(config.root, id);
    if (runningInfo(instance)) await stopInstance(config.root, instance);
    return start(id);
  }

  async function remove(id) {
    const config = requireConfiguration();
    const { list, instance } = findInstance(config.root, id);
    await stopInstance(config.root, instance);
    const directory = instanceDirectory(config.root, instance.id);
    fs.rmSync(directory, { recursive: true, force: true });
    try { fs.rmSync(managedConfigPath(config.serverRoot, instance.id), { force: true }); } catch {}
    writeRegistry(config.root, list.filter((item) => item.id !== instance.id));
    state.running.delete(instance.id);
    return { configured: true, ok: true };
  }

  function readLogs(instance, maxBytes = LOG_TAIL_BYTES) {
    const directory = instance.directory || '';
    if (!directory) return '';
    const logPath = path.join(directory, 'server.log');
    try {
      const stat = fs.statSync(logPath);
      const length = Math.min(stat.size, Math.max(1024, maxBytes));
      const fd = fs.openSync(logPath, 'r');
      const buffer = Buffer.alloc(length);
      let bytes = 0;
      try {
        bytes = fs.readSync(fd, buffer, 0, length, Math.max(0, stat.size - length));
      } finally {
        fs.closeSync(fd);
      }
      return buffer.subarray(0, bytes).toString('utf8');
    } catch {
      return '';
    }
  }

  async function logs(id) {
    const config = requireConfiguration();
    const { instance } = findInstance(config.root, id);
    instance.directory = instance.directory || instanceDirectory(config.root, instance.id);
    return {
      configured: true,
      instance: publicInstance(instance),
      text: readLogs(instance),
    };
  }

  async function instanceStatus(id) {
    const config = requireConfiguration();
    const { instance } = findInstance(config.root, id);
    const running = runningInfo(instance);
    if (!running) {
      return {
        configured: true,
        instance: publicInstance(instance),
        running: false,
        status: '',
        players: '',
        error: 'Instance is not running.',
      };
    }
    const client = state.rconFactory({
      host: '127.0.0.1',
      port: Number(instance.port),
      password: instance.rconPassword,
    });
    const [statusResult, playersResult] = await Promise.allSettled([client.status(), client.players()]);
    return {
      configured: true,
      instance: publicInstance(instance),
      running: true,
      status: statusResult.status === 'fulfilled' ? statusResult.value : '',
      players: playersResult.status === 'fulfilled' ? playersResult.value : '',
      error: statusResult.status === 'rejected'
        ? String(statusResult.reason && statusResult.reason.message ? statusResult.reason.message : statusResult.reason)
        : null,
    };
  }

  function rconTarget(instanceId) {
    const config = requireConfiguration();
    const { instance } = findInstance(config.root, instanceId);
    if (!runningInfo(instance)) throw new Error('That managed instance is not running.');
    instance.directory = instance.directory || instanceDirectory(config.root, instance.id);
    return {
      host: '127.0.0.1',
      port: Number(instance.port),
      password: instance.rconPassword,
      instance,
    };
  }

  async function execute(action, payload = {}) {
    if (action === 'instances-status' || action === 'instances-list') {
      return JSON.stringify(await list());
    }
    if (action === 'instance-create') return JSON.stringify(await create(payload));
    if (action === 'instance-update') return JSON.stringify(await update(String(payload.instanceId || ''), payload));
    if (action === 'instance-start') return JSON.stringify(await start(String(payload.instanceId || '')));
    if (action === 'instance-stop') return JSON.stringify(await stop(String(payload.instanceId || '')));
    if (action === 'instance-restart') return JSON.stringify(await restart(String(payload.instanceId || '')));
    if (action === 'instance-delete') return JSON.stringify(await remove(String(payload.instanceId || '')));
    if (action === 'instance-status') return JSON.stringify(await instanceStatus(String(payload.instanceId || '')));
    if (action === 'instance-logs') return JSON.stringify(await logs(String(payload.instanceId || '')));
    throw new Error('Unsupported instance action.');
  }

  return {
    setConfig,
    configuration,
    list,
    create,
    update,
    start,
    stop,
    restart,
    remove,
    logs,
    instanceStatus,
    rconTarget,
    execute,
    readLogs,
  };
}

module.exports = {
  createManager,
  INSTANCE_ID_RE,
  MAX_INSTANCES,
  normalizePlaylist,
};
