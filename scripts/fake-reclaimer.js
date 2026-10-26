'use strict';

// Test-only stand-in for the Project Reclaimer dedicated executable. The agent
// treats a .js reclaimer path as a Node script, so this exercises real process
// supervision and RCON without launching Halo during automated tests.

const fs = require('fs');
const net = require('net');
const dgram = require('dgram');

const args = process.argv.slice(2);
const configIndex = args.indexOf('--config');
const configPath = configIndex >= 0 ? args[configIndex + 1] : '';
if (!configPath || !fs.existsSync(configPath)) {
  console.error('fake-reclaimer: missing --config');
  process.exit(2);
}
const config = fs.readFileSync(configPath, 'utf8');
const passwordMatch = config.match(/\[rcon\]\s*\r?\npassword\s*=\s*"((?:[^"\\]|\\.)*)"/);
const portMatch = config.match(/^port\s*=\s*(\d+)\s*$/m);
const password = passwordMatch ? JSON.parse(`"${passwordMatch[1]}"`) : '';
const port = portMatch ? Number(portMatch[1]) : 0;
if (!port) {
  console.error('fake-reclaimer: missing port');
  process.exit(2);
}

console.log(`fake-reclaimer: starting on ${port}`);

function encodePacket(id, type, body) {
  const bodyBuffer = Buffer.from(String(body || ''), 'utf8');
  const buffer = Buffer.alloc(14 + bodyBuffer.length);
  buffer.writeInt32LE(buffer.length - 4, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  bodyBuffer.copy(buffer, 12);
  return buffer;
}

const tcp = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let authed = false;
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
        authed = body === password;
        socket.write(encodePacket(authed ? id : -1, 2, ''));
        continue;
      }
      if (type !== 2 || !authed) continue;
      let reply = `OK: ${body}`;
      if (body === 'status') reply = 'OmniVault Fake Reclaimer\n1/16 players\nRound 1';
      else if (body === 'players') reply = '#0 "TestPlayer" 127.0.0.1:1234';
      else if (body === 'maps') reply = 'Guardian\nSandbox\n';
      else if (body === 'modes') reply = 'Slayer\nCTF\n';
      else if (body === 'endround') reply = 'Round ended';
      else if (body === 'endgame') reply = 'Game ended';
      else if (body.startsWith('say ')) reply = 'Message sent';
      socket.write(encodePacket(id, 0, reply));
      socket.end();
    }
  });
  socket.on('error', () => {});
});

const udp = dgram.createSocket('udp4');
udp.on('error', () => {});

function shutdown() {
  try { tcp.close(); } catch {}
  try { udp.close(); } catch {}
  setTimeout(() => process.exit(0), 50);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

tcp.listen(port, '0.0.0.0', () => {
  udp.bind(port, '0.0.0.0', () => {
    console.log(`fake-reclaimer: listening on ${port}`);
  });
});
