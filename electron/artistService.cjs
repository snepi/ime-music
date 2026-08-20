const { logError } = require('./libraryStore.cjs');
const { mergeTracks, mergeReleases } = require('./trackAggregator.cjs');
const {
  searchArtistCatalog,
  searchArtistReleases,
  searchTracks,
  searchReleaseTracks,
} = require('./itunesProvider.cjs');

const DEEZER = 'https://api.deezer.com';
const TOP_LIMIT = 100;
const ALBUM_PAGE = 100;
const MAX_ALBUM_PAGES = 5;
const SEARCH_TRACK_LIMIT = 100;

function artistKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

function mapTrack(
  track,
  basedOnArtist,
  { includeWithoutPreview = true, fallbackCoverUrl = null, fallbackAlbumTitle = '' } = {},
) {
  const preview =
    typeof track.preview === 'string' && track.preview.startsWith('http') ? track.preview : '';
  if (!preview && !includeWithoutPreview) return null;
  const id = track?.id;
  if (id == null) return null;
  const coverUrl = track.album?.cover_medium || track.album?.cover || fallbackCoverUrl || null;
  const albumTitle = String(track.album?.title || fallbackAlbumTitle || '');
  return {
    id: `deezer-${id}`,
    deezerId: id,
    title: String(track.title || 'Без названия'),
    artist: String(track.artist?.name || basedOnArtist || 'Неизвестный исполнитель'),
    album: albumTitle,
    coverUrl,
    previewUrl: preview,
    duration: Number(track.duration) || 30,
    basedOnArtist: basedOnArtist || null,
    source: 'deezer',
    rank: Number(track.rank) || 0,
    trackNumber:
      track.track_position != null
        ? Number(track.track_position)
        : track.trackNumber != null
          ? Number(track.trackNumber)
          : null,
    discNumber:
      track.disk_number != null
        ? Number(track.disk_number)
        : track.discNumber != null
          ? Number(track.discNumber)
          : null,
  };
}

function mapArtistSummary(artist) {
  if (!artist?.id) return null;
  return {
    id: artist.id,
    name: String(artist.name || ''),
    pictureUrl: artist.picture_medium || artist.picture || null,
    nbFan: Number(artist.nb_fan) || 0,
  };
}

function normalizeRecordType(recordType) {
  const rt = String(recordType || '').toLowerCase();
  if (rt === 'single') return 'single';
  if (rt === 'ep') return 'ep';
  if (rt === 'album') return 'album';
  if (rt === 'compile') return 'compile';
  return 'other';
}

function mapRelease(album) {
  if (!album?.id) return null;
  return {
    id: album.id,
    title: String(album.title || ''),
    coverUrl: album.cover_medium || album.cover || null,
    releaseDate: album.release_date ? String(album.release_date) : null,
    recordType: normalizeRecordType(album.record_type),
    nbTracks: Number(album.nb_tracks) || 0,
    deezerUrl: album.link ? String(album.link) : null,
    source: 'deezer',
  };
}

function sortTracksByRank(tracks) {
  return [...tracks].sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0));
}

function dedupeTracks(tracks) {
  const seen = new Set();
  const out = [];
  for (const track of tracks) {
    const key = String(track.deezerId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(track);
  }
  return out;
}

function isCollaborationRaw(track, artistId, artistName) {
  const id = Number(artistId);
  const nameKey = artistKey(artistName);
  const contributors = Array.isArray(track?.contributors) ? track.contributors : [];
  const primaryId = Number(track?.artist?.id);
  const title = String(track?.title || '');
  const artistLabel = String(track?.artist?.name || '');

  const selfContributor = contributors.some((c) => Number(c.id) === id);
  const otherContributors = contributors.some((c) => Number(c.id) !== id);
  if (contributors.length > 1 && selfContributor && otherContributors) return true;

  const featInTitle = /\(feat\.|\(ft\.|\bfeat\.|\bft\.|\bwith\b/i.test(title);
  const multiArtistLabel = /,| & |\band\b/i.test(artistLabel);
  if (featInTitle && artistKey(artistLabel).includes(nameKey)) return true;
  if (multiArtistLabel && artistKey(artistLabel).includes(nameKey)) return true;

  if (primaryId && primaryId !== id && selfContributor) return true;

  return false;
}

async function resolveArtistRecord(nameOrId) {
  const raw = String(nameOrId || '').trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    try {
      return await deezerGet(`/artist/${raw}`);
    } catch (err) {
      logError('artist', 'Artist fetch by id failed', { id: raw, err });
      return null;
    }
  }

  try {
    const data = await deezerGet(`/search/artist?q=${encodeURIComponent(raw)}&limit=8`);
    const list = Array.isArray(data?.data) ? data.data : [];
    if (!list.length) return null;
    const want = artistKey(raw);
    const hit = list.find((a) => artistKey(a?.name) === want) || list[0];
    if (!hit?.id) return null;
    return await deezerGet(`/artist/${hit.id}`);
  } catch (err) {
    logError('artist', 'Artist search failed', { name: raw, err });
    return null;
  }
}

async function fetchArtistTopTracks(artistId, artistName) {
  const data = await deezerGet(`/artist/${artistId}/top?limit=${TOP_LIMIT}`);
  const tracks = [];
  for (const row of Array.isArray(data?.data) ? data.data : []) {
    const mapped = mapTrack(row, artistName);
    if (mapped) tracks.push(mapped);
  }
  return sortTracksByRank(tracks);
}

async function fetchDeezerDiscographyTracks(artistId, artistName) {
  const tracks = [];
  try {
    const albumsData = await deezerGet(`/artist/${artistId}/albums?limit=100`);
    const releases = Array.isArray(albumsData?.data) ? albumsData.data : [];
    const batchSize = 4;

    for (let i = 0; i < releases.length; i += batchSize) {
      const batch = releases.slice(i, i + batchSize);
      const batches = await Promise.all(
        batch.map(async (release) => {
          try {
            const data = await deezerGet(`/album/${release.id}/tracks?limit=100`);
            return {
              rows: Array.isArray(data?.data) ? data.data : [],
              fanRank: Number(release.fans) || 0,
            };
          } catch {
            return { rows: [], fanRank: 0 };
          }
        }),
      );

      for (let j = 0; j < batches.length; j += 1) {
        const { rows, fanRank } = batches[j];
        const release = batch[j];
        const fallbackCoverUrl = release?.cover_medium || release?.cover || null;
        const fallbackAlbumTitle = String(release?.title || '');
        for (const row of rows) {
          const mapped = mapTrack(row, artistName, {
            fallbackCoverUrl,
            fallbackAlbumTitle,
          });
          if (!mapped) continue;
          if (!mapped.rank) mapped.rank = fanRank;
          tracks.push(mapped);
        }
      }
    }
  } catch (err) {
    logError('artist', 'Discography fetch failed', { artistId, err });
  }
  return tracks;
}

async function fetchArtistReleases(artistId) {
  const albums = [];
  const singles = [];

  for (let page = 0; page < MAX_ALBUM_PAGES; page += 1) {
    const index = page * ALBUM_PAGE;
    const data = await deezerGet(`/artist/${artistId}/albums?index=${index}&limit=${ALBUM_PAGE}`);
    const batch = Array.isArray(data?.data) ? data.data : [];
    if (!batch.length) break;

    for (const row of batch) {
      const mapped = mapRelease(row);
      if (!mapped) continue;
      if (mapped.recordType === 'single') {
        singles.push(mapped);
      } else if (mapped.recordType === 'ep') {
        albums.push(mapped);
      } else {
        albums.push(mapped);
      }
    }

    if (batch.length < ALBUM_PAGE) break;
  }

  const byDate = (a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''));
  albums.sort(byDate);
  singles.sort(byDate);
  return { albums, singles };
}

async function fetchDeezerReleaseTracks(releaseId, artistName) {
  const id = String(releaseId || '')
    .trim()
    .replace(/^deezer-/, '');
  if (!id || !/^\d+$/.test(id)) return [];

  try {
    const [albumMeta, data] = await Promise.all([
      deezerGet(`/album/${id}`).catch(() => null),
      deezerGet(`/album/${id}/tracks?limit=100`),
    ]);
    const rows = Array.isArray(data?.data) ? data.data : [];
    const fallbackCoverUrl = albumMeta?.cover_medium || albumMeta?.cover || null;
    const fallbackAlbumTitle = String(albumMeta?.title || '');
    const tracks = [];
    for (const row of rows) {
      const mapped = mapTrack(row, artistName, {
        includeWithoutPreview: false,
        fallbackCoverUrl,
        fallbackAlbumTitle,
      });
      if (mapped) tracks.push(mapped);
    }
    return tracks;
  } catch (err) {
    logError('artist', 'Release tracks fetch failed', { releaseId: id, err });
    return [];
  }
}

async function fetchCollaborationTracks(artist, topRows) {
  const artistId = Number(artist.id);
  const artistName = String(artist.name || '');
  const seen = new Set();
  const collabs = [];

  const pushRow = (row) => {
    const key = String(row?.id);
    if (!key || seen.has(key)) return;
    if (!isCollaborationRaw(row, artistId, artistName)) return;
    const mapped = mapTrack(row, artistName);
    if (!mapped) return;
    seen.add(key);
    collabs.push(mapped);
  };

  for (const row of topRows) pushRow(row);

  try {
    const data = await deezerGet(
      `/search/track?q=${encodeURIComponent(artistName)}&limit=${SEARCH_TRACK_LIMIT}`,
    );
    for (const row of Array.isArray(data?.data) ? data.data : []) {
      const primaryId = Number(row?.artist?.id);
      const labelKey = artistKey(row?.artist?.name || '');
      const selfKey = artistKey(artistName);
      if (primaryId !== artistId && !labelKey.includes(selfKey)) {
        const contributors = Array.isArray(row?.contributors) ? row.contributors : [];
        if (!contributors.some((c) => Number(c.id) === artistId)) continue;
      }
      pushRow(row);
    }
  } catch (err) {
    logError('artist', 'Collaboration search failed', { artistId, err });
  }

  return sortTracksByRank(collabs);
}

/**
 * Search artists and demo tracks on Deezer.
 */
async function searchDiscovery(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return { ok: true, artists: [], tracks: [] };
  }

  try {
    const [artistData, trackData, itunesTracks] = await Promise.all([
      deezerGet(`/search/artist?q=${encodeURIComponent(q)}&limit=8`),
      deezerGet(`/search/track?q=${encodeURIComponent(q)}&limit=24`),
      searchTracks(q, { limit: 24 }),
    ]);

    const artists = (Array.isArray(artistData?.data) ? artistData.data : [])
      .map(mapArtistSummary)
      .filter(Boolean);

    const deezerTracks = [];
    for (const row of Array.isArray(trackData?.data) ? trackData.data : []) {
      const mapped = mapTrack(row, null, { includeWithoutPreview: false });
      if (mapped) deezerTracks.push(mapped);
    }

    const tracks = mergeTracks(deezerTracks, itunesTracks).slice(0, 24);

    return { ok: true, artists, tracks };
  } catch (err) {
    logError('artist', 'Discovery search failed', { q, err });
    return { ok: false, artists: [], tracks: [], error: String(err?.message || err) };
  }
}

/**
 * Full artist profile: top tracks, albums, singles, collaborations, related artists.
 */
async function getArtistProfile(nameOrId) {
  const artist = await resolveArtistRecord(nameOrId);
  if (!artist?.id) {
    return { ok: false, profile: null, error: 'Артист не найден' };
  }

  try {
    const artistName = String(artist.name || '');
    const [topData, relatedData, releases, discographyTracks, itunesCatalog, itunesReleases] =
      await Promise.all([
        deezerGet(`/artist/${artist.id}/top?limit=${TOP_LIMIT}`),
        deezerGet(`/artist/${artist.id}/related?limit=10`).catch(() => ({ data: [] })),
        fetchArtistReleases(artist.id),
        fetchDeezerDiscographyTracks(artist.id, artistName),
        searchArtistCatalog(artistName, { limit: 200 }),
        searchArtistReleases(artistName),
      ]);

    const topRows = Array.isArray(topData?.data) ? topData.data : [];
    const deezerTopTracks = [];
    for (const row of topRows) {
      const mapped = mapTrack(row, artistName);
      if (mapped) deezerTopTracks.push(mapped);
    }

    const topTracks = mergeTracks(deezerTopTracks, discographyTracks, itunesCatalog.primary);
    const albums = mergeReleases(releases.albums, itunesReleases.albums);
    const singles = mergeReleases(releases.singles, itunesReleases.singles);

    const deezerCollabs = await fetchCollaborationTracks(artist, topRows);
    const collaborationTracks = mergeTracks(deezerCollabs, itunesCatalog.collaborations);

    const relatedArtists = (Array.isArray(relatedData?.data) ? relatedData.data : [])
      .map(mapArtistSummary)
      .filter(Boolean)
      .slice(0, 10);

    return {
      ok: true,
      profile: {
        id: artist.id,
        name: String(artist.name || ''),
        pictureUrl: artist.picture_xl || artist.picture_big || artist.picture_medium || null,
        nbFan: Number(artist.nb_fan) || 0,
        nbAlbum: Number(artist.nb_album) || 0,
        topTracks,
        albums,
        singles,
        collaborationTracks,
        tracks: topTracks,
        relatedArtists,
      },
    };
  } catch (err) {
    logError('artist', 'Artist profile failed', { nameOrId, err });
    return { ok: false, profile: null, error: String(err?.message || err) };
  }
}

async function getArtistReleaseProfile(payload) {
  const artistName = String(payload?.artistName || '').trim();
  const release = payload?.release;
  if (!artistName || !release?.id || !release?.title) {
    return { ok: false, profile: null, error: 'Релиз не найден' };
  }

  try {
    const [deezerTracks, itunesTracks] = await Promise.all([
      fetchDeezerReleaseTracks(release.id, artistName),
      searchReleaseTracks(release, artistName, { limit: 120 }),
    ]);

    const tracks = mergeTracks(deezerTracks, itunesTracks).slice(0, 120);
    return {
      ok: true,
      profile: {
        release,
        tracks,
      },
    };
  } catch (err) {
    logError('artist', 'Artist release profile failed', { artistName, release, err });
    return { ok: false, profile: null, error: String(err?.message || err) };
  }
}

module.exports = {
  searchDiscovery,
  getArtistProfile,
  getArtistReleaseProfile,
};
