/**
 * IMe Waves — endless recommendation radio pool (Deezer demos).
 * Filters: genre, language, mood, seed source.
 */

const { logError } = require('./libraryStore.cjs');
const { resolveChartCountry } = require('./chartCountries.cjs');

const DEEZER = 'https://api.deezer.com';
const DISPLAY_TARGET = 80;
const POOL_CAP = 160;

/** @type {Record<string, { deezerId: number | null, queries: string[] }>} */
const GENRE_PRESETS = {
  all: { deezerId: null, queries: [] },
  rock: { deezerId: 152, queries: ['rock'] },
  pop: { deezerId: 132, queries: ['pop'] },
  rap: { deezerId: 116, queries: ['rap', 'hip hop'] },
  ruRap: { deezerId: 116, queries: ['русский рэп', 'russian rap', 'hip-hop russia'] },
  electronic: { deezerId: 106, queries: ['electronic', 'edm'] },
  rnb: { deezerId: 165, queries: ['r&b', 'soul'] },
  indie: { deezerId: 85, queries: ['indie', 'alternative'] },
  metal: { deezerId: 464, queries: ['metal'] },
  dance: { deezerId: 113, queries: ['dance', 'house'] },
  jazz: { deezerId: 129, queries: ['jazz'] },
};

const MOOD_KEYWORDS = {
  energetic: [/energy|power|fire|bounce|party|club|fast|drive|rage|aggress/i, /энерг|огонь|движ|клуб|рейв|ярост/i],
  chill: [/chill|lofi|lo-fi|ambient|calm|soft|slow|relax|dream/i, /чил|спокой|мягк|медлен|расслаб|лофай/i],
  dark: [/dark|night|shadow|black|doom|gloom|pain|sad|cry/i, /тёмн|темн|ночь|боль|груст|мрак/i],
  happy: [/happy|joy|love|summer|sun|smile|fun|good vibes/i, /счаст|любов|лето|солнц|радост|кайф/i],
};

/**
 * @type {{
 *   key: string,
 *   items: object[],
 *   at: number,
 * } | null}
 */
let cache = null;
const CACHE_TTL_MS = 20 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function artistKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function trackKey(artist, title) {
  return `${artistKey(artist)}::${String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()}`;
}

function hasCyrillic(text) {
  return /[\u0400-\u04FF]/.test(String(text || ''));
}

function mostlyLatin(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (hasCyrillic(s)) return false;
  return /[A-Za-z]/.test(s);
}

function detectLanguage(track) {
  const blob = `${track.title || ''} ${track.artist || ''} ${track.album || ''}`;
  if (hasCyrillic(blob)) return 'ru';
  if (mostlyLatin(blob)) return 'en';
  return 'other';
}

function matchesLanguage(track, language) {
  if (!language || language === 'any') return true;
  const lang = detectLanguage(track);
  if (language === 'ru') return lang === 'ru';
  if (language === 'en') return lang === 'en';
  return true;
}

function matchesMood(track, mood) {
  if (!mood || mood === 'any') return true;
  const patterns = MOOD_KEYWORDS[mood];
  if (!patterns) return true;
  const blob = `${track.title || ''} ${track.album || ''} ${track.artist || ''}`;
  return patterns.some((re) => re.test(blob));
}

function matchesGenreHints(track, genre) {
  if (!genre || genre === 'all') return true;
  if (genre === 'ruRap') {
    // Prefer RU language for Russian rap; keep hip-hop pool otherwise
    return detectLanguage(track) === 'ru' || /рэп|rap|hip.?hop/i.test(`${track.title} ${track.artist} ${track.album}`);
  }
  return true;
}

function mapTrack(raw, basedOnArtist, source = 'deezer') {
  const preview = raw?.preview || raw?.previewUrl;
  if (!preview) return null;
  const id = raw.id != null ? `dz-${raw.id}` : null;
  if (!id) return null;
  return {
    id,
    deezerId: raw.id,
    title: String(raw.title || raw.title_short || 'Track'),
    artist: String(raw.artist?.name || raw.artist || 'Unknown'),
    album: String(raw.album?.title || raw.album || ''),
    coverUrl:
      raw.album?.cover_medium ||
      raw.album?.cover ||
      raw.cover_medium ||
      raw.cover ||
      null,
    previewUrl: String(preview),
    duration: Number(raw.duration) || 30,
    basedOnArtist: basedOnArtist || null,
    source,
    rank: raw.rank ?? null,
  };
}

function normalizeWaves(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const genre = GENRE_PRESETS[base.genre] ? base.genre : 'all';
  const language =
    base.language === 'ru' || base.language === 'en' ? base.language : 'any';
  const mood =
    base.mood === 'energetic' ||
    base.mood === 'chill' ||
    base.mood === 'dark' ||
    base.mood === 'happy'
      ? base.mood
      : 'any';
  const seed =
    base.seed === 'chart' ||
    base.seed === 'liked' ||
    base.seed === 'wishlist' ||
    base.seed === 'taste'
      ? base.seed
      : 'taste';
  const diversity = base.diversity === 'high' ? 'high' : 'normal';
  return {
    genre,
    language,
    mood,
    seed,
    diversity,
    skipKnown: base.skipKnown !== false,
  };
}

async function fetchGenreChart(genreId, limit = 50) {
  try {
    const data = await deezerGet(`/chart/${genreId}/tracks?limit=${limit}`);
    return Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    logError('waves', 'genre chart failed', { genreId, err });
    return [];
  }
}

async function fetchCountryChart(country, limit = 50) {
  try {
    const resolved = resolveChartCountry(country || 'ru');
    const data = await deezerGet(`/chart/0/tracks?limit=${limit}`);
    // Deezer country charts often via /chart — use search for country flavor
    if (resolved.code === 'ru' || resolved.code === 'world') {
      return Array.isArray(data?.data) ? data.data : [];
    }
    return Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    logError('waves', 'country chart failed', { country, err });
    return [];
  }
}

async function fetchSearchTracks(query, limit = 40) {
  if (!query) return [];
  try {
    const data = await deezerGet(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`);
    return Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    logError('waves', 'search failed', { query, err });
    return [];
  }
}

async function fetchArtistRadio(artistId, limit = 25) {
  if (!artistId) return [];
  try {
    const data = await deezerGet(`/artist/${artistId}/radio?limit=${limit}`);
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
}

async function resolveArtistId(name) {
  try {
    const data = await deezerGet(`/search/artist?q=${encodeURIComponent(name)}&limit=1`);
    return data?.data?.[0]?.id || null;
  } catch {
    return null;
  }
}

function pickSeedArtists(songs, limit = 10) {
  const counts = new Map();
  for (const song of songs || []) {
    const parts = String(song.artist || '')
      .split(/\s*,\s*|\s+&\s+|\s+feat\.?\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of parts.slice(0, 2)) {
      const key = artistKey(name);
      if (!key) continue;
      const prev = counts.get(key) || { name, score: 0 };
      prev.score += (song.liked ? 3 : 1) + Math.min(5, Number(song.playCount) || 0) * 0.2;
      counts.set(key, prev);
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.name);
}

function ownedKeys(songs) {
  const set = new Set();
  for (const song of songs || []) {
    set.add(trackKey(song.artist, song.title));
  }
  return set;
}

function applyDiversity(items, diversity) {
  const maxPerArtist = diversity === 'high' ? 2 : 4;
  const counts = new Map();
  const out = [];
  for (const item of items) {
    const key = artistKey(item.artist);
    const n = counts.get(key) || 0;
    if (n >= maxPerArtist) continue;
    counts.set(key, n + 1);
    out.push(item);
  }
  return out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build endless Waves pool.
 * @param {{
 *   songs?: object[],
 *   wishlist?: object[],
 *   blockedArtists?: object[],
 *   blockedTracks?: object[],
 *   chartCountry?: string,
 *   waves?: object,
 *   force?: boolean,
 * }} opts
 */
async function buildWavesPool(opts = {}) {
  const waves = normalizeWaves(opts.waves);
  const songs = Array.isArray(opts.songs) ? opts.songs : [];
  const wishlist = Array.isArray(opts.wishlist) ? opts.wishlist : [];
  const blockedArtistKeys = new Set(
    (opts.blockedArtists || []).map((a) => artistKey(a.key || a.name)).filter(Boolean),
  );
  const blockedTrackIds = new Set((opts.blockedTracks || []).map((t) => String(t.id || t.deezerId)));
  const known = waves.skipKnown ? ownedKeys(songs) : new Set();
  const cacheKey = JSON.stringify({
    g: waves.genre,
    l: waves.language,
    m: waves.mood,
    s: waves.seed,
    d: waves.diversity,
    k: waves.skipKnown,
    c: opts.chartCountry || 'ru',
  });

  if (!opts.force && cache && cache.key === cacheKey && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ok: true, items: cache.items.slice(), waves, cached: true };
  }

  const preset = GENRE_PRESETS[waves.genre] || GENRE_PRESETS.all;
  /** @type {object[]} */
  const rawTracks = [];

  // Genre chart
  if (preset.deezerId) {
    rawTracks.push(...(await fetchGenreChart(preset.deezerId, 60)));
    await sleep(80);
  } else if (waves.seed === 'chart') {
    rawTracks.push(...(await fetchCountryChart(opts.chartCountry, 60)));
    await sleep(80);
  }

  // Search queries for genre / RU rap
  for (const q of preset.queries.slice(0, 3)) {
    rawTracks.push(...(await fetchSearchTracks(q, 35)));
    await sleep(60);
  }

  // Seed from taste / liked / wishlist
  let seedNames = [];
  if (waves.seed === 'wishlist') {
    seedNames = wishlist
      .map((w) => w.artist)
      .filter(Boolean)
      .slice(0, 8);
  } else if (waves.seed === 'liked') {
    seedNames = pickSeedArtists(
      songs.filter((s) => s.liked),
      10,
    );
  } else if (waves.seed === 'taste' || waves.seed === 'chart') {
    seedNames = pickSeedArtists(songs, waves.seed === 'chart' ? 6 : 10);
  }

  for (const name of seedNames.slice(0, 6)) {
    const id = await resolveArtistId(name);
    if (!id) continue;
    const radio = await fetchArtistRadio(id, 20);
    rawTracks.push(...radio);
    await sleep(50);
  }

  // Fallback: general chart if still empty
  if (rawTracks.length < 20) {
    rawTracks.push(...(await fetchCountryChart(opts.chartCountry, 50)));
  }

  const seen = new Set();
  /** @type {object[]} */
  let mapped = [];
  for (const raw of rawTracks) {
    const item = mapTrack(raw, null, 'deezer');
    if (!item) continue;
    if (seen.has(item.id) || seen.has(trackKey(item.artist, item.title))) continue;
    if (blockedTrackIds.has(String(item.id)) || blockedTrackIds.has(String(item.deezerId))) continue;
    if (splitBlocked(item.artist, blockedArtistKeys)) continue;
    if (waves.skipKnown && known.has(trackKey(item.artist, item.title))) continue;
    if (!matchesLanguage(item, waves.language)) continue;
    if (!matchesMood(item, waves.mood)) continue;
    if (!matchesGenreHints(item, waves.genre)) continue;
    seen.add(item.id);
    seen.add(trackKey(item.artist, item.title));
    mapped.push(item);
  }

  mapped = applyDiversity(shuffle(mapped), waves.diversity).slice(0, POOL_CAP);
  if (mapped.length > DISPLAY_TARGET) {
    mapped = mapped.slice(0, DISPLAY_TARGET);
  }

  cache = { key: cacheKey, items: mapped, at: Date.now() };
  return { ok: true, items: mapped.slice(), waves, cached: false };
}

function splitBlocked(artist, blockedKeys) {
  const parts = String(artist || '')
    .split(/\s*,\s*|\s+&\s+|\s+feat\.?\s+/i)
    .map((s) => artistKey(s))
    .filter(Boolean);
  return parts.some((p) => blockedKeys.has(p));
}

module.exports = {
  normalizeWaves,
  buildWavesPool,
  GENRE_PRESETS,
};
