const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { app } = require('electron');
const db = require('./database.cjs');
const { logError } = require('./libraryStore.cjs');
const { parseSongFile, normalizePath, AUDIO_EXTENSIONS, downloadCoverFromUrl } = require('./importService.cjs');

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtu.be', 'music.youtube.com']);
const DOWNLOAD_MEDIA_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, 'mp4', 'mkv', 'mov']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isImportAborted(signal, err) {
  return Boolean(signal?.aborted || err?.code === 'YTDLP_ABORTED');
}

function finalizeCancelledImport(result, emit) {
  result.cancelled = true;
  result.done = true;
  result.phase = undefined;
  result.downloadPercent = undefined;
  result.statusMessage = 'Отменено';
  emit();
  return result;
}

function ytDlpSpawnEnv() {
  return {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
  };
}

/** App setting first, then standard proxy env vars (VPN clients sometimes set these). */
function resolveEffectiveProxy(settings) {
  const configured = String(settings?.ytdlpProxy || '').trim();
  if (configured) return configured;
  for (const key of ['ALL_PROXY', 'all_proxy', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function noteProxyStatus(result, settings, emit) {
  const proxy = resolveEffectiveProxy(settings);
  const configured = String(settings?.ytdlpProxy || '').trim();
  if (configured) {
    result.statusMessage = 'Скачивание через прокси VPN…';
  } else if (proxy) {
    result.statusMessage = 'Скачивание через системный прокси…';
  } else {
    result.statusMessage =
      'Прокси не указан. VPN на компьютере может работать, но для надёжности укажите локальный прокси VPN в Настройках → Инструменты…';
  }
  emit();
  return proxy;
}

function downloadsDir() {
  return path.join(app.getPath('userData'), 'downloads');
}

function isAudioFile(filePath) {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

function validateYouTubeUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Введите ссылку на видео YouTube' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: 'Некорректная ссылка' };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) {
    return { ok: false, message: 'Поддерживаются только ссылки YouTube (youtube.com, youtu.be)' };
  }

  if (parsed.pathname.startsWith('/playlist') && parsed.searchParams.has('list')) {
    return {
      ok: false,
      message: 'Плейлисты пока не поддерживаются — вставьте ссылку на одно видео',
    };
  }

  if (host === 'youtu.be') {
    const videoId = parsed.pathname.slice(1).split('/')[0];
    if (!videoId || videoId.length < 6) {
      return { ok: false, message: 'Не удалось определить видео по ссылке' };
    }
    return { ok: true, url: buildWatchUrl(videoId), videoId, originalUrl: trimmed };
  }

  if (parsed.pathname === '/watch' || parsed.pathname.startsWith('/watch/')) {
    const videoId = parsed.searchParams.get('v');
    if (!videoId) {
      return { ok: false, message: 'Не удалось определить видео по ссылке' };
    }
    return { ok: true, url: buildWatchUrl(videoId), videoId, originalUrl: trimmed };
  }

  return { ok: false, message: 'Поддерживается только ссылка на одно видео' };
}

function expandYtDlpCandidates(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return [];

  const out = [trimmed];
  try {
    if (fs.existsSync(trimmed)) {
      const stat = fs.statSync(trimmed);
      if (stat.isDirectory()) {
        out.push(path.join(trimmed, 'yt-dlp.exe'));
        out.push(path.join(trimmed, 'yt-dlp'));
      }
    } else if (!path.extname(trimmed)) {
      out.push(`${trimmed}.exe`);
    }
  } catch {
    /* ignore */
  }
  return [...new Set(out.map((p) => path.normalize(p)))];
}

function resolveYtDlp(settings) {
  const candidates = [];
  if (settings?.ytdlpPath) {
    candidates.push(...expandYtDlpCandidates(settings.ytdlpPath));
  }
  candidates.push('yt-dlp', 'yt-dlp.exe');

  for (const bin of candidates) {
    if (!bin) continue;
    try {
      if (!fs.existsSync(bin) && !bin.includes(path.sep) && !bin.includes('/') && !bin.includes('\\')) {
        // Bare command name — let the shell resolve via PATH.
      } else if (!fs.existsSync(bin)) {
        continue;
      }
      const result = spawnSync(bin, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
      });
      if (result.status === 0) return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

function findExistingDownload(destDir, videoId) {
  return findLooseDownload(destDir, videoId);
}

function buildSearchQueries(title, artist) {
  const t = String(title || '').trim();
  const a = String(artist || '').trim();
  const sensitiveArtist = isSensitiveSearchTerm(a);
  const queries = [];

  if (a && t && !sensitiveArtist) {
    queries.push(`${a} - ${t}`, `${a} ${t}`, `${t} ${a}`);
  }

  if (t) {
    if (sensitiveArtist) {
      queries.push(`${t} punk`, `${t} official audio`, `${t} official`, `${t} live`, t);
    } else if (a) {
      queries.push(`${t} ${a}`, t);
    } else {
      queries.push(t);
    }
  } else if (a && !sensitiveArtist) {
    queries.push(a);
  }

  return [...new Set(queries.filter(Boolean))];
}

function buildWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function buildWishlistSearchQuery(title, artist) {
  const t = String(title || '').trim();
  const a = String(artist || '').trim();
  if (!t && !a) return '';
  if (!a) return t;
  if (!t) return a;
  return `${a} - ${t}`;
}

function validateSearchImport(title, artist) {
  const queries = buildSearchQueries(title, artist);
  if (queries.length === 0) {
    return { ok: false, message: 'Укажите название и исполнителя' };
  }
  const label = buildWishlistSearchQuery(title, artist);
  if (label.length > 240) {
    return { ok: false, message: 'Слишком длинный запрос для поиска' };
  }
  return { ok: true, queries, label };
}

function isSensitiveSearchTerm(text) {
  const lower = String(text || '').toLowerCase();
  return (
    /(?:^|\s|[^\p{L}])(?:порно|porno|sex|xxx)(?:$|\s|[^\p{L}])/iu.test(lower) ||
    /\b(?:fuck|shit|bitch|porn)\b/i.test(lower)
  );
}

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTokens(text) {
  return normalizeForMatch(text)
    .split(' ')
    .filter((t) => t.length >= 2)
    .filter((t) => !['the', 'a', 'an', 'feat', 'ft', 'vs', 'and', 'и'].includes(t));
}

function tokenCoverage(haystack, needleTokens) {
  if (!needleTokens.length) return 1;
  const hit = needleTokens.filter((tok) => haystack.includes(tok)).length;
  return hit / needleTokens.length;
}

/**
 * Rank a YouTube search hit for the requested track.
 * Higher is better; below ~35 is treated as unreliable.
 */
function scoreSearchResult(result, { title, artist }) {
  const resultTitle = typeof result === 'string' ? result : result?.title || '';
  const channel = normalizeForMatch(
    (typeof result === 'object' && (result.channel || result.uploader)) || '',
  );
  const rt = normalizeForMatch(resultTitle);
  const t = normalizeForMatch(title);
  const a = normalizeForMatch(artist);
  const titleTokens = matchTokens(title);
  const artistTokens = matchTokens(artist);

  if (!t && !a) return -999;
  if (!rt) return -999;

  const titleCov = tokenCoverage(rt, titleTokens);
  // Title barely present → almost certainly wrong track
  if (titleTokens.length >= 2 && titleCov < 0.55) return -120;
  if (titleTokens.length === 1 && titleCov < 1) return -80;

  let score = 15 + titleCov * 45;
  if (t && rt.includes(t)) score += 28;

  // Artist must show up in title or channel when we know it
  if (a) {
    const artistInTitle = rt.includes(a) || tokenCoverage(rt, artistTokens) >= 0.6;
    const artistInChannel = channel.includes(a) || tokenCoverage(channel, artistTokens) >= 0.6;
    if (artistInTitle || artistInChannel) {
      score += artistInTitle && artistInChannel ? 50 : 38;
    } else if (artistTokens.length) {
      const soft = tokenCoverage(`${rt} ${channel}`, artistTokens);
      if (soft >= 0.4) score += 12;
      else score -= 55; // different artist → strong penalty
    }
  }

  // Prefer official / topic / audio uploads
  if (/\btopic\b|vevo|official\s+artist/i.test(channel)) score += 22;
  if (/\bofficial\s+audio\b/i.test(resultTitle)) score += 28;
  if (/\bofficial\s+(music\s+)?video\b/i.test(resultTitle)) score += 12;
  if (/\b(audio|lyrics?)\b/i.test(resultTitle)) score += 8;

  const wantRemix = /\bremix\b/i.test(title);
  const wantLive = /\blive\b/i.test(title);
  const wantCover = /\bcover\b/i.test(title);
  const wantKaraoke = /\bkaraoke\b/i.test(title);

  const penalties = [
    [/\bkaraoke\b/i, 55, wantKaraoke],
    [/\bnightcore\b/i, 50, false],
    [/\b(slowed|reverb|sped\s*up|speed\s*up|speedup)\b/i, 45, false],
    [/\b(8d\s*audio|bass\s*boosted|earrape)\b/i, 40, false],
    [/\breaction\b/i, 55, false],
    [/\b(fan\s*made|fanmade|ai\s*cover)\b/i, 40, false],
    [/\bcover\b/i, 38, wantCover],
    [/\bremix\b/i, 30, wantRemix],
    [/\blive\s*(at|from|in|performance|session|concert)\b/i, 25, wantLive],
    [/\b(1\s*hour|10\s*hours|full\s*album|\bmix\b|mashup|medley)\b/i, 45, false],
    [/\b(tutorial|lesson|how\s*to|guitar\s*tab)\b/i, 50, false],
  ];
  for (const [re, pen, allowed] of penalties) {
    if (!allowed && re.test(resultTitle)) score -= pen;
  }

  const dur = Number(typeof result === 'object' ? result.duration : 0) || 0;
  if (dur > 0) {
    if (dur >= 80 && dur <= 540) score += 16;
    else if (dur < 40) score -= 35;
    else if (dur > 900) score -= 45;
    else if (dur > 600) score -= 20;
  }

  return score;
}

function parseYtDlpError(stderr, stdout, { phase = 'download', hasProxy = false } = {}) {
  const text = `${stderr || ''}\n${stdout || ''}`.trim();
  if (!text) {
    if (phase === 'search') {
      return hasProxy
        ? 'YouTube не ответил на поиск. Проверьте прокси в Настройках → Инструменты и попробуйте снова.'
        : 'YouTube не ответил на поиск. VPN на компьютере не передаётся в yt-dlp автоматически — если ошибка повторяется, укажите локальный прокси из настроек VPN в Настройках → Инструменты (например socks5://127.0.0.1:1080).';
    }
    return hasProxy
      ? 'Не удалось скачать аудио. Проверьте прокси в Настройках и обновите yt-dlp.'
      : 'Не удалось скачать аудио. Если VPN включён, но ошибка повторяется — укажите локальный прокси VPN в Настройках → Инструменты.';
  }
  if (/Connection aborted|ConnectionResetError|10054|TransportError/i.test(text)) {
    return (
      'Не удалось подключиться к YouTube. В России YouTube заблокирован — ' +
      'включите VPN и укажите прокси в Настройках (например socks5://127.0.0.1:1080).'
    );
  }
  if (/video unavailable|private video|sign in/i.test(text)) {
    return 'Видео недоступно или требует авторизации';
  }
  if (/HTTP Error 403|403 Forbidden/i.test(text)) {
    return 'Доступ к видео запрещён. Обновите yt-dlp до последней версии';
  }
  if (/Unsupported URL|Unsupported url/i.test(text)) {
    return 'Ссылка не поддерживается';
  }
  if (/network|timed out|Unable to download/i.test(text)) {
    return 'Ошибка сети при скачивании. Проверьте интернет';
  }
  const line = text.split('\n').find((l) => l.trim() && !l.startsWith('[')) || text;
  return line.slice(0, 240);
}

function searchFirstVideoIdAsync(ytDlpBin, query, { signal, proxy, limit = 1 } = {}) {
  const searchUrl = `ytsearch${Math.max(1, Math.min(15, limit))}:${query}`;
  const args = [
    '--no-playlist',
    '--ignore-config',
    '--flat-playlist',
    '--extractor-args',
    'youtube:player_client=android,web',
    '--print',
    'id',
    '--socket-timeout',
    '30',
    '--retries',
    '3',
    '--',
    searchUrl,
  ];

  const proxyTrimmed = String(proxy || '').trim();
  if (proxyTrimmed) {
    args.splice(args.length - 2, 0, '--proxy', proxyTrimmed);
  }

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      fn(value);
    };

    const child = spawn(ytDlpBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: ytDlpSpawnEnv(),
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    const abortHandler = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      finish(reject, Object.assign(new Error('Поиск отменён'), { code: 'YTDLP_ABORTED' }));
    };

    if (signal?.aborted) {
      abortHandler();
      return;
    }
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });

    child.on('error', (err) => {
      logError('youtube-import', 'yt-dlp search spawn failed', { ytDlpBin, query, err });
      finish(reject, err);
    });

    child.on('close', (code) => {
      const videoId = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && /^[\w-]{6,}$/.test(line));

      if (videoId) {
        finish(resolve, videoId);
        return;
      }

      logError('youtube-import', 'yt-dlp search returned no video id', {
        code,
        query,
        stdout: stdout.slice(-400),
        stderr: stderr.slice(-800),
      });
      const detail = parseYtDlpError(stderr, stdout, {
        phase: 'search',
        hasProxy: Boolean(proxyTrimmed),
      });
      finish(
        reject,
        Object.assign(new Error(detail || 'Не удалось найти видео на YouTube'), {
          code: code === 0 ? 'YTDLP_NO_SEARCH' : 'YTDLP_SEARCH_FAILED',
        }),
      );
    });
  });
}

/** Returns video ids only (no title parsing — avoids Windows encoding issues). */
function searchVideoIdsAsync(ytDlpBin, query, { signal, proxy, limit = 8 } = {}) {
  const searchUrl = `ytsearch${Math.max(1, Math.min(15, limit))}:${query}`;
  const args = [
    '--no-playlist',
    '--ignore-config',
    '--flat-playlist',
    '--extractor-args',
    'youtube:player_client=android,web',
    '--print',
    'id',
    '--socket-timeout',
    '30',
    '--retries',
    '3',
    '--',
    searchUrl,
  ];

  const proxyTrimmed = String(proxy || '').trim();
  if (proxyTrimmed) {
    args.splice(args.length - 2, 0, '--proxy', proxyTrimmed);
  }

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      fn(value);
    };

    const child = spawn(ytDlpBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: ytDlpSpawnEnv(),
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    const abortHandler = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      finish(reject, Object.assign(new Error('Поиск отменён'), { code: 'YTDLP_ABORTED' }));
    };

    if (signal?.aborted) {
      abortHandler();
      return;
    }
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });

    child.on('error', (err) => {
      finish(reject, err);
    });

    child.on('close', (code) => {
      const ids = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && /^[\w-]{6,}$/.test(line));

      if (ids.length > 0) {
        finish(resolve, ids);
        return;
      }

      const detail = parseYtDlpError(stderr, stdout, {
        phase: 'search',
        hasProxy: Boolean(proxyTrimmed),
      });
      finish(
        reject,
        Object.assign(new Error(detail || 'Не удалось найти видео на YouTube'), {
          code: code === 0 ? 'YTDLP_NO_SEARCH' : 'YTDLP_SEARCH_FAILED',
        }),
      );
    });
  });
}

function searchYouTubeVideosAsync(ytDlpBin, query, { signal, proxy, limit = 8 } = {}) {
  const searchUrl = `ytsearch${Math.max(1, Math.min(15, limit))}:${query}`;
  const args = [
    '--no-playlist',
    '--ignore-config',
    '--flat-playlist',
    '--extractor-args',
    'youtube:player_client=android,web',
    '--print',
    '%(id)s||%(title)s||%(duration)s||%(channel)s||%(uploader)s',
    '--socket-timeout',
    '30',
    '--retries',
    '3',
    '--',
    searchUrl,
  ];

  const proxyTrimmed = String(proxy || '').trim();
  if (proxyTrimmed) {
    args.splice(args.length - 2, 0, '--proxy', proxyTrimmed);
  }

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      fn(value);
    };

    const child = spawn(ytDlpBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: ytDlpSpawnEnv(),
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    const abortHandler = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      finish(reject, Object.assign(new Error('Поиск отменён'), { code: 'YTDLP_ABORTED' }));
    };

    if (signal?.aborted) {
      abortHandler();
      return;
    }
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });

    child.on('error', (err) => {
      logError('youtube-import', 'yt-dlp search spawn failed', { ytDlpBin, query, err });
      finish(reject, err);
    });

    child.on('close', (code) => {
      const results = [];
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('||');
        const id = (parts[0] || '').trim();
        const title = (parts[1] || '').trim();
        const duration = Number(parts[2]) || 0;
        const channel = (parts[3] || parts[4] || '').trim();
        const uploader = (parts[4] || '').trim();
        if (id && /^[\w-]{6,}$/.test(id)) {
          results.push({
            id,
            title: title || id,
            duration,
            channel: channel || uploader,
            uploader,
          });
        }
      }

      if (results.length > 0) {
        finish(resolve, results);
        return;
      }

      logError('youtube-import', 'yt-dlp search returned no results', {
        code,
        query,
        stdout: stdout.slice(-400),
        stderr: stderr.slice(-800),
      });
      const detail = parseYtDlpError(stderr, stdout, {
        phase: 'search',
        hasProxy: Boolean(proxyTrimmed),
      });
      finish(
        reject,
        Object.assign(new Error(detail || 'Не удалось найти видео на YouTube'), {
          code: code === 0 ? 'YTDLP_NO_SEARCH' : 'YTDLP_SEARCH_FAILED',
        }),
      );
    });
  });
}

async function searchFirstVideoIdWithRetry(ytDlpBin, query, options, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await searchFirstVideoIdAsync(ytDlpBin, query, options);
    } catch (err) {
      lastError = err;
      if (err?.code !== 'YTDLP_NO_SEARCH' || attempt >= attempts) break;
      await sleep(1200 * attempt);
    }
  }
  throw lastError || Object.assign(new Error('Не удалось найти видео на YouTube'), { code: 'YTDLP_NO_SEARCH' });
}

async function searchSensitiveArtistVideo(ytDlpBin, title, artist, options) {
  const t = String(title || '').trim();
  if (!t) return null;

  const fallbackQueries = [`${t} official audio`, `${t} punk`, `${t} official`, t];
  let best = null;
  for (const query of fallbackQueries) {
    try {
      const results = await searchYouTubeVideosAsync(ytDlpBin, query, { ...options, limit: 10 });
      for (const row of results) {
        const score = scoreSearchResult(row, { title, artist });
        if (!best || score > best.score) best = { id: row.id, score, title: row.title };
      }
      if (best && best.score >= 70) return best.id;
    } catch {
      /* try next query */
    }
  }

  return best && best.score >= 30 ? best.id : null;
}

async function resolveSearchVideoAsync(ytDlpBin, title, artist, { signal, proxy } = {}) {
  const baseQueries = buildSearchQueries(title, artist);
  const extra = [];
  const t = String(title || '').trim();
  const a = String(artist || '').trim();
  if (a && t) {
    extra.push(`${a} - ${t} official audio`, `${a} ${t} official audio`, `"${a}" "${t}"`);
  } else if (t) {
    extra.push(`${t} official audio`);
  }
  const queries = [...new Set([...extra, ...baseQueries].filter(Boolean))];
  const hasProxy = Boolean(String(proxy || '').trim());
  const sensitive = isSensitiveSearchTerm(artist);
  let lastError = null;
  let best = null;

  const considerResults = (results, query) => {
    for (const row of results) {
      const score = scoreSearchResult(row, { title, artist });
      if (!best || score > best.score) {
        best = {
          id: row.id,
          score,
          title: row.title,
          channel: row.channel,
          query,
        };
      }
    }
  };

  for (const query of queries) {
    if (signal?.aborted) {
      throw Object.assign(new Error('Поиск отменён'), { code: 'YTDLP_ABORTED' });
    }
    try {
      const results = await searchYouTubeVideosAsync(ytDlpBin, query, {
        signal,
        proxy,
        limit: 10,
      });
      considerResults(results, query);
      // Strong match — no need to try weaker queries
      if (best && best.score >= 95) break;
    } catch (err) {
      lastError = err;
      if (err?.code === 'YTDLP_ABORTED') throw err;
    }
  }

  if (sensitive && (!best || best.score < 50)) {
    try {
      const picked = await searchSensitiveArtistVideo(ytDlpBin, title, artist, { signal, proxy });
      if (picked) {
        // Keep scored best if better; otherwise use sensitive fallback id
        if (!best || best.score < 50) return picked;
      }
    } catch (err) {
      lastError = err;
    }
  }

  const minScore = a ? 40 : 30;
  if (best && best.score >= minScore) {
    logError('youtube-import', 'Search pick', {
      title,
      artist,
      pickedId: best.id,
      pickedTitle: best.title,
      score: best.score,
      query: best.query,
    });
    return best.id;
  }

  let message =
    lastError?.message ||
    'Не удалось уверенно найти нужный трек на YouTube (похожие названия дают чужие видео).';
  message +=
    ' Лучше вставьте прямую ссылку через «Добавить с YouTube», либо уточните название/исполнителя.';
  if (sensitive) {
    message +=
      ' YouTube часто блокирует поиск по этому исполнителю — прямая ссылка надёжнее.';
  }
  if (best) {
    message += ` Лучший кандидат набрал мало очков (${Math.round(best.score)}): «${best.title}».`;
  }
  throw Object.assign(new Error(message), {
    code: 'YTDLP_NO_SEARCH',
    hasProxy,
  });
}

function normalizeImportPayload(raw, artistArg) {
  if (typeof raw === 'string') {
    return {
      title: String(raw || '').trim(),
      artist: String(artistArg || '').trim(),
      album: '',
      coverUrl: null,
      deezerId: null,
      genre: null,
    };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      title: String(raw.title || '').trim(),
      artist: String(raw.artist || '').trim(),
      album: String(raw.album || '').trim(),
      coverUrl: raw.coverUrl ? String(raw.coverUrl).trim() : null,
      deezerId: raw.deezerId ?? null,
      genre: raw.genre ? String(raw.genre).trim() : null,
    };
  }
  return {
    title: '',
    artist: '',
    album: '',
    coverUrl: null,
    deezerId: null,
    genre: null,
  };
}

function looksLikeBadTitle(title) {
  const value = String(title || '').trim();
  if (!value) return true;
  return /^[\w-]{8,15}$/.test(value);
}

async function fetchDeezerTrackMeta(deezerId) {
  const id = String(deezerId || '').trim();
  if (!id) return {};
  try {
    const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      genre: data?.genres?.data?.[0]?.name || null,
      album: data?.album?.title || null,
      coverUrl: data?.album?.cover_medium || data?.album?.cover || null,
    };
  } catch (err) {
    logError('youtube-import', 'Deezer metadata fetch failed', { deezerId: id, err });
    return {};
  }
}

async function resolveImportMetadata(payload) {
  const meta = {
    title: payload?.title || null,
    artist: payload?.artist || null,
    album: payload?.album || null,
    genre: payload?.genre || null,
    coverUrl: payload?.coverUrl || null,
  };

  if (payload?.deezerId) {
    const deezer = await fetchDeezerTrackMeta(payload.deezerId);
    if (!meta.genre && deezer.genre) meta.genre = deezer.genre;
    if (!meta.album && deezer.album) meta.album = deezer.album;
    if (!meta.coverUrl && deezer.coverUrl) meta.coverUrl = deezer.coverUrl;
  }

  return meta;
}

function applyMetadataToSong(song, metadata) {
  if (metadata.title) song.title = metadata.title;
  if (metadata.artist) song.artist = metadata.artist;
  if (metadata.album) song.album = metadata.album;
  if (metadata.genre) song.genre = metadata.genre;
}

async function maybeEnrichExistingTrack(existing, payload) {
  if (!existing?.id || !payload) return;
  const metadata = await resolveImportMetadata(payload);
  const updates = {};

  if (metadata.title && (looksLikeBadTitle(existing.title) || !existing.title?.trim())) {
    updates.title = metadata.title;
  }
  if (
    metadata.artist &&
    (!existing.artist?.trim() ||
      existing.artist === 'Unknown Artist' ||
      existing.artist === 'Неизвестный исполнитель')
  ) {
    updates.artist = metadata.artist;
  }
  if (
    metadata.album &&
    (!existing.album?.trim() ||
      existing.album === 'None' ||
      existing.album === 'Unknown' ||
      existing.album === 'Неизвестный альбом')
  ) {
    updates.album = metadata.album;
  }
  if (metadata.genre && !existing.genre) {
    updates.genre = metadata.genre;
  }
  if (metadata.coverUrl && !existing.coverPath) {
    const coverPath = await downloadCoverFromUrl(metadata.coverUrl, existing.filePath || existing.id);
    if (coverPath) updates.coverPath = coverPath;
  }

  if (Object.keys(updates).length > 0) {
    db.updateTrack(existing.id, updates);
  }
}

async function skipIfAlreadyInLibrary(payload, result, emit, ownedByKey = null) {
  const existing =
    (ownedByKey
      ? ownedByKey.get(require('./trackMatch.cjs').normalizeKey(payload.artist, payload.title))
      : null) || findOwnedLibraryTrack(payload.title, payload.artist);
  if (!existing) return false;

  await maybeEnrichExistingTrack(existing, payload);
  result.skipped += 1;
  result.statusMessage = 'Трек уже есть в библиотеке';
  result.phase = undefined;
  emit();
  return true;
}

function findOwnedLibraryTrack(title, artist) {
  const direct = db.findTrackByTitleArtist(title, artist);
  if (direct) return direct;

  const { normalizeKey } = require('./trackMatch.cjs');
  const key = normalizeKey(artist, title);
  if (!key || key === '::') return null;
  const tracks = db.getAllTracks() || [];
  for (const track of tracks) {
    if (normalizeKey(track.artist, track.title) === key) return track;
  }
  return null;
}

function buildOwnedLibraryKeyMap() {
  const { normalizeKey } = require('./trackMatch.cjs');
  const map = new Map();
  for (const track of db.getAllTracks() || []) {
    const key = normalizeKey(track.artist, track.title);
    if (key && key !== '::' && !map.has(key)) map.set(key, track);
  }
  return map;
}

async function addDownloadedFileToLibrary(filePath, sourceLabel, result, emit, payload) {
  const existingByPath = db.getTrackByPath(filePath);
  if (existingByPath) {
    if (payload) await maybeEnrichExistingTrack(existingByPath, payload);
    result.skipped += 1;
    result.statusMessage = 'Трек уже есть в библиотеке';
    result.phase = undefined;
    return;
  }

  const existingByMeta = payload
    ? db.findTrackByTitleArtist(payload.title, payload.artist)
    : null;
  if (existingByMeta) {
    await maybeEnrichExistingTrack(existingByMeta, payload);
    result.skipped += 1;
    result.statusMessage = 'Трек уже есть в библиотеке';
    result.phase = undefined;
    return;
  }

  result.phase = 'insert';
  result.statusMessage = 'Добавление в библиотеку…';
  emit();

  const metadata = payload ? await resolveImportMetadata(payload) : null;
  const song = await parseSongFile(filePath);
  if (metadata) {
    applyMetadataToSong(song, metadata);
    if (metadata.coverUrl) {
      const coverPath = await downloadCoverFromUrl(metadata.coverUrl, song.filePath || song.id);
      if (coverPath) song.coverPath = coverPath;
    }
  }
  const inserted = db.insertTrack(song);
  if (inserted) {
    result.added += 1;
    result.addedSongs.push(inserted);
  }
}

function parseYtDlpStderrLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const downloadMatch = trimmed.match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  if (downloadMatch) {
    return {
      downloadPercent: Math.min(100, Math.max(0, Number(downloadMatch[1]))),
      statusMessage: `Скачивание: ${downloadMatch[1]}%`,
    };
  }

  const retryMatch = trimmed.match(/Retrying\s*\((\d+)\/(\d+)\)/i);
  if (retryMatch) {
    return { statusMessage: `Повторное подключение к YouTube (${retryMatch[1]}/${retryMatch[2]})…` };
  }

  if (/Downloading webpage/i.test(trimmed)) {
    return { statusMessage: 'Получение информации о видео…' };
  }
  if (/Downloading .* format/i.test(trimmed)) {
    return { statusMessage: 'Загрузка аудио…' };
  }
  if (/ExtractAudio|Merger|Merging/i.test(trimmed)) {
    return { statusMessage: 'Обработка аудио…' };
  }

  return null;
}

function downloadAudioAsync(ytDlpBin, url, videoId, { signal, onProgress, proxy } = {}) {
  const destDir = downloadsDir();
  fs.mkdirSync(destDir, { recursive: true });

  const existing = findExistingDownload(destDir, videoId);
  if (existing && fs.existsSync(existing)) {
    return Promise.resolve({ filePath: existing, downloaded: false });
  }

  const outputTemplate = path.join(destDir, `${videoId}.%(ext)s`);
  const args = [
    '--no-playlist',
    '--ignore-config',
    '-f',
    'bestaudio/best',
    '--extractor-args',
    'youtube:player_client=android,web',
    '--socket-timeout',
    '30',
    '--retries',
    '5',
    '--fragment-retries',
    '5',
    '--no-mtime',
    '--newline',
    '--progress',
    '-o',
    outputTemplate,
    '--',
    url,
  ];

  const proxyTrimmed = String(proxy || '').trim();
  if (proxyTrimmed) {
    // Insert before URL
    args.splice(args.length - 2, 0, '--proxy', proxyTrimmed);
  }

  const notify = (patch) => {
    if (typeof onProgress === 'function') onProgress(patch);
  };

  logError('youtube-import', 'Starting yt-dlp', {
    ytDlpBin,
    videoId,
    proxy: proxyTrimmed ? 'set' : 'none',
    destDir,
  });

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    /** @type {NodeJS.Timeout | null} */
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      fn(value);
    };

    const child = spawn(ytDlpBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: destDir,
      env: ytDlpSpawnEnv(),
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      for (const line of text.split(/\r?\n/)) {
        const parsed = parseYtDlpStderrLine(line);
        if (parsed) notify(parsed);
      }
    });

    const abortHandler = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      finish(reject, Object.assign(new Error('Скачивание отменено'), { code: 'YTDLP_ABORTED' }));
    };

    timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      finish(
        reject,
        Object.assign(new Error('Превышено время ожидания скачивания (15 мин)'), { code: 'YTDLP_TIMEOUT' }),
      );
    }, 15 * 60 * 1000);

    if (signal?.aborted) {
      abortHandler();
      return;
    }
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });

    child.on('error', (err) => {
      logError('youtube-import', 'yt-dlp spawn failed', { ytDlpBin, err });
      finish(reject, err);
    });

    child.on('close', (code) => {
      const found = findExistingDownload(destDir, videoId);
      if (found) {
        finish(resolve, { filePath: found, downloaded: true });
        return;
      }

      // Also accept any media file for this id (e.g. mp4 audio stream) and keep it if playable later.
      const loose = findLooseDownload(destDir, videoId);
      if (loose) {
        finish(resolve, { filePath: loose, downloaded: true });
        return;
      }

      logError('youtube-import', 'yt-dlp finished without output file', {
        code,
        videoId,
        stdout: stdout.slice(-800),
        stderr: stderr.slice(-1500),
      });

      const detail = parseYtDlpError(stderr, stdout);
      const message =
        code === 0
          ? `${detail}. Проверьте прокси VPN в Настройках — без него YouTube часто недоступен.`
          : detail;

      finish(reject, Object.assign(new Error(message), { code: code === 0 ? 'YTDLP_NO_OUTPUT' : 'YTDLP_FAILED' }));
    });
  });
}

function findLooseDownload(destDir, videoId) {
  if (!fs.existsSync(destDir)) return null;
  let best = null;
  for (const name of fs.readdirSync(destDir)) {
    if (!name.startsWith(`${videoId}.`)) continue;
    if (name.endsWith('.part') || name.endsWith('.ytdl')) continue;
    const full = path.join(destDir, name);
    try {
      const stat = fs.statSync(full);
      const ext = path.extname(name).replace('.', '').toLowerCase();
      if (!stat.isFile() || stat.size < 1024 || !DOWNLOAD_MEDIA_EXTENSIONS.has(ext)) continue;
      if (!best || stat.mtimeMs > best.mtime) {
        best = { full: normalizePath(full), mtime: stat.mtimeMs };
      }
    } catch {
      /* skip */
    }
  }
  return best?.full || null;
}

/**
 * Download a single YouTube video as audio and insert it into the library.
 */
async function runUrlImport(rawUrl, { onProgress, signal } = {}) {
  const validation = validateYouTubeUrl(rawUrl);
  const result = {
    total: 1,
    processed: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    addedSongs: [],
    done: false,
    phase: 'download',
    statusMessage: 'Подключение к YouTube…',
    downloadPercent: null,
  };

  const emit = () => {
    if (typeof onProgress === 'function') {
      onProgress({ ...result, errors: result.errors.slice() });
    }
  };

  const applyDownloadProgress = (patch) => {
    if (patch.statusMessage) result.statusMessage = patch.statusMessage;
    if (patch.downloadPercent != null) result.downloadPercent = patch.downloadPercent;
    emit();
  };

  emit();

  if (!validation.ok) {
    result.failed = 1;
    result.processed = 1;
    result.errors.push({ filePath: String(rawUrl || ''), message: validation.message });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  if (signal?.aborted) {
    result.done = true;
    emit();
    return result;
  }

  const settings = db.getSettings();
  const ytDlp = resolveYtDlp(settings);
  if (!ytDlp) {
    result.failed = 1;
    result.processed = 1;
    result.errors.push({
      filePath: validation.originalUrl || validation.url,
      message:
        'yt-dlp не найден. Откройте Настройки и укажите путь, например: D:\\yt-dlp\\yt-dlp.exe (можно указать и папку D:\\yt-dlp)',
    });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  const proxy = noteProxyStatus(result, settings, emit);

  let filePath;
  try {
    const download = await downloadAudioAsync(ytDlp, validation.url, validation.videoId, {
      signal,
      onProgress: applyDownloadProgress,
      proxy,
    });
    filePath = download.filePath;
    result.downloadPercent = 100;
    result.statusMessage = download.downloaded ? 'Обработка метаданных…' : 'Файл уже скачан, добавление…';
    result.phase = 'parse';
    emit();
  } catch (err) {
    result.failed = 1;
    result.processed = 1;
    result.errors.push({
      filePath: validation.originalUrl || validation.url,
      message: err?.message || 'Ошибка скачивания',
    });
    logError('youtube-import', 'Download failed', { url: validation.url, err });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  if (signal?.aborted) {
    result.done = true;
    emit();
    return result;
  }

  try {
    await addDownloadedFileToLibrary(filePath, validation.originalUrl || validation.url, result, emit);
  } catch (err) {
    result.failed = 1;
    result.errors.push({
      filePath: validation.originalUrl || validation.url,
      message: err?.message || 'Не удалось добавить трек',
    });
    logError('youtube-import', 'Insert failed', { url: validation.url, filePath, err });
  }

  result.processed = 1;
  result.done = true;
  result.phase = undefined;
  result.statusMessage = undefined;
  result.downloadPercent = undefined;
  emit();
  return result;
}

/**
 * Find a YouTube video by artist/title and import it into the library.
 */
async function runSearchImport(rawPayload, { onProgress, signal } = {}) {
  const payload = normalizeImportPayload(rawPayload);
  const { title, artist } = payload;
  const validation = validateSearchImport(title, artist);
  const result = {
    total: 1,
    processed: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    addedSongs: [],
    done: false,
    phase: 'download',
    statusMessage: 'Поиск на YouTube…',
    downloadPercent: null,
  };

  const emit = () => {
    if (typeof onProgress === 'function') {
      onProgress({ ...result, errors: result.errors.slice() });
    }
  };

  const applyDownloadProgress = (patch) => {
    if (patch.statusMessage) result.statusMessage = patch.statusMessage;
    if (patch.downloadPercent != null) result.downloadPercent = patch.downloadPercent;
    emit();
  };

  emit();

  if (!validation.ok) {
    result.failed = 1;
    result.processed = 1;
    result.errors.push({ filePath: validation.label || '', message: validation.message });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  if (signal?.aborted) {
    result.done = true;
    emit();
    return result;
  }

  const settings = db.getSettings();
  const ytDlp = resolveYtDlp(settings);
  if (!ytDlp) {
    result.failed = 1;
    result.processed = 1;
    result.errors.push({
      filePath: validation.label,
      message:
        'yt-dlp не найден. Откройте Настройки и укажите путь, например: D:\\yt-dlp\\yt-dlp.exe (можно указать и папку D:\\yt-dlp)',
    });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  const proxy = noteProxyStatus(result, settings, emit);

  if (await skipIfAlreadyInLibrary(payload, result, emit)) {
    result.processed = 1;
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  let videoId;
  try {
    result.statusMessage = `Поиск: ${validation.label}`;
    emit();
    videoId = await resolveSearchVideoAsync(ytDlp, title, artist, {
      signal,
      proxy,
    });
  } catch (err) {
    if (isImportAborted(signal, err)) {
      return finalizeCancelledImport(result, emit);
    }
    result.failed = 1;
    result.processed = 1;
    result.errors.push({
      filePath: validation.label,
      message: err?.message || 'Не удалось найти видео',
    });
    logError('youtube-import', 'Search failed', { title, artist, err });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  const url = buildWatchUrl(videoId);
  let filePath;
  try {
    result.statusMessage = 'Скачивание с YouTube…';
    emit();
    const download = await downloadAudioAsync(ytDlp, url, videoId, {
      signal,
      onProgress: applyDownloadProgress,
      proxy,
    });
    filePath = download.filePath;
    result.downloadPercent = 100;
    result.statusMessage = download.downloaded ? 'Обработка метаданных…' : 'Файл уже скачан, добавление…';
    result.phase = 'parse';
    emit();
  } catch (err) {
    if (isImportAborted(signal, err)) {
      return finalizeCancelledImport(result, emit);
    }
    result.failed = 1;
    result.processed = 1;
    result.errors.push({
      filePath: validation.label,
      message: err?.message || 'Ошибка скачивания',
    });
    logError('youtube-import', 'Search download failed', { title, artist, url, err });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  if (signal?.aborted) {
    result.done = true;
    emit();
    return result;
  }

  try {
    await addDownloadedFileToLibrary(filePath, validation.label, result, emit, payload);
  } catch (err) {
    result.failed = 1;
    result.errors.push({
      filePath: validation.label,
      message: err?.message || 'Не удалось добавить трек',
    });
    logError('youtube-import', 'Search insert failed', { title, artist, filePath, err });
  }

  result.processed = 1;
  result.done = true;
  result.phase = undefined;
  result.statusMessage = undefined;
  result.downloadPercent = undefined;
  emit();
  return result;
}

/**
 * Import every wishlist item sequentially via YouTube search + yt-dlp.
 */
async function runWishlistImport(items, { onProgress, signal } = {}) {
  const list = Array.isArray(items)
    ? items
        .map((item) => normalizeImportPayload(item))
        .filter((item) => item.title || item.artist)
    : [];

  const result = {
    total: list.length,
    processed: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    addedSongs: [],
    done: false,
    phase: 'download',
    statusMessage: list.length ? 'Подготовка…' : undefined,
    downloadPercent: null,
  };

  const emit = () => {
    if (typeof onProgress === 'function') {
      onProgress({ ...result, errors: result.errors.slice() });
    }
  };

  emit();

  if (list.length === 0) {
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    emit();
    return result;
  }

  if (signal?.aborted) {
    result.done = true;
    emit();
    return result;
  }

  const settings = db.getSettings();
  const ytDlp = resolveYtDlp(settings);
  if (!ytDlp) {
    result.failed = list.length;
    result.processed = list.length;
    result.errors.push({
      filePath: 'wishlist',
      message:
        'yt-dlp не найден. Откройте Настройки и укажите путь, например: D:\\yt-dlp\\yt-dlp.exe (можно указать и папку D:\\yt-dlp)',
    });
    result.done = true;
    result.phase = undefined;
    result.statusMessage = undefined;
    result.downloadPercent = undefined;
    emit();
    return result;
  }

  const proxy = resolveEffectiveProxy(settings);
  const ownedByKey = buildOwnedLibraryKeyMap();

  // Drop tracks already in library before any YouTube search/download
  const toDownload = [];
  for (const item of list) {
    const key = require('./trackMatch.cjs').normalizeKey(item.artist, item.title);
    const existing = (key && ownedByKey.get(key)) || findOwnedLibraryTrack(item.title, item.artist);
    if (existing) {
      await maybeEnrichExistingTrack(existing, item);
      result.skipped += 1;
      result.processed += 1;
    } else {
      toDownload.push(item);
    }
  }
  if (result.skipped > 0) {
    result.statusMessage =
      toDownload.length > 0
        ? `Пропущено уже в библиотеке: ${result.skipped}. Осталось скачать: ${toDownload.length}`
        : `Все треки уже в библиотеке (${result.skipped})`;
    emit();
  }

  if (toDownload.length === 0) {
    result.done = true;
    result.phase = undefined;
    result.downloadPercent = undefined;
    if (!result.statusMessage) result.statusMessage = 'Нечего скачивать';
    emit();
    return result;
  }

  result.total = result.skipped + toDownload.length;

  for (let index = 0; index < toDownload.length; index += 1) {
    if (signal?.aborted) break;

    const item = toDownload[index];
    const validation = validateSearchImport(item.title, item.artist);
    const position = `${index + 1}/${toDownload.length}`;

    if (!validation.ok) {
      result.failed += 1;
      result.processed += 1;
      result.errors.push({ filePath: validation.label || '', message: validation.message });
      emit();
      continue;
    }

    // Safety net (should already be filtered)
    if (await skipIfAlreadyInLibrary(item, result, emit, ownedByKey)) {
      result.processed += 1;
      emit();
      continue;
    }

    result.statusMessage = `(${position}) Поиск: ${validation.label}`;
    result.downloadPercent = null;
    emit();

    let videoId;
    try {
      videoId = await resolveSearchVideoAsync(ytDlp, item.title, item.artist, {
        signal,
        proxy,
      });
    } catch (err) {
      if (isImportAborted(signal, err)) {
        return finalizeCancelledImport(result, emit);
      }
      result.failed += 1;
      result.processed += 1;
      result.errors.push({
        filePath: validation.label,
        message: err?.message || 'Не удалось найти видео',
      });
      logError('youtube-import', 'Wishlist search failed', { title: item.title, artist: item.artist, err });
      emit();
      continue;
    }

    const url = buildWatchUrl(videoId);
    let filePath;
    try {
      result.statusMessage = `(${position}) Скачивание: ${validation.label}`;
      emit();
      const download = await downloadAudioAsync(ytDlp, url, videoId, {
        signal,
        onProgress: (patch) => {
          if (patch.statusMessage) {
            result.statusMessage = `(${position}) ${patch.statusMessage}`;
          }
          if (patch.downloadPercent != null) result.downloadPercent = patch.downloadPercent;
          emit();
        },
        proxy,
      });
      filePath = download.filePath;
      result.downloadPercent = 100;
      result.statusMessage = download.downloaded
        ? `(${position}) Обработка…`
        : `(${position}) Уже скачан, добавление…`;
      result.phase = 'parse';
      emit();
    } catch (err) {
      if (isImportAborted(signal, err)) {
        return finalizeCancelledImport(result, emit);
      }
      result.failed += 1;
      result.processed += 1;
      result.errors.push({
        filePath: validation.label,
        message: err?.message || 'Не удалось скачать',
      });
      logError('youtube-import', 'Wishlist download failed', {
        title: item.title,
        artist: item.artist,
        url,
        err,
      });
      emit();
      continue;
    }

    try {
      await addDownloadedFileToLibrary(filePath, validation.label, result, emit, item);
      result.processed += 1;
      emit();
    } catch (err) {
      result.failed += 1;
      result.processed += 1;
      result.errors.push({
        filePath: validation.label,
        message: err?.message || 'Не удалось добавить в библиотеку',
      });
      logError('youtube-import', 'Wishlist insert failed', {
        title: item.title,
        artist: item.artist,
        filePath,
        err,
      });
      emit();
    }
  }

  result.done = true;
  result.phase = undefined;
  result.statusMessage = undefined;
  result.downloadPercent = undefined;
  emit();
  return result;
}

module.exports = {
  downloadsDir,
  validateYouTubeUrl,
  validateSearchImport,
  buildWishlistSearchQuery,
  resolveYtDlp,
  resolveEffectiveProxy,
  ytDlpSpawnEnv,
  runUrlImport,
  runSearchImport,
  runWishlistImport,
};
