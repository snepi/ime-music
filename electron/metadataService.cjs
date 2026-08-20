/**
 * Safe metadata / cover editing for tracks in the library.
 * Writes audio tags only for supported formats; otherwise updates SQLite only.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const { app } = require('electron');
const { spawnSync } = require('child_process');
const NodeID3 = require('node-id3');
const { logError } = require('./libraryStore.cjs');
const db = require('./database.cjs');

const WRITE_FILE_EXTS = new Set(['mp3']);
const FFMPEG_WRITE_EXTS = new Set(['flac', 'm4a', 'mp4', 'ogg', 'opus', 'aac']);

function coversDir() {
  return path.join(app.getPath('userData'), 'covers');
}

function backupsDir() {
  return path.join(app.getPath('userData'), 'backups', 'audio');
}

function normalizePath(filePath) {
  return path.normalize(path.resolve(filePath));
}

function getExt(filePath) {
  return path.extname(filePath).replace('.', '').toLowerCase();
}

function isLibraryTrackPath(filePath) {
  const track = db.getTrackByPath(filePath);
  return Boolean(track);
}

function assertTrackOwned(trackId) {
  const track = db.getTrackById(trackId);
  if (!track) {
    const err = new Error('Трек не найден в библиотеке');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return track;
}

function resolveWriteMode(filePath, settings) {
  const ext = getExt(filePath);
  if (WRITE_FILE_EXTS.has(ext)) return 'file-id3';
  if (FFMPEG_WRITE_EXTS.has(ext) && resolveFfmpeg(settings)) return 'file-ffmpeg';
  return 'library';
}

function resolveFfmpeg(settings) {
  const candidates = [];
  if (settings?.ffmpegPath) candidates.push(settings.ffmpegPath);
  candidates.push('ffmpeg');
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (r.status === 0) return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

function createAudioBackup(filePath) {
  fs.mkdirSync(backupsDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(filePath);
  const dest = path.join(backupsDir(), `${stamp}__${base}`);
  fs.copyFileSync(filePath, dest);
  logError('metadata', 'Audio backup created', { filePath, dest });
  return dest;
}

function restoreFromBackup(backupPath, targetPath) {
  fs.copyFileSync(backupPath, targetPath);
  logError('metadata', 'Audio restored from backup', { backupPath, targetPath });
}

function sanitizeText(value, max = 500) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeInt(value, min, max) {
  if (value === '' || value == null) return null;
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function validateEditable(payload) {
  const title = sanitizeText(payload.title, 300);
  if (!title) {
    const err = new Error('Название не может быть пустым');
    err.code = 'VALIDATION';
    throw err;
  }
  return {
    title,
    artist: sanitizeText(payload.artist, 300) || 'Неизвестный исполнитель',
    album: sanitizeText(payload.album, 300) || 'Неизвестный альбом',
    albumArtist: sanitizeText(payload.albumArtist, 300),
    genre: sanitizeText(payload.genre, 120),
    year: sanitizeInt(payload.year, 1000, 9999),
    trackNumber: sanitizeInt(payload.trackNumber, 0, 9999),
    discNumber: sanitizeInt(payload.discNumber, 0, 999),
    comment: sanitizeText(payload.comment, 2000),
    composer: sanitizeText(payload.composer, 300),
    rating: sanitizeInt(payload.rating, 0, 5),
  };
}

async function readFileTags(filePath) {
  try {
    const { parseFile } = await import('music-metadata');
    const metadata = await parseFile(filePath, { duration: true });
    return {
      title: metadata.common.title ?? null,
      artist: metadata.common.artist ?? null,
      album: metadata.common.album ?? null,
      albumArtist: metadata.common.albumartist ?? null,
      genre: Array.isArray(metadata.common.genre)
        ? metadata.common.genre[0] ?? null
        : metadata.common.genre ?? null,
      year: metadata.common.year ?? null,
      trackNumber: metadata.common.track?.no ?? null,
      discNumber: metadata.common.disk?.no ?? null,
      comment: Array.isArray(metadata.common.comment)
        ? metadata.common.comment.map((c) => (typeof c === 'string' ? c : c?.text)).filter(Boolean).join('\n') || null
        : metadata.common.comment ?? null,
      composer: Array.isArray(metadata.common.composer)
        ? metadata.common.composer[0] ?? null
        : metadata.common.composer ?? null,
      rating:
        Array.isArray(metadata.common.rating) && metadata.common.rating[0]
          ? Math.round((metadata.common.rating[0].rating ?? 0) * 5)
          : null,
      duration: metadata.format.duration ?? null,
      format: metadata.format.container ?? null,
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate) : null,
      sampleRate: metadata.format.sampleRate ?? null,
    };
  } catch (err) {
    logError('metadata', 'Failed to read file tags', { filePath, err });
    return null;
  }
}

async function getTrackDetails(trackId) {
  logError('metadata', 'Editor opened', { trackId });
  const track = assertTrackOwned(trackId);
  const filePath = normalizePath(track.filePath);
  const fileExists = fs.existsSync(filePath);
  const settings = db.getSettings();
  const writeMode = fileExists ? resolveWriteMode(filePath, settings) : 'none';
  let fileTags = null;
  if (fileExists) fileTags = await readFileTags(filePath);

  let fileSize = track.fileSize;
  let dateModified = track.dateModified;
  if (fileExists) {
    try {
      const st = fs.statSync(filePath);
      fileSize = st.size;
      dateModified = st.mtimeMs;
    } catch {
      /* ignore */
    }
  }

  return {
    song: {
      ...track,
      fileSize,
      dateModified,
      comment: track.comment ?? fileTags?.comment ?? null,
      composer: track.composer ?? fileTags?.composer ?? null,
      rating: track.rating ?? fileTags?.rating ?? null,
    },
    fileExists,
    writeMode,
    writeToFileSupported: writeMode === 'file-id3' || writeMode === 'file-ffmpeg',
    writeHint:
      writeMode === 'library'
        ? 'Запись тегов в этот формат недоступна. Можно сохранить изменения только в библиотеке IMe Music.'
        : writeMode === 'none'
          ? 'Файл не найден на диске.'
          : null,
  };
}

function writeId3Tags(targetPath, fields, coverPath) {
  const tags = {
    title: fields.title,
    artist: fields.artist,
    album: fields.album,
    performerInfo: fields.albumArtist || undefined,
    genre: fields.genre || undefined,
    year: fields.year != null ? String(fields.year) : undefined,
    trackNumber: fields.trackNumber != null ? String(fields.trackNumber) : undefined,
    partOfSet: fields.discNumber != null ? String(fields.discNumber) : undefined,
    comment: fields.comment
      ? { language: 'eng', text: fields.comment }
      : undefined,
    composer: fields.composer || undefined,
  };
  if (fields.rating != null) {
    tags.popularimeter = {
      email: 'ime-music',
      rating: Math.round((fields.rating / 5) * 255),
      counter: 0,
    };
  }
  if (coverPath && fs.existsSync(coverPath)) {
    const ext = getExt(coverPath);
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    tags.image = {
      mime,
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: fs.readFileSync(coverPath),
    };
  }
  const result = NodeID3.write(tags, targetPath);
  if (result instanceof Error) throw result;
  if (result === false) throw new Error('node-id3 write failed');
}

function writeFfmpegTags(ffmpegBin, sourcePath, targetPath, fields, coverPath) {
  const args = ['-y', '-i', sourcePath];
  if (coverPath && fs.existsSync(coverPath)) {
    args.push('-i', coverPath, '-map', '0:a', '-map', '1:0', '-c', 'copy', '-disposition:v:0', 'attached_pic');
  } else {
    args.push('-map', '0', '-c', 'copy');
  }
  const meta = {
    title: fields.title,
    artist: fields.artist,
    album: fields.album,
    album_artist: fields.albumArtist || '',
    genre: fields.genre || '',
    date: fields.year != null ? String(fields.year) : '',
    track: fields.trackNumber != null ? String(fields.trackNumber) : '',
    disc: fields.discNumber != null ? String(fields.discNumber) : '',
    comment: fields.comment || '',
    composer: fields.composer || '',
  };
  for (const [k, v] of Object.entries(meta)) {
    args.push('-metadata', `${k}=${v}`);
  }
  args.push(targetPath);
  const r = spawnSync(ffmpegBin, args, { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || 'ffmpeg failed').slice(0, 500);
    logError('metadata', 'FFmpeg write failed', { msg, status: r.status });
    throw new Error('Не удалось записать метаданные через FFmpeg');
  }
}

async function processCoverImage(sourceImagePath) {
  if (!sourceImagePath || !fs.existsSync(sourceImagePath)) {
    const err = new Error('Изображение не найдено');
    err.code = 'ENOENT';
    throw err;
  }
  const ext = getExt(sourceImagePath);
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    const err = new Error('Поддерживаются только PNG, JPG и WEBP');
    err.code = 'VALIDATION';
    throw err;
  }

  fs.mkdirSync(coversDir(), { recursive: true });
  const { Jimp } = require('jimp');
  const image = await Jimp.read(sourceImagePath);
  if (image.width > 1000 || image.height > 1000) {
    const scale = Math.min(1000 / image.width, 1000 / image.height);
    image.resize({
      w: Math.max(1, Math.round(image.width * scale)),
      h: Math.max(1, Math.round(image.height * scale)),
    });
  }

  const hash = createHash('sha1')
    .update(sourceImagePath)
    .update(String(Date.now()))
    .update(randomUUID())
    .digest('hex')
    .slice(0, 16);
  const outExt = ext === 'png' ? 'png' : 'jpg';
  const outPath = path.join(coversDir(), `edit-${hash}.${outExt}`);
  await image.write(outPath);
  logError('metadata', 'Cover processed', { outPath, w: image.width, h: image.height });
  return outPath;
}

function maybeDeleteCover(coverPath) {
  if (!coverPath) return;
  try {
    const normalized = normalizePath(coverPath);
    const coversRoot = normalizePath(coversDir());
    if (!normalized.toLowerCase().startsWith(coversRoot.toLowerCase())) return;
    if (db.countTracksUsingCover(normalized) > 0) return;
    if (fs.existsSync(normalized)) {
      fs.unlinkSync(normalized);
      logError('metadata', 'Unused cover deleted', { coverPath: normalized });
    }
  } catch (err) {
    logError('metadata', 'Failed to delete unused cover', { coverPath, err });
  }
}

/**
 * @param {string} trackId
 * @param {object} payload editable fields + optional coverPath / removeCover / libraryOnly
 */
async function saveTrackMetadata(trackId, payload = {}) {
  const track = assertTrackOwned(trackId);
  const filePath = normalizePath(track.filePath);
  const fields = validateEditable(payload);
  const settings = db.getSettings();
  const libraryOnly = Boolean(payload.libraryOnly);
  const removeCover = Boolean(payload.removeCover);

  let nextCoverPath = track.coverPath;
  let newCoverPath = null;

  if (payload.coverSourcePath) {
    newCoverPath = await processCoverImage(payload.coverSourcePath);
    nextCoverPath = newCoverPath;
  } else if (removeCover) {
    nextCoverPath = null;
  }

  const fileExists = fs.existsSync(filePath);
  if (!fileExists) {
    logError('metadata', 'Save with missing file — library only', { trackId, filePath });
    const updated = db.updateTrack(trackId, {
      ...fields,
      coverPath: nextCoverPath,
      dateModified: Date.now(),
    });
    if (removeCover) maybeDeleteCover(track.coverPath);
    return {
      song: updated,
      writtenToFile: false,
      libraryOnly: true,
      message: 'Файл не найден. Изменения сохранены только в библиотеке.',
    };
  }

  if (!isLibraryTrackPath(filePath)) {
    const err = new Error('Путь не принадлежит треку библиотеки');
    err.code = 'FORBIDDEN';
    throw err;
  }

  let writeMode = libraryOnly ? 'library' : resolveWriteMode(filePath, settings);
  let writtenToFile = false;
  let backupPath = null;
  const tempPath = `${filePath}.ime-tmp-${randomUUID()}${path.extname(filePath)}`;

  try {
    if (writeMode === 'file-id3' || writeMode === 'file-ffmpeg') {
      backupPath = createAudioBackup(filePath);
      fs.copyFileSync(filePath, tempPath);

      const coverForEmbed = removeCover ? null : nextCoverPath;
      if (writeMode === 'file-id3') {
        writeId3Tags(tempPath, fields, coverForEmbed);
      } else {
        const ffmpeg = resolveFfmpeg(settings);
        writeFfmpegTags(ffmpeg, filePath, tempPath, fields, coverForEmbed);
      }

      try {
        fs.renameSync(tempPath, filePath);
      } catch (renameErr) {
        // Windows lock while playing — keep library update, restore audio from backup intent
        logError('metadata', 'Atomic rename failed (file may be locked)', {
          trackId,
          err: renameErr,
        });
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {
          /* ignore */
        }
        writeMode = 'library';
        writtenToFile = false;
      }

      if (writeMode !== 'library') {
        writtenToFile = true;
      }
    }

    let fileSize = track.fileSize;
    let dateModified = Date.now();
    try {
      const st = fs.statSync(filePath);
      fileSize = st.size;
      dateModified = st.mtimeMs;
    } catch {
      /* ignore */
    }

    const updated = db.updateTrack(trackId, {
      ...fields,
      coverPath: nextCoverPath,
      fileSize,
      dateModified,
    });

    if (removeCover || (newCoverPath && track.coverPath && track.coverPath !== newCoverPath)) {
      maybeDeleteCover(track.coverPath);
    }

    logError('metadata', 'Metadata saved', {
      trackId,
      writtenToFile,
      writeMode,
      coverChanged: Boolean(newCoverPath) || removeCover,
    });

    return {
      song: updated,
      writtenToFile,
      libraryOnly: !writtenToFile,
      message: writtenToFile
        ? 'Метаданные сохранены'
        : 'Изменения сохранены в библиотеке. Запись в аудиофайл недоступна или файл занят.',
      backupPath,
    };
  } catch (err) {
    logError('metadata', 'Save metadata failed', { trackId, err });
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    if (backupPath && fs.existsSync(backupPath) && fs.existsSync(filePath)) {
      try {
        restoreFromBackup(backupPath, filePath);
      } catch (restoreErr) {
        logError('metadata', 'Restore failed', { restoreErr });
      }
    }
    if (newCoverPath) maybeDeleteCover(newCoverPath);
    throw err;
  }
}

module.exports = {
  getTrackDetails,
  saveTrackMetadata,
  processCoverImage,
  coversDir,
  backupsDir,
};
