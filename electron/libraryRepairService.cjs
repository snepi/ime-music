/**
 * Find and merge near-duplicate local library tracks.
 * Keeps the best entry, fills empty metadata from siblings, removes extras from DB
 * (files on disk are left untouched).
 */

const { logError } = require('./libraryStore.cjs');

function translitRu(s) {
  return String(s || '')
    .replace(/ё/g, 'е')
    .replace(/а/g, 'a')
    .replace(/б/g, 'b')
    .replace(/в/g, 'v')
    .replace(/г/g, 'g')
    .replace(/д/g, 'd')
    .replace(/е/g, 'e')
    .replace(/ж/g, 'zh')
    .replace(/з/g, 'z')
    .replace(/и/g, 'i')
    .replace(/й/g, 'y')
    .replace(/к/g, 'k')
    .replace(/л/g, 'l')
    .replace(/м/g, 'm')
    .replace(/н/g, 'n')
    .replace(/о/g, 'o')
    .replace(/п/g, 'p')
    .replace(/р/g, 'r')
    .replace(/с/g, 's')
    .replace(/т/g, 't')
    .replace(/у/g, 'u')
    .replace(/ф/g, 'f')
    .replace(/х/g, 'h')
    .replace(/ц/g, 'ts')
    .replace(/ч/g, 'ch')
    .replace(/ш/g, 'sh')
    .replace(/щ/g, 'sch')
    .replace(/ъ/g, '')
    .replace(/ы/g, 'y')
    .replace(/ь/g, '')
    .replace(/э/g, 'e')
    .replace(/ю/g, 'yu')
    .replace(/я/g, 'ya');
}

function normalizeKey(artist, title) {
  const normalize = (s) =>
    translitRu(String(s || ''))
      .toLowerCase()
      .replace(/\([^)]*(feat|ft|with)[^)]*\)/gi, ' ')
      .replace(/\b(remix|live|radio edit|radio|extended|acoustic|instrumental|remaster|edit|version)\b/gi, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${normalize(artist)}::${normalize(title)}`;
}

function hasCover(track) {
  return Boolean(String(track?.coverPath || '').trim());
}

function scoreTrack(track) {
  let score = 0;
  if (track.liked) score += 40;
  score += Math.min(30, Number(track.playCount) || 0);
  if (hasCover(track)) score += 15;
  if (String(track.genre || '').trim()) score += 8;
  if (track.year) score += 6;
  if (String(track.album || '').trim() && !/^unknown/i.test(track.album)) score += 5;
  score += Math.min(20, Math.floor((Number(track.bitrate) || 0) / 64));
  score += Math.min(10, Math.floor((Number(track.duration) || 0) / 60));
  score += Math.min(8, Math.floor((Number(track.fileSize) || 0) / (1024 * 1024)));
  return score;
}

function pickText(...values) {
  for (const value of values) {
    const v = String(value || '').trim();
    if (v && !/^unknown/i.test(v) && v.toLowerCase() !== 'неизвестный исполнитель') return v;
  }
  return undefined;
}

function mergeTrackMeta(keeper, others) {
  const updates = {};
  const title = pickText(keeper.title, ...others.map((t) => t.title));
  if (title && title !== keeper.title) updates.title = title;
  const artist = pickText(keeper.artist, ...others.map((t) => t.artist));
  if (artist && artist !== keeper.artist) updates.artist = artist;
  const album = pickText(keeper.album, ...others.map((t) => t.album));
  if (album && album !== keeper.album) updates.album = album;
  if (!String(keeper.genre || '').trim()) {
    const genre = pickText(...others.map((t) => t.genre));
    if (genre) updates.genre = genre;
  }
  if (!keeper.year) {
    const year = others.map((t) => t.year).find((y) => y != null && Number(y) > 0);
    if (year) updates.year = year;
  }
  if (!hasCover(keeper)) {
    const cover = others.find((t) => hasCover(t))?.coverPath;
    if (cover) updates.coverPath = cover;
  }
  const liked = Boolean(keeper.liked) || others.some((t) => t.liked);
  if (liked !== Boolean(keeper.liked)) updates.liked = liked;
  const playCount =
    (Number(keeper.playCount) || 0) + others.reduce((sum, t) => sum + (Number(t.playCount) || 0), 0);
  if (playCount !== (Number(keeper.playCount) || 0)) updates.playCount = playCount;
  const lastPlayed = Math.max(
    Number(keeper.lastPlayedAt) || 0,
    ...others.map((t) => Number(t.lastPlayedAt) || 0),
  );
  if (lastPlayed && lastPlayed !== (Number(keeper.lastPlayedAt) || 0)) {
    updates.lastPlayedAt = lastPlayed;
  }
  const ratingCandidates = [keeper.rating, ...others.map((t) => t.rating)].filter(
    (r) => r != null && Number(r) > 0,
  );
  if (ratingCandidates.length) {
    const rating = Math.max(...ratingCandidates.map(Number));
    if (rating !== (Number(keeper.rating) || 0)) updates.rating = rating;
  }
  return updates;
}

function findDuplicateGroups(tracks) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const track of tracks || []) {
    const key = normalizeKey(track.artist, track.title);
    if (!key || key === '::') continue;
    const list = map.get(key) || [];
    list.push(track);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      tracks: list.slice().sort((a, b) => scoreTrack(b) - scoreTrack(a)),
    }));
}

/**
 * @param {import('./database.cjs')} db
 * @param {{ dryRun?: boolean, onProgress?: (p: object) => void }} [opts]
 */
function repairLibraryDuplicates(db, { dryRun = false, onProgress } = {}) {
  const groups = findDuplicateGroups(db.getAllTracks());
  const result = {
    totalGroups: groups.length,
    processed: 0,
    merged: 0,
    removed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    groups: groups.map((g) => ({
      key: g.key,
      count: g.tracks.length,
      keepId: g.tracks[0]?.id,
      keepTitle: g.tracks[0]?.title,
      keepArtist: g.tracks[0]?.artist,
    })),
    done: false,
  };

  const emit = () => {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ ...result, errors: result.errors.slice(), groups: result.groups.slice() });
      } catch {
        /* ignore */
      }
    }
  };

  emit();

  if (dryRun || groups.length === 0) {
    result.done = true;
    emit();
    return result;
  }

  for (const group of groups) {
    result.processed += 1;
    try {
      const [keeper, ...dupes] = group.tracks;
      if (!keeper || !dupes.length) {
        result.skipped += 1;
        emit();
        continue;
      }

      const updates = mergeTrackMeta(keeper, dupes);
      if (Object.keys(updates).length) {
        db.updateTrack(keeper.id, updates);
        result.updated += 1;
      }

      for (const dupe of dupes) {
        try {
          const playlistIds = db.getPlaylistIdsForTrack?.(dupe.id) || [];
          for (const playlistId of playlistIds) {
            try {
              db.addToPlaylist(playlistId, keeper.id);
            } catch {
              /* already in playlist */
            }
          }
        } catch (err) {
          logError('libraryRepair', 'playlist transfer failed', { id: dupe.id, err });
        }
        db.deleteTrack(dupe.id);
        result.removed += 1;
      }
      result.merged += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        filePath: group.tracks[0]?.filePath || '',
        message: String(err?.message || err),
      });
      logError('libraryRepair', 'group merge failed', { key: group.key, err });
    }
    emit();
  }

  result.done = true;
  emit();
  return result;
}

module.exports = {
  normalizeKey,
  findDuplicateGroups,
  repairLibraryDuplicates,
};
