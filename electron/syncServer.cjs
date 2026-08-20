const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { URL } = require('url');

const DEFAULT_PORT = 47832;
const SESSION_TTL_MS = 30 * 60 * 1000;

function trackFingerprint(song) {
  const artist = String(song.artist || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const title = String(song.title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const duration = Math.round(Number(song.duration) || 0);
  const fileSize = Number(song.fileSize) || 0;
  return `${artist}::${title}::${duration}::${fileSize}`;
}

function listLanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets || {})) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal) continue;
      out.push({ address: net.address, iface: name });
    }
  }
  return out;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function createSyncServer({ getTracks, getTrackById, onEvent }) {
  /** @type {import('http').Server | null} */
  let server = null;
  /** @type {null | {
   *   token: string,
   *   port: number,
   *   startedAt: number,
   *   expiresAt: number,
   *   transferredBytes: number,
   *   transferredFiles: number,
   *   lastClient: string | null,
   * }} */
  let session = null;

  const emit = (type, payload = {}) => {
    try {
      onEvent?.({ type, ...payload, session: getPublicStatus() });
    } catch {
      /* ignore */
    }
  };

  function getPublicStatus() {
    if (!session || !server) {
      return { active: false };
    }
    const lan = listLanAddresses();
    const primary = lan[0]?.address || '127.0.0.1';
    return {
      active: true,
      token: session.token,
      port: session.port,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      transferredBytes: session.transferredBytes,
      transferredFiles: session.transferredFiles,
      lastClient: session.lastClient,
      lanAddresses: lan.map((x) => x.address),
      joinUrl: `http://${primary}:${session.port}/sync/join?t=${session.token}`,
    };
  }

  function assertToken(req, url) {
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      stop();
      return false;
    }
    const auth = String(req.headers.authorization || '');
    const headerToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const queryToken = url.searchParams.get('t') || url.searchParams.get('token') || '';
    const token = headerToken || queryToken;
    return token && token === session.token;
  }

  async function handleOffer(req, res) {
    if (!session) {
      sendJson(res, 503, { ok: false, error: 'no_session' });
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad_json' });
      return;
    }
    if (body.token && body.token !== session.token) {
      sendJson(res, 401, { ok: false, error: 'bad_token' });
      return;
    }
    const known = new Set(
      (Array.isArray(body.fingerprints) ? body.fingerprints : []).map((f) => String(f)),
    );
    session.lastClient = String(body.deviceName || body.clientId || 'phone');
    const tracks = getTracks() || [];
    const missing = [];
    let totalBytes = 0;
    for (const song of tracks) {
      if (!song?.id || !song.filePath) continue;
      try {
        if (!fs.existsSync(song.filePath)) continue;
      } catch {
        continue;
      }
      const fp = trackFingerprint(song);
      if (known.has(fp)) continue;
      const size = Number(song.fileSize) || safeStatSize(song.filePath);
      missing.push({
        id: song.id,
        fingerprint: fp,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        fileSize: size,
        format: song.format,
        liked: Boolean(song.liked),
      });
      totalBytes += size;
    }
    emit('offer', { missingCount: missing.length, totalBytes });
    sendJson(res, 200, {
      ok: true,
      missing,
      totalBytes,
      trackCount: tracks.length,
      expiresAt: session.expiresAt,
    });
  }

  function safeStatSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  function handleFile(req, res, trackId) {
    if (!session) {
      sendJson(res, 503, { ok: false, error: 'no_session' });
      return;
    }
    const song = getTrackById(trackId);
    if (!song?.filePath || !fs.existsSync(song.filePath)) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    const stat = fs.statSync(song.filePath);
    const ext = path.extname(song.filePath) || `.${song.format || 'mp3'}`;
    const fileName = `${song.artist || 'Unknown'} - ${song.title || trackId}${ext}`.replace(
      /[<>:"/\\|?*\u0000-\u001f]/g,
      '_',
    );
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Access-Control-Allow-Origin': '*',
      'X-Track-Id': song.id,
      'X-Track-Fingerprint': trackFingerprint(song),
    });
    const stream = fs.createReadStream(song.filePath);
    stream.on('data', (chunk) => {
      if (session) session.transferredBytes += chunk.length;
    });
    stream.on('end', () => {
      if (session) {
        session.transferredFiles += 1;
        emit('file', { trackId: song.id, bytes: stat.size });
      }
    });
    stream.on('error', () => {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    });
    stream.pipe(res);
  }

  function handleCover(req, res, trackId) {
    const song = getTrackById(trackId);
    if (!song?.coverPath || !fs.existsSync(song.coverPath)) {
      sendJson(res, 404, { ok: false, error: 'no_cover' });
      return;
    }
    const ext = path.extname(song.coverPath).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const stat = fs.statSync(song.coverPath);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(song.coverPath).pipe(res);
  }

  async function onRequest(req, res) {
    const host = req.headers.host || `127.0.0.1:${session?.port || DEFAULT_PORT}`;
    let url;
    try {
      url = new URL(req.url || '/', `http://${host}`);
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad_url' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }

    if (url.pathname === '/sync/info' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        app: 'IMe Music',
        protocol: 1,
        active: Boolean(session),
        expiresAt: session?.expiresAt || null,
      });
      return;
    }

    if (url.pathname === '/sync/join' && req.method === 'GET') {
      // Human-friendly landing for scanners / browsers
      const ok = assertToken(req, url);
      const html = `<!doctype html><html lang="ru"><meta charset="utf-8"/>
<title>IMe Sync</title>
<body style="font-family:system-ui;background:#111;color:#eee;padding:24px">
<h1>IMe Music — синхронизация</h1>
<p>${ok ? 'Сессия активна. Откройте приложение IMe на телефоне и продолжите приём.' : 'Сессия недействительна или истекла. Запустите синк заново на ПК.'}</p>
<p style="opacity:.7;font-size:13px">Протокол v1 · только новые файлы</p>
</body></html>`;
      res.writeHead(ok ? 200 : 410, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(html);
      return;
    }

    const needsAuth =
      url.pathname === '/sync/offer' ||
      url.pathname.startsWith('/sync/file/') ||
      url.pathname.startsWith('/sync/cover/') ||
      url.pathname === '/sync/done';

    if (needsAuth && !assertToken(req, url)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }

    if (url.pathname === '/sync/offer' && req.method === 'POST') {
      await handleOffer(req, res);
      return;
    }

    if (url.pathname.startsWith('/sync/file/') && req.method === 'GET') {
      const id = decodeURIComponent(url.pathname.slice('/sync/file/'.length));
      handleFile(req, res, id);
      return;
    }

    if (url.pathname.startsWith('/sync/cover/') && req.method === 'GET') {
      const id = decodeURIComponent(url.pathname.slice('/sync/cover/'.length));
      handleCover(req, res, id);
      return;
    }

    if (url.pathname === '/sync/done' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        emit('done', { received: Number(body.received) || 0 });
      } catch {
        /* ignore */
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not_found' });
  }

  function start(preferredPort = DEFAULT_PORT) {
    if (server) {
      return Promise.resolve(getPublicStatus());
    }
    return new Promise((resolve, reject) => {
      const token = crypto.randomBytes(24).toString('hex');
      const startedAt = Date.now();
      const tryListen = (port, attemptsLeft) => {
        const s = http.createServer((req, res) => {
          void onRequest(req, res).catch((err) => {
            sendJson(res, 500, { ok: false, error: String(err?.message || err) });
          });
        });
        s.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
            tryListen(port + 1, attemptsLeft - 1);
            return;
          }
          reject(err);
        });
        s.listen(port, '0.0.0.0', () => {
          server = s;
          session = {
            token,
            port,
            startedAt,
            expiresAt: startedAt + SESSION_TTL_MS,
            transferredBytes: 0,
            transferredFiles: 0,
            lastClient: null,
          };
          emit('started');
          resolve(getPublicStatus());
        });
      };
      tryListen(preferredPort, 20);
    });
  }

  function stop() {
    const had = Boolean(session);
    if (server) {
      try {
        server.close();
      } catch {
        /* ignore */
      }
    }
    server = null;
    session = null;
    if (had) emit('stopped');
    return { ok: true, active: false };
  }

  return {
    start,
    stop,
    status: getPublicStatus,
    trackFingerprint,
    listLanAddresses,
  };
}

module.exports = {
  createSyncServer,
  trackFingerprint,
  listLanAddresses,
  DEFAULT_PORT,
  SESSION_TTL_MS,
};
