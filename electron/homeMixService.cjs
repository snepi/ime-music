const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function artistKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Home feed: continue, recent, similar-to-today.
 */
function buildHomeFeed(db) {
  const songs = db.getAllTracks() || [];
  const byId = new Map(songs.map((s) => [s.id, s]));
  const settings = db.getSettings() || {};
  const history = db.getListenHistory(80);
  const items = history.items || [];

  let continueSong = null;
  const playbackId = settings.playbackSongId;
  if (playbackId && byId.has(playbackId)) {
    continueSong = byId.get(playbackId);
  } else if (items[0]?.song) {
    continueSong = items[0].song;
  }

  const recent = [];
  const seenRecent = new Set();
  for (const row of items) {
    const song = row.song || byId.get(row.trackId);
    if (!song || seenRecent.has(song.id)) continue;
    seenRecent.add(song.id);
    recent.push(song);
    if (recent.length >= 16) break;
  }

  const todayStart = startOfLocalDay();
  const todayArtistKeys = new Set();
  for (const row of items) {
    if ((row.playedAt || 0) < todayStart) continue;
    const song = row.song || byId.get(row.trackId);
    if (!song) continue;
    todayArtistKeys.add(artistKey(song.artist));
  }

  const playedTodayIds = new Set(
    items.filter((r) => (r.playedAt || 0) >= todayStart).map((r) => r.trackId),
  );

  let similarToday = [];
  if (todayArtistKeys.size) {
    similarToday = songs
      .filter((s) => todayArtistKeys.has(artistKey(s.artist)) && !playedTodayIds.has(s.id))
      .sort(
        (a, b) =>
          (b.playCount || 0) - (a.playCount || 0) || (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0),
      )
      .slice(0, 16);
  }

  if (!similarToday.length && recent.length) {
    const seedArtists = new Set(recent.slice(0, 5).map((s) => artistKey(s.artist)));
    similarToday = songs
      .filter((s) => seedArtists.has(artistKey(s.artist)) && !seenRecent.has(s.id))
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 16);
  }

  return {
    continueSong,
    continueTime: Number(settings.playbackTime) || 0,
    recent,
    similarToday,
    todayListenCount: items.filter((r) => (r.playedAt || 0) >= todayStart).length,
  };
}

/**
 * Daily mix / radio pool from library.
 * @param {{ size?: number, excludeIds?: string[], genre?: string|null }} [opts]
 */
function buildLibraryMix(db, { size = 40, excludeIds = [], genre = null } = {}) {
  const songs = db.getAllTracks() || [];
  if (!songs.length) return { trackIds: [], songs: [], generatedAt: Date.now(), genre: genre || null };

  const exclude = new Set(excludeIds);
  const history = db.getListenHistory(120);
  const recentIds = new Set((history.items || []).slice(0, 20).map((r) => r.trackId));
  const todayStart = startOfLocalDay();
  const todayArtists = new Set();
  for (const row of history.items || []) {
    if ((row.playedAt || 0) < todayStart) continue;
    const song = songs.find((s) => s.id === row.trackId);
    if (song) todayArtists.add(artistKey(song.artist));
  }

  const genreKey = genre && genre !== 'all' ? String(genre) : null;
  const pool = songs.filter((s) => {
    if (exclude.has(s.id)) return false;
    if (!genreKey) return true;
    return matchesGenre(s, genreKey);
  });

  const usePool = pool.length >= Math.min(8, songs.length) ? pool : songs.filter((s) => !exclude.has(s.id));

  const scored = usePool
    .map((s) => {
      let score = (s.playCount || 0) * 3;
      if (s.liked) score += 25;
      if (todayArtists.has(artistKey(s.artist))) score += 40;
      if (recentIds.has(s.id)) score -= 15;
      if (genreKey && matchesGenre(s, genreKey)) score += 35;
      const last = s.lastPlayedAt || 0;
      const days = last ? (Date.now() - last) / DAY_MS : 90;
      if (days > 30) score += 12;
      if (days > 90) score += 8;
      score += Math.random() * 10;
      return { song: s, score };
    })
    .sort((a, b) => b.score - a.score);

  const out = [];
  const perArtist = new Map();
  for (const row of scored) {
    if (out.length >= size) break;
    const ak = artistKey(row.song.artist);
    if ((perArtist.get(ak) || 0) >= 3) continue;
    out.push(row.song);
    perArtist.set(ak, (perArtist.get(ak) || 0) + 1);
  }

  if (out.length < Math.min(size, usePool.length)) {
    const have = new Set(out.map((s) => s.id));
    for (const row of scored) {
      if (out.length >= size) break;
      if (have.has(row.song.id)) continue;
      out.push(row.song);
      have.add(row.song.id);
    }
  }

  return {
    trackIds: out.map((s) => s.id),
    songs: out,
    generatedAt: Date.now(),
    genre: genreKey,
  };
}

const GENRE_KEYWORDS = {
  rock: [/rock/i, /рок/i, /alternative/i, /indie rock/i, /punk/i],
  pop: [/pop/i, /поп/i, /synthpop/i, /dance pop/i],
  rap: [/rap/i, /hip.?hop/i, /рэп/i, /реп/i, /trap/i],
  electronic: [/electronic/i, /edm/i, /house/i, /techno/i, /electro/i, /электрон/i],
  rnb: [/r&b/i, /\brnb\b/i, /soul/i, /neo.?soul/i],
  metal: [/metal/i, /метал/i, /hardcore/i],
  jazz: [/jazz/i, /джаз/i],
  classical: [/classical/i, /classic/i, /classical/i, /класси/i, /orchestra/i],
  indie: [/indie/i, /инди/i, /alternative/i],
  dance: [/dance/i, /дэнс/i, /disco/i, /club/i],
};

function matchesGenre(song, genreKey) {
  const blob = `${song.genre || ''} ${song.album || ''} ${song.title || ''}`.toLowerCase();
  if (!blob.trim()) return false;
  const patterns = GENRE_KEYWORDS[genreKey];
  if (!patterns) {
    const g = String(genreKey || '').toLowerCase();
    return g && blob.includes(g);
  }
  return patterns.some((re) => re.test(blob));
}

/**
 * Aggregate genres present in the local library for UI chips.
 */
function listLibraryGenres(db, { limit = 12 } = {}) {
  const songs = db.getAllTracks() || [];
  const counts = new Map();

  const bump = (key, label) => {
    const prev = counts.get(key) || { key, label, count: 0 };
    prev.count += 1;
    counts.set(key, prev);
  };

  for (const song of songs) {
    const raw = String(song.genre || '').trim();
    if (!raw) continue;
    let matched = false;
    for (const [key, patterns] of Object.entries(GENRE_KEYWORDS)) {
      if (patterns.some((re) => re.test(raw))) {
        bump(key, key);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const label = raw.split(/[,/;|]/)[0].trim();
      if (label.length >= 2) {
        const key = label.toLowerCase();
        bump(key, label);
      }
    }
  }

  // Also count keyword hits from title/album when genre tag empty
  if (counts.size < 4) {
    for (const song of songs) {
      for (const [key, patterns] of Object.entries(GENRE_KEYWORDS)) {
        if (matchesGenre(song, key)) bump(key, key);
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function pickNextRadioTrack(db, { recentIds = [], genre = null } = {}) {
  const mix = buildLibraryMix(db, { size: 30, excludeIds: recentIds.slice(-12), genre });
  return mix.songs[0] || null;
}

module.exports = {
  buildHomeFeed,
  buildLibraryMix,
  listLibraryGenres,
  matchesGenre,
  pickNextRadioTrack,
  startOfLocalDay,
  GENRE_KEYWORDS,
};
