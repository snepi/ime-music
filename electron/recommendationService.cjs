const { logError } = require('./libraryStore.cjs');
const { resolveChartCountry, DEFAULT_CHART_COUNTRY } = require('./chartCountries.cjs');
const { searchArtistTracks } = require('./itunesProvider.cjs');
const { normalizeKey } = require('./trackMatch.cjs');

const DEEZER = 'https://api.deezer.com';
/** Visible recommendations rotate at least every 8 hours */
const ROTATION_MS = 8 * 60 * 60 * 1000;
const MAX_SEED_ARTISTS = 16;
const MAX_RELATED_PER_SEED = 8;
const MAX_TRACKS_PER_RELATED = 8;
const MAX_RADIO_PER_SEED = 8;
const POOL_TARGET = 220;
const DISPLAY_COUNT = 100;
/** Cap how many pool tracks can come from one library seed */
const MAX_PER_SEED = 28;
/** Cap how many displayed tracks share the same artist name */
const MAX_PER_ARTIST_DISPLAY = 4;
/** Cap how many displayed tracks share the same basedOnArtist */
const MAX_PER_SEED_DISPLAY = 18;
/** On manual refresh / rotation keep this share of previous cards */
const KEEP_RATIO = 0.3;

/**
 * @type {{
 *   key: string,
 *   pool: object[],
 *   items: object[],
 *   poolAt: number,
 *   rotatedAt: number,
 *   rotation: number,
 * } | null}
 */
let cache = null;
/** Separate cache so opening «Чарт» does not wipe taste-based recommendations */
let chartCache = null;

function artistKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function splitArtistNames(raw) {
  return String(raw || '')
    .split(
      /\s*,\s*|\s*;\s*|\s+\/\s+|\s+&\s+|\s+\+\s+|\s+×\s+|\s+x\s+|\s+vs\.?\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+и\s+/i,
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

function rotationBucket(now = Date.now()) {
  return Math.floor(now / ROTATION_MS);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(items, seed) {
  const rng = mulberry32(seed >>> 0);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
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

/**
 * @param {Array<{ artist?: string, liked?: boolean, playCount?: number, lastPlayedAt?: number | null }>} songs
 */
function pickSeedArtists(songs) {
  if (!Array.isArray(songs) || songs.length === 0) return [];

  const byArtist = new Map();
  for (const song of songs) {
    const name = String(song.artist || '').trim();
    if (!name || name.toLowerCase() === 'unknown artist' || name === 'Неизвестный исполнитель') {
      continue;
    }
    const key = artistKey(name);
    const prev = byArtist.get(key) || {
      name,
      score: 0,
      liked: 0,
      plays: 0,
      last: 0,
    };
    prev.liked += song.liked ? 3 : 0;
    prev.plays += Number(song.playCount) || 0;
    prev.last = Math.max(prev.last, Number(song.lastPlayedAt) || 0);
    prev.score = prev.liked * 1000 + prev.plays * 10 + (prev.last > 0 ? 1 : 0);
    byArtist.set(key, prev);
  }

  return [...byArtist.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_SEED_ARTISTS)
    .map((a) => a.name);
}

/**
 * Artists from «Хочу послушать» — strong taste signal by recency + frequency.
 * @param {Array<{ artist?: string, addedAt?: number }>} wishlist
 */
function pickWishlistSeedArtists(wishlist) {
  if (!Array.isArray(wishlist) || wishlist.length === 0) return [];

  const byArtist = new Map();
  for (const item of wishlist) {
    const names = splitArtistNames(item.artist);
    for (const raw of names) {
      const name = String(raw || '').trim();
      if (!name || name.toLowerCase() === 'unknown artist' || name === 'Неизвестный исполнитель') {
        continue;
      }
      const key = artistKey(name);
      const prev = byArtist.get(key) || { name, score: 0, count: 0, last: 0 };
      prev.count += 1;
      prev.last = Math.max(prev.last, Number(item.addedAt) || 0);
      // Wishlist is an explicit intent signal — weight above casual library plays
      prev.score = prev.count * 800 + Math.floor(prev.last / 1e8);
      byArtist.set(key, prev);
    }
  }

  return [...byArtist.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_SEED_ARTISTS)
    .map((a) => a.name);
}

/**
 * Merge library seeds with wishlist seeds. Wishlist gets up to half the slots first.
 */
function mergeSeedLists(primary, wishlistSeeds, max = MAX_SEED_ARTISTS) {
  const out = [];
  const seen = new Set();
  const push = (name) => {
    const key = artistKey(name);
    if (!key || seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push(name);
  };

  const wishCap = Math.min(Math.ceil(max / 2), (wishlistSeeds || []).length);
  for (const name of (wishlistSeeds || []).slice(0, wishCap)) push(name);
  for (const name of primary || []) push(name);
  for (const name of wishlistSeeds || []) push(name);
  return out;
}

function resolveSeeds({ songs, mode, currentArtist, wishlist }) {
  const wishSeeds = pickWishlistSeedArtists(wishlist);

  if (mode === 'wishlist') {
    return wishSeeds.slice(0, MAX_SEED_ARTISTS);
  }

  if (mode === 'current') {
    const names = splitArtistNames(currentArtist || '');
    const cleaned = names
      .map((n) => n.trim())
      .filter(
        (n) =>
          n &&
          n.toLowerCase() !== 'unknown artist' &&
          n !== 'Неизвестный исполнитель',
      );
    return cleaned.slice(0, MAX_SEED_ARTISTS);
  }

  const source =
    mode === 'liked' ? (songs || []).filter((s) => Boolean(s.liked)) : songs || [];
  const librarySeeds = pickSeedArtists(source);
  return mergeSeedLists(librarySeeds, wishSeeds, MAX_SEED_ARTISTS);
}

async function resolveArtistId(name) {
  const data = await deezerGet(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
  const list = Array.isArray(data?.data) ? data.data : [];
  if (!list.length) return null;
  const want = artistKey(name);
  const exact = list.find((a) => artistKey(a.name) === want);
  return exact || list[0];
}

async function getRelatedArtists(artistId) {
  const data = await deezerGet(`/artist/${artistId}/related?limit=${MAX_RELATED_PER_SEED}`);
  return Array.isArray(data?.data) ? data.data : [];
}

async function getTopTracks(artistId) {
  const data = await deezerGet(`/artist/${artistId}/top?limit=${MAX_TRACKS_PER_RELATED}`);
  return Array.isArray(data?.data) ? data.data : [];
}

async function getArtistRadio(artistId) {
  try {
    const data = await deezerGet(`/artist/${artistId}/radio?limit=${MAX_RADIO_PER_SEED}`);
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
}

function mapTrack(track, basedOnArtist) {
  const preview = typeof track.preview === 'string' && track.preview.startsWith('http') ? track.preview : null;
  if (!preview) return null;
  return {
    id: `deezer-${track.id}`,
    deezerId: track.id,
    title: String(track.title || 'Без названия'),
    artist: String(track.artist?.name || 'Неизвестный исполнитель'),
    album: String(track.album?.title || ''),
    coverUrl: track.album?.cover_medium || track.album?.cover || null,
    previewUrl: preview,
    duration: Number(track.duration) || 30,
    basedOnArtist: basedOnArtist || null,
    source: 'deezer',
  };
}

/**
 * Round-robin pool across library seeds so one artist cannot fill everything.
 */
async function buildPool(seeds, owned, blockedArtistKeys = new Set()) {
  const seedArtistKeys = new Set(seeds.map(artistKey));
  const seenTrack = new Set();
  const pool = [];
  const perSeed = new Map();

  const canTake = (basedOnArtist) => {
    const key = artistKey(basedOnArtist || '');
    return (perSeed.get(key) || 0) < MAX_PER_SEED;
  };

  const pushMapped = (mapped, basedOnArtist) => {
    if (pool.length >= POOL_TARGET) return false;
    if (!canTake(basedOnArtist)) return false;
    if (!mapped) return false;
    if (!String(mapped.previewUrl || '').startsWith('http')) return false;
    if (blockedArtistKeys.has(artistKey(mapped.artist))) return false;
    const withSeed = { ...mapped, basedOnArtist: basedOnArtist || null };
    const key = normalizeKey(mapped.artist, mapped.title);
    if (owned.has(key) || seenTrack.has(key)) return false;
    seenTrack.add(key);
    const sk = artistKey(basedOnArtist || '');
    perSeed.set(sk, (perSeed.get(sk) || 0) + 1);
    pool.push(withSeed);
    return true;
  };

  const pushOne = (track, basedOnArtist) => {
    const mapped = mapTrack(track, basedOnArtist);
    return pushMapped(mapped, basedOnArtist);
  };

  const pushMappedTracks = (tracks, basedOnArtist, limit) => {
    let added = 0;
    for (const track of tracks) {
      if (added >= limit) break;
      if (pool.length >= POOL_TARGET) break;
      if (!canTake(basedOnArtist)) break;
      if (pushMapped(track, basedOnArtist)) added += 1;
    }
    return added;
  };

  const pushTracks = (tracks, basedOnArtist, limit) => {
    let added = 0;
    for (const track of tracks) {
      if (added >= limit) break;
      if (pool.length >= POOL_TARGET) break;
      if (!canTake(basedOnArtist)) break;
      if (pushOne(track, basedOnArtist)) added += 1;
    }
    return added;
  };

  /** @type {Array<{ seedName: string, artist: object, related: object[], radio: object[], tops: object[], relatedIdx: number }>} */
  const jobs = [];

  for (const seedName of seeds) {
    let seedArtist;
    try {
      seedArtist = await resolveArtistId(seedName);
    } catch (err) {
      logError('recommendations', 'Artist search failed', {
        seedName,
        err: String(err?.message || err),
      });
      continue;
    }
    if (!seedArtist?.id) continue;

    let related = [];
    try {
      related = await getRelatedArtists(seedArtist.id);
    } catch (err) {
      logError('recommendations', 'Related failed', {
        seedName,
        err: String(err?.message || err),
      });
    }

    related = (related || []).filter(
      (rel) =>
        rel?.id &&
        !seedArtistKeys.has(artistKey(rel.name)) &&
        !blockedArtistKeys.has(artistKey(rel.name)),
    );

    let radio = [];
    let tops = [];
    try {
      radio = await getArtistRadio(seedArtist.id);
      tops = await getTopTracks(seedArtist.id);
    } catch {
      /* ignore */
    }

    jobs.push({
      seedName,
      artist: seedArtist,
      related,
      radio: Array.isArray(radio) ? radio : [],
      tops: Array.isArray(tops) ? tops : [],
      relatedIdx: 0,
    });
  }

  // Pass 1: small bite from each seed (radio + tops)
  for (const job of jobs) {
    if (pool.length >= POOL_TARGET) break;
    pushTracks(job.radio, job.seedName, 3);
    pushTracks(job.tops, job.seedName, 2);
    try {
      // Add extra candidates from iTunes (more catalog coverage)
      const itunesTracks = await searchArtistTracks(job.seedName, { limit: 40 });
      pushMappedTracks(itunesTracks, job.seedName, 6);
    } catch {
      /* ignore */
    }
  }

  // Pass 2: round-robin related artists across seeds
  let progress = true;
  while (progress && pool.length < POOL_TARGET) {
    progress = false;
    for (const job of jobs) {
      if (pool.length >= POOL_TARGET) break;
      if (!canTake(job.seedName)) continue;
      if (job.relatedIdx >= job.related.length) continue;

      const rel = job.related[job.relatedIdx];
      job.relatedIdx += 1;
      progress = true;

      try {
        const relTops = await getTopTracks(rel.id);
        pushTracks(relTops, job.seedName, 3);
        if (canTake(job.seedName) && pool.length < POOL_TARGET) {
          const relRadio = await getArtistRadio(rel.id);
          pushTracks(relRadio, job.seedName, 2);
        }
      } catch {
        /* ignore */
      }
    }
  }

  // Pass 3: leftover radio/tops if still room and seed caps allow
  for (const job of jobs) {
    if (pool.length >= POOL_TARGET) break;
    pushTracks(job.radio, job.seedName, 4);
    pushTracks(job.tops, job.seedName, 3);
  }

  return pool;
}

/**
 * Diversify a list: limit repeats of same artist and same seed.
 */
function diversify(items, limit, seed) {
  const shuffled = seededShuffle(items, seed);
  const out = [];
  const byArtist = new Map();
  const bySeed = new Map();

  for (const item of shuffled) {
    if (out.length >= limit) break;
    const aKey = artistKey(item.artist);
    const sKey = artistKey(item.basedOnArtist || '');
    if ((byArtist.get(aKey) || 0) >= MAX_PER_ARTIST_DISPLAY) continue;
    if (sKey && (bySeed.get(sKey) || 0) >= MAX_PER_SEED_DISPLAY) continue;
    out.push(item);
    byArtist.set(aKey, (byArtist.get(aKey) || 0) + 1);
    if (sKey) bySeed.set(sKey, (bySeed.get(sKey) || 0) + 1);
  }

  // If caps left holes, fill remaining without seed cap (still artist-capped)
  if (out.length < limit) {
    const have = new Set(out.map((i) => i.id));
    for (const item of shuffled) {
      if (out.length >= limit) break;
      if (have.has(item.id)) continue;
      const aKey = artistKey(item.artist);
      if ((byArtist.get(aKey) || 0) >= MAX_PER_ARTIST_DISPLAY) continue;
      out.push(item);
      have.add(item.id);
      byArtist.set(aKey, (byArtist.get(aKey) || 0) + 1);
    }
  }

  return out;
}

/**
 * Pick a display batch from pool. Keeps some previous items on refresh/rotation.
 */
function pickBatch(pool, previousItems, { force, seedKey, rotation }) {
  const displayCount = Math.min(DISPLAY_COUNT, pool.length);
  if (!displayCount) return [];

  const bucket = rotationBucket();
  const seed = hashString(`${seedKey}|${bucket}|${rotation}`);
  const poolById = new Map(pool.map((item) => [item.id, item]));
  const previous = (previousItems || []).map((item) => poolById.get(item.id)).filter(Boolean);

  const keepCount = previous.length
    ? Math.min(previous.length, Math.max(1, Math.floor(displayCount * KEEP_RATIO)))
    : 0;

  const keep = keepCount ? diversify(previous, keepCount, seed ^ 0xabc) : [];
  const keepIds = new Set(keep.map((item) => item.id));
  const previousIds = new Set(previous.map((item) => item.id));

  const freshPreferred = pool.filter((item) => !previousIds.has(item.id) && !keepIds.has(item.id));
  const freshFallback = pool.filter((item) => !keepIds.has(item.id) && previousIds.has(item.id));

  const need = displayCount - keep.length;
  const fresh = diversify(
    [...seededShuffle(freshPreferred, seed ^ 0x111), ...seededShuffle(freshFallback, seed ^ 0x222)],
    need,
    seed ^ 0x333,
  );

  // Re-diversify combined so keep+fresh still respect caps
  return diversify([...keep, ...fresh], displayCount, seed ^ 0x444);
}

function nextRotateAt(rotatedAt) {
  return rotatedAt + ROTATION_MS;
}

function isItemBlocked(item, blockedArtistKeys, blockedTrackIds) {
  if (!item) return true;
  if (blockedTrackIds.has(String(item.id))) return true;
  if (blockedArtistKeys.has(artistKey(item.artist))) return true;
  return false;
}

const CHART_LIMIT = 100;
/** Chart refreshes a bit more often than taste-based pools */
const CHART_CACHE_MS = 4 * 60 * 60 * 1000;

async function fetchPlaylistChartTracks(playlistId, basedOnLabel) {
  const items = [];
  let index = 0;
  while (items.length < CHART_LIMIT) {
    const data = await deezerGet(
      `/playlist/${playlistId}/tracks?limit=50&index=${index}`,
    );
    const list = Array.isArray(data?.data) ? data.data : [];
    if (!list.length) break;
    for (const track of list) {
      const mapped = mapTrack(track, basedOnLabel);
      if (mapped) items.push(mapped);
      if (items.length >= CHART_LIMIT) break;
    }
    index += list.length;
    if (!data?.next) break;
  }
  return items;
}

async function fetchChartTracks(countryCode = DEFAULT_CHART_COUNTRY) {
  const country = resolveChartCountry(countryCode);
  const label = `Чарт · ${country.label}`;
  try {
    return await fetchPlaylistChartTracks(country.playlistId, label);
  } catch (err) {
    // Fallback: global Deezer chart endpoint
    logError('recommendations', `Country chart failed (${country.code}), fallback world`, err);
    if (country.code === 'world') {
      const data = await deezerGet(`/chart/0/tracks?limit=${CHART_LIMIT}`);
      const list = Array.isArray(data?.data) ? data.data : [];
      const items = [];
      for (const track of list) {
        const mapped = mapTrack(track, label);
        if (mapped) items.push(mapped);
      }
      return items;
    }
    throw err;
  }
}

async function buildChartRecommendations({
  songs,
  force = false,
  blockedArtists = [],
  blockedTracks = [],
  chartCountry = DEFAULT_CHART_COUNTRY,
}) {
  const country = resolveChartCountry(chartCountry);
  const filterMode = 'chart';
  const blockedArtistKeys = new Set(
    (blockedArtists || [])
      .map((a) => artistKey(a?.key || a?.name))
      .filter(Boolean),
  );
  const blockedTrackIds = new Set(
    (blockedTracks || []).map((t) => String(t?.id || '')).filter(Boolean),
  );
  const owned = new Set(
    (songs || []).map((s) => normalizeKey(s.artist, s.title)).filter((k) => !k.startsWith('::')),
  );
  const cacheKey = `chart|${country.code}|${country.playlistId}`;
  const now = Date.now();

  const filterVisible = (list) =>
    (list || []).filter((item) => {
      if (isItemBlocked(item, blockedArtistKeys, blockedTrackIds)) return false;
      const key = normalizeKey(item.artist, item.title);
      if (owned.has(key)) return false;
      return true;
    });

  const cacheFresh =
    !force &&
    chartCache &&
    chartCache.key === cacheKey &&
    Array.isArray(chartCache.items) &&
    chartCache.items.length > 0 &&
    now - chartCache.rotatedAt < CHART_CACHE_MS;

  if (cacheFresh) {
    return {
      ok: true,
      items: filterVisible(chartCache.items),
      reason: null,
      cached: true,
      generatedAt: chartCache.rotatedAt,
      rotatesAt: chartCache.rotatedAt + CHART_CACHE_MS,
      filterMode,
      chartCountry: country.code,
    };
  }

  try {
    const raw = await fetchChartTracks(country.code);
    const items = filterVisible(raw);
    chartCache = {
      key: cacheKey,
      pool: raw,
      items,
      poolAt: now,
      rotatedAt: now,
      rotation: 0,
    };
    return {
      ok: true,
      items,
      reason: items.length ? null : 'no_matches',
      cached: false,
      generatedAt: now,
      rotatesAt: now + CHART_CACHE_MS,
      filterMode,
      chartCountry: country.code,
    };
  } catch (err) {
    logError('recommendations', 'Chart fetch failed', err);
    const fallback = filterVisible(chartCache?.key === cacheKey ? chartCache.items : []);
    return {
      ok: false,
      items: fallback,
      reason: 'network',
      error: String(err?.message || err),
      cached: Boolean(fallback.length),
      generatedAt: chartCache?.rotatedAt || now,
      rotatesAt: chartCache?.rotatedAt ? chartCache.rotatedAt + CHART_CACHE_MS : null,
      filterMode,
      chartCountry: country.code,
    };
  }
}

/**
 * @param {{
 *   songs: object[],
 *   force?: boolean,
 *   mode?: 'all'|'liked'|'current'|'wishlist'|'chart',
 *   currentArtist?: string|null,
 *   wishlist?: object[],
 *   blockedArtists?: Array<{ key?: string, name?: string }>,
 *   blockedTracks?: Array<{ id?: string }>,
 * }} opts
 */
async function buildRecommendations({
  songs,
  force = false,
  mode = 'all',
  currentArtist = null,
  wishlist = [],
  blockedArtists = [],
  blockedTracks = [],
  chartCountry = DEFAULT_CHART_COUNTRY,
}) {
  if (mode === 'chart') {
    return buildChartRecommendations({
      songs,
      force,
      blockedArtists,
      blockedTracks,
      chartCountry,
    });
  }

  const filterMode =
    mode === 'liked' || mode === 'current' || mode === 'wishlist' ? mode : 'all';
  const blockedArtistKeys = new Set(
    (blockedArtists || [])
      .map((a) => artistKey(a?.key || a?.name))
      .filter(Boolean),
  );
  const blockedTrackIds = new Set(
    (blockedTracks || []).map((t) => String(t?.id || '')).filter(Boolean),
  );
  // Don't re-recommend tracks already saved to wishlist
  for (const w of wishlist || []) {
    if (w?.id) blockedTrackIds.add(String(w.id));
  }

  const seeds = resolveSeeds({ songs, mode: filterMode, currentArtist, wishlist });
  if (!seeds.length) {
    let reason = 'empty_library';
    if (filterMode === 'current') reason = 'no_current';
    else if (filterMode === 'wishlist') reason = 'empty_wishlist';
    return {
      ok: true,
      items: [],
      reason,
      cached: false,
      generatedAt: Date.now(),
      rotatesAt: null,
      filterMode,
    };
  }

  const wishKey = (wishlist || [])
    .slice(0, 40)
    .map((w) => String(w?.id || artistKey(w?.artist)))
    .join(',');
  const cacheKey = `${filterMode}|${seeds.map((s) => artistKey(s)).join('|')}|w:${hashString(wishKey)}`;
  const now = Date.now();
  const owned = new Set(
    (songs || []).map((s) => normalizeKey(s.artist, s.title)).filter((k) => !k.startsWith('::')),
  );
  for (const w of wishlist || []) {
    const key = normalizeKey(w.artist, w.title);
    if (key && !key.startsWith('::')) owned.add(key);
  }

  const poolFresh =
    !force &&
    cache &&
    cache.key === cacheKey &&
    Array.isArray(cache.pool) &&
    cache.pool.length > 0 &&
    now - cache.poolAt < ROTATION_MS;

  const batchFresh =
    !force &&
    cache &&
    cache.key === cacheKey &&
    Array.isArray(cache.items) &&
    cache.items.length > 0 &&
    now - cache.rotatedAt < ROTATION_MS;

  const filterVisible = (list) =>
    (list || []).filter((item) => !isItemBlocked(item, blockedArtistKeys, blockedTrackIds));

  if (batchFresh && poolFresh) {
    return {
      ok: true,
      items: filterVisible(cache.items),
      reason: null,
      cached: true,
      generatedAt: cache.rotatedAt,
      rotatesAt: nextRotateAt(cache.rotatedAt),
      filterMode,
    };
  }

  try {
    let pool = poolFresh
      ? cache.pool
      : await buildPool(seeds, owned, blockedArtistKeys);
    pool = filterVisible(pool);

    if (!pool.length) {
      return {
        ok: true,
        items: [],
        reason: 'no_matches',
        cached: false,
        generatedAt: now,
        rotatesAt: null,
        filterMode,
      };
    }

    const previousItems = filterVisible(cache?.key === cacheKey ? cache.items : []);
    const rotation = force
      ? cache?.key === cacheKey
        ? (cache.rotation || 0) + 1
        : 1
      : cache?.key === cacheKey && poolFresh
        ? (cache.rotation || 0) + 1
        : rotationBucket(now);

    const items = pickBatch(pool, previousItems, {
      force: force || Boolean(cache?.items?.length),
      seedKey: cacheKey,
      rotation,
    });

    cache = {
      key: cacheKey,
      pool,
      items,
      poolAt: poolFresh ? cache.poolAt : now,
      rotatedAt: now,
      rotation,
    };

    return {
      ok: true,
      items: filterVisible(items),
      reason: null,
      cached: false,
      generatedAt: now,
      rotatesAt: nextRotateAt(now),
      filterMode,
    };
  } catch (err) {
    logError('recommendations', 'Build failed', err);
    return {
      ok: false,
      items: filterVisible(cache?.items || []),
      reason: 'network',
      error: String(err?.message || err),
      cached: Boolean(cache?.items?.length),
      generatedAt: cache?.rotatedAt || now,
      rotatesAt: cache?.rotatedAt ? nextRotateAt(cache.rotatedAt) : null,
      filterMode,
    };
  }
}

function clearRecommendationsCache() {
  cache = null;
  chartCache = null;
}

module.exports = {
  buildRecommendations,
  clearRecommendationsCache,
  pickSeedArtists,
  pickWishlistSeedArtists,
  normalizeKey,
  ROTATION_MS,
};
