const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { logError } = require('./libraryStore.cjs');
const { parseSongFile, downloadCoverFromUrl } = require('./importService.cjs');
const { resolveYtDlp, resolveEffectiveProxy, ytDlpSpawnEnv } = require('./youtubeImportService.cjs');

const DEEZER = 'https://api.deezer.com';
const UNKNOWN_ARTISTS = new Set(['unknown artist', 'неизвестный исполнитель']);
const UNKNOWN_ALBUMS = new Set(['unknown', 'none', 'неизвестный альбом', '']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeBadTitle(title) {
  const value = String(title || '').trim();
  if (!value) return true;
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return true;
  return /^[\w-]{8,15}$/.test(value);
}

function isYoutubeVideoId(value) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || '').trim());
}

function extractYoutubeVideoId(track) {
  const title = String(track?.title || '').trim();
  if (isYoutubeVideoId(title)) return title;
  const base = path.basename(String(track?.filePath || ''), path.extname(String(track?.filePath || '')));
  if (isYoutubeVideoId(base)) return base;
  return null;
}

function isUnknownArtist(artist) {
  const v = normalizeMatch(artist);
  return !v || UNKNOWN_ARTISTS.has(v);
}

function isBadAlbum(album) {
  const v = normalizeMatch(album);
  return !v || UNKNOWN_ALBUMS.has(v);
}

function coverMissing(track) {
  const coverPath = track?.coverPath;
  if (!coverPath) return true;
  try {
    return !fs.existsSync(coverPath);
  } catch {
    return true;
  }
}

function needsMetadataEnrichment(track) {
  const titleBad = !String(track.title || '').trim() || looksLikeBadTitle(track.title);
  const artistBad = isUnknownArtist(track.artist);
  const genreBad = !String(track.genre || '').trim();
  const yearBad = track.year == null || !Number(track.year);
  const coverBad = coverMissing(track);
  return titleBad || artistBad || genreBad || yearBad || coverBad;
}

function pickIfMissing(current, next) {
  const cur = String(current || '').trim();
  const val = String(next || '').trim();
  if (!val) return undefined;
  if (!cur || (looksLikeBadTitle(cur) && !looksLikeBadTitle(val))) return val;
  if (isUnknownArtist(cur) && !isUnknownArtist(val)) return val;
  if (!cur) return val;
  return undefined;
}

function pickAlbumIfBetter(current, next) {
  const val = String(next || '').trim();
  if (!val || isBadAlbum(val)) return undefined;
  const cur = String(current || '').trim();
  if (!cur || isBadAlbum(cur)) return val;
  return undefined;
}

function filterMeaningfulUpdates(track, updates) {
  const out = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (value == null || value === '') continue;
    if (key === 'album') {
      const nextAlbum = pickAlbumIfBetter(track.album, value);
      if (nextAlbum && nextAlbum !== track.album) out.album = nextAlbum;
      continue;
    }
    if (track[key] === value) continue;
    out[key] = value;
  }
  return out;
}

async function deezerGet(pathname) {
  const url = pathname.startsWith('http') ? pathname : `${DEEZER}${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function scoreDeezerTrack(item, title, artist) {
  const t = normalizeMatch(title);
  const a = normalizeMatch(artist);
  const it = normalizeMatch(item?.title);
  const ia = normalizeMatch(item?.artist?.name);
  if (!t || !it) return 0;
  if (!it.includes(t) && !t.includes(it)) return 0;
  let score = 50;
  if (a && ia && (ia.includes(a) || a.includes(ia))) score += 40;
  if (it === t) score += 10;
  return score;
}

async function searchDeezerTrack(title, artist) {
  const t = String(title || '').trim();
  const a = String(artist || '').trim();
  if (!t && !a) return null;
  if (looksLikeBadTitle(t) && !a) return null;

  const queries = [];
  if (a && t && !looksLikeBadTitle(t)) queries.push(`${a} ${t}`, `${t} ${a}`);
  else if (a) queries.push(a);
  else queries.push(t);

  let best = null;
  for (const q of [...new Set(queries)]) {
    try {
      const data = await deezerGet(`/search/track?q=${encodeURIComponent(q)}&limit=8`);
      const rows = Array.isArray(data?.data) ? data.data : [];
      for (const item of rows) {
        const score = scoreDeezerTrack(item, t || item.title, a || item.artist?.name);
        if (score <= 0) continue;
        if (!best || score > best.score) {
          best = { item, score };
        }
      }
      if (best && best.score >= 80) break;
    } catch (err) {
      logError('metaEnrich', 'Deezer search failed', { q, err });
    }
    await sleep(180);
  }

  if (!best || best.score < 45) return null;
  return best.item;
}

function parseYoutubeInfo(info) {
  const rawTitle = String(info?.title || info?.track || '').trim();
  let title = rawTitle;
  let artist = String(info?.artist || info?.channel || info?.uploader || '').trim();

  const split = rawTitle.match(/^(.+?)\s[-–—|]\s(.+)$/);
  if (split) {
    artist = split[1].trim();
    title = split[2].trim();
  }

  title = title
    .replace(/\s*[\[(][^\])]*?(official|video|audio|lyric|clip|live|premiere|премьера)[^\])]*?[\])]\s*/gi, ' ')
    .replace(/\s*\([^)]{0,80}\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const thumbnail =
    info?.thumbnail ||
    (Array.isArray(info?.thumbnails) && info.thumbnails.length
      ? info.thumbnails[info.thumbnails.length - 1]?.url
      : null);

  return { title, artist, thumbnail };
}

function runYtDlpJson(ytDlpBin, videoId, proxy) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      '--no-playlist',
      '--ignore-config',
      '--extractor-args',
      'youtube:player_client=android,web',
      '--skip-download',
      '-j',
      '--',
      url,
    ];
    if (proxy) args.splice(args.length - 2, 0, '--proxy', proxy);

    const child = spawn(ytDlpBin, args, { env: ytDlpSpawnEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exit ${code}`));
        return;
      }
      try {
        const line = stdout.trim().split('\n').filter(Boolean).pop() || '';
        resolve(JSON.parse(line));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function buildUpdatesFromYoutube(track, settings) {
  const videoId = extractYoutubeVideoId(track);
  if (!videoId) return {};

  const ytDlpBin = resolveYtDlp(settings || {});
  if (!ytDlpBin) {
    logError('metaEnrich', 'yt-dlp not configured for YouTube metadata', { videoId });
    return {};
  }

  let info;
  try {
    info = await runYtDlpJson(ytDlpBin, videoId, resolveEffectiveProxy(settings));
  } catch (err) {
    logError('metaEnrich', 'YouTube metadata fetch failed', { videoId, err });
    return {};
  }

  const parsed = parseYoutubeInfo(info);
  const updates = {};
  const nextTitle = pickIfMissing(track.title, parsed.title);
  if (nextTitle) updates.title = nextTitle;
  const nextArtist = pickIfMissing(track.artist, parsed.artist);
  if (nextArtist) updates.artist = nextArtist;

  if (coverMissing(track) && parsed.thumbnail) {
    const coverPath = await downloadCoverFromUrl(parsed.thumbnail, track.filePath || track.id);
    if (coverPath) updates.coverPath = coverPath;
  }

  return updates;
}

async function buildUpdatesFromDeezer(track, deezerTrack) {
  const updates = {};
  let fullTrack = deezerTrack;
  try {
    if (deezerTrack?.id) {
      fullTrack = (await deezerGet(`/track/${deezerTrack.id}`)) || deezerTrack;
    }
  } catch (err) {
    logError('metaEnrich', 'Deezer track detail failed', { id: deezerTrack?.id, err });
  }

  const title = fullTrack?.title;
  const artist = fullTrack?.artist?.name;
  const album = fullTrack?.album?.title;
  const genre = fullTrack?.genres?.data?.[0]?.name || null;
  const coverUrl = fullTrack?.album?.cover_medium || fullTrack?.album?.cover || null;
  const releaseDate = fullTrack?.album?.release_date || fullTrack?.release_date || '';
  const yearFromDate = Number(String(releaseDate).slice(0, 4));

  const nextTitle = pickIfMissing(track.title, title);
  if (nextTitle) updates.title = nextTitle;
  const nextArtist = pickIfMissing(track.artist, artist);
  if (nextArtist) updates.artist = nextArtist;
  const nextAlbum = pickAlbumIfBetter(track.album, album);
  if (nextAlbum) updates.album = nextAlbum;
  if (!String(track.genre || '').trim() && genre) updates.genre = genre;
  if ((!track.year || !Number(track.year)) && Number.isFinite(yearFromDate) && yearFromDate >= 1900) {
    updates.year = yearFromDate;
  }

  if (coverMissing({ ...track, coverPath: updates.coverPath || track.coverPath }) && coverUrl) {
    const coverPath = await downloadCoverFromUrl(coverUrl, track.filePath || track.id);
    if (coverPath) updates.coverPath = coverPath;
  }

  return updates;
}

async function buildUpdatesFromFile(track) {
  const parsed = await parseSongFile(track.filePath);
  const updates = {};

  const title = pickIfMissing(track.title, parsed.title);
  if (title) updates.title = title;
  const artist = pickIfMissing(track.artist, parsed.artist);
  if (artist) updates.artist = artist;
  const album = pickAlbumIfBetter(track.album, parsed.album);
  if (album) updates.album = album;
  if (!String(track.genre || '').trim() && parsed.genre) updates.genre = parsed.genre;
  if ((!track.year || !Number(track.year)) && parsed.year) updates.year = parsed.year;
  if (coverMissing(track) && parsed.coverPath) updates.coverPath = parsed.coverPath;

  return updates;
}

function searchTitleForTrack(track, updates) {
  const title = updates.title || track.title;
  if (title && !looksLikeBadTitle(title)) return title;
  const base = path.basename(String(track.filePath || ''), path.extname(String(track.filePath || '')));
  return base && !looksLikeBadTitle(base) ? base : title;
}

function searchArtistForTrack(track, updates) {
  const artist = updates.artist || track.artist;
  return isUnknownArtist(artist) ? '' : artist;
}

function stillNeedsEnrichment(track, updates) {
  const merged = { ...track, ...updates };
  return needsMetadataEnrichment(merged);
}

/**
 * Enrich incomplete library tracks from file tags, YouTube and Deezer.
 */
async function enrichLibraryMetadata(db, { settings, onProgress } = {}) {
  const targets = (db.getAllTracks() || []).filter(needsMetadataEnrichment);
  const result = {
    total: targets.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    done: false,
  };

  const emit = () => {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ ...result, errors: result.errors.slice() });
      } catch {
        /* ignore */
      }
    }
  };

  emit();

  for (const track of targets) {
    result.processed += 1;
    try {
      let updates = {};
      try {
        updates = await buildUpdatesFromFile(track);
      } catch (err) {
        logError('metaEnrich', 'File metadata read failed', { id: track.id, err });
      }

      const mergedAfterFile = { ...track, ...updates };

      if (extractYoutubeVideoId(mergedAfterFile)) {
        const ytUpdates = await buildUpdatesFromYoutube(mergedAfterFile, settings);
        updates = { ...updates, ...ytUpdates };
      }

      if (stillNeedsEnrichment(track, updates)) {
        const deezerTrack = await searchDeezerTrack(
          searchTitleForTrack(track, updates),
          searchArtistForTrack(track, updates),
        );
        if (deezerTrack) {
          const deezerUpdates = await buildUpdatesFromDeezer({ ...track, ...updates }, deezerTrack);
          updates = { ...updates, ...deezerUpdates };
        }
      }

      updates = filterMeaningfulUpdates(track, updates);

      if (Object.keys(updates).length > 0) {
        db.updateTrack(track.id, updates);
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        filePath: track.filePath,
        message: String(err?.message || err),
      });
      logError('metaEnrich', 'Track enrich failed', { id: track.id, err });
    }

    if (result.processed % 3 === 0 || result.processed === result.total) emit();
    await sleep(120);
  }

  result.done = true;
  emit();
  return result;
}

module.exports = {
  needsMetadataEnrichment,
  enrichLibraryMetadata,
  extractYoutubeVideoId,
};
