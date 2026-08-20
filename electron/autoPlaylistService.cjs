const AUTO = {
  frequent: {
    id: 'auto:frequent',
    name: 'Часто слушаю',
    icon: '🔥',
    description: 'Автоплейлист · по числу прослушиваний',
  },
  neglected: {
    id: 'auto:neglected',
    name: 'Давно не звучало',
    icon: '⏳',
    description: 'Автоплейлист · давно не играли',
  },
  liked90s: {
    id: 'auto:liked-90s',
    name: 'Избранное 90-х',
    icon: '💿',
    description: 'Автоплейлист · лайки 1990–1999',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_IDS = new Set(Object.values(AUTO).map((a) => a.id));

function isAutoPlaylistId(id) {
  return AUTO_IDS.has(String(id || ''));
}

function ensurePlaylist(db, meta) {
  const existing = db.getAllPlaylists().find((p) => p.id === meta.id);
  if (!existing) {
    db.createPlaylist({
      id: meta.id,
      name: meta.name,
      icon: meta.icon,
      description: meta.description,
      createdAt: Date.now(),
    });
  } else {
    db.updatePlaylist(meta.id, {
      name: meta.name,
      icon: meta.icon,
      description: meta.description,
    });
  }
}

function rebuildAutoPlaylists(db) {
  const songs = db.getAllTracks() || [];
  const now = Date.now();

  ensurePlaylist(db, AUTO.frequent);
  const frequentIds = [...songs]
    .filter((s) => (s.playCount || 0) > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0) || (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
    .slice(0, 50)
    .map((s) => s.id);
  db.setPlaylistTracks(AUTO.frequent.id, frequentIds);

  ensurePlaylist(db, AUTO.neglected);
  const neglectedIds = [...songs]
    .filter((s) => {
      const last = s.lastPlayedAt;
      if (!last) return true;
      return now - last > 45 * DAY_MS;
    })
    .sort((a, b) => (a.lastPlayedAt || 0) - (b.lastPlayedAt || 0) || (b.dateAdded || 0) - (a.dateAdded || 0))
    .slice(0, 50)
    .map((s) => s.id);
  db.setPlaylistTracks(AUTO.neglected.id, neglectedIds);

  ensurePlaylist(db, AUTO.liked90s);
  const liked90sIds = songs
    .filter((s) => s.liked && s.year != null && s.year >= 1990 && s.year <= 1999)
    .sort((a, b) => (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title))
    .slice(0, 100)
    .map((s) => s.id);
  db.setPlaylistTracks(AUTO.liked90s.id, liked90sIds);

  return {
    ok: true,
    playlists: db.getAllPlaylists().filter((p) => isAutoPlaylistId(p.id)),
  };
}

module.exports = {
  AUTO,
  AUTO_IDS,
  isAutoPlaylistId,
  rebuildAutoPlaylists,
};
