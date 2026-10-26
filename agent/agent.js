'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const WebSocket = require('ws');
const rcon = require('./rcon');
const packageInfo = require('./package.json');

// pkg snapshots the application under a virtual directory. Configuration and
// update files must live next to the real executable, not inside that snapshot.
const IS_PACKAGED = !!process.pkg;
const BUNDLE_DIR = __dirname;
const RUNTIME_DIR = IS_PACKAGED ? path.dirname(process.execPath) : __dirname;
const VERSION = packageInfo.version;
const DEFAULT_CONFIG = path.join(RUNTIME_DIR, 'agent-config.json');
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_RESULT_CHARS = 256 * 1024;
const UPDATE_FILES = new Set([
  'agent.js', 'rcon.js', 'package.json', 'update-public.pem',
  'start-agent.ps1', 'start-agent.cmd', 'README.txt',
]);
const args = process.argv.slice(2);

function hasArg(name) {
  return args.includes(name) || args.some((value) => value.startsWith(`${name}=`));
}

function argValue(...names) {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) return args[index + 1];
    const prefix = `${name}=`;
    const match = args.find((value) => value.startsWith(prefix));
    if (match) return match.slice(prefix.length);
  }
  return undefined;
}

const configPath = argValue('--config') || process.env.OMNIVAULT_AGENT_CONFIG || DEFAULT_CONFIG;
const testOnly = hasArg('--test');
const forceSetup = hasArg('--setup');
const skipRconTest = hasArg('--skip-rcon-test');
const showHelp = hasArg('--help') || hasArg('-h');
const showVersion = hasArg('--version');
const setupRequested = forceSetup || [
  '--panel', '--panel-url', '--pair', '--pairing-code', '--rcon-host',
  '--rcon-port', '--rcon-password', '--name',
].some(hasArg);

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function usage() {
  console.log(`OmniVault Agent ${VERSION}\n`);
  console.log('Usage:');
  console.log('  OmniVaultAgent.exe');
  console.log('  OmniVaultAgent.exe --panel "https://panel.example.com" --pair "1A2B-3C4D" --rcon-port 49176');
  console.log('  OmniVaultAgent.exe --setup');
  console.log('  OmniVaultAgent.exe --test');
  console.log('');
  console.log('Options:');
  console.log('  --panel <url>          Control panel URL (HTTPS outside localhost).');
  console.log('  --pair <code>          Eight-character pairing code from the panel.');
  console.log('  --rcon-host <host>     Local RCON host (default 127.0.0.1).');
  console.log('  --rcon-port <port>     Local RCON port (default 49176).');
  console.log('  --rcon-password <pw>   RCON password; omit it to be prompted privately.');
  console.log('  --name <name>          Name shown in the panel (default: this PC).');
  console.log('  --setup                Re-run setup even if agent-config.json exists.');
  console.log('  --skip-rcon-test       Save the configuration without testing RCON first.');
  console.log('  --test                 Test the saved RCON configuration and exit.');
  console.log('  --config <path>        Use a different agent-config.json path.');
  console.log('  --version              Print the agent version and exit.');
  console.log('  --help                 Show this help.');
}

function normalizePanelUrl(value) {
  const input = String(value || '').trim();
  if (!input) throw new Error('The panel URL is required.');
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error('Enter a valid panel URL, such as https://panel.example.com.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('The panel URL must use http or https.');
  }
  if (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('Use an HTTPS panel URL outside localhost so the agent token is not sent in clear text.');
  }
  return parsed.origin;
}

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question) => new Promise((resolve) => rl.question(question, resolve)),
    close: () => rl.close(),
  };
}

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('No terminal is available for the RCON password. Pass --rcon-password or set OMNIVAULT_RCON_PASSWORD.'));
      return;
    }
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let value = '';
    let settled = false;
    const cleanup = () => {
      stdin.removeListener('data', onData);
      try { stdin.setRawMode(!!wasRaw); } catch {}
      stdin.pause();
    };
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(result);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003' || character === '\u0004') {
          finish(new Error('Setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish(null, value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          process.stdout.write('*');
        }
      }
    };
    try { stdin.setRawMode(true); } catch {}
    stdin.resume();
    stdin.setEncoding('utf8');
    process.stdout.write(label);
    stdin.on('data', onData);
  });
}

function restrictConfigPermissions(file) {
  try {
    const user = process.env.USERDOMAIN
      ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
      : process.env.USERNAME;
    if (!user || process.platform !== 'win32') return;
    spawnSync('icacls.exe', [file, '/inheritance:r', '/grant:r', `${user}:(R,W)`], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {}
}

async function runSetup() {
  let panelUrl = String(argValue('--panel', '--panel-url') || process.env.OMNIVAULT_PANEL_URL || '').trim();
  let pairingCodeInput = String(argValue('--pair', '--pairing-code') || '').trim();
  let rconHost = String(argValue('--rcon-host') || '127.0.0.1').trim() || '127.0.0.1';
  let rconPortInput = String(argValue('--rcon-port') || '49176').trim();
  let agentName = String(argValue('--name') || os.hostname()).trim().slice(0, 80) || os.hostname();
  let rconPassword = String(argValue('--rcon-password') || process.env.OMNIVAULT_RCON_PASSWORD || '');

  const needsWizard = !panelUrl || !pairingCodeInput;
  if (needsWizard && !process.stdin.isTTY) {
    throw new Error('Run with --panel, --pair, and --rcon-port, or double-click OmniVaultAgent.exe to use setup.');
  }

  if (needsWizard) {
    console.log('');
    console.log('OmniVault Agent setup');
    console.log('The agent connects out to the panel. No port forwarding is needed.');
    console.log('');
    const prompt = createPrompt();
    try {
      if (!panelUrl) {
        panelUrl = (await prompt.ask('Panel URL: ')).trim();
      }
      if (!pairingCodeInput) {
        pairingCodeInput = (await prompt.ask('Pairing code: ')).trim();
      }
      const hostAnswer = (await prompt.ask(`Local RCON host [${rconHost}]: `)).trim();
      if (hostAnswer) rconHost = hostAnswer;
      const portAnswer = (await prompt.ask(`Local RCON port [${rconPortInput || '49176'}]: `)).trim();
      if (portAnswer) rconPortInput = portAnswer;
      const nameAnswer = (await prompt.ask(`Agent name [${agentName}]: `)).trim();
      if (nameAnswer) agentName = nameAnswer.slice(0, 80);
    } finally {
      prompt.close();
    }
  }

  const origin = normalizePanelUrl(panelUrl);
  const normalizedCode = String(pairingCodeInput).toUpperCase().replace(/[^A-F0-9]/g, '');
  if (normalizedCode.length !== 8) {
    throw new Error('The pairing code must be eight characters, for example 1A2B-3C4D.');
  }
  const rconPort = Number(rconPortInput);
  if (!Number.isInteger(rconPort) || rconPort < 1 || rconPort > 65535) {
    throw new Error('The RCON port must be between 1 and 65535.');
  }
  if (!rconHost) throw new Error('The RCON host is required.');

  if (!rconPassword) {
    rconPassword = await promptHidden(`RCON password for ${rconHost}:${rconPort}: `);
  }
  if (!rconPassword) throw new Error('The RCON password cannot be empty.');

  if (!skipRconTest) {
    console.log('Testing the local RCON connection...');
    const result = await rcon.make({ host: rconHost, port: rconPort, password: rconPassword }, { allowPrivate: true }).status();
    const firstLine = String(result || '').split(/\r?\n/)[0] || 'RCON responded.';
    console.log(`RCON test passed: ${firstLine}`);
  }

  console.log(`Pairing with ${origin}...`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  let pair;
  try {
    response = await fetch(`${origin}/api/agent/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pairingCode: normalizedCode, agentName, agentVersion: VERSION }),
      signal: controller.signal,
    });
    pair = await response.json().catch(() => ({}));
  } catch (error) {
    throw new Error(`Could not pair with the panel: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok || !pair || !pair.ok || !pair.token || !pair.serverId) {
    throw new Error((pair && pair.error) || 'The panel rejected the pairing code. Generate a new code and try again.');
  }

  const config = {
    panelUrl: origin,
    serverId: pair.serverId,
    agentToken: pair.token,
    agentName,
    rcon: { host: rconHost, port: rconPort, password: rconPassword },
  };
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    throw new Error(`Could not save ${configPath}: ${error.message}`);
  }
  restrictConfigPermissions(configPath);
  console.log(`Agent installed for "${pair.serverName || pair.serverId}".`);
  console.log('Keep this window open while you want remote control to work.');
  return config;
}

function loadConfig() {
  let config;
  try {
    const text = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not read ${configPath}. Run OmniVaultAgent.exe without arguments to set it up. (${error.message})`);
  }
  if (!config.panelUrl || !config.agentToken || !config.serverId) {
    throw new Error('The agent config is incomplete. Run OmniVaultAgent.exe --setup again.');
  }
  if (!config.rcon || !config.rcon.host || !Number.isInteger(Number(config.rcon.port))) {
    throw new Error('The agent config is missing the local RCON host or port.');
  }
  const panel = new URL(config.panelUrl);
  if (panel.protocol !== 'https:' && panel.protocol !== 'http:') {
    throw new Error('The panel URL must use http or https.');
  }
  if (panel.protocol === 'http:' && !['127.0.0.1', 'localhost', '::1'].includes(panel.hostname)) {
    throw new Error('Use an HTTPS panel URL outside localhost so the agent token is not sent in clear text.');
  }
  return config;
}

function websocketUrl(panelUrl) {
  const url = new URL(panelUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/agent/socket';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// ---------- signed auto-update ----------
function updatePublicKey() {
  for (const directory of [BUNDLE_DIR, RUNTIME_DIR]) {
    try {
      return fs.readFileSync(path.join(directory, 'update-public.pem'), 'utf8');
    } catch {}
  }
  return '';
}

function canonicalPackage(pkg) {
  return JSON.stringify({
    version: String(pkg.version),
    publishedAt: String(pkg.publishedAt),
    files: pkg.files.map((file) => ({
      name: String(file.name),
      sha256: String(file.sha256),
      data: String(file.data),
    })),
  });
}

function verifyUpdatePackage(pkg) {
  const key = updatePublicKey();
  if (!key || !pkg || typeof pkg !== 'object' || !pkg.signature || !Array.isArray(pkg.files)) return false;
  try {
    return crypto.verify(
      null,
      Buffer.from(canonicalPackage(pkg)),
      key,
      Buffer.from(String(pkg.signature), 'base64'),
    );
  } catch {
    return false;
  }
}

function versionParts(value) {
  return String(value || '0').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate, current) {
  const left = versionParts(candidate);
  const right = versionParts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return false;
}

async function fetchUpdatePackage(panelUrl) {
  if (typeof fetch !== 'function') return null;
  const endpoint = new URL('/api/agent/update', panelUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Update check returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function canonicalExeManifest(manifest) {
  return JSON.stringify({
    version: String(manifest.version),
    publishedAt: String(manifest.publishedAt),
    sha256: String(manifest.sha256),
    size: Number(manifest.size),
  });
}

function verifyExeManifest(manifest) {
  const key = updatePublicKey();
  if (!key || !manifest || typeof manifest !== 'object' || !manifest.signature) return false;
  try {
    return crypto.verify(
      null,
      Buffer.from(canonicalExeManifest(manifest)),
      key,
      Buffer.from(String(manifest.signature), 'base64'),
    );
  } catch {
    return false;
  }
}

async function fetchExeManifest(panelUrl) {
  if (typeof fetch !== 'function') return null;
  const endpoint = new URL('/api/agent/update-exe', panelUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Update check returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function downloadAgentExe(panelUrl) {
  if (typeof fetch !== 'function') throw new Error('This runtime does not support HTTPS downloads.');
  const endpoint = new URL('/api/agent/update-exe/download', panelUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/octet-stream' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Agent download returned ${response.status}.`);
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length) throw new Error('The downloaded agent was empty.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function applyExeUpdate(manifest, data) {
  const targetPath = process.execPath;
  const targetName = path.basename(targetPath);
  const temporaryName = `.OmniVaultAgent-${manifest.version}.exe`;
  const temporaryPath = path.join(RUNTIME_DIR, temporaryName);
  const scriptPath = path.join(RUNTIME_DIR, `.OmniVaultAgent-update-${Date.now()}.cmd`);
  fs.writeFileSync(temporaryPath, data, { mode: 0o755 });

  const script = [
    '@echo off',
    'setlocal',
    `set "TARGET=%~dp0${targetName}"`,
    `set "SOURCE=%~dp0${temporaryName}"`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue" >nul 2>&1`,
    'set /a tries=0',
    ':retry',
    'move /y "%SOURCE%" "%TARGET%" >nul 2>&1',
    'if not errorlevel 1 goto done',
    'set /a tries+=1',
    'if %tries% GEQ 15 goto failed',
    'timeout /t 1 /nobreak >nul',
    'goto retry',
    ':done',
    'start "" "%TARGET%"',
    'del "%~f0" >nul 2>&1',
    'exit /b 0',
    ':failed',
    `echo Agent update failed: could not replace "%TARGET%". > "%~dp0${targetName}.update-error.txt"`,
    'exit /b 1',
  ].join('\r\n');
  fs.writeFileSync(scriptPath, `${script}\r\n`, 'utf8');

  try {
    const child = spawn('cmd.exe', ['/d', '/c', scriptPath], {
      cwd: RUNTIME_DIR,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    try { fs.rmSync(scriptPath, { force: true }); } catch {}
    throw new Error(`Could not start the agent updater: ${error.message}`);
  }

  log(`Installed agent ${manifest.version}. Restarting...`);
  setTimeout(() => process.exit(0), 600);
  return true;
}

async function maybeUpdateExe(config, reason) {
  const manifest = await fetchExeManifest(config.panelUrl);
  if (!manifest) {
    log('Auto-update is not configured on this panel.');
    return;
  }
  if (!verifyExeManifest(manifest)) {
    log('Update rejected: the panel signature is invalid.');
    return;
  }
  if (!isNewerVersion(manifest.version, VERSION)) {
    if (reason === 'manual') log(`Agent ${VERSION} is up to date.`);
    return;
  }
  if (!Number.isInteger(Number(manifest.size)) || Number(manifest.size) < 1 || Number(manifest.size) > 250 * 1024 * 1024) {
    throw new Error('The update manifest has an invalid size.');
  }
  log(`Signed update ${manifest.version} available; downloading...`);
  const data = await downloadAgentExe(config.panelUrl);
  if (data.length !== Number(manifest.size)) {
    throw new Error('The downloaded agent size does not match the signed manifest.');
  }
  const digest = crypto.createHash('sha256').update(data).digest('hex');
  if (digest !== String(manifest.sha256)) {
    throw new Error('The downloaded agent hash does not match the signed manifest.');
  }
  applyExeUpdate(manifest, data);
}

function pruneBackups() {
  try {
    const backups = fs.readdirSync(RUNTIME_DIR)
      .filter((name) => name.startsWith('.backup-'))
      .map((name) => path.join(RUNTIME_DIR, name))
      .sort();
    while (backups.length > 2) {
      fs.rmSync(backups.shift(), { recursive: true, force: true });
    }
  } catch {}
}

function applyUpdate(pkg) {
  if (!verifyUpdatePackage(pkg)) throw new Error('The update signature is not valid.');
  if (!isNewerVersion(pkg.version, VERSION)) return false;

  const stagingDir = path.join(__dirname, `.update-${Date.now()}`);
  const backupDir = path.join(__dirname, `.backup-${VERSION}-${Date.now()}`);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    for (const file of pkg.files) {
      const name = String(file.name || '');
      if (!UPDATE_FILES.has(name)) throw new Error(`Update contains an unapproved file: ${name}`);
      const data = Buffer.from(String(file.data || ''), 'base64');
      const digest = crypto.createHash('sha256').update(data).digest('hex');
      if (digest !== String(file.sha256 || '')) throw new Error(`Update hash mismatch for ${name}.`);
      fs.writeFileSync(path.join(stagingDir, name), data);
    }

    const stagedPackage = JSON.parse(fs.readFileSync(path.join(stagingDir, 'package.json'), 'utf8'));
    if (JSON.stringify(stagedPackage.dependencies || {}) !== JSON.stringify(packageInfo.dependencies || {})) {
      throw new Error('This update changes dependencies. Reinstall the agent with the new package.');
    }

    fs.mkdirSync(backupDir, { recursive: true });
    for (const name of UPDATE_FILES) {
      if (fs.existsSync(path.join(__dirname, name))) {
        fs.copyFileSync(path.join(__dirname, name), path.join(backupDir, name));
      }
    }

    try {
      for (const name of UPDATE_FILES) {
        const source = path.join(stagingDir, name);
        if (fs.existsSync(source)) fs.copyFileSync(source, path.join(__dirname, name));
      }
    } catch (error) {
      for (const name of UPDATE_FILES) {
        const backup = path.join(backupDir, name);
        if (fs.existsSync(backup)) fs.copyFileSync(backup, path.join(__dirname, name));
      }
      throw error;
    }

    pruneBackups();
    if (process.env.OMNIVAULT_AGENT_SUPERVISED === '1') {
      fs.writeFileSync(path.join(__dirname, '.update-restart'), String(pkg.version));
      log(`Installed agent update ${pkg.version}. Restarting under start-agent.ps1...`);
      setTimeout(() => process.exit(42), 400);
      return true;
    }
    log(`Installed agent update ${pkg.version}. Restarting...`);
    const child = spawn(process.execPath, process.argv.slice(1), {
      cwd: __dirname,
      stdio: 'inherit',
      windowsHide: false,
      env: process.env,
    });
    child.unref();
    setTimeout(() => process.exit(0), 500);
    return true;
  } finally {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
  }
}

async function maybeUpdate(config, reason) {
  if (updateCheckInFlight || !updatePublicKey()) return;
  updateCheckInFlight = true;
  try {
    if (IS_PACKAGED) {
      await maybeUpdateExe(config, reason);
      return;
    }
    const pkg = await fetchUpdatePackage(config.panelUrl);
    if (!pkg) {
      log('Auto-update is not configured on this panel.');
      return;
    }
    if (!verifyUpdatePackage(pkg)) {
      log('Update rejected: the panel signature is invalid.');
      return;
    }
    if (!isNewerVersion(pkg.version, VERSION)) {
      if (reason === 'manual') log(`Agent ${VERSION} is up to date.`);
      return;
    }
    log(`Signed update ${pkg.version} available; installing...`);
    applyUpdate(pkg);
  } catch (error) {
    log(`Update check failed: ${error.message}`);
  } finally {
    updateCheckInFlight = false;
  }
}

// ---------- RCON actions ----------
async function executeCommand(config, action, payload = {}) {
  const rc = rcon.make(config.rcon, { allowPrivate: true });
  if (action === 'status') return rc.status();
  if (action === 'players') return rc.players();
  if (action === 'maps') return rc.maps();
  if (action === 'modes') return rc.modes();
  if (action === 'endround') return rc.endround();
  if (action === 'endgame') return rc.endgame();

  if (action === 'say') {
    const message = text(payload.message, 500);
    if (!message) throw new Error('Message is required.');
    return rc.say(message);
  }
  if (action === 'kick') {
    const player = text(payload.player, 80);
    if (!player) throw new Error('Player is required.');
    return rc.kick(player, text(payload.reason, 160));
  }
  if (action === 'ban') {
    const player = text(payload.player, 80);
    if (!player) throw new Error('Player is required.');
    const allowedTimes = new Set(['none', '30m', '1h', '12h', '1d', '7d', '2w']);
    const time = allowedTimes.has(String(payload.time || 'none')) ? String(payload.time || 'none') : 'none';
    return rc.ban(player, time, text(payload.reason, 160));
  }
  if (action === 'unban') {
    const target = text(payload.target || payload.player, 160);
    if (!target) throw new Error('Player or address is required.');
    return rc.unban(target);
  }
  if (action === 'map' || action === 'load') {
    const map = text(payload.map, 160);
    if (!map) throw new Error('Map is required.');
    const mode = text(payload.mode, 160);
    if (action === 'map' && !mode) return rc.map(map);
    if (action === 'map') return rc.map(map, mode);
    return rc.load(map, mode);
  }
  if (action === 'nextmap') {
    return rc.nextmap(text(payload.map, 160), text(payload.mode, 160));
  }
  throw new Error('Unsupported action.');
}

let updateCheckInFlight = false;

function pruneExeUpdateFiles() {
  if (!IS_PACKAGED) return;
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(RUNTIME_DIR)) {
      if (!/^\.OmniVaultAgent-(update-.*\.cmd|[0-9].*\.exe)$/.test(name)) continue;
      const fullPath = path.join(RUNTIME_DIR, name);
      try {
        if (fs.statSync(fullPath).mtimeMs < cutoff) fs.rmSync(fullPath, { force: true });
      } catch {}
    }
  } catch {}
}

async function main() {
  if (showHelp) {
    usage();
    return;
  }
  if (showVersion) {
    console.log(VERSION);
    return;
  }

  const hasConfig = fs.existsSync(configPath);
  if (testOnly && !hasConfig && !setupRequested) {
    throw new Error(`No agent configuration was found at ${configPath}. Run setup first.`);
  }

  pruneExeUpdateFiles();
  let config;
  if (forceSetup || setupRequested || !hasConfig) {
    config = await runSetup();
  } else {
    config = loadConfig();
  }

  if (testOnly) {
    try {
      const result = await rcon.make(config.rcon, { allowPrivate: true }).status();
      const firstLine = String(result || '').split(/\r?\n/)[0] || 'RCON responded.';
      console.log(`RCON test passed: ${firstLine}`);
      console.log(`Server: ${config.serverId}`);
      console.log(`Panel: ${config.panelUrl}`);
      console.log(`Agent: ${VERSION}`);
    } catch (error) {
      console.error(`RCON test failed: ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }

  let socket = null;
  let stopped = false;
  let fatal = false;
  let reconnectTimer = null;
  let updateTimer = null;
  let attempt = 0;

  function scheduleReconnect() {
    if (stopped || fatal) return;
    const delay = Math.min(60000, 2000 * Math.pow(2, Math.min(attempt, 5))) + Math.floor(Math.random() * 500);
    attempt += 1;
    log(`Reconnecting in ${Math.round(delay / 1000)} seconds...`);
    reconnectTimer = setTimeout(connect, delay);
  }

  function stop(exitCode = 0) {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (updateTimer) clearInterval(updateTimer);
    if (socket && socket.readyState === WebSocket.OPEN) {
      try { socket.close(1000, 'Agent stopping'); } catch {}
    }
    setTimeout(() => process.exit(exitCode), 250);
  }

  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify(message)); } catch {}
  }

  function connect() {
    if (stopped) return;
    const url = websocketUrl(config.panelUrl);
    log(`Connecting to ${config.panelUrl}... (agent ${VERSION})`);
    socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${config.agentToken}` },
      handshakeTimeout: 15000,
    });

    socket.on('open', () => {
      attempt = 0;
      log('Connected to the panel.');
      send({
        type: 'hello',
        agentName: config.agentName || os.hostname(),
        agentVersion: VERSION,
      });
      setTimeout(() => maybeUpdate(config, 'connect'), 1500);
    });

    socket.on('message', async (data) => {
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (!message || typeof message !== 'object') return;

      if (message.type === 'welcome') {
        log(`Panel registered server "${message.serverName || config.serverId}".`);
        return;
      }
      if (message.type === 'update-available') {
        maybeUpdate(config, 'push');
        return;
      }
      if (message.type !== 'command' || !message.id) return;

      log(`Command received: ${message.action}`);
      try {
        const result = await executeCommand(config, String(message.action || ''), message.payload || {});
        const output = result == null ? '' : String(result);
        send({
          type: 'result',
          id: message.id,
          ok: true,
          result: output.length > MAX_RESULT_CHARS
            ? `${output.slice(0, MAX_RESULT_CHARS)}\n[output truncated by the agent]`
            : output,
        });
      } catch (error) {
        send({ type: 'result', id: message.id, ok: false, error: String(error.message || error) });
      }
    });

    socket.on('close', (code, reasonBuffer) => {
      socket = null;
      const reason = reasonBuffer ? reasonBuffer.toString() : '';
      log(`Disconnected (${code}${reason ? `: ${reason}` : ''}).`);
      if (code === 4001) {
        if (/Replaced by a new agent connection/i.test(reason)) {
          log('Replaced by the newly connected agent.');
          stop(0);
          return;
        }
        fatal = true;
        log('This pairing was revoked. Run OmniVaultAgent.exe --setup again with a new pairing code.');
        stop(1);
        return;
      }
      if (fatal) {
        log('The panel rejected the agent token. Run OmniVaultAgent.exe --setup again with a new pairing code.');
        stop(1);
        return;
      }
      scheduleReconnect();
    });

    socket.on('error', (error) => {
      log(`Connection error: ${error.message}`);
      if (/401|403/i.test(error.message)) fatal = true;
    });
  }

  updateTimer = setInterval(() => maybeUpdate(config, 'periodic'), UPDATE_CHECK_INTERVAL_MS);
  if (updateTimer.unref) updateTimer.unref();
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  connect();
}

main().catch(async (error) => {
  console.error(`Agent error: ${error.message}`);
  process.exitCode = 1;
  if (process.stdin.isTTY) {
    const prompt = createPrompt();
    try {
      await prompt.ask('\nPress Enter to close...');
    } finally {
      prompt.close();
    }
  }
});
