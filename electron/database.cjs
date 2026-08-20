const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { app } = require('electron');
const { logError, normalizeLibrary, libraryPath, backupLibrary } = require('./libraryStore.cjs');
const { checkBetterSqlite3 } = require('./sqliteCheck.cjs');

const SCHEMA_VERSION = 4;

let db = null;
let Database = null;

function loadDatabaseModule() {
  if (Database) return Database;
  const check = checkBetterSqlite3();
  if (!check.ok) {
    const err = new Error(
      `SQLite (better-sqlite3 ${check.version}) недоступен: ${check.error}. ${check.hint}`,
    );
    err.sqliteCheck = check;
    logError('database', 'better-sqlite3 failed to load', check);
    throw err;
  }
  Database = require('better-sqlite3');
  return Database;
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'data', 'library.db');
}

function openDatabase() {
  if (db) return db;
  const Db = loadDatabaseModule();
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    db = new Db(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables(db);
    ensureSchema(db);
    return db;
  } catch (err) {
    logError('database', 'Failed to open SQLite database', { dbPath, err });
    db = null;
    throw err;
  }
}

function createTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      album_artist TEXT,
      genre TEXT,
      year INTEGER,
      track_number INTEGER,
      disc_number INTEGER,
      duration REAL NOT NULL DEFAULT 0,
      format TEXT,
      bitrate INTEGER,
      sample_rate INTEGER,
      file_size INTEGER,
      date_added REAL NOT NULL,
      date_modified REAL NOT NULL,
      cover_path TEXT,
      liked INTEGER NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0,
      last_played_at REAL,
      volume REAL NOT NULL DEFAULT 1,
      icon TEXT NOT NULL DEFAULT '♪',
      comment TEXT,
      composer TEXT,
      rating INTEGER
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      cover_path TEXT,
      icon TEXT NOT NULL DEFAULT '♪',
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playback_queue (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      added_at REAL NOT NULL,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS listen_history (
      id TEXT PRIMARY KEY NOT NULL,
      track_id TEXT NOT NULL,
      played_at REAL NOT NULL,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
    CREATE INDEX IF NOT EXISTS idx_tracks_liked ON tracks(liked);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pos ON playlist_tracks(playlist_id, position);
    CREATE INDEX IF NOT EXISTS idx_playback_queue_pos ON playback_queue(position);
    CREATE INDEX IF NOT EXISTS idx_listen_history_played ON listen_history(played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_listen_history_track ON listen_history(track_id);
  `);
}

function ensureSchema(database) {
  let version = 1;
  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  if (row) version = parseInt(row.value, 10) || 1;

  if (version < 2) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS playback_queue (
        id TEXT PRIMARY KEY NOT NULL,
        track_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        added_at REAL NOT NULL,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_playback_queue_pos ON playback_queue(position);
    `);
  }

  if (version < 3) {
    const cols = database.prepare('PRAGMA table_info(tracks)').all().map((c) => c.name);
    if (!cols.includes('comment')) {
      database.exec('ALTER TABLE tracks ADD COLUMN comment TEXT');
    }
    if (!cols.includes('composer')) {
      database.exec('ALTER TABLE tracks ADD COLUMN composer TEXT');
    }
    if (!cols.includes('rating')) {
      database.exec('ALTER TABLE tracks ADD COLUMN rating INTEGER');
    }
  }

  if (version < 4) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS listen_history (
        id TEXT PRIMARY KEY NOT NULL,
        track_id TEXT NOT NULL,
        played_at REAL NOT NULL,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_listen_history_played ON listen_history(played_at DESC);
      CREATE INDEX IF NOT EXISTS idx_listen_history_track ON listen_history(track_id);
    `);
  }

  if (version < SCHEMA_VERSION) {
    database
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run('schema_version', String(SCHEMA_VERSION));
    logError('migrate', 'Schema upgraded', { from: version, to: SCHEMA_VERSION });
  } else if (!row) {
    database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  }

  pruneQueueTable(database);
  migratePlaybackQueueFromSettings(database);
  migrateAccidentalQueueHotkey(database);
}

function rowToQueueItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    trackId: row.track_id,
    position: row.position,
    addedAt: row.added_at,
  };
}

function renumberQueuePositions(database) {
  const rows = database.prepare('SELECT id FROM playback_queue ORDER BY position ASC, added_at ASC').all();
  const update = database.prepare('UPDATE playback_queue SET position = ? WHERE id = ?');
  rows.forEach((r, i) => update.run(i, r.id));
}

function pruneQueueTable(database) {
  database.prepare(
    'DELETE FROM playback_queue WHERE track_id NOT IN (SELECT id FROM tracks)',
  ).run();
  renumberQueuePositions(database);
}

function writeSettingRow(database, key, value) {
  database
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, JSON.stringify(value));
}

function migratePlaybackQueueFromSettings(database) {
  const count = database.prepare('SELECT COUNT(*) AS c FROM playback_queue').get().c;
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get('playbackQueue');
  let legacy = [];
  try {
    legacy = row ? JSON.parse(row.value) : [];
  } catch {
    legacy = [];
  }
  if (count === 0 && Array.isArray(legacy) && legacy.length > 0) {
    legacy.forEach((trackId, i) => {
      if (typeof trackId !== 'string') return;
      if (!database.prepare('SELECT 1 FROM tracks WHERE id = ?').get(trackId)) return;
      database
        .prepare(
          'INSERT INTO playback_queue (id, track_id, position, added_at) VALUES (?, ?, ?, ?)',
        )
        .run(randomUUID(), trackId, i, Date.now());
    });
    logError('migrate', 'Legacy settings.playbackQueue migrated to playback_queue', {
      count: legacy.length,
    });
  }
  writeSettingRow(database, 'playbackQueue', []);
}

/** KeyQ used to add the current track. Users pressed Q for «очередь» and the song stuck in SQLite. */
function migrateAccidentalQueueHotkey(database) {
  const flag = database.prepare('SELECT value FROM meta WHERE key = ?').get('phantom_queue_q_fix');
  if (flag && flag.value === '1') return;

  let rawHotkeys = {};
  try {
    const hotkeysRow = database.prepare('SELECT value FROM settings WHERE key = ?').get('hotkeys');
    if (hotkeysRow) rawHotkeys = JSON.parse(hotkeysRow.value) || {};
  } catch {
    rawHotkeys = {};
  }

  const addBind =
    typeof rawHotkeys.addToQueue === 'string' && rawHotkeys.addToQueue.trim()
      ? rawHotkeys.addToQueue.trim()
      : 'KeyQ';

  if (addBind === 'KeyQ') {
    database.prepare('DELETE FROM playback_queue').run();
    writeSettingRow(database, 'playbackQueue', []);
    writeSettingRow(database, 'hotkeys', {
      ...rawHotkeys,
      addToQueue: '',
      queue: rawHotkeys.queue === 'KeyE' || !rawHotkeys.queue ? 'KeyQ' : rawHotkeys.queue,
    });
    logError('migrate', 'Cleared queue items added by KeyQ hotkey; Q now opens the queue');
  }

  database
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run('phantom_queue_q_fix', '1');
}

function getPlaybackQueue() {
  const database = openDatabase();
  const rows = database
    .prepare(
      `SELECT pq.id, pq.track_id, pq.position, pq.added_at
       FROM playback_queue pq
       INNER JOIN tracks t ON t.id = pq.track_id
       ORDER BY pq.position ASC, pq.added_at ASC`,
    )
    .all();
  return rows.map(rowToQueueItem);
}

function getPlaybackQueueWithSongs() {
  return getPlaybackQueue()
    .map((item) => ({
      ...item,
      song: getTrackById(item.trackId),
    }))
    .filter((item) => item.song);
}

function addQueueEnd(trackId) {
  const database = openDatabase();
  if (!getTrackById(trackId)) return null;
  const dup = database.prepare('SELECT id FROM playback_queue WHERE track_id = ?').get(trackId);
  if (dup) {
    return rowToQueueItem(database.prepare('SELECT * FROM playback_queue WHERE id = ?').get(dup.id));
  }
  const row = database.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM playback_queue').get();
  const id = randomUUID();
  const now = Date.now();
  database
    .prepare(
      'INSERT INTO playback_queue (id, track_id, position, added_at) VALUES (?, ?, ?, ?)',
    )
    .run(id, trackId, (row.maxPos ?? -1) + 1, now);
  return rowToQueueItem(database.prepare('SELECT * FROM playback_queue WHERE id = ?').get(id));
}

function addQueueNext(trackId) {
  const database = openDatabase();
  if (!getTrackById(trackId)) return null;
  database.prepare('DELETE FROM playback_queue WHERE track_id = ?').run(trackId);
  const id = randomUUID();
  const now = Date.now();
  database
    .prepare(
      'INSERT INTO playback_queue (id, track_id, position, added_at) VALUES (?, ?, -1, ?)',
    )
    .run(id, trackId, now);
  renumberQueuePositions(database);
  return rowToQueueItem(database.prepare('SELECT * FROM playback_queue WHERE id = ?').get(id));
}

function removeQueueItem(queueRowId) {
  const database = openDatabase();
  const info = database.prepare('DELETE FROM playback_queue WHERE id = ?').run(queueRowId);
  if (info.changes > 0) renumberQueuePositions(database);
  return info.changes > 0;
}

function clearPlaybackQueue() {
  const database = openDatabase();
  database.prepare('DELETE FROM playback_queue').run();
  writeSettingRow(database, 'playbackQueue', []);
}

function reorderPlaybackQueue(orderedQueueRowIds) {
  const database = openDatabase();
  const tx = database.transaction((ids) => {
    ids.forEach((id, position) => {
      database.prepare('UPDATE playback_queue SET position = ? WHERE id = ?').run(position, id);
    });
  });
  tx(orderedQueueRowIds);
  return getPlaybackQueue();
}

function peekQueueHeadTrackId() {
  const database = openDatabase();
  const row = database
    .prepare('SELECT track_id FROM playback_queue ORDER BY position ASC, added_at ASC LIMIT 1')
    .get();
  return row ? row.track_id : null;
}

/** Take first queue item and remove it (when starting playback from queue). */
function takeQueueHeadTrackId() {
  const database = openDatabase();
  const row = database
    .prepare('SELECT id, track_id FROM playback_queue ORDER BY position ASC, added_at ASC LIMIT 1')
    .get();
  if (!row) return null;
  database.prepare('DELETE FROM playback_queue WHERE id = ?').run(row.id);
  renumberQueuePositions(database);
  return row.track_id;
}

/** Record a listen: history row + bump play_count / last_played_at. Returns updated song. */
function recordListen(trackId) {
  if (!trackId || typeof trackId !== 'string') return null;
  const database = openDatabase();
  const track = database.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
  if (!track) return null;
  const now = Date.now();
  database
    .prepare('INSERT INTO listen_history (id, track_id, played_at) VALUES (?, ?, ?)')
    .run(randomUUID(), trackId, now);
  database
    .prepare(
      'UPDATE tracks SET play_count = COALESCE(play_count, 0) + 1, last_played_at = ? WHERE id = ?',
    )
    .run(now, trackId);
  // Keep table bounded
  database
    .prepare(
      `DELETE FROM listen_history WHERE id IN (
        SELECT id FROM listen_history ORDER BY played_at DESC LIMIT -1 OFFSET 5000
      )`,
    )
    .run();
  return getTrackById(trackId);
}

function getListenStats() {
  const database = openDatabase();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const weekCount = database
    .prepare('SELECT COUNT(*) AS c FROM listen_history WHERE played_at >= ?')
    .get(weekAgo).c;
  const monthCount = database
    .prepare('SELECT COUNT(*) AS c FROM listen_history WHERE played_at >= ?')
    .get(monthAgo).c;
  const totalCount = database.prepare('SELECT COUNT(*) AS c FROM listen_history').get().c;

  const topArtists = database
    .prepare(
      `SELECT t.artist AS artist, COUNT(*) AS count
       FROM listen_history h
       JOIN tracks t ON t.id = h.track_id
       WHERE h.played_at >= ?
       GROUP BY t.artist
       ORDER BY count DESC
       LIMIT 8`,
    )
    .all(monthAgo)
    .map((r) => ({ artist: r.artist, count: Number(r.count) || 0 }));

  const topTracks = database
    .prepare(
      `SELECT t.id AS trackId, t.title AS title, t.artist AS artist, COUNT(*) AS count
       FROM listen_history h
       JOIN tracks t ON t.id = h.track_id
       WHERE h.played_at >= ?
       GROUP BY t.id
       ORDER BY count DESC
       LIMIT 8`,
    )
    .all(monthAgo)
    .map((r) => ({
      trackId: r.trackId,
      title: r.title,
      artist: r.artist,
      count: Number(r.count) || 0,
    }));

  return { weekCount, monthCount, totalCount, topArtists, topTracks };
}

function getListenHistory(limit = 80) {
  const database = openDatabase();
  const lim = Math.max(1, Math.min(200, Math.floor(Number(limit) || 80)));
  const rows = database
    .prepare(
      `SELECT h.id, h.track_id, h.played_at
       FROM listen_history h
       ORDER BY h.played_at DESC
       LIMIT ?`,
    )
    .all(lim);

  const items = rows.map((row) => {
    const song = getTrackById(row.track_id);
    return {
      id: row.id,
      trackId: row.track_id,
      playedAt: Number(row.played_at) || 0,
      song: song || null,
    };
  });

  return { items, stats: getListenStats() };
}

function getMeta(key) {
  const database = openDatabase();
  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  const database = openDatabase();
  database.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, String(value));
}

function rowToSong(row) {
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.album_artist ?? null,
    genre: row.genre ?? null,
    year: row.year ?? null,
    trackNumber: row.track_number ?? null,
    discNumber: row.disc_number ?? null,
    duration: Number(row.duration) || 0,
    format: row.format ?? null,
    bitrate: row.bitrate ?? null,
    sampleRate: row.sample_rate ?? null,
    fileSize: row.file_size ?? null,
    dateAdded: Number(row.date_added) || 0,
    dateModified: Number(row.date_modified) || 0,
    coverPath: row.cover_path ?? null,
    liked: Boolean(row.liked),
    playCount: Number(row.play_count) || 0,
    lastPlayedAt: row.last_played_at == null ? null : Number(row.last_played_at),
    volume: row.volume == null ? 1 : Number(row.volume),
    icon: row.icon || '♪',
    comment: row.comment ?? null,
    composer: row.composer ?? null,
    rating: row.rating == null ? null : Number(row.rating),
  };
}

function getAllTracks() {
  const database = openDatabase();
  const rows = database.prepare('SELECT * FROM tracks ORDER BY title COLLATE NOCASE').all();
  return rows.map(rowToSong);
}

function getTrackById(id) {
  const database = openDatabase();
  return rowToSong(database.prepare('SELECT * FROM tracks WHERE id = ?').get(id));
}

function getTrackByPath(filePath) {
  const database = openDatabase();
  const normalized = path.normalize(filePath);
  const row =
    database.prepare('SELECT * FROM tracks WHERE file_path = ?').get(normalized) ||
    database
      .prepare('SELECT * FROM tracks WHERE lower(file_path) = lower(?)')
      .get(normalized);
  return rowToSong(row);
}

function normalizeTrackMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function primaryArtistName(value) {
  const cleaned = normalizeTrackMatchText(value);
  if (!cleaned) return '';
  return cleaned.split(/,|&|\bfeat\b|\bft\b|\bvs\b/i)[0].trim();
}

function trackMatchKey(title, artist) {
  const t = normalizeTrackMatchText(title);
  const a = primaryArtistName(artist);
  if (!t || !a) return '';
  return `${a}|${t}`;
}

function findTrackByTitleArtist(title, artist) {
  const key = trackMatchKey(title, artist);
  if (!key) return null;

  const tracks = getAllTracks();
  for (const track of tracks) {
    if (trackMatchKey(track.title, track.artist) === key) {
      return track;
    }
  }

  const titleNorm = normalizeTrackMatchText(title);
  const artistNorm = primaryArtistName(artist);
  if (!titleNorm || !artistNorm) return null;

  for (const track of tracks) {
    if (normalizeTrackMatchText(track.title) !== titleNorm) continue;
    const trackArtist = primaryArtistName(track.artist);
    if (trackArtist === artistNorm || trackArtist.includes(artistNorm) || artistNorm.includes(trackArtist)) {
      return track;
    }
  }

  return null;
}

function insertTrack(song) {
  const database = openDatabase();
  const filePath = path.normalize(song.filePath);
  try {
    database.prepare(`
      INSERT INTO tracks (
        id, file_path, title, artist, album, album_artist, genre, year,
        track_number, disc_number, duration, format, bitrate, sample_rate,
        file_size, date_added, date_modified, cover_path, liked, play_count,
        last_played_at, volume, icon, comment, composer, rating
      ) VALUES (
        @id, @file_path, @title, @artist, @album, @album_artist, @genre, @year,
        @track_number, @disc_number, @duration, @format, @bitrate, @sample_rate,
        @file_size, @date_added, @date_modified, @cover_path, @liked, @play_count,
        @last_played_at, @volume, @icon, @comment, @composer, @rating
      )
    `).run({
      id: song.id,
      file_path: filePath,
      title: song.title,
      artist: song.artist,
      album: song.album,
      album_artist: song.albumArtist ?? null,
      genre: song.genre ?? null,
      year: song.year ?? null,
      track_number: song.trackNumber ?? null,
      disc_number: song.discNumber ?? null,
      duration: song.duration ?? 0,
      format: song.format ?? null,
      bitrate: song.bitrate ?? null,
      sample_rate: song.sampleRate ?? null,
      file_size: song.fileSize ?? null,
      date_added: song.dateAdded ?? Date.now(),
      date_modified: song.dateModified ?? Date.now(),
      cover_path: song.coverPath ?? null,
      liked: song.liked ? 1 : 0,
      play_count: song.playCount ?? 0,
      last_played_at: song.lastPlayedAt ?? null,
      volume: song.volume ?? 1,
      icon: song.icon || '♪',
      comment: song.comment ?? null,
      composer: song.composer ?? null,
      rating: song.rating ?? null,
    });
    return getTrackById(song.id);
  } catch (err) {
    logError('database', 'insertTrack failed', { filePath, err });
    throw err;
  }
}

function updateTrack(id, updates) {
  const database = openDatabase();
  const current = getTrackById(id);
  if (!current) return null;
  const next = { ...current, ...updates, id };
  try {
    database.prepare(`
      UPDATE tracks SET
        file_path = @file_path,
        title = @title,
        artist = @artist,
        album = @album,
        album_artist = @album_artist,
        genre = @genre,
        year = @year,
        track_number = @track_number,
        disc_number = @disc_number,
        duration = @duration,
        format = @format,
        bitrate = @bitrate,
        sample_rate = @sample_rate,
        file_size = @file_size,
        date_added = @date_added,
        date_modified = @date_modified,
        cover_path = @cover_path,
        liked = @liked,
        play_count = @play_count,
        last_played_at = @last_played_at,
        volume = @volume,
        icon = @icon,
        comment = @comment,
        composer = @composer,
        rating = @rating
      WHERE id = @id
    `).run({
      id,
      file_path: path.normalize(next.filePath),
      title: next.title,
      artist: next.artist,
      album: next.album,
      album_artist: next.albumArtist ?? null,
      genre: next.genre ?? null,
      year: next.year ?? null,
      track_number: next.trackNumber ?? null,
      disc_number: next.discNumber ?? null,
      duration: next.duration ?? 0,
      format: next.format ?? null,
      bitrate: next.bitrate ?? null,
      sample_rate: next.sampleRate ?? null,
      file_size: next.fileSize ?? null,
      date_added: next.dateAdded,
      date_modified: next.dateModified,
      cover_path: next.coverPath ?? null,
      liked: next.liked ? 1 : 0,
      play_count: next.playCount ?? 0,
      last_played_at: next.lastPlayedAt ?? null,
      volume: next.volume ?? 1,
      icon: next.icon || '♪',
      comment: next.comment ?? null,
      composer: next.composer ?? null,
      rating: next.rating ?? null,
    });
    return getTrackById(id);
  } catch (err) {
    logError('database', 'updateTrack failed', { id, err });
    throw err;
  }
}

function deleteTrack(id) {
  const database = openDatabase();
  try {
    const info = database.prepare('DELETE FROM tracks WHERE id = ?').run(id);
    return info.changes > 0;
  } catch (err) {
    logError('database', 'deleteTrack failed', { id, err });
    throw err;
  }
}

function setTrackLiked(id, liked) {
  return updateTrack(id, { liked: Boolean(liked) });
}

function countTracksUsingCover(coverPath) {
  if (!coverPath) return 0;
  const database = openDatabase();
  const row = database
    .prepare('SELECT COUNT(*) AS c FROM tracks WHERE cover_path = ? OR lower(cover_path) = lower(?)')
    .get(coverPath, coverPath);
  return row?.c || 0;
}

function getAllPlaylists() {
  const database = openDatabase();
  const playlists = database.prepare('SELECT * FROM playlists ORDER BY created_at ASC').all();
  const trackStmt = database.prepare(
    'SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC',
  );
  return playlists.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon || '♪',
    description: p.description ?? null,
    coverPath: p.cover_path ?? null,
    songIds: trackStmt.all(p.id).map((r) => r.track_id),
    createdAt: Number(p.created_at) || 0,
    updatedAt: Number(p.updated_at) || 0,
  }));
}

function createPlaylist({ id, name, icon, description, coverPath, createdAt }) {
  const database = openDatabase();
  const now = createdAt || Date.now();
  try {
    database.prepare(`
      INSERT INTO playlists (id, name, description, cover_path, icon, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description ?? null, coverPath ?? null, icon || '♪', now, now);
    return getAllPlaylists().find((p) => p.id === id) || null;
  } catch (err) {
    logError('database', 'createPlaylist failed', { id, err });
    throw err;
  }
}

function updatePlaylist(id, updates) {
  const database = openDatabase();
  const current = getAllPlaylists().find((p) => p.id === id);
  if (!current) return null;
  const next = {
    name: updates.name ?? current.name,
    description: updates.description !== undefined ? updates.description : current.description,
    coverPath: updates.coverPath !== undefined ? updates.coverPath : current.coverPath,
    icon: updates.icon ?? current.icon,
  };
  try {
    database.prepare(`
      UPDATE playlists SET name = ?, description = ?, cover_path = ?, icon = ?, updated_at = ?
      WHERE id = ?
    `).run(next.name, next.description ?? null, next.coverPath ?? null, next.icon || '♪', Date.now(), id);

    if (Array.isArray(updates.songIds)) {
      setPlaylistTracks(id, updates.songIds);
    }
    return getAllPlaylists().find((p) => p.id === id) || null;
  } catch (err) {
    logError('database', 'updatePlaylist failed', { id, err });
    throw err;
  }
}

function deletePlaylist(id) {
  if (require('./autoPlaylistService.cjs').isAutoPlaylistId(id)) {
    return false;
  }
  const database = openDatabase();
  try {
    const info = database.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    return info.changes > 0;
  } catch (err) {
    logError('database', 'deletePlaylist failed', { id, err });
    throw err;
  }
}

function setPlaylistTracks(playlistId, songIds) {
  const database = openDatabase();
  const tx = database.transaction((ids) => {
    database.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);
    const insert = database.prepare(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
    );
    ids.forEach((trackId, index) => {
      insert.run(playlistId, trackId, index);
    });
    database.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
  });
  try {
    tx(songIds);
    return true;
  } catch (err) {
    logError('database', 'setPlaylistTracks failed', { playlistId, err });
    throw err;
  }
}

function addToPlaylist(playlistId, trackId) {
  const database = openDatabase();
  const exists = database
    .prepare('SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
    .get(playlistId, trackId);
  if (exists) return false;
  const row = database
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM playlist_tracks WHERE playlist_id = ?')
    .get(playlistId);
  const position = (row?.maxPos ?? -1) + 1;
  try {
    database.prepare(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
    ).run(playlistId, trackId, position);
    database.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
    return true;
  } catch (err) {
    logError('database', 'addToPlaylist failed', { playlistId, trackId, err });
    throw err;
  }
}

function getPlaylistIdsForTrack(trackId) {
  const database = openDatabase();
  try {
    return database
      .prepare('SELECT playlist_id FROM playlist_tracks WHERE track_id = ?')
      .all(trackId)
      .map((row) => row.playlist_id);
  } catch (err) {
    logError('database', 'getPlaylistIdsForTrack failed', { trackId, err });
    return [];
  }
}

function removeFromPlaylist(playlistId, trackId) {
  const database = openDatabase();
  try {
    const info = database
      .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
      .run(playlistId, trackId);
    if (info.changes === 0) return false;
    // Re-pack positions
    const ids = database
      .prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC')
      .all(playlistId)
      .map((r) => r.track_id);
    setPlaylistTracks(playlistId, ids);
    return true;
  } catch (err) {
    logError('database', 'removeFromPlaylist failed', { playlistId, trackId, err });
    throw err;
  }
}

const appearanceMod = require('./appearance.cjs');
const themeService = require('./themeService.cjs');

const DEFAULT_PLAYBACK = {
  shuffle: false,
  repeat: 'off',
  normalizeVolume: false,
  eqEnabled: false,
  eqBass: 0,
  eqMid: 0,
  eqTreble: 0,
  eqPreset: 'flat',
  closeToTray: true,
  crossfadeSeconds: 0,
  gaplessEnabled: false,
};

const DEFAULT_DISCOVERY = {
  filterMode: 'all',
  blockedArtists: [],
  blockedTracks: [],
  favoriteArtists: [],
  wishlist: [],
  chartCountry: 'ru',
  waves: {
    genre: 'all',
    language: 'any',
    mood: 'any',
    seed: 'taste',
    diversity: 'normal',
    skipKnown: true,
  },
};

const DEFAULT_SCROBBLE = {
  listenBrainzEnabled: false,
  listenBrainzToken: '',
  lastFmEnabled: false,
  lastFmApiKey: '',
  lastFmApiSecret: '',
  lastFmSessionKey: '',
  lastFmUsername: '',
};

function clampEq(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(-12, Math.min(12, v));
}

function normalizePlayback(raw) {
  const base = { ...DEFAULT_PLAYBACK, ...(raw && typeof raw === 'object' ? raw : {}) };
  const repeat = base.repeat === 'one' || base.repeat === 'all' ? base.repeat : 'off';
  const preset =
    base.eqPreset === 'bassBoost' || base.eqPreset === 'vocal' || base.eqPreset === 'custom'
      ? base.eqPreset
      : 'flat';
  const crossfadeSeconds = Math.max(0, Math.min(12, Number(base.crossfadeSeconds) || 0));
  return {
    shuffle: Boolean(base.shuffle),
    repeat,
    normalizeVolume: Boolean(base.normalizeVolume),
    eqEnabled: Boolean(base.eqEnabled),
    eqBass: clampEq(base.eqBass),
    eqMid: clampEq(base.eqMid),
    eqTreble: clampEq(base.eqTreble),
    eqPreset: preset,
    closeToTray: base.closeToTray !== false,
    crossfadeSeconds,
    gaplessEnabled: Boolean(base.gaplessEnabled),
  };
}

function artistBlockKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDiscovery(raw) {
  const base = { ...DEFAULT_DISCOVERY, ...(raw && typeof raw === 'object' ? raw : {}) };
  const mode =
    base.filterMode === 'liked' ||
    base.filterMode === 'current' ||
    base.filterMode === 'wishlist' ||
    base.filterMode === 'chart'
      ? base.filterMode
      : 'all';
  const blockedArtists = Array.isArray(base.blockedArtists)
    ? base.blockedArtists
        .filter((a) => a && typeof a === 'object' && a.name)
        .map((a) => ({
          key: artistBlockKey(a.key || a.name),
          name: String(a.name).trim(),
          blockedAt: Number(a.blockedAt) || Date.now(),
        }))
        .filter((a) => a.key && a.name)
        .slice(0, 500)
    : [];
  const blockedTracks = Array.isArray(base.blockedTracks)
    ? base.blockedTracks
        .filter((t) => t && typeof t === 'object' && t.id)
        .map((t) => ({
          id: String(t.id),
          deezerId: t.deezerId ?? t.id,
          title: String(t.title || ''),
          artist: String(t.artist || ''),
          album: String(t.album || ''),
          coverUrl: t.coverUrl || null,
          previewUrl: String(t.previewUrl || ''),
          blockedAt: Number(t.blockedAt) || Date.now(),
        }))
        .slice(0, 1000)
    : [];
  const favoriteArtists = Array.isArray(base.favoriteArtists)
    ? base.favoriteArtists
        .filter((a) => a && typeof a === 'object' && a.name)
        .map((a) => ({
          key: artistBlockKey(a.key || a.name),
          name: String(a.name).trim(),
          deezerId: a.deezerId ?? null,
          pictureUrl: a.pictureUrl || null,
          addedAt: Number(a.addedAt) || Date.now(),
        }))
        .filter((a) => a.key && a.name)
        .slice(0, 500)
    : [];
  const wishlist = Array.isArray(base.wishlist)
    ? base.wishlist
        .filter((t) => t && typeof t === 'object' && t.id)
        .map((t) => ({
          id: String(t.id),
          deezerId: t.deezerId ?? t.id,
          title: String(t.title || ''),
          artist: String(t.artist || ''),
          album: String(t.album || ''),
          coverUrl: t.coverUrl || null,
          previewUrl: String(t.previewUrl || ''),
          duration: Number(t.duration) || 30,
          basedOnArtist: t.basedOnArtist || null,
          source: t.source === 'itunes' ? 'itunes' : 'deezer',
          addedAt: Number(t.addedAt) || Date.now(),
        }))
        .slice(0, 500)
    : [];
  let chartCountry = String(base.chartCountry || 'ru').trim().toLowerCase() || 'ru';
  try {
    const { resolveChartCountry } = require('./chartCountries.cjs');
    chartCountry = resolveChartCountry(chartCountry).code;
  } catch {
    /* keep */
  }
  let waves = {
    genre: 'all',
    language: 'any',
    mood: 'any',
    seed: 'taste',
    diversity: 'normal',
    skipKnown: true,
  };
  try {
    const { normalizeWaves } = require('./wavesService.cjs');
    waves = normalizeWaves(base.waves);
  } catch {
    /* keep defaults */
  }
  return {
    filterMode: mode,
    blockedArtists,
    blockedTracks,
    favoriteArtists,
    wishlist,
    chartCountry,
    waves,
  };
}

const DEFAULT_SETTINGS = {
  ffmpegPath: '',
  ytdlpPath: '',
  ytdlpProxy: '',
  sortBy: 'title',
  sortOrder: 'asc',
  globalVolume: 0.8,
  muted: false,
  theme: 'dark',
  locale: 'ru',
  appearance: appearanceMod.DEFAULT_APPEARANCE,
  hotkeys: appearanceMod.DEFAULT_HOTKEYS,
  uiPresets: [],
  uiThemes: [],
  activeThemeId: 'default',
  wallpapers: [],
  playbackSongId: null,
  playbackTime: 0,
  playbackQueue: [],
  playbackQueueIndex: 0,
  playback: { ...DEFAULT_PLAYBACK },
  discovery: { ...DEFAULT_DISCOVERY },
  scrobble: { ...DEFAULT_SCROBBLE },
  lastView: null,
};

function getSettings() {
  const database = openDatabase();
  const rows = database.prepare('SELECT key, value FROM settings').all();
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  const legacyTheme = settings.theme;
  settings.appearance = appearanceMod.normalizeAppearance(settings.appearance, legacyTheme);
  settings.theme = settings.appearance.theme === 'system' ? 'system' : settings.appearance.theme;
  settings.hotkeys = appearanceMod.normalizeHotkeys(settings.hotkeys);
  settings.uiPresets = appearanceMod.normalizeUiPresets(settings.uiPresets);
  settings.uiThemes = appearanceMod.normalizeUiThemes(settings.uiThemes);
  settings.activeThemeId =
    typeof settings.activeThemeId === 'string' && settings.activeThemeId
      ? settings.activeThemeId
      : 'default';
  settings.wallpapers = themeService.enrichWallpaperMeta(
    appearanceMod.normalizeWallpapersMeta(settings.wallpapers),
  );
  settings.playback = normalizePlayback(settings.playback);
  settings.discovery = normalizeDiscovery(settings.discovery);
  settings.scrobble = require('./scrobbleService.cjs').normalizeScrobble(settings.scrobble);
  const loc = String(settings.locale || 'ru').toLowerCase();
  settings.locale = ['ru', 'en', 'zh', 'hi', 'es', 'fr', 'uk'].includes(loc) ? loc : 'ru';
  if (settings.lastView && typeof settings.lastView === 'object' && settings.lastView.kind) {
    /* keep */
  } else {
    settings.lastView = null;
  }
  return settings;
}

function updateSettings(updates) {
  const database = openDatabase();
  const current = getSettings();
  const next = { ...current, ...updates };

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'appearance')) {
    next.appearance = appearanceMod.normalizeAppearance(
      appearanceMod.deepMerge(current.appearance, updates.appearance || {}),
      updates.theme || current.theme,
    );
    next.theme = next.appearance.theme === 'system' ? 'system' : next.appearance.theme;
  } else if (updates && Object.prototype.hasOwnProperty.call(updates, 'theme')) {
    next.appearance = appearanceMod.normalizeAppearance(
      { ...current.appearance, theme: updates.theme },
      updates.theme,
    );
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'hotkeys')) {
    next.hotkeys = appearanceMod.normalizeHotkeys(
      appearanceMod.deepMerge(current.hotkeys, updates.hotkeys || {}),
    );
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'uiPresets')) {
    next.uiPresets = appearanceMod.normalizeUiPresets(updates.uiPresets);
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'uiThemes')) {
    next.uiThemes = appearanceMod.normalizeUiThemes(updates.uiThemes);
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'activeThemeId')) {
    next.activeThemeId =
      typeof updates.activeThemeId === 'string' && updates.activeThemeId
        ? updates.activeThemeId
        : 'default';
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'wallpapers')) {
    next.wallpapers = appearanceMod.normalizeWallpapersMeta(updates.wallpapers);
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'playback')) {
    next.playback = normalizePlayback({
      ...current.playback,
      ...(updates.playback || {}),
    });
  } else {
    next.playback = normalizePlayback(current.playback);
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'discovery')) {
    const incoming = updates.discovery || {};
    next.discovery = normalizeDiscovery({
      ...current.discovery,
      ...incoming,
      // arrays replace wholesale when provided
      blockedArtists: Object.prototype.hasOwnProperty.call(incoming, 'blockedArtists')
        ? incoming.blockedArtists
        : current.discovery?.blockedArtists,
      blockedTracks: Object.prototype.hasOwnProperty.call(incoming, 'blockedTracks')
        ? incoming.blockedTracks
        : current.discovery?.blockedTracks,
      wishlist: Object.prototype.hasOwnProperty.call(incoming, 'wishlist')
        ? incoming.wishlist
        : current.discovery?.wishlist,
      favoriteArtists: Object.prototype.hasOwnProperty.call(incoming, 'favoriteArtists')
        ? incoming.favoriteArtists
        : current.discovery?.favoriteArtists,
      waves: {
        ...(current.discovery?.waves || {}),
        ...(incoming.waves && typeof incoming.waves === 'object' ? incoming.waves : {}),
      },
    });
  } else {
    next.discovery = normalizeDiscovery(current.discovery);
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, 'scrobble')) {
    const scrobbleMod = require('./scrobbleService.cjs');
    next.scrobble = scrobbleMod.normalizeScrobble({
      ...current.scrobble,
      ...(updates.scrobble || {}),
    });
  } else {
    next.scrobble = require('./scrobbleService.cjs').normalizeScrobble(current.scrobble);
  }

  // Never persist absolute paths — only metadata file names
  next.wallpapers = appearanceMod.normalizeWallpapersMeta(next.wallpapers).map(
    ({ filePath: _fp, previewPath: _pp, ...rest }) => rest,
  );

  const upsert = database.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const tx = database.transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) {
      upsert.run(key, JSON.stringify(value));
    }
  });
  try {
    tx(next);
    return getSettings();
  } catch (err) {
    logError('database', 'updateSettings failed', err);
    throw err;
  }
}

function getLibrary() {
  return {
    songs: getAllTracks(),
    playlists: getAllPlaylists(),
    settings: getSettings(),
  };
}

function isJsonMigrated() {
  return getMeta('json_migrated') === '1';
}

/**
 * One-time migration from library.json → SQLite.
 * Safe to call repeatedly: skips if already migrated.
 */
function migrateFromJsonIfNeeded() {
  openDatabase();

  const jsonFile = libraryPath();
  const trackCount = getAllTracks().length;
  const alreadyMigrated = isJsonMigrated();

  if (alreadyMigrated) {
    // Recovery: flag set but DB empty while JSON still has songs (e.g. wrong userData during first run)
    if (trackCount === 0 && fs.existsSync(jsonFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
        if (!Array.isArray(raw.songs) || raw.songs.length === 0) {
          return { migrated: false, reason: 'already_migrated' };
        }
        logError('migrate', 'Recovery import: json_migrated set but DB empty', {
          jsonSongs: raw.songs.length,
        });
      } catch (err) {
        logError('migrate', 'Recovery check failed', err);
        return { migrated: false, reason: 'already_migrated' };
      }
    } else {
      return { migrated: false, reason: 'already_migrated' };
    }
  }

  if (!fs.existsSync(jsonFile)) {
    setMeta('json_migrated', '1');
    setMeta('json_migrated_at', new Date().toISOString());
    logError('migrate', 'No library.json found; marked SQLite as ready', { jsonFile });
    return { migrated: false, reason: 'no_json' };
  }

  try {
    backupLibrary();
  } catch (err) {
    logError('migrate', 'Could not backup library.json before migration', err);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
  } catch (err) {
    logError('migrate', 'Failed to parse library.json for migration', err);
    throw new Error('Не удалось прочитать library.json для миграции. Старые данные сохранены.');
  }

  const library = normalizeLibrary(raw);
  const database = openDatabase();

  const migrateTx = database.transaction(() => {
    for (const song of library.songs) {
      const existing = database.prepare('SELECT id FROM tracks WHERE file_path = ?').get(path.normalize(song.filePath));
      if (existing) continue;
      // Also skip if id already exists
      const byId = database.prepare('SELECT id FROM tracks WHERE id = ?').get(song.id);
      if (byId) continue;
      insertTrack(song);
    }

    for (const pl of library.playlists) {
      const exists = database.prepare('SELECT id FROM playlists WHERE id = ?').get(pl.id);
      if (!exists) {
        createPlaylist({
          id: pl.id,
          name: pl.name,
          icon: pl.icon,
          createdAt: pl.createdAt,
        });
      }
      const validIds = pl.songIds.filter((id) => database.prepare('SELECT 1 FROM tracks WHERE id = ?').get(id));
      setPlaylistTracks(pl.id, validIds);
    }

    updateSettings(library.settings);
    setMeta('json_migrated', '1');
    setMeta('json_migrated_at', new Date().toISOString());
    setMeta('json_migrated_songs', String(library.songs.length));
  });

  try {
    migrateTx();
    logError('migrate', 'JSON → SQLite migration completed', {
      songs: library.songs.length,
      playlists: library.playlists.length,
    });
    return {
      migrated: true,
      songs: library.songs.length,
      playlists: library.playlists.length,
    };
  } catch (err) {
    logError('migrate', 'JSON → SQLite migration failed', err);
    throw new Error('Миграция в SQLite не удалась. library.json не изменён, данные не потеряны.');
  }
}

function prunePlaybackQueue() {
  pruneQueueTable(openDatabase());
}

function closeDatabase() {
  if (db) {
    try {
      db.close();
    } catch (err) {
      logError('database', 'Error closing database', err);
    }
    db = null;
  }
}

module.exports = {
  getDbPath,
  openDatabase,
  createTables,
  getLibrary,
  getAllTracks,
  getTrackById,
  getTrackByPath,
  findTrackByTitleArtist,
  insertTrack,
  updateTrack,
  deleteTrack,
  setTrackLiked,
  countTracksUsingCover,
  getAllPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addToPlaylist,
  getPlaylistIdsForTrack,
  removeFromPlaylist,
  setPlaylistTracks,
  getSettings,
  updateSettings,
  migrateFromJsonIfNeeded,
  isJsonMigrated,
  closeDatabase,
  getMeta,
  getPlaybackQueue,
  getPlaybackQueueWithSongs,
  addQueueEnd,
  addQueueNext,
  removeQueueItem,
  clearPlaybackQueue,
  reorderPlaybackQueue,
  peekQueueHeadTrackId,
  takeQueueHeadTrackId,
  prunePlaybackQueue,
  recordListen,
  getListenHistory,
  getListenStats,
};
