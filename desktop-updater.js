'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app } = require('electron');

const RELEASE_API_URL = 'https://api.github.com/repos/Lvl52Warlock/OmniVault/releases/latest';
const REQUEST_TIMEOUT_MS = 30 * 1000;
const MAX_REDIRECTS = 6;
const MAX_RELEASE_BYTES = 2 * 1024 * 1024;
const CACHE_MS = 5 * 60 * 1000;

let cachedRelease = null;

function currentVersion() {
  if (app.isPackaged) return cleanVersion(app.getVersion());
  try {
    return cleanVersion(require('./package.json').version);
  } catch {
    return cleanVersion(app.getVersion());
  }
}

function cleanVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function versionParts(value) {
  return cleanVersion(value)
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => {
      const match = String(part).match(/^\d+/);
      return match ? Number(match[0]) : 0;
    });
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    const av = a[index] || 0;
    const bv = b[index] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function pickInstallerAsset(release) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  return assets.find((asset) => /^OmniVault-Setup(?:-\d+\.\d+\.\d+)?\.exe$/i.test(String(asset.name || ''))) || null;
}

function openHttps(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('The update URL is invalid.'));
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error('Updates must use HTTPS.'));
      return;
    }

    const request = https.get(parsed, {
      headers: {
        'User-Agent': `OmniVault-Desktop/${currentVersion()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, (response) => {
      const status = Number(response.statusCode) || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error('The update server redirected too many times.'));
          return;
        }
        let next;
        try {
          next = new URL(response.headers.location, parsed);
        } catch {
          reject(new Error('The update server returned an invalid redirect.'));
          return;
        }
        if (next.protocol !== 'https:') {
          reject(new Error('The update server redirected to an insecure address.'));
          return;
        }
        resolve(openHttps(next.toString(), redirects + 1));
        return;
      }
      resolve(response);
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('The update server timed out.'));
    });
    request.on('error', reject);
  });
}

async function readJson(url) {
  const response = await openHttps(url);
  const status = Number(response.statusCode) || 0;
  if (status === 404) {
    response.resume();
    throw new Error('No published release was found.');
  }
  if (status === 403) {
    response.resume();
    throw new Error('GitHub is rate-limiting update checks. Try again in a few minutes.');
  }
  if (status !== 200) {
    response.resume();
    throw new Error(`GitHub returned HTTP ${status || 'error'} while checking for updates.`);
  }

  let total = 0;
  const chunks = [];
  await new Promise((resolve, reject) => {
    response.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_RELEASE_BYTES) {
        response.destroy(new Error('The release information was too large.'));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', resolve);
    response.on('error', reject);
  });

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('GitHub returned unreadable release information.');
  }
}

async function downloadFile(url, destination, expectedSize, expectedDigest) {
  const response = await openHttps(url);
  const status = Number(response.statusCode) || 0;
  if (status !== 200) {
    response.resume();
    throw new Error(`The update download returned HTTP ${status || 'error'}.`);
  }

  const temp = `${destination}.${process.pid}.download`;
  const hash = crypto.createHash('sha256');
  let bytes = 0;

  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(temp);
      response.on('data', (chunk) => {
        bytes += chunk.length;
        hash.update(chunk);
      });
      response.on('error', reject);
      output.on('error', reject);
      output.on('finish', resolve);
      response.pipe(output);
    });

    if (expectedSize && bytes !== Number(expectedSize)) {
      throw new Error('The update download was incomplete.');
    }

    const digest = `sha256:${hash.digest('hex')}`;
    if (expectedDigest && digest.toLowerCase() !== String(expectedDigest).toLowerCase()) {
      throw new Error('The update download failed its integrity check.');
    }

    fs.renameSync(temp, destination);
    return { path: destination, bytes, digest };
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch {}
    throw error;
  }
}

async function fetchRelease() {
  const release = await readJson(RELEASE_API_URL);
  const asset = pickInstallerAsset(release);
  if (!asset || !asset.browser_download_url) {
    throw new Error('The latest release does not include a Windows installer yet.');
  }

  const latestVersion = cleanVersion(release.tag_name || release.name);
  if (!latestVersion) throw new Error('The latest release has no version tag.');

  return {
    currentVersion: currentVersion(),
    latestVersion,
    available: compareVersions(latestVersion, currentVersion()) > 0,
    releaseUrl: String(release.html_url || 'https://github.com/Lvl52Warlock/OmniVault/releases/latest'),
    publishedAt: release.published_at || null,
    notes: String(release.body || '').slice(0, 6000),
    installerName: String(asset.name),
    installerUrl: String(asset.browser_download_url),
    installerSize: Number(asset.size) || 0,
    installerDigest: asset.digest ? String(asset.digest) : '',
  };
}

async function checkForUpdate(options = {}) {
  const force = options === true || (options && options.force);
  if (!force && cachedRelease && Date.now() - cachedRelease.at < CACHE_MS) {
    return { ...cachedRelease.value, cached: true };
  }

  const result = await fetchRelease();
  cachedRelease = { at: Date.now(), value: result };
  return { ...result, cached: false };
}

async function downloadAndInstall() {
  if (!app.isPackaged) {
    throw new Error('Updates are only available in the installed Windows app.');
  }

  const info = await checkForUpdate({ force: true });
  if (!info.available) {
    return { started: false, version: info.currentVersion, upToDate: true };
  }

  const updateDir = path.join(app.getPath('temp'), 'OmniVault-Update');
  fs.mkdirSync(updateDir, { recursive: true });
  const installerName = info.installerName.replace(/[^A-Za-z0-9._-]/g, '_');
  const installerPath = path.join(updateDir, installerName);

  await downloadFile(info.installerUrl, installerPath, info.installerSize, info.installerDigest);

  const scriptPath = path.join(updateDir, `install-${Date.now()}.cmd`);
  const appPath = process.execPath;
  const script = [
    '@echo off',
    'setlocal',
    'timeout /t 3 /nobreak >nul',
    `start "" /wait "${installerPath}" /S`,
    `start "" "${appPath}"`,
    'del "%~f0" >nul 2>&1',
  ].join('\r\n');
  fs.writeFileSync(scriptPath, `${script}\r\n`, 'utf8');

  const updater = spawn('cmd.exe', ['/d', '/s', '/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  updater.unref();

  setTimeout(() => app.quit(), 800);
  return {
    started: true,
    version: info.latestVersion,
    installerName: info.installerName,
    installerPath,
  };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  compareVersions,
  pickInstallerAsset,
  _downloadFile: downloadFile,
};
