'use strict';

const net = require('net');
const dns = require('dns').promises;

const DEFAULT_TIMEOUT_MS = 8000;
const LOOKUP_TIMEOUT_MS = 5000;
const AUTH_ID = 1;
const COMMAND_ID = 2;

function clean(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function quoteArg(value) {
  const text = clean(value);
  if (!text) return '""';
  return /[\s"]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function encodePacket(id, type, body) {
  const bodyBuffer = Buffer.from(String(body), 'utf8');
  const size = 4 + 4 + bodyBuffer.length + 2;
  const buffer = Buffer.alloc(4 + size);
  buffer.writeInt32LE(size, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  bodyBuffer.copy(buffer, 12);
  return buffer;
}

function decodePackets(buffer) {
  const packets = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = buffer.readInt32LE(offset);
    if (size < 10 || size > 1024 * 1024) break;
    if (buffer.length - offset < 4 + size) break;
    packets.push({
      id: buffer.readInt32LE(offset + 4),
      type: buffer.readInt32LE(offset + 8),
      body: buffer.subarray(offset + 12, offset + 4 + size - 2).toString('utf8'),
    });
    offset += 4 + size;
  }
  return { packets, rest: buffer.subarray(offset) };
}

function ipv4ToNumber(address) {
  return address.split('.').reduce((total, part) => (total * 256) + Number(part), 0);
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const value = ipv4ToNumber(address);
    return (
      value < ipv4ToNumber('1.0.0.0') ||
      (value >= ipv4ToNumber('10.0.0.0') && value <= ipv4ToNumber('10.255.255.255')) ||
      (value >= ipv4ToNumber('100.64.0.0') && value <= ipv4ToNumber('100.127.255.255')) ||
      (value >= ipv4ToNumber('127.0.0.0') && value <= ipv4ToNumber('127.255.255.255')) ||
      (value >= ipv4ToNumber('169.254.0.0') && value <= ipv4ToNumber('169.254.255.255')) ||
      (value >= ipv4ToNumber('172.16.0.0') && value <= ipv4ToNumber('172.31.255.255')) ||
      (value >= ipv4ToNumber('192.0.0.0') && value <= ipv4ToNumber('192.0.0.255')) ||
      (value >= ipv4ToNumber('192.0.2.0') && value <= ipv4ToNumber('192.0.2.255')) ||
      (value >= ipv4ToNumber('192.168.0.0') && value <= ipv4ToNumber('192.168.255.255')) ||
      (value >= ipv4ToNumber('198.18.0.0') && value <= ipv4ToNumber('198.19.255.255')) ||
      (value >= ipv4ToNumber('198.51.100.0') && value <= ipv4ToNumber('198.51.100.255')) ||
      (value >= ipv4ToNumber('203.0.113.0') && value <= ipv4ToNumber('203.0.113.255')) ||
      (value >= ipv4ToNumber('224.0.0.0') && value <= ipv4ToNumber('239.255.255.255')) ||
      value >= ipv4ToNumber('240.0.0.0')
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase().replace(/%.*$/, '');
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('::ffff:')) {
      const tail = normalized.slice('::ffff:'.length);
      if (net.isIPv4(tail)) return isPrivateAddress(tail);
      // IPv4-mapped addresses can also be written in hex, such as
      // ::ffff:7f00:1 for 127.0.0.1. Convert the final 32 bits back to IPv4.
      const parts = normalized.split(':');
      const high = parts[parts.length - 2];
      const low = parts[parts.length - 1];
      if (high && low && /^[0-9a-f]{1,4}$/.test(high) && /^[0-9a-f]{1,4}$/.test(low)) {
        const value = (parseInt(high, 16) * 65536) + parseInt(low, 16);
        const mapped = [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
        return isPrivateAddress(mapped);
      }
      return true;
    }
    // Block loopback/unspecified/compatible, NAT64 and 6to4 transition prefixes,
    // unique-local, link-local, multicast and other non-global ranges.
    if (normalized.startsWith('::')) return true;
    if (/^f[cd]/.test(normalized)) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (/^ff/.test(normalized)) return true;
    if (normalized.startsWith('64:ff9b:')) return true;
    if (normalized.startsWith('2002:')) return true;
    if (normalized.startsWith('2001:0:')) return true;
    return false;
  }
  return true;
}

async function resolveTarget(server, allowPrivate) {
  const host = clean(server && server.host).replace(/^\[|\]$/g, '');
  const port = Number(server && server.port);
  if (!host) throw new Error('RCON host is missing.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RCON port is invalid.');

  const lookupPromise = dns.lookup(host, { all: true, verbatim: true });
  const lookupTimeout = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('RCON host lookup timed out.')), LOOKUP_TIMEOUT_MS);
    if (timer.unref) timer.unref();
  });
  const addresses = await Promise.race([lookupPromise, lookupTimeout]);
  if (!Array.isArray(addresses) || !addresses.length) throw new Error('Could not resolve the RCON host.');

  if (!allowPrivate) {
    const blocked = addresses.find((entry) => isPrivateAddress(entry.address));
    if (blocked) {
      throw new Error('This RCON host is on a private network. Only administrators can connect to local servers.');
    }
  }
  const ordered = addresses.slice().sort((a, b) => (a.family === 4 ? 0 : 1) - (b.family === 4 ? 0 : 1));
  return { address: ordered[0].address, port };
}

function execute(server, command, options = {}) {
  const allowPrivate = !!options.allowPrivate;
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  // Do not trim the RCON password: leading/trailing spaces can be meaningful.
  const password = server && server.password != null ? String(server.password) : '';
  const commandBody = clean(command);
  if (!commandBody) return Promise.reject(new Error('RCON command is empty.'));

  return resolveTarget(server, allowPrivate).then((target) => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: target.address, port: target.port });
    let buffer = Buffer.alloc(0);
    let authed = false;
    let commandSent = false;
    let output = '';
    let settled = false;
    let quietTimer = null;
    let totalTimer = null;
    let authTimer = null;

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(totalTimer);
      clearTimeout(authTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve(String(value || '').trim());
    }

    totalTimer = setTimeout(() => finish(new Error('RCON connection timed out.')), timeoutMs);
    authTimer = setTimeout(() => {
      if (!authed) finish(new Error('RCON authentication timed out.'));
    }, Math.min(timeoutMs, 5000));

    socket.setNoDelay(true);
    socket.on('connect', () => {
      socket.write(encodePacket(AUTH_ID, 3, password));
    });
    socket.on('error', (error) => {
      if (error && error.code === 'ECONNREFUSED') {
        finish(new Error('RCON connection refused. Check the host, port and firewall.'));
      } else {
        finish(new Error(error && error.message ? error.message : 'RCON connection failed.'));
      }
    });
    socket.on('close', () => {
      if (settled) return;
      if (authed && commandSent) finish(null, output);
      else finish(new Error('RCON connection closed before a response was received.'));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = decodePackets(buffer);
      buffer = parsed.rest;
      for (const packet of parsed.packets) {
        if (!authed) {
          if (packet.type === 2) {
            if (packet.id === -1) {
              finish(new Error('RCON authentication failed. Check the RCON password.'));
              return;
            }
            authed = true;
            clearTimeout(authTimer);
            if (!commandSent) {
              commandSent = true;
              socket.write(encodePacket(COMMAND_ID, 2, commandBody));
            }
          }
          continue;
        }
        if (packet.id !== COMMAND_ID || packet.type !== 0) continue;
        if (packet.body) output += packet.body;
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(null, output), 250);
      }
    });
  }));
}

function make(server, options = {}) {
  const allowPrivate = !!options.allowPrivate;
  const run = (command, timeoutMs) => execute(server, command, { allowPrivate, timeoutMs });
  return {
    status: () => run('status', 6000),
    players: () => run('players', 6000),
    say: (text) => run(`say ${clean(text)}`),
    kick: (player, reason) => run(`kick ${quoteArg(player)}${reason ? ` ${clean(reason)}` : ''}`),
    ban: (player, time, reason) => run(`ban ${quoteArg(player)}${time ? ` ${quoteArg(time)}` : ''}${reason ? ` ${clean(reason)}` : ''}`),
    unban: (target) => run(`unban ${quoteArg(target)}`),
    map: (mapReference, mode) => mode
      ? run(`load ${quoteArg(mapReference)} ${quoteArg(mode)}`, 12000)
      : run(`map ${quoteArg(mapReference)}`, 12000),
    load: (mapReference, mode) => run(`load ${quoteArg(mapReference)}${mode ? ` ${quoteArg(mode)}` : ''}`, 12000),
    nextmap: (mapReference, mode) => run(`nextmap${mapReference ? ` ${quoteArg(mapReference)}${mode ? ` ${quoteArg(mode)}` : ''}` : ''}`, 12000),
    maps: () => run('maps', 15000),
    modes: () => run('modes', 15000),
    endround: () => run('endround', 12000),
    endgame: () => run('endgame', 12000),
  };
}

module.exports = {
  execute,
  make,
  isPrivateAddress,
  resolveTarget,
};
