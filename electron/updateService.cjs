/**
 * Check GitHub Releases for a newer IMe Music build and install the Setup.exe.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app, shell } = require('electron');
const { logError } = require('./libraryStore.cjs');

const OWNER = 'snepi';
const REPO = 'ime-music';
const USER_AGENT = 'IMe-Music-Updater';

function normalizeVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/)[0];
}

function parseParts(v) {
  return normalizeVersion(v)
    .split('.')
    .map((p) => parseInt(p, 10) || 0);
}

/** @returns {-1|0|1} */
function compareVersions(a, b) {
  const pa = parseParts(a);
  const pb = parseParts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function pickSetupAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const exes = list.filter((a) => /\.exe$/i.test(a.name || ''));
  const setup =
    exes.find((a) => /setup/i.test(a.name || '')) ||
    exes.find((a) => /installer/i.test(a.name || '')) ||
    null;
  const portable = exes.find((a) => /portable/i.test(a.name || '')) || null;
  return setup || portable || exes[0] || null;
}

async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} [currentVersion]
 */
async function checkForUpdates(currentVersion) {
  const current = normalizeVersion(currentVersion || app.getVersion());
  try {
    const release = await fetchLatestRelease();
    if (release?.draft || release?.prerelease) {
      return {
        ok: true,
        updateAvailable: false,
        currentVersion: current,
        latestVersion: current,
        message: 'no_stable_release',
      };
    }
    const latest = normalizeVersion(release.tag_name || release.name || '');
    if (!latest) {
      return { ok: false, error: 'empty_tag', currentVersion: current };
    }
    const asset = pickSetupAsset(release.assets);
    const newer = compareVersions(latest, current) > 0;
    return {
      ok: true,
      updateAvailable: newer,
      currentVersion: current,
      latestVersion: latest,
      releaseName: release.name || `v${latest}`,
      releaseNotes: String(release.body || '').trim(),
      releaseUrl: release.html_url || `https://github.com/${OWNER}/${REPO}/releases/tag/v${latest}`,
      downloadUrl: asset?.browser_download_url || null,
      downloadName: asset?.name || null,
      downloadSize: asset?.size || null,
    };
  } catch (err) {
    logError('update', 'check failed', err);
    return {
      ok: false,
      error: String(err?.message || err),
      currentVersion: current,
    };
  }
}

/**
 * Download installer and launch it, then quit the app.
 * @param {{ downloadUrl: string, fileName?: string, onProgress?: (p: object) => void }} opts
 */
async function downloadAndInstall(opts) {
  const downloadUrl = opts?.downloadUrl;
  if (!downloadUrl) return { ok: false, error: 'no_url' };

  const fileName =
    opts.fileName ||
    decodeURIComponent(downloadUrl.split('/').pop() || `IMe-Music-Setup.exe`).replace(
      /[^\w.\- ()]/g,
      '_',
    );
  const destDir = path.join(app.getPath('temp'), 'ime-music-updates');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, fileName);

  const emit = (partial) => {
    if (typeof opts.onProgress === 'function') {
      try {
        opts.onProgress(partial);
      } catch {
        /* ignore */
      }
    }
  };

  emit({ phase: 'download', received: 0, total: 0, percent: 0, done: false });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    let res;
    try {
      res = await fetch(downloadUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' },
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);

    const total = Number(res.headers.get('content-length') || 0);
    const reader = res.body?.getReader?.();
    if (!reader) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buf);
      emit({ phase: 'download', received: buf.length, total: buf.length, percent: 100, done: false });
    } else {
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        received += value.length;
        const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
        emit({ phase: 'download', received, total, percent, done: false });
      }
      fs.writeFileSync(destPath, Buffer.concat(chunks));
      emit({
        phase: 'download',
        received,
        total: total || received,
        percent: 100,
        done: false,
      });
    }

    emit({ phase: 'launch', received: 0, total: 0, percent: 100, done: false });

    if (process.platform === 'win32') {
      const child = spawn(destPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
    } else {
      await shell.openPath(destPath);
    }

    setTimeout(() => {
      try {
        app.quit();
      } catch {
        /* ignore */
      }
    }, 600);

    emit({ phase: 'done', received: 0, total: 0, percent: 100, done: true });
    return { ok: true, path: destPath };
  } catch (err) {
    logError('update', 'download/install failed', err);
    emit({
      phase: 'error',
      received: 0,
      total: 0,
      percent: 0,
      done: true,
      error: String(err?.message || err),
    });
    return { ok: false, error: String(err?.message || err) };
  }
}

function getAppVersion() {
  try {
    return normalizeVersion(app.getVersion());
  } catch {
    return '0.0.0';
  }
}

module.exports = {
  OWNER,
  REPO,
  checkForUpdates,
  downloadAndInstall,
  compareVersions,
  getAppVersion,
};
