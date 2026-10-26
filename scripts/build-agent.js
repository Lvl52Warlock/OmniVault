'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const agentDir = path.join(root, 'agent');
const distDir = path.join(root, 'agent-dist');
const output = path.join(distDir, 'OmniVaultAgent.exe');
const temporary = path.join(distDir, '.OmniVaultAgent.build.exe');
const pkgBin = path.join(root, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');

const info = JSON.parse(fs.readFileSync(path.join(agentDir, 'package.json'), 'utf8'));
const version = String(info.version || '');

if (!version) {
  console.error('The agent package version is missing.');
  process.exit(1);
}
if (!fs.existsSync(pkgBin)) {
  console.error('The agent packager is not installed. Run npm install in rcon-client first.');
  process.exit(1);
}
if (!fs.existsSync(path.join(agentDir, 'node_modules', 'ws'))) {
  console.error('The agent dependencies are missing. Run npm install in rcon-client/agent first.');
  process.exit(1);
}
if (!fs.existsSync(path.join(agentDir, 'update-public.pem'))) {
  console.error('agent/update-public.pem is missing; the exe could not verify signed updates.');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
try { fs.rmSync(temporary, { force: true }); } catch {}

console.log(`Packaging OmniVault Agent ${version}...`);
const result = spawnSync(
  process.execPath,
  [pkgBin, agentDir, '--target', 'node22-win-x64', '--output', temporary, '--compress', 'GZip'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PKG_CACHE_PATH: path.join(root, '.pkg-cache') },
  },
);
if (result.status !== 0) {
  console.error('Agent packaging failed.');
  process.exit(result.status || 1);
}

const smoke = spawnSync(temporary, ['--version'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 120000,
  windowsHide: true,
});
if (smoke.status !== 0 || String(smoke.stdout || '').trim() !== version) {
  console.error(`The packaged agent did not report version ${version}.`);
  if (smoke.stdout) console.error(smoke.stdout.trim());
  if (smoke.stderr) console.error(smoke.stderr.trim());
  process.exit(1);
}

try { fs.rmSync(output, { force: true }); } catch {}
fs.renameSync(temporary, output);
const data = fs.readFileSync(output);
const sha256 = crypto.createHash('sha256').update(data).digest('hex');
fs.writeFileSync(path.join(distDir, 'OmniVaultAgent.sha256'), `${sha256}  OmniVaultAgent.exe\n`);

console.log('');
console.log(`Built ${output}`);
console.log(`Size: ${(data.length / (1024 * 1024)).toFixed(1)} MB`);
console.log(`SHA-256: ${sha256}`);
