const { listLibraryGenres, matchesGenre } = require('./homeMixService.cjs');

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
  liked: {
    id: 'auto:liked',
    name: 'Все лайки',
    icon: '♥',
    description: 'Автоплейлист · все избранные треки',
  },
  fresh: {
    id: 'auto:fresh',
    name: 'Недавно добавленные',
    icon: '✨',
    description: 'Автоплейлист · последние добавления',
  },
  topRated: {
    id: 'auto:top-rated',
    name: 'Высокий рейтинг',
    icon: '⭐',
    description: 'Автоплейлист · оценка 4–5',
  },
};

const GENRE_LABELS = {
  rock: 'Рок',
  pop: 'Поп',
  rap: 'Рэп / хип-хоп',
  electronic: 'Электроника',
  rnb: 'R&B',
  metal: 'Метал',
  jazz: 'Джаз',
  classical: 'Классика',
  indie: 'Инди',
  dance: 'Дэнс',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_IDS = new Set(Object.values(AUTO).map((a) => a.id));

function isAutoPlaylistId(id) {
  const s = String(id || '');
  return AUTO_IDS.has(s) || s.startsWith('auto:genre:');
}

function genrePlaylistName(genre) {
  if (GENRE_LABELS[genre.key]) return GENRE_LABELS[genre.key];
  return genre.label || genre.key;
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

  ensurePlaylist(db, AUTO.liked);
  const likedIds = songs
    .filter((s) => s.liked)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0) || a.title.localeCompare(b.title))
    .slice(0, 200)
    .map((s) => s.id);
  db.setPlaylistTracks(AUTO.liked.id, likedIds);

  ensurePlaylist(db, AUTO.fresh);
  const freshIds = [...songs]
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    .slice(0, 40)
    .map((s) => s.id);
  db.setPlaylistTracks(AUTO.fresh.id, freshIds);

  ensurePlaylist(db, AUTO.topRated);
  const topRatedIds = songs
    .filter((s) => (s.rating || 0) >= 4)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.playCount || 0) - (a.playCount || 0))
    .slice(0, 80)
    .map((s) => s.id);
  db.setPlaylistTracks(AUTO.topRated.id, topRatedIds);

  // Genre-based smart mixes from local library
  const genres = listLibraryGenres(db, { limit: 10 }).filter((g) => g.count >= 4);
  const keepGenreIds = new Set();
  for (const genre of genres) {
    const id = `auto:genre:${genre.key}`;
    keepGenreIds.add(id);
    ensurePlaylist(db, {
      id,
      name: genrePlaylistName(genre),
      icon: '♪',
      description: `Умная подборка · жанр · ${genre.count} треков`,
    });
    const ids = songs
      .filter((s) => matchesGenre(s, genre.key))
      .sort(
        (a, b) =>
          (b.liked ? 1 : 0) - (a.liked ? 1 : 0) ||
          (b.playCount || 0) - (a.playCount || 0) ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 80)
      .map((s) => s.id);
    db.setPlaylistTracks(id, ids);
  }

  for (const pl of db.getAllPlaylists()) {
    if (String(pl.id).startsWith('auto:genre:') && !keepGenreIds.has(pl.id)) {
      try {
        db.setPlaylistTracks(pl.id, []);
        db.updatePlaylist(pl.id, {
          name: pl.name,
          description: 'Умная подборка · жанр (пусто)',
        });
      } catch {
        /* ignore */
      }
    }
  }

  return {
    ok: true,
    playlists: db.getAllPlaylists().filter((p) => isAutoPlaylistId(p.id)),
  };
}

module.exports = {
  AUTO,
  AUTO_IDS,
  GENRE_LABELS,
  isAutoPlaylistId,
  rebuildAutoPlaylists,
};
