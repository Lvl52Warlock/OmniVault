'use strict';

const electronModule = require('electron');
const electronApp = (typeof electronModule === 'object' && electronModule !== null && electronModule.app) ? electronModule.app : null;
const BrowserWindow = (typeof electronModule === 'object' && electronModule !== null && typeof electronModule.BrowserWindow === 'function') ? electronModule.BrowserWindow : null;
const electronDialog = (typeof electronModule === 'object' && electronModule !== null && electronModule.dialog) ? electronModule.dialog : null;
const ipcMain = (typeof electronModule === 'object' && electronModule !== null && electronModule.ipcMain) ? electronModule.ipcMain : null;
const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const rcon = require('./rcon');

const IS_ELECTRON = !!(electronApp && BrowserWindow);
const PANEL_ASSET_VERSION = (() => {
  try {
    const pkg = require('./package.json');
    if (!IS_ELECTRON || !electronApp.isPackaged) return String(pkg.version || '1.0.0');
    return String(electronApp.getVersion() || pkg.version || '1.0.0');
  } catch {
    return '1.0.0';
  }
})();
const LOCAL_MODE = process.argv.includes('--local') || process.env.PANEL_MODE === 'local';
const PUBLIC_MODE = process.env.PANEL_PUBLIC_MODE === '1';
const PORT = Number(process.env.PANEL_PORT) || 49222;
const BIND_HOST = process.env.PANEL_BIND || '127.0.0.1';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AGENT_PAIRING_TTL_MS = 15 * 60 * 1000;
const TEAM_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const INSTANCE_ID_RE = /^inst_[a-f0-9]{16}$/;
const AGENT_COMMAND_TIMEOUT_MS = 25000;
const AGENT_MAX_RESULT_CHARS = 256 * 1024;
const MAX_FILE_UPLOAD_BYTES = 32 * 1024 * 1024;
const FILE_READ_CHUNK_BYTES = 128 * 1024;
const FILE_UPLOAD_CHUNK_BYTES = 256 * 1024;
const LEGACY_TEAM_ROLES = new Set(['moderator', 'developer']);
const BUILTIN_ROLE_DEFINITIONS = [
  {
    key: 'moderator',
    name: 'Moderator',
    permissions: ['view', 'kick', 'endRound', 'endGame'],
  },
  {
    key: 'developer',
    name: 'Developer',
    permissions: ['view', 'catalog', 'map', 'filesRead', 'filesWrite', 'instancesView', 'instancesCreate', 'instancesControl'],
  },
];
const PERMISSION_CATALOG = [
  { key: 'view', label: 'View server', description: 'See the server status, map, and player list.' },
  { key: 'kick', label: 'Kick players', description: 'Remove a player from the current game.' },
  { key: 'endRound', label: 'End round', description: 'End the current round.' },
  { key: 'endGame', label: 'End game', description: 'End the current game.' },
  { key: 'say', label: 'Broadcast messages', description: 'Send a message to everyone on the server.' },
  { key: 'ban', label: 'Ban players', description: 'Ban a player by name, ID, or address.' },
  { key: 'unban', label: 'Unban players', description: 'Lift a ban by name, ID, or address.' },
  { key: 'map', label: 'Change maps', description: 'Load a map or set the next map and mode.' },
  { key: 'catalog', label: 'Browse maps and modes', description: 'Read the available map and game-type names.' },
  { key: 'filesRead', label: 'Read server files', description: 'Browse and download allowed server files.' },
  { key: 'filesWrite', label: 'Change server files', description: 'Upload, overwrite, rename, and create folders.' },
  { key: 'filesDelete', label: 'Delete server files', description: 'Permanently delete files. Owner only.', ownerOnly: true },
  { key: 'instancesView', label: 'View server instances', description: 'See Reclaimer instances managed on the agent PC.' },
  { key: 'instancesCreate', label: 'Create server instances', description: 'Create Reclaimer instances and playlists. Owner and Developer by default.' },
  { key: 'instancesControl', label: 'Start and stop instances', description: 'Start, stop, and restart Reclaimer instances.' },
  { key: 'instancesDelete', label: 'Delete server instances', description: 'Remove a managed instance and its files. Owner only.', ownerOnly: true },
];
const PERMISSION_KEYS = PERMISSION_CATALOG.map((item) => item.key);
const OWNER_ONLY_PERMISSIONS = new Set(PERMISSION_CATALOG.filter((item) => item.ownerOnly).map((item) => item.key));
const GRANTABLE_PERMISSIONS = new Set(PERMISSION_KEYS.filter((key) => !OWNER_ONLY_PERMISSIONS.has(key)));
const FILE_EXTENSIONS = new Set([
  '.map', '.gametype', '.gt', '.playlist', '.rotation', '.pdl',
  '.ini', '.json', '.txt', '.xml', '.cfg', '.yaml', '.yml', '.toml',
  '.csv', '.md', '.zip', '.pak', '.umap', '.uasset',
]);

function desktopDataDir() {
  if (IS_ELECTRON && electronApp && typeof electronApp.getPath === 'function') {
    try { return electronApp.getPath('userData'); } catch {}
  }
  return __dirname;
}
const DATA_DIR = String(process.env.PANEL_DATA_DIR || '').trim() || desktopDataDir();
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SERVERS_FILE = path.join(DATA_DIR, 'servers.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const PANEL_URL_FILE = path.join(DATA_DIR, 'panel-url.txt');
const DEFAULT_PANEL_URL_FILE = path.join(__dirname, 'default-panel-url.txt');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');
const AGENT_DIR = path.join(__dirname, 'agent');
const AGENT_UPDATE_KEY_FILE = path.join(__dirname, '..', 'agent-update-private.pem');
const AGENT_EXE_FILE = path.join(__dirname, 'agent-dist', 'OmniVaultAgent.exe');
const DESKTOP_INSTALLER_FILE = path.join(__dirname, 'desktop-dist', 'OmniVault-Setup.exe');
const AGENT_UPDATE_PACKAGE_FILES = [
  'agent.js', 'rcon.js', 'instances.js', 'package.json', 'update-public.pem',
  'start-agent.ps1', 'start-agent.cmd', 'README.txt',
];
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

const LEGACY_OWNER_USERNAME = 'Warlock';
const LEGACY_OWNER_ID = 'user_4aadeb472011e8ac';

let mainWindow = null;
let desktopIpcReady = false;
let desktopUpdater = null;
let rateBuckets = new Map();
const liveAgents = new Map(); // serverId -> live agent socket and pending commands

// ---------- small storage helpers ----------
function loadJson(file, fallback) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) return fallback;
    const parsed = JSON.parse(text);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2));
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  }
}

function loadUsers() {
  const users = loadJson(USERS_FILE, []);
  return Array.isArray(users) ? users : [];
}
function saveUsers(users) {
  writeJsonAtomic(USERS_FILE, users);
}
function loadServers() {
  const servers = loadJson(SERVERS_FILE, []);
  return Array.isArray(servers) ? servers : [];
}
function saveServers(servers) {
  writeJsonAtomic(SERVERS_FILE, servers);
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function newServerId() {
  return 'srv_' + crypto.randomBytes(8).toString('hex');
}
function readAgentVersion() {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, 'package.json'), 'utf8'));
    return String(info.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}
function buildAgentUpdatePackage() {
  let key;
  try {
    key = fs.readFileSync(AGENT_UPDATE_KEY_FILE, 'utf8');
  } catch {
    return null;
  }
  const version = readAgentVersion();
  const publishedAt = new Date().toISOString();
  const files = AGENT_UPDATE_PACKAGE_FILES.map((name) => {
    const data = fs.readFileSync(path.join(AGENT_DIR, name));
    return { name, sha256: hashBuffer(data), data: data.toString('base64') };
  });
  const canonical = JSON.stringify({
    version,
    publishedAt,
    files: files.map(({ name, sha256, data }) => ({ name, sha256, data })),
  });
  const signature = crypto.sign(null, Buffer.from(canonical), key).toString('base64');
  return { version, publishedAt, files, signature };
}
function buildAgentExeManifest() {
  let key;
  let data;
  try {
    key = fs.readFileSync(AGENT_UPDATE_KEY_FILE, 'utf8');
    data = fs.readFileSync(AGENT_EXE_FILE);
  } catch {
    return null;
  }
  if (!data.length) return null;
  const version = readAgentVersion();
  const publishedAt = new Date().toISOString();
  const sha256 = hashBuffer(data);
  const size = data.length;
  const canonical = JSON.stringify({ version, publishedAt, sha256, size });
  const signature = crypto.sign(null, Buffer.from(canonical), key).toString('base64');
  return { version, publishedAt, sha256, size, signature };
}
function audit(event) {
  try {
    if (fs.existsSync(AUDIT_FILE) && fs.statSync(AUDIT_FILE).size > 5 * 1024 * 1024) {
      try { fs.rmSync(AUDIT_FILE + '.1', { force: true }); } catch {}
      fs.renameSync(AUDIT_FILE, AUDIT_FILE + '.1');
    }
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
  } catch {}
}
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Administrator access is required.' });
  next();
}

// ---------- password hashing (scrypt, with legacy SHA-256 migration) ----------
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return { ok: false, needsUpgrade: false };
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 6) return { ok: false, needsUpgrade: false };
    const [, n, r, p, saltHex, digestHex] = parts;
    try {
      const derived = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN, {
        N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
      });
      const expected = Buffer.from(digestHex, 'hex');
      const ok = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
      return { ok, needsUpgrade: false };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  const legacy = crypto.createHash('sha256').update(String(password)).digest('hex');
  const expected = Buffer.from(stored, 'utf8');
  const actual = Buffer.from(legacy, 'utf8');
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  return { ok, needsUpgrade: ok };
}

// ---------- sessions ----------
const sessions = new Map(); // token hash -> { userId, username, isAdmin, createdAt, expiresAt }

function loadSessions() {
  const now = Date.now();
  const userIds = new Set(loadUsers().map((user) => user.userId));
  for (const entry of loadJson(SESSIONS_FILE, [])) {
    if (!entry || !entry.tokenHash || !entry.userId || !entry.expiresAt) continue;
    if (Number(entry.expiresAt) <= now) continue;
    if (!userIds.has(entry.userId)) continue;
    sessions.set(entry.tokenHash, entry);
  }
}
function persistSessions() {
  try {
    writeJsonAtomic(SESSIONS_FILE, [...sessions.values()]);
  } catch (error) {
    console.error('Could not save sessions:', error.message);
  }
}
function createSession(user) {
  const now = Date.now();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  for (const [hash, session] of sessions) {
    if (Number(session.expiresAt) <= now) sessions.delete(hash);
  }
  sessions.set(tokenHash, {
    tokenHash,
    userId: user.userId,
    username: user.username,
    isAdmin: !!user.isAdmin,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  const mine = [...sessions.entries()]
    .filter(([, session]) => session.userId === user.userId)
    .sort((a, b) => Number(a[1].createdAt) - Number(b[1].createdAt));
  while (mine.length > 20) {
    const [hash] = mine.shift();
    sessions.delete(hash);
  }
  persistSessions();
  return token;
}
function destroySession(token) {
  if (!token) return;
  if (sessions.delete(hashToken(token))) persistSessions();
}

// ---------- rate limiting ----------
function clientIp(req) {
  return String(req.ip || (req.socket && req.socket.remoteAddress) || 'unknown').replace(/^::ffff:/, '');
}
function checkRate(key, limit, windowMs) {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs);
  if (bucket.length >= limit) {
    rateBuckets.set(key, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return true;
}
function resetRate(key) {
  rateBuckets.delete(key);
}
function pruneRateBuckets() {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    const live = bucket.filter((time) => now - time < 60 * 60 * 1000);
    if (live.length) rateBuckets.set(key, live);
    else rateBuckets.delete(key);
  }
}
const ratePruner = setInterval(pruneRateBuckets, 10 * 60 * 1000);
if (ratePruner.unref) ratePruner.unref();

// ---------- migration / ownership ----------
function migrateData() {
  const users = loadUsers();
  const owner = users.find((user) => String(user.username || '').toLowerCase() === LEGACY_OWNER_USERNAME.toLowerCase());
  let usersChanged = false;
  if (owner && !owner.isAdmin) {
    owner.isAdmin = true;
    usersChanged = true;
  }
  if (usersChanged) saveUsers(users);

  const ownerId = owner ? owner.userId : LEGACY_OWNER_ID;
  const servers = loadServers();
  const seenNames = new Set();
  const seenIds = new Set();
  const migrated = [];
  let serversChanged = false;
  for (const entry of servers) {
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.id || seenIds.has(entry.id)) {
      entry.id = newServerId();
      serversChanged = true;
    }
    seenIds.add(entry.id);
    if (!entry.ownerId || entry.ownerId === 'local') {
      entry.ownerId = ownerId;
      serversChanged = true;
    }
    if (entry.connectionMode !== 'agent' && entry.connectionMode !== 'direct') {
      entry.connectionMode = 'direct';
      serversChanged = true;
    }
    if (!Array.isArray(entry.members)) {
      entry.members = [];
      serversChanged = true;
    }
    if (ensureServerRoles(entry)) serversChanged = true;
    let name = String(entry.name || entry.label || '').trim() || `Server ${migrated.length + 1}`;
    const base = name;
    let suffix = 2;
    while (seenNames.has(`${entry.ownerId}\u0000${name}`)) {
      name = `${base} (${suffix})`;
      suffix += 1;
    }
    seenNames.add(`${entry.ownerId}\u0000${name}`);
    if (entry.name !== name || entry.label !== undefined) {
      entry.name = name;
      delete entry.label;
      serversChanged = true;
    }
    migrated.push(entry);
  }
  if (serversChanged) saveServers(migrated);
}

// ---------- model helpers ----------
function normalizeUsername(value) {
  return String(value || '').trim();
}
function publicUser(user) {
  return { userId: user.userId, username: user.username, isAdmin: !!user.isAdmin };
}
function newRoleId() {
  return 'role_' + crypto.randomBytes(9).toString('hex');
}
function defaultServerRoles() {
  const createdAt = new Date().toISOString();
  return BUILTIN_ROLE_DEFINITIONS.map((definition) => ({
    id: `role_${definition.key}`,
    key: definition.key,
    name: definition.name,
    builtin: true,
    permissions: definition.permissions.slice(),
    createdAt,
  }));
}
function normalizeRoleName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
}
function normalizeCustomRolePermissions(value) {
  const requested = new Set(Array.isArray(value) ? value.map((item) => String(item || '')) : []);
  requested.add('view');
  if (requested.has('instancesCreate') || requested.has('instancesControl')) requested.add('instancesView');
  if (requested.has('filesWrite')) requested.add('filesRead');
  if (requested.has('map')) requested.add('catalog');
  return PERMISSION_KEYS.filter((key) => requested.has(key) && GRANTABLE_PERMISSIONS.has(key));
}
function findServerRole(entry, roleId) {
  return (Array.isArray(entry && entry.roles) ? entry.roles : []).find((role) => role && role.id === roleId) || null;
}
function publicRoles(entry) {
  return (Array.isArray(entry && entry.roles) ? entry.roles : []).map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    builtin: !!role.builtin,
    permissions: Array.isArray(role.permissions) ? role.permissions.slice() : [],
  }));
}
function ensureServerRoles(entry) {
  const before = JSON.stringify({
    roles: entry.roles || null,
    members: entry.members || null,
    invite: entry.memberInvite || null,
  });
  const existing = Array.isArray(entry.roles) ? entry.roles : [];
  const roles = [];
  const usedIds = new Set();
  const usedNames = new Set();
  const createdAt = new Date().toISOString();

  for (const definition of BUILTIN_ROLE_DEFINITIONS) {
    const stored = existing.find((role) => role && (role.key === definition.key || role.id === `role_${definition.key}`));
    roles.push({
      id: `role_${definition.key}`,
      key: definition.key,
      name: definition.name,
      builtin: true,
      permissions: definition.permissions.slice(),
      createdAt: stored && stored.createdAt ? stored.createdAt : createdAt,
    });
    usedIds.add(`role_${definition.key}`);
    usedNames.add(definition.name.toLowerCase());
  }

  let customCount = 0;
  for (const stored of existing) {
    if (!stored || typeof stored !== 'object') continue;
    if (BUILTIN_ROLE_DEFINITIONS.some((definition) => (
      stored.key === definition.key || stored.id === `role_${definition.key}`
    ))) continue;
    if (customCount >= 20) break;
    let name = normalizeRoleName(stored.name);
    if (!name) continue;
    const baseName = name;
    let suffix = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${baseName.slice(0, 27)} ${suffix}`;
      suffix += 1;
    }
    let id = String(stored.id || '');
    if (!/^role_[a-f0-9]{18}$/.test(id) || usedIds.has(id)) id = newRoleId();
    roles.push({
      id,
      key: 'custom',
      name,
      builtin: false,
      permissions: normalizeCustomRolePermissions(stored.permissions),
      createdAt: stored.createdAt || createdAt,
    });
    usedIds.add(id);
    usedNames.add(name.toLowerCase());
    customCount += 1;
  }

  entry.roles = roles;
  entry.members = (Array.isArray(entry.members) ? entry.members : []).map((member) => {
    if (!member || typeof member.userId !== 'string' || member.userId === entry.ownerId) return null;
    let roleId = String(member.roleId || '');
    if (!roleId && LEGACY_TEAM_ROLES.has(member.role)) roleId = `role_${member.role}`;
    const role = findServerRole(entry, roleId);
    if (!role) return null;
    return {
      userId: member.userId,
      username: String(member.username || 'Team member').slice(0, 32),
      roleId: role.id,
      role: role.key,
      addedAt: member.addedAt || null,
      addedBy: member.addedBy || null,
    };
  }).filter(Boolean);

  if (entry.memberInvite) {
    const invite = entry.memberInvite;
    let roleId = String(invite.roleId || '');
    if (!roleId && LEGACY_TEAM_ROLES.has(invite.role)) roleId = `role_${invite.role}`;
    const role = findServerRole(entry, roleId);
    if (!role || !invite.codeHash || Number(invite.expiresAt) <= Date.now()) {
      delete entry.memberInvite;
    } else {
      entry.memberInvite = {
        codeHash: invite.codeHash,
        roleId: role.id,
        role: role.key,
        createdBy: invite.createdBy || null,
        createdAt: invite.createdAt || null,
        expiresAt: Number(invite.expiresAt),
      };
    }
  }

  return before !== JSON.stringify({
    roles: entry.roles || null,
    members: entry.members || null,
    invite: entry.memberInvite || null,
  });
}
function permissionsForAccess(access) {
  const allowed = access && access.permissions instanceof Set ? access.permissions : new Set();
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, allowed.has(key)]));
}
function ownerAccess() {
  return {
    id: 'owner',
    key: 'owner',
    name: 'Owner',
    owner: true,
    permissions: new Set(PERMISSION_KEYS),
  };
}
function accessFor(entry, user) {
  if (!entry || !user) return null;
  if (entry.ownerId === user.userId) return ownerAccess();
  const member = (Array.isArray(entry.members) ? entry.members : [])
    .find((item) => item && item.userId === user.userId);
  if (!member) return null;
  let role = findServerRole(entry, member.roleId);
  if (!role && LEGACY_TEAM_ROLES.has(member.role)) role = findServerRole(entry, `role_${member.role}`);
  if (!role) return null;
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    owner: false,
    permissions: new Set(Array.isArray(role.permissions) ? role.permissions : []),
  };
}
function serverRole(entry, user) {
  const access = accessFor(entry, user);
  return access ? access.key : null;
}
function can(entry, user, permission) {
  const access = accessFor(entry, user);
  return !!(access && access.permissions.has(permission));
}
function publicMembers(entry) {
  return (Array.isArray(entry.members) ? entry.members : [])
    .map((member) => {
      if (!member || !member.userId) return null;
      const role = findServerRole(entry, member.roleId);
      if (!role) return null;
      return {
        userId: member.userId,
        username: String(member.username || 'Team member'),
        roleId: role.id,
        role: role.key,
        roleName: role.name,
        addedAt: member.addedAt || null,
      };
    })
    .filter(Boolean);
}
function publicServer(entry, viewer) {
  const live = liveAgents.get(entry.id);
  const mode = entry.connectionMode === 'agent' ? 'agent' : 'direct';
  const access = viewer ? accessFor(entry, viewer) : null;
  const owner = loadUsers().find((user) => user.userId === entry.ownerId);
  const invite = entry.memberInvite;
  const inviteRole = invite ? findServerRole(entry, invite.roleId) : null;
  return {
    id: entry.id,
    name: entry.name || entry.label || '',
    host: entry.host || '',
    port: Number(entry.port) || 0,
    rconPort: Number(entry.rconPort) || 0,
    createdAt: entry.createdAt || null,
    connectionMode: mode,
    role: access ? access.key : null,
    roleId: access ? access.id : null,
    roleName: access ? access.name : null,
    permissions: permissionsForAccess(access),
    ownerName: owner ? owner.username : null,
    members: access && access.owner ? publicMembers(entry) : undefined,
    roles: access && access.owner ? publicRoles(entry) : undefined,
    memberInvite: access && access.owner && invite && inviteRole && Number(invite.expiresAt) > Date.now()
      ? {
        roleId: inviteRole.id,
        role: inviteRole.key,
        roleName: inviteRole.name,
        expiresAt: new Date(Number(invite.expiresAt)).toISOString(),
      }
      : null,
    agentOnline: !!live,
    agentPaired: !!(entry.agentTokenHash),
    agentName: live ? live.agentName : (entry.agentName || null),
    agentVersion: live ? live.agentVersion : (entry.agentVersion || null),
    filesEnabled: live ? !!live.filesEnabled : !!entry.agentFilesEnabled,
    instancesEnabled: live ? !!live.instancesEnabled : !!entry.agentInstancesEnabled,
    agentLastSeen: live ? new Date(live.lastSeen).toISOString() : (entry.agentLastSeen || null),
    pairingPending: mode === 'agent' && !!(entry.agentPairingCodeHash && Number(entry.agentPairingExpiresAt) > Date.now()),
    pairingExpiresAt: mode === 'agent' && entry.agentPairingExpiresAt
      ? new Date(Number(entry.agentPairingExpiresAt)).toISOString()
      : null,
  };
}

function normalizePairingCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-F0-9]/g, '');
}

function hashPairingCode(value) {
  return hashToken(normalizePairingCode(value));
}

function newPairingCode() {
  const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function setAgentPairing(entry) {
  const code = newPairingCode();
  entry.connectionMode = 'agent';
  entry.agentPairingCodeHash = hashPairingCode(code);
  entry.agentPairingExpiresAt = Date.now() + AGENT_PAIRING_TTL_MS;
  delete entry.agentTokenHash;
  delete entry.agentId;
  delete entry.agentPairedAt;
  delete entry.agentLastSeen;
  return code;
}

function agentEntryFromToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  return loadServers().find((entry) => entry.connectionMode === 'agent' && entry.agentTokenHash === tokenHash) || null;
}

function updateAgentMeta(serverId, patch) {
  const servers = loadServers();
  const index = servers.findIndex((entry) => entry.id === serverId);
  if (index === -1) return;
  Object.assign(servers[index], patch);
  saveServers(servers);
}

function rejectAgentPending(live, message) {
  for (const pending of live.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }
  live.pending.clear();
}

function closeLiveAgent(serverId, reason) {
  const live = liveAgents.get(serverId);
  if (!live) return;
  liveAgents.delete(serverId);
  rejectAgentPending(live, 'Agent disconnected.');
  try { live.socket.close(4001, reason || 'Agent disconnected'); } catch {}
}

function sendAgentCommand(entry, action, payload = {}, timeoutMs = AGENT_COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const live = liveAgents.get(entry.id);
    if (!live || live.socket.readyState !== WebSocket.OPEN) {
      reject(new Error('Agent is offline. Start the OmniVault agent on the game server.'));
      return;
    }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      live.pending.delete(id);
      reject(new Error('The agent did not respond in time.'));
    }, timeoutMs);
    live.pending.set(id, { resolve, reject, timer });
    try {
      live.socket.send(JSON.stringify({ type: 'command', id, action, payload }));
    } catch {
      clearTimeout(timer);
      live.pending.delete(id);
      reject(new Error('Could not send the command to the agent.'));
    }
  });
}

function capAgentResult(value) {
  const text = String(value == null ? '' : value);
  return text.length > AGENT_MAX_RESULT_CHARS
    ? `${text.slice(0, AGENT_MAX_RESULT_CHARS)}\n[output truncated by the panel]`
    : text;
}

const ACTION_PERMISSIONS = {
  status: 'view',
  players: 'view',
  say: 'say',
  kick: 'kick',
  ban: 'ban',
  unban: 'unban',
  map: 'map',
  load: 'map',
  nextmap: 'map',
  endround: 'endRound',
  endgame: 'endGame',
  maps: 'catalog',
  modes: 'catalog',
};
function actionPermission(action) {
  return ACTION_PERMISSIONS[String(action || '')] || '';
}
function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
function normalizeRelativeFilePath(value, allowEmpty = true) {
  const raw = String(value == null ? '' : value).replace(/\\/g, '/').trim();
  if (!raw) {
    if (allowEmpty) return '';
    throw badRequest('A file path is required.');
  }
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.includes('\u0000')) {
    throw badRequest('Use a path relative to the configured server files folder.');
  }
  const parts = raw.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) {
    throw badRequest('The file path cannot leave the server files folder.');
  }
  if (!parts.length && !allowEmpty) throw badRequest('A file path is required.');
  return parts.join('/');
}
function assertAllowedFileExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!FILE_EXTENSIONS.has(extension)) {
    throw badRequest('That file type is not allowed in the server files manager.');
  }
}
async function sendAgentJson(entry, action, payload = {}, timeoutMs = AGENT_COMMAND_TIMEOUT_MS) {
  const raw = await sendAgentCommand(entry, action, payload, timeoutMs);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('The agent returned an invalid file response.');
  }
}
function normalizeAgentAction(body) {
  const action = String((body && body.action) || '');
  const payload = {};
  const instanceId = String((body && body.instanceId) || '').trim();
  if (instanceId && !INSTANCE_ID_RE.test(instanceId)) return { error: 'Choose a valid managed server instance.' };
  if (instanceId) payload.instanceId = instanceId;
  if (action === 'status' || action === 'players' || action === 'endround' || action === 'endgame') {
    return { action, payload };
  }
  if (action === 'say') {
    payload.message = String((body && body.message) || '').trim().slice(0, 500);
    if (!payload.message) return { error: 'Message is required.' };
    return { action, payload };
  }
  if (action === 'kick') {
    payload.player = String((body && body.player) || '').trim();
    payload.reason = String((body && body.reason) || '').trim().slice(0, 160);
    if (!payload.player) return { error: 'Player is required.' };
    return { action, payload };
  }
  if (action === 'ban') {
    payload.player = String((body && body.player) || '').trim();
    if (!payload.player) return { error: 'Player is required.' };
    let time = String((body && (body.time || body.duration)) || 'none').trim();
    if (!time || time.toLowerCase() === 'permanent') time = 'none';
    payload.time = time;
    payload.reason = String((body && body.reason) || '').trim().slice(0, 160);
    return { action, payload };
  }
  if (action === 'unban') {
    payload.target = String((body && (body.target || body.player)) || '').trim();
    if (!payload.target) return { error: 'Player or address is required.' };
    return { action, payload };
  }
  if (action === 'map' || action === 'load') {
    payload.map = String((body && body.map) || '').trim();
    payload.mode = String((body && body.mode) || '').trim();
    if (!payload.map) return { error: 'Map is required.' };
    return { action, payload };
  }
  if (action === 'nextmap') {
    payload.map = String((body && body.map) || '').trim();
    payload.mode = String((body && body.mode) || '').trim();
    return { action, payload };
  }
  return { error: 'Unknown action.' };
}
function ownServers(user) {
  return loadServers().filter((entry) => entry.ownerId === user.userId);
}
function serversForUser(user) {
  return loadServers().filter((entry) => !!serverRole(entry, user));
}
function findOwnedServerById(id, user) {
  return loadServers().find((entry) => entry.id === id && entry.ownerId === user.userId) || null;
}
function findAccessibleServerById(id, user) {
  return loadServers().find((entry) => entry.id === id && !!serverRole(entry, user)) || null;
}
function findAccessibleServerByName(name, user) {
  const matches = loadServers().filter((entry) => (entry.name || entry.label) === name && !!serverRole(entry, user));
  return matches.find((entry) => entry.ownerId === user.userId) || matches[0] || null;
}
function findAccessibleServer(body, user) {
  if (!body || typeof body !== 'object') return null;
  if (body.serverId) return findAccessibleServerById(String(body.serverId), user);
  if (body.server) return findAccessibleServerByName(String(body.server), user);
  return null;
}
function normalizeServerRole(entry, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  let role = findServerRole(entry, text);
  const legacy = text.toLowerCase();
  if (!role && LEGACY_TEAM_ROLES.has(legacy)) role = findServerRole(entry, `role_${legacy}`);
  return role || null;
}
function newTeamCode() {
  return newPairingCode();
}
function setTeamInvite(entry, role, createdBy) {
  const code = newTeamCode();
  entry.memberInvite = {
    codeHash: hashPairingCode(code),
    roleId: role.id,
    role: role.key,
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + TEAM_INVITE_TTL_MS,
  };
  return code;
}
function findServerForAction(body, user) {
  return findAccessibleServer(body, user);
}
function assertOwner(entry, user) {
  return !!entry && entry.ownerId === user.userId;
}
function isPrivateHost(host) {
  const bare = String(host || '').replace(/^\[|\]$/g, '');
  if (!bare) return true;
  if (bare.toLowerCase() === 'localhost') return true;
  return net.isIP(bare) ? rcon.isPrivateAddress(bare) : false;
}
function cleanInstanceText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function normalizeInstancePlaylist(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rawGames = Array.isArray(source.games) ? source.games : [];
  if (rawGames.length < 3) throw badRequest('A playlist needs at least three games. Project Reclaimer votes between three different games.');
  if (rawGames.length > 30) throw badRequest('A playlist can contain at most 30 games.');
  const seen = new Set();
  const games = rawGames.map((game, index) => {
    const map = cleanInstanceText(game && game.map, 160);
    const mode = cleanInstanceText(game && (game.game || game.mode), 160);
    if (!map) throw badRequest(`Game ${index + 1} is missing a map.`);
    if (!mode) throw badRequest(`Game ${index + 1} is missing a game type.`);
    const key = `${map.toLowerCase()}\u0000${mode.toLowerCase()}`;
    if (seen.has(key)) throw badRequest('Each playlist game must use a different map and game type.');
    seen.add(key);
    return {
      name: cleanInstanceText(game && game.name, 80) || `${map} · ${mode}`,
      map,
      game: mode,
      antiCheat: !!(game && game.antiCheat),
    };
  });
  const rawVote = Number(source.voteSeconds);
  const voteSeconds = Number.isInteger(rawVote) && rawVote >= 5 && rawVote <= 300 ? rawVote : 20;
  return {
    name: cleanInstanceText(source.name, 80) || 'OmniVault Playlist',
    voteSeconds,
    games,
  };
}
function normalizeInstancePayload(body, editing = false) {
  const payload = {};
  if (!editing || (body && body.name != null)) {
    payload.name = cleanInstanceText(body && body.name, 80);
    if (payload.name.length < 2) throw badRequest('Server name must be 2-80 characters.');
  }
  if (!editing || (body && body.port != null && body.port !== '')) {
    if (body && body.port != null && body.port !== '') {
      const port = Number(body.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw badRequest('Choose a server port between 1024 and 65535.');
      }
      payload.port = port;
    }
  }
  if (body && body.maxPlayers != null && body.maxPlayers !== '') {
    const maxPlayers = Number(body.maxPlayers);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 127) {
      throw badRequest('Max players must be 1-127.');
    }
    payload.maxPlayers = maxPlayers;
  }
  if (body && body.playlist != null) payload.playlist = normalizeInstancePlaylist(body.playlist);
  return payload;
}
function parseServerInput(body, editing) {
  const name = String((body && body.name) || '').trim().slice(0, 80);
  const host = String((body && body.host) || '').trim().slice(0, 253);
  const port = Number(body && body.port);
  const rawPassword = body && Object.prototype.hasOwnProperty.call(body, 'password') ? body.password : undefined;
  const password = rawPassword === undefined || rawPassword === null ? undefined : String(rawPassword);
  if (!name) return { error: 'Server name is required.' };
  if (!host || /[\s/]/.test(host) || host.includes('://')) return { error: 'Enter a valid RCON host or IP address.' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'Enter a valid RCON port (1-65535).' };
  if (!editing && (!password || password.length < 4 || password.length > 128)) {
    return { error: 'RCON password must be 4-128 characters.' };
  }
  if (editing && password !== undefined && password !== '' && (password.length < 4 || password.length > 128)) {
    return { error: 'RCON password must be 4-128 characters.' };
  }
  return { name, host, port, password };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// ---------- auth middleware ----------
function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}
function userFromRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = sessions.get(tokenHash);
  if (!session) return null;
  if (Number(session.expiresAt) <= Date.now()) {
    sessions.delete(tokenHash);
    persistSessions();
    return null;
  }
  const account = loadUsers().find((user) => user.userId === session.userId);
  if (!account) {
    sessions.delete(tokenHash);
    persistSessions();
    return null;
  }
  return { userId: account.userId, username: account.username, isAdmin: !!account.isAdmin };
}
function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  req.user = user;
  next();
}
function optionalAuth(req, res, next) {
  req.user = userFromRequest(req);
  next();
}

// ---------- desktop window ----------
function getDesktopUpdater() {
  if (!desktopUpdater) desktopUpdater = require('./desktop-updater');
  return desktopUpdater;
}

function registerDesktopIpc() {
  if (!IS_ELECTRON || !ipcMain || desktopIpcReady) return;
  desktopIpcReady = true;

  const assertPanelWindow = (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      throw new Error('This update request did not come from the OmniVault window.');
    }
  };

  ipcMain.handle('desktop:info', (event) => {
    assertPanelWindow(event);
    return { version: electronApp.getVersion(), packaged: !!electronApp.isPackaged };
  });
  ipcMain.handle('desktop:update:check', async (event, options) => {
    assertPanelWindow(event);
    return getDesktopUpdater().checkForUpdate(options || {});
  });
  ipcMain.handle('desktop:update:install', async (event) => {
    assertPanelWindow(event);
    return getDesktopUpdater().downloadAndInstall();
  });
}

function createWindow(url) {
  registerDesktopIpc();
  let panelUrl = url;
  try {
    const parsed = new URL(url);
    // The server redirects "/" to "/webpanel/". Normalize first so the
    // desktop marker survives that redirect and the panel can expose the
    // update control only inside the desktop shell.
    if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/webpanel/';
    parsed.searchParams.set('desktop', '1');
    // A changing HTML URL also bypasses a stale cached panel after an app
    // upgrade. The page's CSS and JS links carry the same version marker.
    parsed.searchParams.set('v', PANEL_ASSET_VERSION);
    panelUrl = parsed.toString();
  } catch {}

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  let allowedOrigin = null;
  try { allowedOrigin = new URL(panelUrl).origin; } catch {}
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    try {
      if (!allowedOrigin || new URL(target).origin !== allowedOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.loadURL(panelUrl);
}

function readRemotePanelUrl() {
  if (LOCAL_MODE) return '';
  const envUrl = String(process.env.PANEL_URL || '').trim();
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  for (const file of [PANEL_URL_FILE, DEFAULT_PANEL_URL_FILE]) {
    try {
      const fileUrl = fs.readFileSync(file, 'utf8').trim();
      if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    } catch {}
  }
  return '';
}

// ---------- HTTP application ----------
function startServer() {
  migrateData();

  const web = express();
  web.disable('x-powered-by');
  web.set('trust proxy', 'loopback');

  web.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', CSP);
    if (req.secure || PUBLIC_MODE) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  web.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  web.use(express.json({ limit: '256kb' }));

  // Static assets are an explicit allowlist so users.json, servers.json,
  // sessions.json and the backend source can never be downloaded.
  const webpanelFiles = ['index.html', 'webpanel.js', 'webpanel.css', 'signup.html', 'signup.js'];
  const sendPanelFile = (res, file) => {
    // The panel changes with the app and the agent; never let a browser or
    // Cloudflare keep an old copy of the sign-in page or its scripts.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'webpanel', file));
  };
  for (const file of webpanelFiles) {
    web.get(`/webpanel/${file}`, (req, res) => sendPanelFile(res, file));
  }
  web.get(['/webpanel', '/webpanel/'], (req, res) => sendPanelFile(res, 'index.html'));
  web.get('/panel.css', (req, res) => res.sendFile(path.join(__dirname, 'panel.css')));
  web.get('/', (req, res) => res.redirect('/webpanel/'));
  web.get('/index.html', (req, res) => res.redirect('/webpanel/'));
  web.get('/favicon.ico', (req, res) => res.status(204).end());

  // The agent executable is public so a server owner can download it before
  // they have a paired server. It contains no token, config, or RCON password.
  web.get('/api/agent/download', (req, res) => {
    if (!checkRate(`agent-download:${clientIp(req)}`, 60, 10 * 60 * 1000)) {
      return res.status(429).send('Too many downloads. Try again later.');
    }
    if (!fs.existsSync(AGENT_EXE_FILE)) {
      return res.status(404).send('The agent executable is not published yet.');
    }
    res.download(AGENT_EXE_FILE, 'OmniVaultAgent.exe');
  });

  // Signed agent executable manifest. The signature uses the Ed25519 private
  // key stored outside the web root; the matching public key is embedded in
  // the agent executable.
  web.get('/api/agent/update-exe', (req, res) => {
    if (!checkRate(`agent-update-exe:${clientIp(req)}`, 120, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many update checks. Try again later.' });
    }
    try {
      const manifest = buildAgentExeManifest();
      if (!manifest) return res.status(404).json({ error: 'Agent updates are not configured on this panel.' });
      res.setHeader('Cache-Control', 'no-store');
      res.json(manifest);
    } catch (error) {
      console.error('Could not build the agent update manifest:', error.message);
      res.status(500).json({ error: 'The agent update manifest is unavailable.' });
    }
  });

  web.get('/api/agent/update-exe/download', (req, res) => {
    if (!checkRate(`agent-update-exe-download:${clientIp(req)}`, 60, 10 * 60 * 1000)) {
      return res.status(429).send('Too many agent downloads. Try again later.');
    }
    if (!fs.existsSync(AGENT_EXE_FILE)) {
      return res.status(404).send('The agent executable is not published yet.');
    }
    const stat = fs.statSync(AGENT_EXE_FILE);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 'attachment; filename="OmniVaultAgent.exe"');
    fs.createReadStream(AGENT_EXE_FILE).pipe(res);
  });

  // Legacy signed source-file package. Existing 1.1.x ZIP agents still use
  // this route; new single-exe agents use /api/agent/update-exe instead.
  web.get('/api/agent/update', (req, res) => {
    if (!checkRate(`agent-update:${clientIp(req)}`, 120, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many update checks. Try again later.' });
    }
    try {
      const pkg = buildAgentUpdatePackage();
      if (!pkg) return res.status(404).json({ error: 'Agent updates are not configured on this panel.' });
      res.setHeader('Cache-Control', 'no-store');
      res.json(pkg);
    } catch (error) {
      console.error('Could not build the agent update package:', error.message);
      res.status(500).json({ error: 'The agent update package is unavailable.' });
    }
  });

  web.get('/api/desktop/download', (req, res) => {
    if (!checkRate(`desktop-download:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
      return res.status(429).send('Too many downloads. Try again later.');
    }
    if (!fs.existsSync(DESKTOP_INSTALLER_FILE)) {
      return res.status(404).send('The Windows build is not published yet. Check the GitHub releases page.');
    }
    res.download(DESKTOP_INSTALLER_FILE, 'OmniVault-Setup.exe');
  });

  // ---- auth ----
  web.get('/api/auth/state', optionalAuth, (req, res) => {
    res.json({
      authenticated: !!req.user,
      user: req.user ? publicUser(req.user) : null,
      authRequired: true,
      inviteRequired: !!process.env.PANEL_INVITE_CODE,
      publicMode: PUBLIC_MODE,
    });
  });

  web.post('/api/register', (req, res) => {
    const ipKey = `register:${clientIp(req)}`;
    if (!checkRate(ipKey, 5, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many account registrations from this address. Try again later.' });
    }
    const inviteRequired = String(process.env.PANEL_INVITE_CODE || '');
    if (inviteRequired && String((req.body && req.body.inviteCode) || '') !== inviteRequired) {
      return res.status(403).json({ error: 'A valid invite code is required.' });
    }
    const username = normalizeUsername(req.body && req.body.username);
    const password = req.body && req.body.password;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-32 characters and start with a letter or number.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 8-128 characters.' });
    }
    const users = loadUsers();
    if (users.some((user) => String(user.username || '').toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    const user = {
      userId: 'user_' + crypto.randomBytes(8).toString('hex'),
      username,
      passwordHash: hashPassword(password),
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    const token = createSession(user);
    audit({ type: 'register', userId: user.userId, username: user.username, ip: clientIp(req) });
    resetRate(`login-user:${clientIp(req)}:${username.toLowerCase()}`);
    res.json({ ok: true, token, user: publicUser(user) });
  });

  web.post('/api/login', (req, res) => {
    const username = normalizeUsername(req.body && req.body.username);
    const password = req.body && req.body.password;
    if (!username || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const ipKey = `login-ip:${clientIp(req)}`;
    const userKey = `login-user:${clientIp(req)}:${username.toLowerCase()}`;
    if (!checkRate(ipKey, 30, 10 * 60 * 1000) || !checkRate(userKey, 10, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
    const users = loadUsers();
    const user = users.find((entry) => String(entry.username || '').toLowerCase() === username.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
    const result = verifyPassword(password, user.passwordHash);
    if (!result.ok) return res.status(401).json({ error: 'Invalid username or password.' });
    if (result.needsUpgrade) {
      user.passwordHash = hashPassword(password);
      saveUsers(users);
    }
    resetRate(userKey);
    const token = createSession(user);
    audit({ type: 'login', userId: user.userId, username: user.username, ip: clientIp(req) });
    res.json({ ok: true, token, user: publicUser(user) });
  });

  web.post('/api/logout', (req, res) => {
    destroySession(bearerToken(req));
    res.json({ ok: true });
  });

  web.post('/api/admin/agent-update/push', requireAuth, requireAdmin, (req, res) => {
    if (!checkRate(`agent-update-push:${req.user.userId}`, 10, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many update announcements. Try again later.' });
    }
    try {
      const pkg = buildAgentUpdatePackage();
      if (!pkg) return res.status(503).json({ error: 'Agent updates are not configured on this panel.' });
      let sent = 0;
      for (const live of liveAgents.values()) {
        if (live.socket.readyState !== WebSocket.OPEN) continue;
        try {
          live.socket.send(JSON.stringify({ type: 'update-available', version: pkg.version }));
          sent += 1;
        } catch {}
      }
      audit({ type: 'agent-update-push', userId: req.user.userId, username: req.user.username, ip: clientIp(req), version: pkg.version, sent });
      res.json({ ok: true, version: pkg.version, sent });
    } catch (error) {
      res.status(500).json({ error: String(error.message || error) });
    }
  });

  // ---- agent pairing (called by the server owner's agent installer) ----
  web.post('/api/agent/pair', (req, res) => {
    if (!checkRate(`agent-pair:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many pairing attempts. Try again later.' });
    }
    const rawCode = String((req.body && req.body.pairingCode) || '');
    const normalized = normalizePairingCode(rawCode);
    if (normalized.length !== 8) {
      return res.status(401).json({ error: 'The pairing code is invalid or has expired.' });
    }
    const codeHash = hashPairingCode(rawCode);
    const servers = loadServers();
    const now = Date.now();
    const index = servers.findIndex((entry) => (
      entry.connectionMode === 'agent'
      && entry.agentPairingCodeHash === codeHash
      && Number(entry.agentPairingExpiresAt) > now
    ));
    if (index === -1) {
      return res.status(401).json({ error: 'The pairing code is invalid or has expired.' });
    }
    const entry = servers[index];
    const token = 'agent_' + crypto.randomBytes(32).toString('hex');
    entry.agentTokenHash = hashToken(token);
    entry.agentId = 'agent_' + crypto.randomBytes(8).toString('hex');
    entry.agentPairedAt = new Date().toISOString();
    entry.agentName = String((req.body && req.body.agentName) || 'OmniVault Agent').trim().slice(0, 80);
    entry.agentVersion = String((req.body && req.body.agentVersion) || '').trim().slice(0, 32);
    entry.agentLastSeen = null;
    delete entry.agentPairingCodeHash;
    delete entry.agentPairingExpiresAt;
    saveServers(servers);
    closeLiveAgent(entry.id, 'Agent re-paired');
    audit({ type: 'agent-pair', userId: entry.ownerId, serverId: entry.id, serverName: entry.name, ip: clientIp(req) });
    res.json({
      ok: true,
      token,
      serverId: entry.id,
      serverName: entry.name,
    });
  });

  // ---- per-account server inventory ----
  web.get('/api/servers', requireAuth, async (req, res) => {
    if (!checkRate(`servers:${req.user.userId}`, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many refreshes. Wait a moment.' });
    }
    const mine = serversForUser(req.user);
    const servers = await Promise.all(mine.map(async (entry) => {
      if (entry.connectionMode === 'agent') {
        if (!liveAgents.has(entry.id)) {
          return {
            ...publicServer(entry, req.user),
            status: 'Agent offline',
            error: 'Agent is offline. Start the OmniVault agent on the game server.',
            players: '',
            playersError: null,
          };
        }
        const [statusResult, playersResult] = await Promise.allSettled([
          sendAgentCommand(entry, 'status', {}, 15000),
          sendAgentCommand(entry, 'players', {}, 15000),
        ]);
        const status = statusResult.status === 'fulfilled' ? statusResult.value : 'Agent unavailable';
        const error = statusResult.status === 'rejected' ? String(statusResult.reason.message || statusResult.reason) : null;
        const players = playersResult.status === 'fulfilled' ? playersResult.value : '';
        const playersError = playersResult.status === 'rejected' ? String(playersResult.reason.message || playersResult.reason) : null;
        return { ...publicServer(entry, req.user), status, error, players, playersError };
      }
      if (!req.user.isAdmin) {
        return {
          ...publicServer(entry, req.user),
          status: 'Direct RCON restricted',
          error: 'Direct RCON is restricted to the panel administrator. Remove this server and re-add it with Agent mode.',
          players: '',
          playersError: null,
        };
      }
      const rc = rcon.make(entry, { allowPrivate: req.user.isAdmin });
      const [statusResult, playersResult] = await Promise.allSettled([rc.status(), rc.players()]);
      const status = statusResult.status === 'fulfilled' ? statusResult.value : 'RCON unavailable';
      const error = statusResult.status === 'rejected' ? String(statusResult.reason.message || statusResult.reason) : null;
      const players = playersResult.status === 'fulfilled' ? playersResult.value : '';
      const playersError = playersResult.status === 'rejected' ? String(playersResult.reason.message || playersResult.reason) : null;
      return { ...publicServer(entry, req.user), status, error, players, playersError };
    }));
    res.json({ servers });
  });

  web.post('/api/servers', requireAuth, (req, res) => {
    if (!checkRate(`server-write:${req.user.userId}`, 30, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many server changes. Try again later.' });
    }
    const mode = req.body && req.body.connectionMode === 'agent' ? 'agent' : 'direct';
    const name = String((req.body && req.body.name) || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Server name is required.' });
    const servers = loadServers();
    const mine = servers.filter((entry) => entry.ownerId === req.user.userId);
    if (mine.length >= 20) {
      return res.status(400).json({ error: 'You can add at most 20 servers per account.' });
    }
    if (mine.some((entry) => String(entry.name || entry.label || '').toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'You already have a server with that name.' });
    }

    if (mode === 'agent') {
      const rconPort = Number(req.body && req.body.rconPort);
      if (req.body && req.body.rconPort != null && (!Number.isInteger(rconPort) || rconPort < 1 || rconPort > 65535)) {
        return res.status(400).json({ error: 'Enter a valid local RCON port (1-65535).' });
      }
      const entry = {
        id: newServerId(),
        name,
        ownerId: req.user.userId,
        members: [],
        roles: defaultServerRoles(),
        connectionMode: 'agent',
        rconPort: Number.isInteger(rconPort) ? rconPort : 49176,
        createdAt: new Date().toISOString(),
      };
      const pairingCode = setAgentPairing(entry);
      servers.push(entry);
      saveServers(servers);
      audit({ type: 'server-create', userId: req.user.userId, username: req.user.username, ip: clientIp(req), serverId: entry.id, serverName: entry.name, mode: 'agent' });
      res.json({
        ok: true,
        server: publicServer(entry, req.user),
        pairingCode,
        pairingExpiresAt: new Date(entry.agentPairingExpiresAt).toISOString(),
      });
      return;
    }

    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Direct RCON is restricted to the panel administrator. Use Agent mode; it needs no port forwarding.' });
    }
    const input = parseServerInput(req.body, false);
    if (input.error) return res.status(400).json({ error: input.error });
    if (!req.user.isAdmin && isPrivateHost(input.host)) {
      return res.status(403).json({ error: 'Private and loopback RCON hosts are not allowed on this account.' });
    }
    const entry = {
      id: newServerId(),
      name: input.name,
      host: input.host,
      port: input.port,
      password: input.password,
      ownerId: req.user.userId,
      members: [],
      roles: defaultServerRoles(),
      connectionMode: 'direct',
      createdAt: new Date().toISOString(),
    };
    servers.push(entry);
    saveServers(servers);
    audit({ type: 'server-create', userId: req.user.userId, username: req.user.username, ip: clientIp(req), serverId: entry.id, serverName: entry.name, mode: 'direct' });
    res.json({ ok: true, server: publicServer(entry, req.user) });
  });

  web.put('/api/servers/:id', requireAuth, (req, res) => {
    if (!checkRate(`server-write:${req.user.userId}`, 30, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many server changes. Try again later.' });
    }
    const servers = loadServers();
    const index = servers.findIndex((entry) => entry.id === req.params.id && entry.ownerId === req.user.userId);
    if (index === -1) return res.status(404).json({ error: 'Server not found.' });
    const entry = servers[index];
    if (!req.user.isAdmin && entry.connectionMode === 'direct') {
      return res.status(403).json({ error: 'Direct RCON is restricted to the panel administrator. Remove this server and re-add it with Agent mode.' });
    }
    const requestedMode = req.body && req.body.connectionMode;
    if (requestedMode && requestedMode !== entry.connectionMode) {
      return res.status(400).json({ error: 'Remove and re-add the server to change its connection type.' });
    }
    const name = String((req.body && req.body.name) || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Server name is required.' });
    const mine = servers.filter((server, entryIndex) => server.ownerId === req.user.userId && entryIndex !== index);
    if (mine.some((server) => String(server.name || server.label || '').toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'You already have a server with that name.' });
    }

    if (entry.connectionMode === 'agent') {
      entry.name = name;
      if (req.body && req.body.rconPort != null) {
        const rconPort = Number(req.body.rconPort);
        if (!Number.isInteger(rconPort) || rconPort < 1 || rconPort > 65535) {
          return res.status(400).json({ error: 'Enter a valid local RCON port (1-65535).' });
        }
        entry.rconPort = rconPort;
      }
      if (req.body && req.body.agentName) entry.agentName = String(req.body.agentName).trim().slice(0, 80);
      saveServers(servers);
      catalogCache.delete(entry.id);
      res.json({ ok: true, server: publicServer(entry, req.user) });
      return;
    }

    const input = parseServerInput(req.body, true);
    if (input.error) return res.status(400).json({ error: input.error });
    if (!req.user.isAdmin && isPrivateHost(input.host)) {
      return res.status(403).json({ error: 'Private and loopback RCON hosts are not allowed on this account.' });
    }
    entry.name = input.name;
    entry.host = input.host;
    entry.port = input.port;
    if (input.password !== undefined && input.password !== '') entry.password = input.password;
    saveServers(servers);
    catalogCache.delete(entry.id);
    res.json({ ok: true, server: publicServer(entry, req.user) });
  });

  web.post('/api/servers/:id/agent-code', requireAuth, (req, res) => {
    if (!checkRate(`server-write:${req.user.userId}`, 30, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many server changes. Try again later.' });
    }
    const servers = loadServers();
    const index = servers.findIndex((entry) => entry.id === req.params.id && entry.ownerId === req.user.userId);
    if (index === -1) return res.status(404).json({ error: 'Server not found.' });
    const entry = servers[index];
    if (entry.connectionMode !== 'agent') return res.status(400).json({ error: 'This server is not using agent mode.' });
    const pairingCode = setAgentPairing(entry);
    saveServers(servers);
    closeLiveAgent(entry.id, 'A new pairing code was generated');
    res.json({
      ok: true,
      pairingCode,
      pairingExpiresAt: new Date(entry.agentPairingExpiresAt).toISOString(),
      server: publicServer(entry, req.user),
    });
  });

  // ---- custom server roles ----
  web.get('/api/servers/:id/roles', requireAuth, (req, res) => {
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    const access = accessFor(entry, req.user);
    res.json({
      roles: publicRoles(entry),
      permissions: PERMISSION_CATALOG,
      canManage: !!access && access.owner,
    });
  });

  web.post('/api/servers/:id/roles', requireAuth, (req, res) => {
    if (!checkRate(`role-write:${req.user.userId}`, 40, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many role changes. Try again later.' });
    }
    const entry = findOwnedServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account.' });
    const customCount = (entry.roles || []).filter((role) => !role.builtin).length;
    if (customCount >= 20) return res.status(400).json({ error: 'You can create at most 20 custom roles per server.' });
    const name = normalizeRoleName(req.body && req.body.name);
    if (name.length < 2) return res.status(400).json({ error: 'Role names must be 2-32 characters.' });
    const reserved = new Set(['owner', ...BUILTIN_ROLE_DEFINITIONS.map((definition) => definition.name.toLowerCase())]);
    if (reserved.has(name.toLowerCase())) return res.status(409).json({ error: 'That role name is reserved.' });
    if ((entry.roles || []).some((role) => role.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'A role with that name already exists.' });
    }
    const role = {
      id: newRoleId(),
      key: 'custom',
      name,
      builtin: false,
      permissions: normalizeCustomRolePermissions(req.body && req.body.permissions),
      createdAt: new Date().toISOString(),
    };
    entry.roles = [...(entry.roles || []), role];
    saveServers(loadServers().map((item) => (item.id === entry.id ? entry : item)));
    audit({ type: 'role-create', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, roleId: role.id, roleName: role.name, ip: clientIp(req) });
    res.json({ ok: true, role, roles: publicRoles(entry), permissions: PERMISSION_CATALOG });
  });

  web.patch('/api/servers/:id/roles/:roleId', requireAuth, (req, res) => {
    if (!checkRate(`role-write:${req.user.userId}`, 40, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many role changes. Try again later.' });
    }
    const entry = findOwnedServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account.' });
    const role = findServerRole(entry, req.params.roleId);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    if (role.builtin) return res.status(400).json({ error: 'The Moderator and Developer roles are built in and cannot be edited.' });
    const name = normalizeRoleName(req.body && req.body.name);
    if (name.length < 2) return res.status(400).json({ error: 'Role names must be 2-32 characters.' });
    const reserved = new Set(['owner', ...BUILTIN_ROLE_DEFINITIONS.map((definition) => definition.name.toLowerCase())]);
    if (reserved.has(name.toLowerCase())) return res.status(409).json({ error: 'That role name is reserved.' });
    if ((entry.roles || []).some((item) => item.id !== role.id && item.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'A role with that name already exists.' });
    }
    role.name = name;
    if (Array.isArray(req.body && req.body.permissions)) {
      role.permissions = normalizeCustomRolePermissions(req.body.permissions);
    }
    saveServers(loadServers().map((item) => (item.id === entry.id ? entry : item)));
    audit({ type: 'role-update', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, roleId: role.id, roleName: role.name, ip: clientIp(req) });
    res.json({ ok: true, role, roles: publicRoles(entry), permissions: PERMISSION_CATALOG });
  });

  web.delete('/api/servers/:id/roles/:roleId', requireAuth, (req, res) => {
    if (!checkRate(`role-write:${req.user.userId}`, 40, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many role changes. Try again later.' });
    }
    const entry = findOwnedServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account.' });
    const role = findServerRole(entry, req.params.roleId);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    if (role.builtin) return res.status(400).json({ error: 'The Moderator and Developer roles are built in and cannot be deleted.' });
    if ((entry.members || []).some((member) => member.roleId === role.id)) {
      return res.status(409).json({ error: 'Move the people using this role to another role before deleting it.' });
    }
    if (entry.memberInvite && entry.memberInvite.roleId === role.id) {
      return res.status(409).json({ error: 'Replace the active invitation before deleting this role.' });
    }
    entry.roles = (entry.roles || []).filter((item) => item.id !== role.id);
    saveServers(loadServers().map((item) => (item.id === entry.id ? entry : item)));
    audit({ type: 'role-delete', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, roleId: role.id, roleName: role.name, ip: clientIp(req) });
    res.json({ ok: true, roles: publicRoles(entry), permissions: PERMISSION_CATALOG });
  });

  // ---- server team access ----
  web.get('/api/servers/:id/access', requireAuth, (req, res) => {
    const entry = findOwnedServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account.' });
    const inviteRole = entry.memberInvite ? findServerRole(entry, entry.memberInvite.roleId) : null;
    const invite = entry.memberInvite && inviteRole && Number(entry.memberInvite.expiresAt) > Date.now()
      ? {
        roleId: inviteRole.id,
        role: inviteRole.key,
        roleName: inviteRole.name,
        expiresAt: new Date(Number(entry.memberInvite.expiresAt)).toISOString(),
      }
      : null;
    res.json({
      members: publicMembers(entry),
      roles: publicRoles(entry),
      permissions: PERMISSION_CATALOG,
      invite,
    });
  });

  web.post('/api/servers/:id/access/invite', requireAuth, (req, res) => {
    if (!checkRate(`team-invite:${req.user.userId}`, 30, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many team invitations. Try again later.' });
    }
    const entry = findOwnedServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account.' });
    const role = normalizeServerRole(entry, (req.body && (req.body.roleId || req.body.role)) || '');
    if (!role) return res.status(400).json({ error: 'Choose a role for the invitation.' });
    const code = setTeamInvite(entry, role, req.user.userId);
    saveServers(loadServers().map((item) => (item.id === entry.id ? entry : item)));
    audit({ type: 'team-invite', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, role: role.key, roleName: role.name, ip: clientIp(req) });
    res.json({
      ok: true,
      code,
      roleId: role.id,
      role: role.key,
      roleName: role.name,
      expiresAt: new Date(entry.memberInvite.expiresAt).toISOString(),
    });
  });

  web.patch('/api/servers/:id/members/:userId', requireAuth, (req, res) => {
    if (!checkRate(`team-manage:${req.user.userId}`, 60, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many team changes. Try again later.' });
    }
    const entry = findOwnedServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account.' });
    const role = normalizeServerRole(entry, (req.body && (req.body.roleId || req.body.role)) || '');
    if (!role) return res.status(400).json({ error: 'Choose a role for this team member.' });
    const member = (entry.members || []).find((item) => item.userId === req.params.userId);
    if (!member) return res.status(404).json({ error: 'That person is not on this server team.' });
    member.roleId = role.id;
    member.role = role.key;
    saveServers(loadServers().map((item) => (item.id === entry.id ? entry : item)));
    audit({ type: 'team-role-change', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, targetUserId: member.userId, role: role.key, roleName: role.name, ip: clientIp(req) });
    res.json({ ok: true, members: publicMembers(entry), roles: publicRoles(entry) });
  });

  web.delete('/api/servers/:id/members/:userId', requireAuth, (req, res) => {
    if (!checkRate(`team-manage:${req.user.userId}`, 60, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many team changes. Try again later.' });
    }
    const entry = findOwnedServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account.' });
    const before = Array.isArray(entry.members) ? entry.members.length : 0;
    entry.members = (entry.members || []).filter((member) => member.userId !== req.params.userId);
    if (entry.members.length === before) return res.status(404).json({ error: 'That person is not on this server team.' });
    saveServers(loadServers().map((item) => (item.id === entry.id ? entry : item)));
    audit({ type: 'team-remove', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, targetUserId: req.params.userId, ip: clientIp(req) });
    res.json({ ok: true, members: publicMembers(entry) });
  });

  web.post('/api/servers/join', requireAuth, (req, res) => {
    if (!checkRate(`team-join:${req.user.userId}`, 12, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many join attempts. Try again later.' });
    }
    const rawCode = String((req.body && req.body.code) || '');
    if (normalizePairingCode(rawCode).length !== 8) {
      return res.status(400).json({ error: 'That access code is invalid or has expired.' });
    }
    const codeHash = hashPairingCode(rawCode);
    const servers = loadServers();
    const entry = servers.find((item) => (
      item.memberInvite
      && item.memberInvite.codeHash === codeHash
      && Number(item.memberInvite.expiresAt) > Date.now()
    ));
    if (!entry) return res.status(404).json({ error: 'That access code is invalid or has expired.' });
    if (entry.ownerId === req.user.userId) {
      return res.status(400).json({ error: 'You already own this server.' });
    }
    const role = findServerRole(entry, entry.memberInvite.roleId);
    if (!role) return res.status(400).json({ error: 'That invitation has an invalid role.' });
    entry.members = Array.isArray(entry.members) ? entry.members : [];
    const existing = entry.members.find((member) => member.userId === req.user.userId);
    if (existing) {
      existing.roleId = role.id;
      existing.role = role.key;
      existing.username = req.user.username;
    } else {
      entry.members.push({
        userId: req.user.userId,
        username: req.user.username,
        roleId: role.id,
        role: role.key,
        addedAt: new Date().toISOString(),
        addedBy: entry.memberInvite.createdBy || null,
      });
    }
    delete entry.memberInvite;
    saveServers(servers);
    audit({ type: 'team-join', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, role: role.key, roleName: role.name, ip: clientIp(req) });
    res.json({ ok: true, server: publicServer(entry, req.user) });
  });

  web.delete('/api/servers/:id', requireAuth, (req, res) => {
    if (!checkRate(`server-write:${req.user.userId}`, 30, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many server changes. Try again later.' });
    }
    const servers = loadServers();
    const index = servers.findIndex((entry) => entry.id === req.params.id && entry.ownerId === req.user.userId);
    if (index === -1) return res.status(404).json({ error: 'Server not found.' });
    const [removed] = servers.splice(index, 1);
    saveServers(servers);
    closeLiveAgent(removed.id, 'Server removed');
    catalogCache.delete(removed.id);
    audit({ type: 'server-delete', userId: req.user.userId, username: req.user.username, ip: clientIp(req), serverId: removed.id, serverName: removed.name });
    res.json({ ok: true });
  });

  // ---- RCON actions ----
  web.post('/api/action', requireAuth, async (req, res) => {
    if (!checkRate(`action:${req.user.userId}`, 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many RCON actions. Wait a moment.' });
    }
    const entry = findAccessibleServer(req.body, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    const action = String((req.body && req.body.action) || '');
    const role = serverRole(entry, req.user);
    const permission = actionPermission(action);
    if (!permission || !can(entry, req.user, permission)) {
      return res.status(403).json({ error: 'Your role does not allow that action on this server.' });
    }
    const requestedInstanceId = String((req.body && req.body.instanceId) || '').trim();
    if (requestedInstanceId) {
      if (!INSTANCE_ID_RE.test(requestedInstanceId)) {
        return res.status(400).json({ error: 'Choose a valid managed server instance.' });
      }
      if (entry.connectionMode !== 'agent') {
        return res.status(400).json({ error: 'Managed server instances require Agent mode.' });
      }
      if (!can(entry, req.user, 'instancesView')) {
        return res.status(403).json({ error: 'Your role does not allow access to managed server instances.' });
      }
    }
    if (entry.connectionMode === 'direct' && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Direct RCON is restricted to the panel administrator. Use Agent mode; it needs no port forwarding.' });
    }

    if (entry.connectionMode === 'agent') {
      const request = normalizeAgentAction(req.body);
      if (request.error) return res.status(400).json({ error: request.error });
      try {
        const result = await sendAgentCommand(entry, request.action, request.payload);
        audit({ type: 'action', userId: req.user.userId, username: req.user.username, role, ip: clientIp(req), serverId: entry.id, serverName: entry.name, action: request.action, ok: true });
        res.json({ result: result || 'Command sent.' });
      } catch (error) {
        audit({ type: 'action', userId: req.user.userId, username: req.user.username, role, ip: clientIp(req), serverId: entry.id, serverName: entry.name, action: request.action, ok: false, error: String(error.message || error) });
        res.status(502).json({ error: String(error.message || error) });
      }
      return;
    }

    const rc = rcon.make(entry, { allowPrivate: req.user.isAdmin });
    try {
      let result;
      if (action === 'status') result = await rc.status();
      else if (action === 'players') result = await rc.players();
      else if (action === 'say') {
        const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
        if (!message) return res.status(400).json({ error: 'Message is required.' });
        result = await rc.say(message);
      } else if (action === 'kick') {
        const player = String((req.body && req.body.player) || '').trim();
        if (!player) return res.status(400).json({ error: 'Player is required.' });
        result = await rc.kick(player, req.body && req.body.reason);
      } else if (action === 'ban') {
        const player = String((req.body && req.body.player) || '').trim();
        if (!player) return res.status(400).json({ error: 'Player is required.' });
        let time = String((req.body && (req.body.time || req.body.duration)) || 'none').trim();
        if (!time || time.toLowerCase() === 'permanent') time = 'none';
        result = await rc.ban(player, time, req.body && req.body.reason);
      } else if (action === 'unban') {
        const target = String((req.body && (req.body.target || req.body.player)) || '').trim();
        if (!target) return res.status(400).json({ error: 'Player or address is required.' });
        result = await rc.unban(target);
      } else if (action === 'map') {
        const map = String((req.body && req.body.map) || '').trim();
        if (!map) return res.status(400).json({ error: 'Map is required.' });
        result = await rc.map(map, req.body && req.body.mode);
      } else if (action === 'load') {
        const map = String((req.body && req.body.map) || '').trim();
        if (!map) return res.status(400).json({ error: 'Map is required.' });
        result = await rc.load(map, req.body && req.body.mode);
      } else if (action === 'nextmap') {
        result = await rc.nextmap((req.body && req.body.map) || '', req.body && req.body.mode);
      } else if (action === 'endround') {
        result = await rc.endround();
      } else if (action === 'endgame') {
        result = await rc.endgame();
      } else {
        return res.status(400).json({ error: 'Unknown action.' });
      }
      audit({ type: 'action', userId: req.user.userId, username: req.user.username, role, ip: clientIp(req), serverId: entry.id, serverName: entry.name, action, ok: true });
      res.json({ result: result || 'Command sent.' });
    } catch (error) {
      audit({ type: 'action', userId: req.user.userId, username: req.user.username, role, ip: clientIp(req), serverId: entry.id, serverName: entry.name, action, ok: false, error: String(error.message || error) });
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  // ---- server files ----
  web.get('/api/servers/:id/files', requireAuth, async (req, res) => {
    if (!checkRate(`files-list:${req.user.userId}`, 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many file requests. Wait a moment.' });
    }
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    if (!can(entry, req.user, 'filesRead')) return res.status(403).json({ error: 'Your role does not allow file access on this server.' });
    if (entry.connectionMode !== 'agent') return res.status(400).json({ error: 'The server files manager requires Agent mode.' });
    try {
      const dir = normalizeRelativeFilePath(req.query.path || '');
      const data = await sendAgentJson(entry, 'files-list', { path: dir }, 20000);
      res.json({
        path: dir,
        entries: Array.isArray(data.entries) ? data.entries : [],
        configured: data.configured !== false,
      });
    } catch (error) {
      res.status(error.status === 400 ? 400 : 502).json({ error: String(error.message || error) });
    }
  });

  web.get('/api/servers/:id/files/download', requireAuth, async (req, res) => {
    if (!checkRate(`files-download:${req.user.userId}`, 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many file downloads. Wait a moment.' });
    }
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    if (!can(entry, req.user, 'filesRead')) return res.status(403).json({ error: 'Your role does not allow file access on this server.' });
    if (entry.connectionMode !== 'agent') return res.status(400).json({ error: 'The server files manager requires Agent mode.' });
    let filePath;
    let stat;
    try {
      filePath = normalizeRelativeFilePath(req.query.path || '', false);
      assertAllowedFileExtension(filePath);
      stat = await sendAgentJson(entry, 'files-stat', { path: filePath }, 20000);
    } catch (error) {
      return res.status(error.status === 400 ? 400 : 502).json({ error: String(error.message || error) });
    }
    const size = Number(stat.size);
    if (!Number.isInteger(size) || size < 0) return res.status(502).json({ error: 'The agent returned an invalid file size.' });
    const name = String(stat.name || filePath.split('/').pop() || 'download');
    const asciiName = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    const sendFileHeaders = () => {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(size));
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    };
    try {
      let offset = 0;
      let started = false;
      while (offset < size) {
        const chunk = await sendAgentJson(entry, 'files-read', {
          path: filePath,
          offset,
          length: Math.min(FILE_READ_CHUNK_BYTES, size - offset),
        }, 30000);
        const data = Buffer.from(String(chunk.data || ''), 'base64');
        if (!data.length) throw new Error('The agent returned an empty file chunk.');
        if (!started) {
          sendFileHeaders();
          started = true;
        }
        offset += data.length;
        if (!res.write(data)) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
      if (!started) sendFileHeaders();
      res.end();
    } catch (error) {
      audit({ type: 'files-download', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, path: filePath, ok: false, error: String(error.message || error) });
      if (!res.headersSent) res.status(error.status === 400 ? 400 : 502).json({ error: String(error.message || error) });
      else res.destroy();
    }
  });

  web.post('/api/servers/:id/files/upload', requireAuth, express.raw({ type: () => true, limit: MAX_FILE_UPLOAD_BYTES }), async (req, res) => {
    if (!checkRate(`files-upload:${req.user.userId}`, 20, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many file uploads. Try again later.' });
    }
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    if (!can(entry, req.user, 'filesWrite')) return res.status(403).json({ error: 'Your role does not allow file changes on this server.' });
    if (entry.connectionMode !== 'agent') return res.status(400).json({ error: 'The server files manager requires Agent mode.' });
    let filePath = '';
    let uploadId = '';
    try {
      filePath = normalizeRelativeFilePath(req.query.path || '', false);
      assertAllowedFileExtension(filePath);
      const data = req.body;
      if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ error: 'Choose a file to upload.' });
      if (data.length > MAX_FILE_UPLOAD_BYTES) return res.status(413).json({ error: 'That file is too large. The limit is 32 MB.' });
      const begin = await sendAgentJson(entry, 'files-upload-begin', { path: filePath, size: data.length }, 20000);
      uploadId = String(begin.uploadId || '');
      if (!uploadId) throw new Error('The agent did not start the upload.');
      for (let offset = 0; offset < data.length; offset += FILE_UPLOAD_CHUNK_BYTES) {
        await sendAgentJson(entry, 'files-upload-chunk', {
          uploadId,
          data: data.subarray(offset, offset + FILE_UPLOAD_CHUNK_BYTES).toString('base64'),
        }, 30000);
      }
      await sendAgentJson(entry, 'files-upload-end', { uploadId }, 30000);
      uploadId = '';
      audit({ type: 'files-upload', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, path: filePath, size: data.length, ok: true });
      res.json({ ok: true, path: filePath, size: data.length });
    } catch (error) {
      if (uploadId) {
        try { await sendAgentJson(entry, 'files-upload-abort', { uploadId }, 10000); } catch {}
      }
      audit({ type: 'files-upload', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, path: filePath, ok: false, error: String(error.message || error) });
      res.status(error.status === 400 ? 400 : 502).json({ error: String(error.message || error) });
    }
  });

  web.post('/api/servers/:id/files/mkdir', requireAuth, async (req, res) => {
    if (!checkRate(`files-write:${req.user.userId}`, 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many file changes. Wait a moment.' });
    }
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    if (!can(entry, req.user, 'filesWrite')) return res.status(403).json({ error: 'Your role does not allow file changes on this server.' });
    if (entry.connectionMode !== 'agent') return res.status(400).json({ error: 'The server files manager requires Agent mode.' });
    try {
      const dir = normalizeRelativeFilePath(req.body && req.body.path, false);
      await sendAgentJson(entry, 'files-mkdir', { path: dir }, 20000);
      audit({ type: 'files-mkdir', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, path: dir, ok: true });
      res.json({ ok: true, path: dir });
    } catch (error) {
      res.status(error.status === 400 ? 400 : 502).json({ error: String(error.message || error) });
    }
  });

  web.post('/api/servers/:id/files/rename', requireAuth, async (req, res) => {
    if (!checkRate(`files-write:${req.user.userId}`, 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many file changes. Wait a moment.' });
    }
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    if (!can(entry, req.user, 'filesWrite')) return res.status(403).json({ error: 'Your role does not allow file changes on this server.' });
    if (entry.connectionMode !== 'agent') return res.status(400).json({ error: 'The server files manager requires Agent mode.' });
    try {
      const from = normalizeRelativeFilePath(req.body && (req.body.from || req.body.path), false);
      const to = normalizeRelativeFilePath(req.body && (req.body.to || req.body.name), false);
      await sendAgentJson(entry, 'files-rename', { from, to }, 20000);
      audit({ type: 'files-rename', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, from, to, ok: true });
      res.json({ ok: true, from, to });
    } catch (error) {
      res.status(error.status === 400 ? 400 : 502).json({ error: String(error.message || error) });
    }
  });

  web.delete('/api/servers/:id/files', requireAuth, async (req, res) => {
    if (!checkRate(`files-delete:${req.user.userId}`, 60, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many file deletions. Try again later.' });
    }
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    if (!can(entry, req.user, 'filesDelete')) return res.status(403).json({ error: 'Only the server owner can delete files.' });
    if (entry.connectionMode !== 'agent') return res.status(400).json({ error: 'The server files manager requires Agent mode.' });
    try {
      const target = normalizeRelativeFilePath(req.query.path || '', false);
      await sendAgentJson(entry, 'files-delete', { path: target }, 20000);
      audit({ type: 'files-delete', userId: req.user.userId, username: req.user.username, serverId: entry.id, serverName: entry.name, path: target, ok: true });
      res.json({ ok: true, path: target });
    } catch (error) {
      res.status(error.status === 400 ? 400 : 502).json({ error: String(error.message || error) });
    }
  });

  // ---- managed Reclaimer instances ----
  function instanceRouteContext(req, res, permission) {
    const entry = findAccessibleServerById(req.params.id, req.user);
    if (!entry) {
      res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
      return null;
    }
    if (!can(entry, req.user, permission)) {
      res.status(403).json({ error: 'Your role does not allow that instance action on this server.' });
      return null;
    }
    if (entry.connectionMode !== 'agent') {
      res.status(400).json({ error: 'Managed server instances require Agent mode.' });
      return null;
    }
    const live = liveAgents.get(entry.id);
    if (!live || live.socket.readyState !== WebSocket.OPEN) {
      res.status(409).json({ error: 'The agent is offline. Start OmniVaultAgent.exe on the game-server PC.' });
      return null;
    }
    return entry;
  }

  function instanceIdFromParams(req, res) {
    const id = String(req.params.instanceId || '');
    if (!INSTANCE_ID_RE.test(id)) {
      res.status(400).json({ error: 'Choose a valid managed server instance.' });
      return '';
    }
    return id;
  }

  web.get('/api/servers/:id/instances', requireAuth, async (req, res) => {
    if (!checkRate(`instances:${req.user.userId}`, 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many instance requests. Wait a moment.' });
    }
    const entry = instanceRouteContext(req, res, 'instancesView');
    if (!entry) return;
    try {
      const data = await sendAgentJson(entry, 'instances-list', {}, 25000);
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  web.post('/api/servers/:id/instances', requireAuth, async (req, res) => {
    if (!checkRate(`instance-write:${req.user.userId}`, 40, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many instance changes. Try again later.' });
    }
    const entry = instanceRouteContext(req, res, 'instancesCreate');
    if (!entry) return;
    let payload;
    try {
      payload = normalizeInstancePayload(req.body, false);
      payload.start = !(req.body && req.body.start === false);
    } catch (error) {
      return res.status(error.status === 400 ? 400 : 500).json({ error: String(error.message || error) });
    }
    try {
      const data = await sendAgentJson(entry, 'instance-create', payload, 75000);
      audit({ type: 'instance-create', userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceId: data && data.instance ? data.instance.id : null, instanceName: payload.name, ok: true });
      res.json(data);
    } catch (error) {
      audit({ type: 'instance-create', userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceName: payload.name, ok: false, error: String(error.message || error) });
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  web.patch('/api/servers/:id/instances/:instanceId', requireAuth, async (req, res) => {
    if (!checkRate(`instance-write:${req.user.userId}`, 40, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many instance changes. Try again later.' });
    }
    const entry = instanceRouteContext(req, res, 'instancesCreate');
    if (!entry) return;
    const instanceId = instanceIdFromParams(req, res);
    if (!instanceId) return;
    let payload;
    try {
      payload = normalizeInstancePayload(req.body, true);
    } catch (error) {
      return res.status(error.status === 400 ? 400 : 500).json({ error: String(error.message || error) });
    }
    payload.instanceId = instanceId;
    try {
      const data = await sendAgentJson(entry, 'instance-update', payload, 75000);
      audit({ type: 'instance-update', userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceId, ok: true });
      res.json(data);
    } catch (error) {
      audit({ type: 'instance-update', userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceId, ok: false, error: String(error.message || error) });
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  web.post('/api/servers/:id/instances/:instanceId/:operation', requireAuth, async (req, res) => {
    if (!checkRate(`instance-control:${req.user.userId}`, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many instance controls. Wait a moment.' });
    }
    const operation = String(req.params.operation || '');
    if (!['start', 'stop', 'restart'].includes(operation)) {
      return res.status(404).json({ error: 'Instance operation not found.' });
    }
    const entry = instanceRouteContext(req, res, 'instancesControl');
    if (!entry) return;
    const instanceId = instanceIdFromParams(req, res);
    if (!instanceId) return;
    try {
      const data = await sendAgentJson(entry, `instance-${operation}`, { instanceId }, operation === 'stop' ? 25000 : 75000);
      audit({ type: `instance-${operation}`, userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceId, ok: true });
      res.json(data);
    } catch (error) {
      audit({ type: `instance-${operation}`, userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceId, ok: false, error: String(error.message || error) });
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  web.get('/api/servers/:id/instances/:instanceId/status', requireAuth, async (req, res) => {
    if (!checkRate(`instance-status:${req.user.userId}`, 240, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many status requests. Wait a moment.' });
    }
    const entry = instanceRouteContext(req, res, 'instancesView');
    if (!entry) return;
    const instanceId = instanceIdFromParams(req, res);
    if (!instanceId) return;
    try {
      const data = await sendAgentJson(entry, 'instance-status', { instanceId }, 25000);
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  web.get('/api/servers/:id/instances/:instanceId/logs', requireAuth, async (req, res) => {
    if (!checkRate(`instance-logs:${req.user.userId}`, 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many log requests. Wait a moment.' });
    }
    const entry = instanceRouteContext(req, res, 'instancesView');
    if (!entry) return;
    const instanceId = instanceIdFromParams(req, res);
    if (!instanceId) return;
    try {
      const data = await sendAgentJson(entry, 'instance-logs', { instanceId }, 25000);
      if (data && typeof data.text === 'string') data.text = data.text.slice(-24 * 1024);
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  web.delete('/api/servers/:id/instances/:instanceId', requireAuth, async (req, res) => {
    if (!checkRate(`instance-delete:${req.user.userId}`, 20, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many instance deletions. Try again later.' });
    }
    const entry = instanceRouteContext(req, res, 'instancesDelete');
    if (!entry) return;
    const instanceId = instanceIdFromParams(req, res);
    if (!instanceId) return;
    try {
      const data = await sendAgentJson(entry, 'instance-delete', { instanceId }, 30000);
      audit({ type: 'instance-delete', userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceId, ok: true });
      res.json(data);
    } catch (error) {
      audit({ type: 'instance-delete', userId: req.user.userId, username: req.user.username, role: serverRole(entry, req.user), ip: clientIp(req), serverId: entry.id, serverName: entry.name, instanceId, ok: false, error: String(error.message || error) });
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  // ---- map/mode catalog ----
  const catalogCache = new Map();
  const CATALOG_TTL_MS = 5 * 60 * 1000;
  web.get('/api/catalog', requireAuth, async (req, res) => {
    if (!checkRate(`catalog:${req.user.userId}`, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many catalog requests. Wait a moment.' });
    }
    const entry = findAccessibleServer(req.query, req.user);
    if (!entry) return res.status(404).json({ error: 'Server not found on your account or a team you joined.' });
    if (!can(entry, req.user, 'catalog')) {
      return res.status(403).json({ error: 'Your role does not allow map browsing on this server.' });
    }
    const requestedInstanceId = String(req.query.instanceId || '').trim();
    if (requestedInstanceId) {
      if (!INSTANCE_ID_RE.test(requestedInstanceId)) {
        return res.status(400).json({ error: 'Choose a valid managed server instance.' });
      }
      if (entry.connectionMode !== 'agent') {
        return res.status(400).json({ error: 'Managed server instances require Agent mode.' });
      }
      if (!can(entry, req.user, 'instancesView')) {
        return res.status(403).json({ error: 'Your role does not allow access to managed server instances.' });
      }
    }
    if (entry.connectionMode === 'direct' && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Direct RCON is restricted to the panel administrator. Use Agent mode; it needs no port forwarding.' });
    }
    const cacheKey = `${entry.id}:${requestedInstanceId || 'default'}`;
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return res.json(cached.data);
    try {
      let maps;
      let modes;
      if (entry.connectionMode === 'agent') {
        const payload = requestedInstanceId ? { instanceId: requestedInstanceId } : {};
        [maps, modes] = await Promise.all([
          sendAgentCommand(entry, 'maps', payload, 25000),
          sendAgentCommand(entry, 'modes', payload, 25000),
        ]);
      } else {
        const rc = rcon.make(entry, { allowPrivate: req.user.isAdmin });
        [maps, modes] = await Promise.all([rc.maps(), rc.modes()]);
      }
      const data = { maps, modes };
      catalogCache.set(cacheKey, { at: Date.now(), data });
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: String(error.message || error) });
    }
  });

  web.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

  web.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error && error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    if (error && error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    console.error('Unhandled request error:', error);
    res.status(500).json({ error: 'Server error.' });
  });

  const listener = web.listen(PORT, BIND_HOST, () => {
    const address = listener.address();
    const port = address && address.port ? address.port : PORT;
    const localUrl = `http://127.0.0.1:${port}/webpanel/`;
    console.log(`OmniVault panel listening on ${BIND_HOST}:${port}`);
    console.log(`Panel URL: ${localUrl}`);
    if (PUBLIC_MODE) console.log('Public mode: use the Cloudflare Tunnel URL printed by start-public.ps1.');
    if (IS_ELECTRON) {
      electronApp.whenReady().then(() => createWindow(localUrl));
    } else {
      console.log('Electron window API unavailable; open the panel URL in a browser.');
    }
  });

  const agentWss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
  listener.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch {}
    if (pathname !== '/api/agent/socket') {
      socket.destroy();
      return;
    }
    const entry = agentEntryFromToken(bearerToken(request));
    if (!entry) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    agentWss.handleUpgrade(request, socket, head, (ws) => {
      agentWss.emit('connection', ws, request, entry);
    });
  });

  agentWss.on('connection', (ws, request, entry) => {
    if (liveAgents.has(entry.id)) {
      closeLiveAgent(entry.id, 'Replaced by a new agent connection');
    }
    const live = {
      socket: ws,
      serverId: entry.id,
      agentName: entry.agentName || 'OmniVault Agent',
      agentVersion: entry.agentVersion || 'unknown',
      filesEnabled: !!entry.agentFilesEnabled,
      instancesEnabled: !!entry.agentInstancesEnabled,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      pending: new Map(),
    };
    ws.isAlive = true;
    liveAgents.set(entry.id, live);
    updateAgentMeta(entry.id, {
      agentName: live.agentName,
      agentVersion: live.agentVersion,
      agentFilesEnabled: !!live.filesEnabled,
      agentInstancesEnabled: !!live.instancesEnabled,
      agentLastSeen: new Date().toISOString(),
    });
    try {
      ws.send(JSON.stringify({ type: 'welcome', serverId: entry.id, serverName: entry.name }));
    } catch {}

    let heartbeat = null;
    ws.on('pong', () => {
      ws.isAlive = true;
      live.lastSeen = Date.now();
    });
    ws.on('message', (data) => {
      let message = null;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (!message || typeof message !== 'object') return;
      live.lastSeen = Date.now();
      if (message.type === 'hello') {
        if (message.agentName) live.agentName = String(message.agentName).slice(0, 80);
        if (message.agentVersion) live.agentVersion = String(message.agentVersion).slice(0, 32);
        if (typeof message.filesEnabled === 'boolean') live.filesEnabled = message.filesEnabled;
        if (typeof message.instancesEnabled === 'boolean') live.instancesEnabled = message.instancesEnabled;
        updateAgentMeta(entry.id, {
          agentName: live.agentName,
          agentVersion: live.agentVersion,
          agentFilesEnabled: !!live.filesEnabled,
          agentInstancesEnabled: !!live.instancesEnabled,
          agentLastSeen: new Date().toISOString(),
        });
        return;
      }
      if (message.type !== 'result' || !message.id) return;
      const pending = live.pending.get(String(message.id));
      if (!pending) return;
      clearTimeout(pending.timer);
      live.pending.delete(String(message.id));
      if (message.ok) {
        pending.resolve(capAgentResult(message.result));
      } else {
        pending.reject(new Error(String(message.error || 'The agent reported an error.')));
      }
    });
    ws.on('close', () => {
      if (heartbeat) clearInterval(heartbeat);
      if (liveAgents.get(entry.id) !== live) return;
      liveAgents.delete(entry.id);
      rejectAgentPending(live, 'Agent disconnected.');
      updateAgentMeta(entry.id, { agentLastSeen: new Date().toISOString() });
    });
    ws.on('error', () => {});
    heartbeat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    }, 25000);
    if (heartbeat.unref) heartbeat.unref();
  });

  listener.on('error', (error) => {
    console.error('Server error:', error.message);
    if (error.code === 'EADDRINUSE') {
      const message = `Port ${PORT} is already in use. Stop the other panel/Electron instance or set PANEL_PORT.`;
      console.error(message);
      if (IS_ELECTRON) {
        if (electronDialog) electronDialog.showErrorBox('OmniVault panel', message);
        electronApp.quit();
      }
    }
  });
}

loadSessions();

const remotePanelUrl = readRemotePanelUrl();
if (IS_ELECTRON && remotePanelUrl) {
  console.log(`Desktop app connecting to ${remotePanelUrl}`);
  electronApp.whenReady().then(() => createWindow(remotePanelUrl));
  electronApp.on('window-all-closed', () => electronApp.quit());
} else {
  if (remotePanelUrl && !IS_ELECTRON) {
    console.log(`Ignoring panel-url.txt in server mode; starting the local panel instead.`);
  }
  startServer();
  if (IS_ELECTRON) electronApp.on('window-all-closed', () => electronApp.quit());
}
