const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { logError } = require('./libraryStore.cjs');

function lyricsStoreDir() {
  return path.join(app.getPath('userData'), 'lyrics');
}

function appLyricsPath(trackId) {
  return path.join(lyricsStoreDir(), `${trackId}.txt`);
}

function sidecarPaths(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  return [
    path.join(dir, `${base}.lrc`),
    path.join(dir, `${base}.LRC`),
    path.join(dir, `${base}.txt`),
  ];
}

/**
 * Load lyrics for a local track:
 * 1) app storage (%APPDATA%/IMe Music/lyrics/{id}.txt)
 * 2) sidecar .lrc / .txt next to the audio file
 * 3) optional embedded unsynced lyrics via music-metadata
 */
async function getLyricsForTrack(track) {
  if (!track?.id && !track?.filePath) {
    return { ok: false, error: 'no track', lines: [], synced: false, source: null, text: '' };
  }

  // App-stored lyrics (from metadata editor)
  if (track.id) {
    try {
      const stored = appLyricsPath(track.id);
      if (fs.existsSync(stored)) {
        const raw = fs.readFileSync(stored, 'utf8');
        const parsed = parseLrcOrText(raw);
        if (raw.trim()) {
          return {
            ok: true,
            lines: parsed.lines,
            synced: parsed.synced,
            source: 'library',
            filePath: stored,
            text: raw,
            empty: !parsed.lines.length && !raw.trim(),
          };
        }
      }
    } catch (err) {
      logError('lyrics', 'read app lyrics failed', err);
    }
  }

  const filePath = track.filePath;
  if (filePath) {
    for (const candidate of sidecarPaths(filePath)) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const raw = fs.readFileSync(candidate, 'utf8');
        const parsed = parseLrcOrText(raw);
        if (parsed.lines.length || raw.trim()) {
          return {
            ok: true,
            lines: parsed.lines,
            synced: parsed.synced,
            source: path.basename(candidate),
            filePath: candidate,
            text: raw,
          };
        }
      } catch (err) {
        logError('lyrics', 'read sidecar failed', { candidate, err });
      }
    }

    try {
      const mm = require('music-metadata');
      const meta = await mm.parseFile(filePath, { duration: false });
      const unsynced =
        meta?.common?.lyrics?.[0]?.text ||
        meta?.native?.ID3v2?.find?.((f) => f.id === 'USLT')?.value?.text ||
        null;
      if (unsynced && String(unsynced).trim()) {
        const text = String(unsynced).trim();
        const lines = text.split(/\r?\n/).map((t, i) => ({ time: i * 0.01, text: t }));
        return { ok: true, lines, synced: false, source: 'tags', filePath: null, text };
      }
    } catch {
      /* optional */
    }
  }

  return {
    ok: true,
    lines: [],
    synced: false,
    source: null,
    empty: true,
    text: '',
  };
}

/**
 * Save lyrics from metadata editor: app storage + sidecar .txt next to audio when possible.
 */
function saveLyricsForTrack(track, text) {
  if (!track?.id) {
    return { ok: false, error: 'track not found' };
  }
  const raw = text == null ? '' : String(text).replace(/^\uFEFF/, '');
  fs.mkdirSync(lyricsStoreDir(), { recursive: true });
  const stored = appLyricsPath(track.id);

  try {
    if (!raw.trim()) {
      if (fs.existsSync(stored)) fs.unlinkSync(stored);
    } else {
      fs.writeFileSync(stored, raw, 'utf8');
    }
  } catch (err) {
    logError('lyrics', 'write app lyrics failed', err);
    return { ok: false, error: String(err?.message || err) };
  }

  let sidecarWritten = false;
  if (track.filePath && raw.trim()) {
    try {
      const dir = path.dirname(track.filePath);
      const base = path.basename(track.filePath, path.extname(track.filePath));
      const looksSynced = /\[\d{1,2}:\d{2}/.test(raw);
      const sidecar = path.join(dir, `${base}${looksSynced ? '.lrc' : '.txt'}`);
      fs.writeFileSync(sidecar, raw, 'utf8');
      sidecarWritten = true;
    } catch (err) {
      logError('lyrics', 'sidecar write failed (ok, kept in library)', err);
    }
  }

  return { ok: true, sidecarWritten, storedPath: stored };
}

function parseLrcOrText(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const lines = [];
  let synced = false;
  const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g;

  for (const row of text.split(/\r?\n/)) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    if (/^\[(ti|ar|al|by|offset|id|length):/i.test(trimmed)) continue;

    let match;
    let found = false;
    const localRe = new RegExp(re.source, 'g');
    while ((match = localRe.exec(trimmed)) !== null) {
      found = true;
      synced = true;
      const min = Number(match[1]) || 0;
      const sec = Number(match[2]) || 0;
      const frac = match[3] ? Number(`0.${match[3]}`) : 0;
      const time = min * 60 + sec + frac;
      const lyric = String(match[4] || '').trim();
      if (lyric) lines.push({ time, text: lyric });
    }
    if (!found && !/^\[/.test(trimmed)) {
      lines.push({ time: lines.length * 0.01, text: trimmed });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return { lines, synced };
}

module.exports = {
  getLyricsForTrack,
  saveLyricsForTrack,
  parseLrcOrText,
};
