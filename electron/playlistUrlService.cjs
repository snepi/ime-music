const { logError } = require('./libraryStore.cjs');
const { parsePlaylistText, importPlaylistEntries } = require('./playlistImportService.cjs');

/**
 * Import playlist by public URL (Yandex Music, YouTube Music, Spotify, Apple Music).
 * Extracts artist+title list, then matches against local library.
 */

async function fetchText(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/json,*/*',
        ...headers,
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: await res.text(), finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

function detectService(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('music.yandex.') || u.includes('ya.ru/music')) return 'yandex';
  if (u.includes('open.spotify.com') || u.includes('spotify.com')) return 'spotify';
  if (u.includes('music.apple.com') || u.includes('itunes.apple.com')) return 'apple';
  if (
    u.includes('music.youtube.com') ||
    ((u.includes('youtube.com') || u.includes('youtu.be')) && (u.includes('list=') || u.includes('/playlist')))
  ) {
    return 'youtube';
  }
  return null;
}

async function fetchYandexPlaylist(url) {
  const raw = String(url || '').trim();

  // iframe: .../iframe/playlist/OWNER/KIND
  let m = raw.match(/iframe\/playlist\/([^/?#]+)\/([^/?#"'\s]+)/i);
  if (m) return loadYandexOwnerKind(m[1], m[2]);

  // classic: /users/OWNER/playlists/KIND
  m = raw.match(/\/users\/([^/?#]+)\/playlists\/([^/?#]+)/i);
  if (m) return loadYandexOwnerKind(m[1], m[2]);

  // new: /playlists/UUID
  m = raw.match(/\/playlists\/([a-f0-9-]{16,})/i);
  if (m) {
    // Resolve via page redirect / meta — try API by uuid if available
    const page = await fetchText(raw, { Referer: 'https://music.yandex.ru/' });
    const ownerKind =
      page.text.match(/\/users\/([^/"'?]+)\/playlists\/(\d+)/) ||
      page.text.match(/"owner"\s*:\s*\{[^}]*"login"\s*:\s*"([^"]+)".*?"kind"\s*:\s*(\d+)/s);
    if (ownerKind) return loadYandexOwnerKind(ownerKind[1], ownerKind[2]);
    // try playlist id in JSON
    const kindMatch = page.text.match(/"kind"\s*:\s*(\d+)/);
    const ownerMatch = page.text.match(/"login"\s*:\s*"([^"]+)"/);
    if (kindMatch && ownerMatch) return loadYandexOwnerKind(ownerMatch[1], kindMatch[1]);
    throw new Error('Не удалось разобрать новую ссылку Яндекс.Музыки. Откройте плейлист → Поделиться → скопируйте ссылку вида users/.../playlists/...');
  }

  throw new Error('Не распознана ссылка Яндекс.Музыки');
}

async function loadYandexOwnerKind(owner, kinds) {
  const api = `https://music.yandex.ru/handlers/playlist.jsx?owner=${encodeURIComponent(owner)}&kinds=${encodeURIComponent(kinds)}&light=true`;
  const { text } = await fetchText(api, {
    Referer: 'https://music.yandex.ru/',
    Accept: 'application/json,text/javascript,*/*',
    'X-Requested-With': 'XMLHttpRequest',
  });
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Яндекс.Музыка вернула неожиданный ответ');
  }
  const pl = data?.playlist;
  if (!pl) throw new Error('Плейлист Яндекс.Музыки не найден или закрыт');
  const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
  const entries = [];
  for (const track of tracks) {
    const title = String(track?.title || track?.track?.title || '').trim();
    const artists = track?.artists || track?.track?.artists || [];
    const artist = Array.isArray(artists)
      ? artists.map((a) => a?.name).filter(Boolean).join(', ')
      : '';
    if (!title) continue;
    entries.push({ title, artist: artist || 'Unknown' });
  }
  return {
    service: 'yandex',
    name: String(pl.title || 'Яндекс.Музыка') || 'Яндекс.Музыка',
    entries,
  };
}

async function fetchSpotifyPlaylist(url) {
  const m = String(url).match(/playlist\/([a-zA-Z0-9]+)/);
  if (!m) throw new Error('Не распознана ссылка Spotify (нужен playlist/...)');
  const id = m[1];
  const pageUrl = `https://open.spotify.com/playlist/${id}`;
  const { text } = await fetchText(pageUrl, {
    Accept: 'text/html',
    'Accept-Language': 'en,ru;q=0.9',
  });

  const entries = [];
  // Spotify often embeds track list in <script> JSON
  const nextData = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData) {
    try {
      walkCollectSpotify(JSON.parse(nextData[1]), entries, new Set());
    } catch {
      /* continue */
    }
  }

  if (!entries.length) {
    // Fallback: og / meta style "Artist - Title" lines are rare; try track items in JSON blobs
    const re =
      /"name"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"type"\s*:\s*"track"|\\"name\\":\\"((?:\\\\.|[^"\\])*)\\",\\"type\\":\\"track\\"/g;
    // Simpler: pairs of artist + track from resource
    const trackBlocks = text.matchAll(
      /"artists"\s*:\s*\[\{[^[\]]*?"name"\s*:\s*"((?:\\.|[^"\\])*)"[^\]]*\][^}]*?"name"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"type"\s*:\s*"track"/g,
    );
    for (const block of trackBlocks) {
      const artist = unescapeJson(block[1]);
      const title = unescapeJson(block[2]);
      if (title) entries.push({ title, artist: artist || 'Unknown' });
    }
  }

  if (!entries.length) {
    // Last resort: embed page
    const embed = await fetchText(`https://open.spotify.com/embed/playlist/${id}`, {
      Accept: 'text/html',
    });
    walkCollectSpotifyLoose(embed.text, entries);
  }

  if (!entries.length) {
    throw new Error(
      'Не удалось прочитать плейлист Spotify. Сделайте его открытым (Public) и попробуйте снова, либо экспортируйте CSV.',
    );
  }

  const titleMatch =
    text.match(/<meta property="og:title" content="([^"]+)"/i) ||
    text.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"type"\s*:\s*"playlist"/);
  const name = titleMatch ? unescapeJson(titleMatch[1]) : 'Spotify playlist';

  return { service: 'spotify', name, entries: dedupeEntries(entries) };
}

function walkCollectSpotify(node, out, seen) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkCollectSpotify(item, out, seen);
    return;
  }
  if (node.type === 'track' && node.name) {
    const title = String(node.name);
    const artist = Array.isArray(node.artists)
      ? node.artists.map((a) => a?.name).filter(Boolean).join(', ')
      : node.artist?.name || node.subtitle || 'Unknown';
    const key = `${artist}::${title}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ title, artist: artist || 'Unknown' });
    }
  }
  // Spotify nested itemV2 / trackV2 shapes
  const track = node.track || node.item?.track || node.data?.track;
  if (track?.name || track?.uri?.includes?.('track')) {
    walkCollectSpotify({ ...track, type: 'track' }, out, seen);
  }
  for (const v of Object.values(node)) walkCollectSpotify(v, out, seen);
}

function walkCollectSpotifyLoose(html, out) {
  const seen = new Set();
  const re =
    /"artists?[^"]*"\s*:\s*(?:"([^"]+)"|\[\{[^[\]]*"name"\s*:\s*"([^"]+)")[\s\S]{0,200}?"name"\s*:\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const artist = m[1] || m[2] || 'Unknown';
    const title = m[3];
    const key = `${artist}::${title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, artist });
  }
}

async function fetchApplePlaylist(url) {
  const { text } = await fetchText(url, { Accept: 'text/html', 'Accept-Language': 'en,ru;q=0.9' });
  const entries = [];
  const seen = new Set();

  // JSON-LD ItemList
  const ldBlocks = text.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  );
  for (const block of ldBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const list = Array.isArray(data) ? data : [data];
      for (const node of list) {
        const items = node?.track || node?.itemListElement || node?.tracks;
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          const song = item?.item || item;
          const title = song?.name || song?.title;
          const artist =
            song?.byArtist?.name ||
            (Array.isArray(song?.byArtist) ? song.byArtist.map((a) => a.name).join(', ') : '') ||
            song?.artistName ||
            'Unknown';
          if (!title) continue;
          const key = `${artist}::${title}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          entries.push({ title: String(title), artist: String(artist) });
        }
      }
    } catch {
      /* next */
    }
  }

  if (!entries.length) {
    throw new Error(
      'Не удалось прочитать плейлист Apple Music. Откройте его в браузере и убедитесь, что ссылка публичная.',
    );
  }

  const titleMatch = text.match(/<meta property="og:title" content="([^"]+)"/i);
  return {
    service: 'apple',
    name: titleMatch ? titleMatch[1] : 'Apple Music playlist',
    entries: dedupeEntries(entries),
  };
}

/**
 * YouTube Music / YouTube playlist via yt-dlp metadata dump (no download).
 */
function parseArtistTitleFromYt(entry) {
  const rawTitle = String(entry?.track || entry?.title || entry?.fulltitle || '').trim();
  let artist = String(
    entry?.artist ||
      entry?.artists ||
      entry?.creator ||
      entry?.uploader ||
      entry?.channel ||
      '',
  ).trim();
  if (Array.isArray(entry?.artists)) {
    artist = entry.artists.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ');
  }

  let title = rawTitle;
  // "Artist - Title" / "Artist — Title"
  if ((!artist || artist === 'Various Artists') && rawTitle) {
    const m = rawTitle.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    if (m) {
      artist = m[1].trim();
      title = m[2].trim();
    }
  }

  // Strip common junk from titles
  title = title
    .replace(/\s*[\(\[]?(official\s+)?(audio|video|music\s+video|lyric\s+video|lyrics|visualizer)[\)\]]?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!title) return null;
  return { title, artist: artist || 'Unknown' };
}

async function fetchYouTubeMusicPlaylist(url) {
  const db = require('./database.cjs');
  const { spawn } = require('child_process');
  const {
    resolveYtDlp,
    resolveEffectiveProxy,
    ytDlpSpawnEnv,
  } = require('./youtubeImportService.cjs');

  const settings = db.getSettings?.() || {};
  const ytDlpBin = resolveYtDlp(settings);
  if (!ytDlpBin) {
    throw new Error(
      'Для YouTube Music нужен yt-dlp. Укажите путь в Настройки → Инструменты (или установите yt-dlp в PATH).',
    );
  }

  // Prefer music.youtube.com form when list id is present
  let playlistUrl = String(url).trim();
  const listMatch = playlistUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (listMatch && !playlistUrl.includes('music.youtube.com')) {
    playlistUrl = `https://music.youtube.com/playlist?list=${listMatch[1]}`;
  }

  const proxy = resolveEffectiveProxy(settings);
  const args = [
    '--ignore-config',
    '--flat-playlist',
    '--no-download',
    '-J',
    '--socket-timeout',
    '45',
    '--retries',
    '3',
    '--extractor-args',
    'youtube:player_client=android,web',
  ];
  if (proxy) {
    args.push('--proxy', proxy);
  }
  args.push('--', playlistUrl);

  const data = await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(ytDlpBin, args, {
      windowsHide: true,
      env: ytDlpSpawnEnv(),
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error('Таймаут чтения плейлиста YouTube Music (yt-dlp)'));
    }, 120000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(
          new Error(
            stderr.trim().slice(0, 280) ||
              `yt-dlp не смог прочитать плейлист (код ${code}). Проверьте, что плейлист открытый.`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error('yt-dlp вернул неожиданный ответ для YouTube Music'));
      }
    });
  });

  const entries = [];
  const items = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
  for (const item of items) {
    if (!item) continue;
    // Nested playlists / null stubs
    if (item._type === 'playlist' && Array.isArray(item.entries)) {
      for (const sub of item.entries) {
        const parsed = parseArtistTitleFromYt(sub);
        if (parsed) entries.push(parsed);
      }
      continue;
    }
    const parsed = parseArtistTitleFromYt(item);
    if (parsed) entries.push(parsed);
  }

  if (!entries.length) {
    throw new Error(
      'В плейлисте YouTube Music не найдено треков. Убедитесь, что ссылка на плейлист (не одно видео) и он доступен без входа.',
    );
  }

  return {
    service: 'youtube',
    name: String(data?.title || data?.playlist || 'YouTube Music') || 'YouTube Music',
    entries: dedupeEntries(entries),
  };
}

function unescapeJson(s) {
  try {
    return JSON.parse(`"${String(s || '')}"`);
  } catch {
    return String(s || '')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, ' ')
      .replace(/\\\\/g, '\\');
  }
}

function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = `${String(e.artist).toLowerCase()}::${String(e.title).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

async function resolvePlaylistUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) throw new Error('Вставьте ссылку на плейлист');
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('Ссылка должна начинаться с http:// или https://');

  const service = detectService(trimmed);
  if (!service) {
    throw new Error(
      'Поддерживаются ссылки: Яндекс.Музыка, YouTube Music, Spotify, Apple Music. Или импортируйте файл CSV/M3U.',
    );
  }

  if (service === 'yandex') return fetchYandexPlaylist(trimmed);
  if (service === 'spotify') return fetchSpotifyPlaylist(trimmed);
  if (service === 'youtube') return fetchYouTubeMusicPlaylist(trimmed);
  return fetchApplePlaylist(trimmed);
}

async function importPlaylistFromUrl(db, url, options = {}) {
  try {
    const resolved = await resolvePlaylistUrl(url);
    if (!resolved.entries.length) {
      return { ok: false, error: 'В плейлисте нет треков', matched: 0, unmatched: 0 };
    }
    const result = importPlaylistEntries(db, resolved.entries, {
      name: options.name || resolved.name || 'Imported playlist',
      createPlaylist: options.createPlaylist !== false,
      addWishlist: options.addWishlist !== false,
    });
    return {
      ...result,
      service: resolved.service,
      name: resolved.name,
      total: resolved.entries.length,
    };
  } catch (err) {
    logError('playlistUrlImport', 'import failed', { url, err });
    return {
      ok: false,
      error: String(err?.message || err),
      matched: 0,
      unmatched: 0,
    };
  }
}

module.exports = {
  detectService,
  resolvePlaylistUrl,
  importPlaylistFromUrl,
  parsePlaylistText,
};
