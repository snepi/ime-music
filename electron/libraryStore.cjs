/**
 * JSON backup / migration helpers only.
 * Runtime reads/writes go through electron/database.cjs (SQLite).
 * saveLibrary/loadLibrary must NOT be called during normal app operation.
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const DEFAULT_SETTINGS = {
  ffmpegPath: '',
  sortBy: 'title',
  sortOrder: 'asc',
  globalVolume: 0.8,
};

const DEFAULT_PLAYBACK = {
  currentSongId: null,
  currentTime: 0,
  queue: [],
  queueIndex: 0,
};

function getUserDataDir() {
  return app.getPath('userData');
}

function libraryPath() {
  return path.join(getUserDataDir(), 'library.json');
}

function backupPath() {
  return path.join(getUserDataDir(), 'library.backup.json');
}

function tempPath() {
  return path.join(getUserDataDir(), 'library.json.tmp');
}

function logsDir() {
  return path.join(getUserDataDir(), 'logs');
}

function logFilePath() {
  return path.join(logsDir(), 'app.log');
}

/**
 * Strip large / sensitive payloads before logging.
 */
function sanitizeForLog(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > 200) {
      return `[data-url omitted, length=${value.length}]`;
    }
    if (value.length > 2000) return `${value.slice(0, 500)}…[truncated]`;
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'object') {
    try {
      const clone = Array.isArray(value) ? [...value] : { ...value };
      for (const key of Object.keys(clone)) {
        const lower = key.toLowerCase();
        if (lower.includes('cover') || lower.includes('base64') || lower === 'coverart') {
          clone[key] = '[omitted]';
        } else {
          clone[key] = sanitizeForLog(clone[key]);
        }
      }
      return clone;
    } catch {
      return String(value);
    }
  }
  return value;
}

function logError(category, message, detail) {
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    const ts = new Date().toISOString();
    let detailText = '';
    if (detail !== undefined) {
      try {
        detailText =
          typeof detail === 'string'
            ? sanitizeForLog(detail)
            : JSON.stringify(sanitizeForLog(detail));
      } catch {
        detailText = String(detail);
      }
    }
    const line = detailText
      ? `[${ts}] [${category}] ${message} | ${detailText}\n`
      : `[${ts}] [${category}] ${message}\n`;
    fs.appendFileSync(logFilePath(), line, 'utf-8');
  } catch (err) {
    // Last resort — never throw from logger
    console.error('[logError failed]', category, message, err);
  }
}

function asNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/**
 * Normalize a legacy or partial song into the current Song shape.
 * Keeps volume, icon, coverArt for UI compatibility.
 */
function normalizeSong(raw) {
  const now = Date.now();
  const filePath = typeof raw?.filePath === 'string' ? raw.filePath : '';
  const dateModified =
    asNumberOrNull(raw?.dateModified) ??
    asNumberOrNull(raw?.modifiedAt) ??
    now;
  const dateAdded = asNumberOrNull(raw?.dateAdded) ?? dateModified ?? now;

  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : require('crypto').randomUUID(),
    filePath,
    title:
      (typeof raw?.title === 'string' && raw.title.trim()) ||
      (filePath ? path.basename(filePath, path.extname(filePath)) : 'Unknown'),
    artist: (typeof raw?.artist === 'string' && raw.artist.trim()) || 'Unknown Artist',
    album: (typeof raw?.album === 'string' && raw.album.trim()) || 'None',
    albumArtist: asStringOrNull(raw?.albumArtist),
    genre: asStringOrNull(raw?.genre),
    year: asNumberOrNull(raw?.year),
    trackNumber: asNumberOrNull(raw?.trackNumber),
    discNumber: asNumberOrNull(raw?.discNumber),
    comment: asStringOrNull(raw?.comment),
    composer: asStringOrNull(raw?.composer),
    rating: (() => {
      const r = asNumberOrNull(raw?.rating);
      if (r == null) return null;
      return Math.max(0, Math.min(5, Math.round(r)));
    })(),
    duration: Math.max(0, Math.round(asNumberOrNull(raw?.duration) ?? 0)),
    format: asStringOrNull(raw?.format) ?? (filePath ? path.extname(filePath).replace('.', '').toLowerCase() || null : null),
    bitrate: asNumberOrNull(raw?.bitrate),
    sampleRate: asNumberOrNull(raw?.sampleRate),
    fileSize: asNumberOrNull(raw?.fileSize),
    dateAdded,
    dateModified,
    coverPath: asStringOrNull(raw?.coverPath),
    liked: Boolean(raw?.liked),
    playCount: Math.max(0, Math.floor(asNumberOrNull(raw?.playCount) ?? 0)),
    lastPlayedAt: asNumberOrNull(raw?.lastPlayedAt),
    volume: (() => {
      const v = asNumberOrNull(raw?.volume);
      if (v == null) return 1;
      return Math.max(0, Math.min(1, v));
    })(),
    icon: (typeof raw?.icon === 'string' && raw.icon) || '♪',
    ...(typeof raw?.coverArt === 'string' && raw.coverArt.startsWith('data:')
      ? { coverArt: raw.coverArt }
      : {}),
  };
}

function normalizePlaylist(raw) {
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : require('crypto').randomUUID(),
    name: (typeof raw?.name === 'string' && raw.name.trim()) || 'Playlist',
    icon: (typeof raw?.icon === 'string' && raw.icon) || '♪',
    songIds: Array.isArray(raw?.songIds)
      ? raw.songIds.filter((id) => typeof id === 'string')
      : [],
    createdAt: asNumberOrNull(raw?.createdAt) ?? Date.now(),
  };
}

function normalizeSettings(raw) {
  const sortBy = raw?.sortBy;
  const allowedSort = ['title', 'modifiedAt', 'dateAdded', 'dateModified'];
  return {
    ffmpegPath: typeof raw?.ffmpegPath === 'string' ? raw.ffmpegPath : '',
    ytdlpPath: typeof raw?.ytdlpPath === 'string' ? raw.ytdlpPath : '',
    ytdlpProxy: typeof raw?.ytdlpProxy === 'string' ? raw.ytdlpProxy : '',
    sortBy: allowedSort.includes(sortBy) ? sortBy : DEFAULT_SETTINGS.sortBy,
    sortOrder: raw?.sortOrder === 'desc' ? 'desc' : 'asc',
    globalVolume: (() => {
      const v = asNumberOrNull(raw?.globalVolume);
      if (v == null) return DEFAULT_SETTINGS.globalVolume;
      return Math.max(0, Math.min(1, v));
    })(),
  };
}

function normalizePlayback(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PLAYBACK };
  return {
    currentSongId: typeof raw.currentSongId === 'string' ? raw.currentSongId : null,
    currentTime: Math.max(0, asNumberOrNull(raw.currentTime) ?? 0),
    queue: Array.isArray(raw.queue) ? raw.queue.filter((id) => typeof id === 'string') : [],
    queueIndex: Math.max(0, Math.floor(asNumberOrNull(raw.queueIndex) ?? 0)),
  };
}

function normalizeLibrary(raw) {
  const songs = Array.isArray(raw?.songs) ? raw.songs.map(normalizeSong) : [];
  const songIds = new Set(songs.map((s) => s.id));
  const playlists = Array.isArray(raw?.playlists)
    ? raw.playlists.map((p) => {
        const pl = normalizePlaylist(p);
        pl.songIds = pl.songIds.filter((id) => songIds.has(id));
        return pl;
      })
    : [];

  return {
    songs,
    playlists,
    settings: normalizeSettings(raw?.settings),
    playback: normalizePlayback(raw?.playback),
  };
}

function emptyLibrary() {
  return {
    songs: [],
    playlists: [],
    settings: { ...DEFAULT_SETTINGS },
    playback: { ...DEFAULT_PLAYBACK },
  };
}

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(text);
}

function backupLibrary() {
  const src = libraryPath();
  if (!fs.existsSync(src)) return false;
  try {
    fs.mkdirSync(path.dirname(backupPath()), { recursive: true });
    fs.copyFileSync(src, backupPath());
    return true;
  } catch (err) {
    logError('backup', 'Failed to create library backup', err);
    return false;
  }
}

function restoreFromBackup() {
  const bak = backupPath();
  if (!fs.existsSync(bak)) {
    logError('restore', 'No backup file found', bak);
    return null;
  }
  try {
    const raw = readJsonFile(bak);
    const data = normalizeLibrary(raw);
    // Write restored data back to primary via atomic save (no nested backup)
    saveLibrary(data, { skipBackup: true });
    logError('restore', 'Library restored from backup', { songs: data.songs.length });
    return data;
  } catch (err) {
    logError('restore', 'Failed to restore library from backup', err);
    return null;
  }
}

/**
 * Atomic write: write temp → fsync-ish via rename → replace library.json
 */
function saveLibrary(data, options = {}) {
  const normalized = normalizeLibrary(data);
  const file = libraryPath();
  const tmp = tempPath();

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    if (!options.skipBackup && fs.existsSync(file)) {
      backupLibrary();
    }

    const json = JSON.stringify(normalized, null, 2);
    fs.writeFileSync(tmp, json, 'utf-8');

    // On Windows, rename over existing may fail — unlink then rename
    try {
      fs.renameSync(tmp, file);
    } catch {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      fs.renameSync(tmp, file);
    }

    return normalized;
  } catch (err) {
    logError('save', 'Failed to save library.json', err);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

function needsMigration(raw) {
  if (!raw || typeof raw !== 'object') return true;
  if (!Array.isArray(raw.songs)) return true;
  if (raw.songs.length === 0) return !raw.playback || !raw.settings;
  const sample = raw.songs[0];
  return (
    sample.dateAdded == null ||
    sample.dateModified == null ||
    sample.playCount == null ||
    !('albumArtist' in sample) ||
    !('coverPath' in sample)
  );
}

function loadLibrary() {
  const file = libraryPath();

  if (fs.existsSync(file)) {
    try {
      const raw = readJsonFile(file);
      const data = normalizeLibrary(raw);
      if (needsMigration(raw)) {
        try {
          saveLibrary(data, { skipBackup: false });
          logError('migrate', 'Library migrated to expanded song model', {
            songs: data.songs.length,
          });
        } catch (err) {
          logError('migrate', 'Normalized library could not be written back', err);
        }
      }
      return data;
    } catch (err) {
      logError('load', 'Primary library.json is corrupt or unreadable', err);
      const restored = restoreFromBackup();
      if (restored) return restored;
      logError('load', 'Falling back to empty library after failed restore');
      return emptyLibrary();
    }
  }

  // No primary — try backup
  if (fs.existsSync(backupPath())) {
    logError('load', 'Primary library missing, trying backup');
    const restored = restoreFromBackup();
    if (restored) return restored;
  }

  return emptyLibrary();
}

module.exports = {
  DEFAULT_SETTINGS,
  libraryPath,
  backupPath,
  logsDir,
  logFilePath,
  logError,
  normalizeSong,
  normalizeLibrary,
  emptyLibrary,
  backupLibrary,
  restoreFromBackup,
  saveLibrary,
  loadLibrary,
};
