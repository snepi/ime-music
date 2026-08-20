const { logError } = require('./libraryStore.cjs');
const { artistKey, primaryArtistName } = require('./trackAggregator.cjs');

const ITUNES = 'https://itunes.apple.com/search';
const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';
const COUNTRY_TRY = ['RU', 'US', 'GB'];

async function itunesSearch(params) {
  const qs = new URLSearchParams(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${ITUNES}?${qs.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function itunesLookup(params) {
  const qs = new URLSearchParams(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${ITUNES_LOOKUP}?${qs.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`iTunes lookup HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function itunesSearchBest(term, entity, attribute) {
  let best = { results: [], resultCount: 0, country: COUNTRY_TRY[0] };
  for (const country of COUNTRY_TRY) {
    try {
      const params = { term, entity, limit: '200', country };
      if (attribute) params.attribute = attribute;
      const data = await itunesSearch(params);
      const count = Number(data?.resultCount) || (Array.isArray(data?.results) ? data.results.length : 0);
      if (count > best.resultCount) {
        best = { ...data, country, resultCount: count };
      }
      if (count >= 40) break;
    } catch {
      /* next country */
    }
  }
  return best;
}

function mapSong(row, basedOnArtist, rankHint = 0) {
  const trackId = row?.trackId ?? row?.collectionId;
  if (!trackId) return null;
  const preview =
    typeof row.previewUrl === 'string' && row.previewUrl.startsWith('http') ? row.previewUrl : '';
  return {
    id: `itunes-${trackId}`,
    deezerId: null,
    itunesId: trackId,
    title: String(row.trackName || row.collectionName || 'Без названия'),
    artist: String(row.artistName || basedOnArtist || 'Неизвестный исполнитель'),
    album: String(row.collectionName || ''),
    coverUrl: row.artworkUrl100 || row.artworkUrl60 || null,
    previewUrl: preview,
    duration: Math.round(Number(row.trackTimeMillis || 0) / 1000) || 30,
    basedOnArtist: basedOnArtist || null,
    source: 'itunes',
    rank: Number(rankHint) || 0,
    trackNumber: row.trackNumber != null ? Number(row.trackNumber) : null,
    discNumber: row.discNumber != null ? Number(row.discNumber) : null,
  };
}

function mapAlbum(row) {
  const collectionId = row?.collectionId;
  if (!collectionId) return null;
  const recordTypeRaw = String(row.collectionType || '').toLowerCase();
  let recordType = 'album';
  if (recordTypeRaw.includes('single') || Number(row.trackCount) <= 2) recordType = 'single';
  else if (recordTypeRaw.includes('ep') || (Number(row.trackCount) > 2 && Number(row.trackCount) <= 6)) {
    recordType = 'ep';
  }
  const releaseDate = row.releaseDate ? String(row.releaseDate).slice(0, 10) : null;
  return {
    id: `itunes-${collectionId}`,
    title: String(row.collectionName || ''),
    coverUrl: row.artworkUrl100 || row.artworkUrl60 || null,
    releaseDate,
    recordType,
    nbTracks: Number(row.trackCount) || 0,
    deezerUrl: null,
    itunesUrl: row.collectionViewUrl ? String(row.collectionViewUrl) : null,
    source: 'itunes',
  };
}

function isPrimaryArtist(rowArtist, artistName) {
  return primaryArtistName(rowArtist) === primaryArtistName(artistName);
}

function artistInvolved(rowArtist, artistName) {
  const want = artistKey(artistName);
  const label = String(rowArtist || '').toLowerCase();
  const got = artistKey(rowArtist);
  if (!want) return false;
  return got === want || got.includes(want) || want.includes(got) || label.includes(String(artistName).toLowerCase());
}

function isCollaborationArtist(rowArtist, artistName) {
  return artistInvolved(rowArtist, artistName) && !isPrimaryArtist(rowArtist, artistName);
}

async function searchArtistTracks(artistName, { limit = 200 } = {}) {
  const catalog = await searchArtistCatalog(artistName, { limit });
  return catalog.primary;
}

async function searchArtistCatalog(artistName, { limit = 200 } = {}) {
  const name = String(artistName || '').trim();
  if (!name) return { primary: [], collaborations: [] };

  try {
    const data = await itunesSearchBest(name, 'song', 'artistTerm');
    const rows = Array.isArray(data?.results) ? data.results : [];
    const primary = [];
    const collaborations = [];
    let rank = rows.length;

    for (const row of rows) {
      if (row.wrapperType !== 'track' && !row.trackId) continue;
      if (!artistInvolved(row.artistName, name)) continue;
      const mapped = mapSong(row, name, rank);
      rank -= 1;
      if (!mapped) continue;
      if (isCollaborationArtist(row.artistName, name)) collaborations.push(mapped);
      else primary.push(mapped);
      if (primary.length + collaborations.length >= limit) break;
    }

    return { primary, collaborations };
  } catch (err) {
    logError('itunes', 'Artist catalog search failed', { artistName: name, err });
    return { primary: [], collaborations: [] };
  }
}

async function searchArtistReleases(artistName) {
  const name = String(artistName || '').trim();
  if (!name) return { albums: [], singles: [] };

  try {
    const data = await itunesSearchBest(name, 'album', 'artistTerm');
    const rows = Array.isArray(data?.results) ? data.results : [];
    const albums = [];
    const singles = [];

    for (const row of rows) {
      if (!artistInvolved(row.artistName, name)) continue;
      const mapped = mapAlbum(row);
      if (!mapped) continue;
      if (mapped.recordType === 'single' || mapped.recordType === 'ep') singles.push(mapped);
      else albums.push(mapped);
    }
    return { albums, singles };
  } catch (err) {
    logError('itunes', 'Artist albums search failed', { artistName: name, err });
    return { albums: [], singles: [] };
  }
}

async function searchTracks(query, { limit = 24 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  try {
    const data = await itunesSearchBest(q, 'song', undefined);
    const rows = Array.isArray(data?.results) ? data.results : [];
    const tracks = [];
    let rank = rows.length;
    for (const row of rows) {
      if (!row.trackId) continue;
      const mapped = mapSong(row, null, rank);
      rank -= 1;
      if (!mapped?.previewUrl) continue;
      tracks.push(mapped);
      if (tracks.length >= limit) break;
    }
    return tracks;
  } catch (err) {
    logError('itunes', 'Track search failed', { q, err });
    return [];
  }
}

async function searchReleaseTracks(release, artistName, { limit = 80 } = {}) {
  const source = String(release?.source || '').toLowerCase();
  if (source !== 'itunes') return [];

  const rawId = String(release?.id || '');
  const match = rawId.match(/(\d+)$/);
  const collectionId = match ? match[1] : '';
  if (!collectionId) return [];

  for (const country of COUNTRY_TRY) {
    try {
      const data = await itunesLookup({
        id: collectionId,
        entity: 'song',
        country,
      });
      const rows = Array.isArray(data?.results) ? data.results : [];
      const tracks = [];
      let rank = rows.length;
      for (const row of rows) {
        if (row.wrapperType !== 'track' || !row.trackId) continue;
        if (artistName && !artistInvolved(row.artistName, artistName)) continue;
        const mapped = mapSong(row, artistName || row.artistName || '', rank);
        rank -= 1;
        if (!mapped?.previewUrl) continue;
        tracks.push(mapped);
        if (tracks.length >= limit) break;
      }
      if (tracks.length > 0) return tracks;
    } catch (err) {
      logError('itunes', 'Release tracks lookup failed', { collectionId, country, err });
    }
  }

  return [];
}

module.exports = {
  searchArtistTracks,
  searchArtistCatalog,
  searchArtistReleases,
  searchTracks,
  searchReleaseTracks,
};
