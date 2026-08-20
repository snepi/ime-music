const { logError } = require('./libraryStore.cjs');
const { parseSongFile } = require('./importService.cjs');

/**
 * Re-read tags/covers from files for all library tracks.
 * Preserves id, liked, playCount, lastPlayedAt, volume, icon, dateAdded.
 */
async function resyncLibraryMetadata(db, { onProgress } = {}) {
  const tracks = db.getAllTracks() || [];
  const result = {
    total: tracks.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    done: false,
  };

  const emit = () => {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ ...result });
      } catch {
        /* ignore */
      }
    }
  };

  emit();

  for (const track of tracks) {
    result.processed += 1;
    try {
      const parsed = await parseSongFile(track.filePath);
      const next = {
        title: parsed.title || track.title,
        artist: parsed.artist || track.artist,
        album: parsed.album || track.album,
        albumArtist: parsed.albumArtist ?? track.albumArtist,
        genre: parsed.genre ?? track.genre,
        year: parsed.year ?? track.year,
        trackNumber: parsed.trackNumber ?? track.trackNumber,
        discNumber: parsed.discNumber ?? track.discNumber,
        comment: parsed.comment ?? track.comment,
        composer: parsed.composer ?? track.composer,
        duration: parsed.duration || track.duration,
        format: parsed.format || track.format,
        bitrate: parsed.bitrate ?? track.bitrate,
        sampleRate: parsed.sampleRate ?? track.sampleRate,
        fileSize: parsed.fileSize ?? track.fileSize,
        dateModified: parsed.dateModified || track.dateModified,
        coverPath: parsed.coverPath || track.coverPath,
      };

      const changed =
        next.title !== track.title ||
        next.artist !== track.artist ||
        next.album !== track.album ||
        next.coverPath !== track.coverPath ||
        next.year !== track.year ||
        next.genre !== track.genre ||
        next.albumArtist !== track.albumArtist ||
        next.composer !== track.composer ||
        next.comment !== track.comment;

      if (changed) {
        db.updateTrack(track.id, next);
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        filePath: track.filePath,
        message: String(err?.message || err),
      });
      logError('metaSync', 'Track resync failed', { id: track.id, err });
    }

    if (result.processed % 5 === 0 || result.processed === result.total) emit();
  }

  result.done = true;
  emit();
  return result;
}

module.exports = { resyncLibraryMetadata };
