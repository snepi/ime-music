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
 */
function buildLibraryMix(db, { size = 40, excludeIds = [] } = {}) {
  const songs = db.getAllTracks() || [];
  if (!songs.length) return { trackIds: [], songs: [], generatedAt: Date.now() };

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

  const scored = songs
    .filter((s) => !exclude.has(s.id))
    .map((s) => {
      let score = (s.playCount || 0) * 3;
      if (s.liked) score += 25;
      if (todayArtists.has(artistKey(s.artist))) score += 40;
      if (recentIds.has(s.id)) score -= 15;
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

  if (out.length < Math.min(size, songs.length)) {
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
  };
}

function pickNextRadioTrack(db, { recentIds = [] } = {}) {
  const mix = buildLibraryMix(db, { size: 30, excludeIds: recentIds.slice(-12) });
  return mix.songs[0] || null;
}

module.exports = {
  buildHomeFeed,
  buildLibraryMix,
  pickNextRadioTrack,
  startOfLocalDay,
};
