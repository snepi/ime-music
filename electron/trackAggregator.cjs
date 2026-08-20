/** Shared track/release merge helpers for multi-source catalogs (Deezer + iTunes, …). */

const SOURCE_PRIORITY = {
  deezer: 3,
  itunes: 2,
  musicbrainz: 1,
};

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(feat[^)]*\)/gi, ' ')
    .replace(/\(ft[^)]*\)/gi, ' ')
    .replace(/\(with[^)]*\)/gi, ' ')
    .replace(/\s-\s*(remaster[^)]*|live[^)]*|radio edit[^)]*)$/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function primaryArtistName(artist) {
  const first = String(artist || '')
    .split(/\s*,\s*|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+×\s+|\s+x\s+|\s+и\s+/i)[0]
    .trim();
  return normalizeText(first || artist);
}

function normalizeTrackKey(artist, title) {
  return `${primaryArtistName(artist)}::${normalizeText(title)}`;
}

function normalizeReleaseKey(title, releaseDate) {
  const year = String(releaseDate || '').slice(0, 4);
  return `${normalizeText(title)}::${year}`;
}

function sourcePriority(source) {
  return SOURCE_PRIORITY[String(source || '').toLowerCase()] || 0;
}

function mergeTrackPair(primary, secondary) {
  if (!primary) return secondary;
  if (!secondary) return primary;

  const keepPrimary = sourcePriority(primary.source) >= sourcePriority(secondary.source);
  const main = keepPrimary ? { ...primary } : { ...secondary };
  const other = keepPrimary ? secondary : primary;

  if (!main.previewUrl && other.previewUrl) main.previewUrl = other.previewUrl;
  if (!main.coverUrl && other.coverUrl) main.coverUrl = other.coverUrl;
  if (!main.album && other.album) main.album = other.album;
  main.rank = Math.max(Number(main.rank) || 0, Number(other.rank) || 0);
  if ((main.trackNumber == null || main.trackNumber === 0) && other.trackNumber != null) {
    main.trackNumber = other.trackNumber;
  }
  if ((main.discNumber == null || main.discNumber === 0) && other.discNumber != null) {
    main.discNumber = other.discNumber;
  }

  if (main.source === 'deezer' && other.source === 'itunes' && other.deezerId == null) {
    /* keep deezer identity */
  } else if (!main.deezerId && other.deezerId) {
    main.deezerId = other.deezerId;
  }

  return main;
}

/**
 * Merge track lists from multiple providers.
 * Dedup by normalized artist+title; prefer Deezer metadata, fill preview gaps from iTunes.
 */
function mergeTracks(...lists) {
  const map = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const track of list) {
      if (!track?.title) continue;
      const key = normalizeTrackKey(track.artist, track.title);
      const existing = map.get(key);
      map.set(key, existing ? mergeTrackPair(existing, track) : { ...track });
    }
  }
  return Array.from(map.values()).sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0));
}

function mergeReleases(...lists) {
  const map = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const release of list) {
      if (!release?.title) continue;
      const key = `${String(release.id)}::${normalizeReleaseKey(release.title, release.releaseDate)}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...release });
        continue;
      }
      const keepExisting = sourcePriority(existing.source) >= sourcePriority(release.source);
      const main = keepExisting ? { ...existing } : { ...release };
      const other = keepExisting ? release : existing;
      if (!main.coverUrl && other.coverUrl) main.coverUrl = other.coverUrl;
      if (!main.nbTracks && other.nbTracks) main.nbTracks = other.nbTracks;
      if (!main.deezerUrl && other.deezerUrl) main.deezerUrl = other.deezerUrl;
      if (!main.itunesUrl && other.itunesUrl) main.itunesUrl = other.itunesUrl;
      map.set(key, main);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')),
  );
}

function artistKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  normalizeTrackKey,
  normalizeReleaseKey,
  mergeTracks,
  mergeReleases,
  primaryArtistName,
  artistKey,
};
