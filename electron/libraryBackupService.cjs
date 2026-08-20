/**
 * Export / import portable library backup (likes, playlists, discovery).
 * Audio files are NOT included — tracks are rematched by title+artist on import.
 */

const fs = require('fs');
const { randomUUID } = require('crypto');
const { app, dialog } = require('electron');
const { logError } = require('./libraryStore.cjs');
const { isAutoPlaylistId } = require('./autoPlaylistService.cjs');

const FORMAT = 'ime-music-library-backup';
const FORMAT_VERSION = 1;

function trackRef(song) {
  return {
    title: String(song?.title || '').trim(),
    artist: String(song?.artist || '').trim(),
    album: String(song?.album || '').trim() || undefined,
  };
}

function buildBackupPayload(db) {
  const songs = db.getAllTracks() || [];
  const playlists = (db.getAllPlaylists() || []).filter((p) => !isAutoPlaylistId(p.id));
  const settings = db.getSettings() || {};
  const discovery = settings.discovery || {};

  const byId = new Map(songs.map((s) => [s.id, s]));
  const liked = songs.filter((s) => s.liked).map(trackRef);

  const playlistPayload = playlists.map((pl) => ({
    name: pl.name,
    icon: pl.icon || '♪',
    description: pl.description || null,
    tracks: (pl.songIds || [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map(trackRef),
  }));

  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    appVersion: (() => {
      try {
        return app.getVersion();
      } catch {
        return 'unknown';
      }
    })(),
    liked,
    playlists: playlistPayload,
    discovery: {
      wishlist: Array.isArray(discovery.wishlist) ? discovery.wishlist : [],
      favoriteArtists: Array.isArray(discovery.favoriteArtists) ? discovery.favoriteArtists : [],
      blockedArtists: Array.isArray(discovery.blockedArtists) ? discovery.blockedArtists : [],
      blockedTracks: Array.isArray(discovery.blockedTracks) ? discovery.blockedTracks : [],
      filterMode: discovery.filterMode || 'all',
      chartCountry: discovery.chartCountry || 'ru',
      waves: discovery.waves || undefined,
    },
    stats: {
      likedCount: liked.length,
      playlistCount: playlistPayload.length,
      wishlistCount: (discovery.wishlist || []).length,
      trackHints: songs.length,
    },
  };
}

async function exportLibraryBackup(db, parentWindow) {
  const payload = buildBackupPayload(db);
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(parentWindow || undefined, {
    title: 'Экспорт библиотеки IMe Music',
    defaultPath: `ime-music-backup-${stamp}.json`,
    filters: [{ name: 'IMe Music Backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true };
  }
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return {
      ok: true,
      path: result.filePath,
      liked: payload.liked.length,
      playlists: payload.playlists.length,
      wishlist: payload.discovery.wishlist.length,
    };
  } catch (err) {
    logError('libraryBackup', 'export failed', err);
    return { ok: false, error: String(err?.message || err) };
  }
}

function resolveTrack(db, ref) {
  if (!ref?.title) return null;
  return db.findTrackByTitleArtist(ref.title, ref.artist || '');
}

function importLibraryBackupData(db, data, { replaceDiscovery = true } = {}) {
  if (!data || data.format !== FORMAT) {
    return { ok: false, error: 'invalid_format' };
  }

  let likedApplied = 0;
  let likedMissing = 0;
  let playlistsCreated = 0;
  let playlistTracksLinked = 0;
  let playlistTracksMissing = 0;

  for (const ref of data.liked || []) {
    const track = resolveTrack(db, ref);
    if (!track) {
      likedMissing += 1;
      continue;
    }
    if (!track.liked) {
      db.setTrackLiked(track.id, true);
      likedApplied += 1;
    }
  }

  const existing = db.getAllPlaylists() || [];
  for (const pl of data.playlists || []) {
    const name = String(pl.name || '').trim();
    if (!name) continue;
    const songIds = [];
    for (const ref of pl.tracks || []) {
      const track = resolveTrack(db, ref);
      if (!track) {
        playlistTracksMissing += 1;
        continue;
      }
      songIds.push(track.id);
      playlistTracksLinked += 1;
    }

    const sameName = existing.find(
      (p) => !isAutoPlaylistId(p.id) && String(p.name).toLowerCase() === name.toLowerCase(),
    );
    if (sameName) {
      db.setPlaylistTracks(sameName.id, songIds);
      db.updatePlaylist(sameName.id, {
        icon: pl.icon || sameName.icon,
        description: pl.description ?? sameName.description,
      });
    } else {
      const id = randomUUID();
      db.createPlaylist({
        id,
        name,
        icon: pl.icon || '♪',
        description: pl.description || null,
      });
      db.setPlaylistTracks(id, songIds);
      playlistsCreated += 1;
    }
  }

  if (data.discovery && replaceDiscovery) {
    const current = db.getSettings();
    const nextDiscovery = {
      ...(current.discovery || {}),
      ...data.discovery,
      wishlist: Array.isArray(data.discovery.wishlist)
        ? data.discovery.wishlist
        : current.discovery?.wishlist || [],
      favoriteArtists: Array.isArray(data.discovery.favoriteArtists)
        ? data.discovery.favoriteArtists
        : current.discovery?.favoriteArtists || [],
      blockedArtists: Array.isArray(data.discovery.blockedArtists)
        ? data.discovery.blockedArtists
        : current.discovery?.blockedArtists || [],
      blockedTracks: Array.isArray(data.discovery.blockedTracks)
        ? data.discovery.blockedTracks
        : current.discovery?.blockedTracks || [],
    };
    db.updateSettings({ discovery: nextDiscovery });
  }

  return {
    ok: true,
    likedApplied,
    likedMissing,
    playlistsCreated,
    playlistTracksLinked,
    playlistTracksMissing,
    wishlist: Array.isArray(data.discovery?.wishlist) ? data.discovery.wishlist.length : 0,
  };
}

async function importLibraryBackup(db, parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow || undefined, {
    title: 'Импорт бэкапа IMe Music',
    properties: ['openFile'],
    filters: [{ name: 'IMe Music Backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, cancelled: true };
  }
  try {
    const text = fs.readFileSync(result.filePaths[0], 'utf8');
    const data = JSON.parse(text);
    const imported = importLibraryBackupData(db, data);
    if (!imported.ok) return imported;
    return { ...imported, path: result.filePaths[0] };
  } catch (err) {
    logError('libraryBackup', 'import failed', err);
    return { ok: false, error: String(err?.message || err) };
  }
}

module.exports = {
  FORMAT,
  buildBackupPayload,
  exportLibraryBackup,
  importLibraryBackup,
  importLibraryBackupData,
};
