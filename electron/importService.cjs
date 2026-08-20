const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { app } = require('electron');
const { logError, normalizeSong } = require('./libraryStore.cjs');
const db = require('./database.cjs');

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'aiff', 'aif', 'wma', 'webm',
]);

function coversDir() {
  return path.join(app.getPath('userData'), 'covers');
}

function normalizePath(filePath) {
  return path.normalize(path.resolve(filePath));
}

function isAudioFile(filePath) {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

function walkDirectory(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    logError('import', 'Cannot read directory', { dir, err });
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) walkDirectory(full, out);
      else if (entry.isFile() && isAudioFile(full)) out.push(full);
    } catch (err) {
      logError('import', 'Skipped entry during scan', { full, err });
    }
  }
  return out;
}

function collectAudioPaths(inputPaths) {
  const files = [];
  for (const input of inputPaths) {
    try {
      const normalized = normalizePath(input);
      if (!fs.existsSync(normalized)) continue;
      const stat = fs.statSync(normalized);
      if (stat.isDirectory()) walkDirectory(normalized, files);
      else if (stat.isFile() && isAudioFile(normalized)) files.push(normalized);
    } catch (err) {
      logError('import', 'Failed to resolve import path', { input, err });
    }
  }
  // Unique by normalized absolute path (case-insensitive on win)
  const seen = new Set();
  const unique = [];
  for (const f of files) {
    const key = normalizePath(f).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalizePath(f));
  }
  return unique;
}

function coverCacheKey(filePath, picture) {
  const { createHash } = require('crypto');
  const hash = createHash('sha1');
  hash.update(normalizePath(filePath).toLowerCase());
  if (picture?.data) hash.update(Buffer.from(picture.data));
  return hash.digest('hex');
}

function saveCoverFromPicture(filePath, picture) {
  if (!picture?.data) return null;
  try {
    fs.mkdirSync(coversDir(), { recursive: true });
    const key = coverCacheKey(filePath, picture);
    const format = (picture.format || 'image/jpeg').toLowerCase();
    let ext = 'jpg';
    if (format.includes('png')) ext = 'png';
    else if (format.includes('webp')) ext = 'webp';
    else if (format.includes('gif')) ext = 'gif';
    const outPath = path.join(coversDir(), `${key}.${ext}`);
    if (!fs.existsSync(outPath)) {
      fs.writeFileSync(outPath, Buffer.from(picture.data));
    }
    return outPath;
  } catch (err) {
    logError('metadata', 'Failed to save cover art', { filePath, err });
    return null;
  }
}

async function downloadCoverFromUrl(coverUrl, seed = '') {
  const url = String(coverUrl || '').trim();
  if (!url.startsWith('http')) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 128) return null;

    fs.mkdirSync(coversDir(), { recursive: true });
    const { createHash } = require('crypto');
    const hash = createHash('sha1');
    hash.update(url);
    if (seed) hash.update(String(seed));
    const key = hash.digest('hex');
    let ext = 'jpg';
    if (contentType.includes('png') || url.includes('.png')) ext = 'png';
    else if (contentType.includes('webp') || url.includes('.webp')) ext = 'webp';
    else if (contentType.includes('gif') || url.includes('.gif')) ext = 'gif';
    const outPath = path.join(coversDir(), `${key}.${ext}`);
    if (!fs.existsSync(outPath)) {
      fs.writeFileSync(outPath, buf);
    }
    return outPath;
  } catch (err) {
    logError('metadata', 'Failed to download cover art', { coverUrl: url, err });
    return null;
  }
}

async function parseSongFile(filePath) {
  const normalized = normalizePath(filePath);
  if (!fs.existsSync(normalized)) {
    const err = new Error('Файл не найден');
    err.code = 'ENOENT';
    throw err;
  }

  const stat = fs.statSync(normalized);
  let metadata;
  try {
    const { parseFile } = await import('music-metadata');
    metadata = await parseFile(normalized, { duration: true });
  } catch (err) {
    logError('metadata', 'Failed to read metadata', { filePath: normalized, err });
    throw new Error('Не удалось прочитать метаданные или файл повреждён');
  }

  const ext = path.extname(normalized).replace('.', '').toLowerCase() || null;
  const title =
    metadata.common.title?.trim() ||
    path.basename(normalized, path.extname(normalized));

  const picture = metadata.common.picture?.[0];
  const coverPath = picture ? saveCoverFromPicture(normalized, picture) : null;

  return normalizeSong({
    id: randomUUID(),
    filePath: normalized,
    title,
    artist: metadata.common.artist?.trim() || 'Неизвестный исполнитель',
    album: metadata.common.album?.trim() || 'Неизвестный альбом',
    albumArtist: metadata.common.albumartist ?? null,
    genre: Array.isArray(metadata.common.genre)
      ? metadata.common.genre[0] ?? null
      : metadata.common.genre ?? null,
    year: metadata.common.year ?? null,
    trackNumber: metadata.common.track?.no ?? null,
    discNumber: metadata.common.disk?.no ?? null,
    comment: Array.isArray(metadata.common.comment)
      ? metadata.common.comment.map((c) => (typeof c === 'string' ? c : c?.text)).filter(Boolean).join('\n') || null
      : null,
    composer: Array.isArray(metadata.common.composer)
      ? metadata.common.composer[0] ?? null
      : metadata.common.composer ?? null,
    rating: null,
    duration: Math.round(metadata.format.duration || 0),
    format: metadata.format.container || ext,
    bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate) : null,
    sampleRate: metadata.format.sampleRate ?? null,
    fileSize: stat.size,
    dateAdded: Date.now(),
    dateModified: stat.mtimeMs,
    coverPath,
    liked: false,
    playCount: 0,
    lastPlayedAt: null,
    volume: 1,
    icon: '♪',
  });
}

/**
 * Run import with progress callbacks. Non-blocking for the UI via async chunking.
 */
async function runImport(inputPaths, { onProgress, signal } = {}) {
  const files = collectAudioPaths(inputPaths);
  const result = {
    total: files.length,
    processed: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    addedSongs: [],
    done: false,
  };

  const emit = () => {
    if (typeof onProgress === 'function') {
      onProgress({ ...result, errors: result.errors.slice() });
    }
  };

  emit();

  for (const filePath of files) {
    if (signal?.aborted) break;

    try {
      if (db.getTrackByPath(filePath)) {
        result.skipped += 1;
        result.processed += 1;
        emit();
        // Yield to event loop
        await new Promise((r) => setImmediate(r));
        continue;
      }

      const song = await parseSongFile(filePath);
      const inserted = db.insertTrack(song);
      if (inserted) {
        result.added += 1;
        result.addedSongs.push(inserted);
      }
    } catch (err) {
      result.failed += 1;
      const message = err?.message || String(err);
      result.errors.push({ filePath, message });
      logError('import', 'Failed to import file', { filePath, err });
    }

    result.processed += 1;
    emit();
    await new Promise((r) => setImmediate(r));
  }

  result.done = true;
  emit();
  return result;
}

module.exports = {
  AUDIO_EXTENSIONS,
  coversDir,
  normalizePath,
  collectAudioPaths,
  parseSongFile,
  downloadCoverFromUrl,
  runImport,
};
