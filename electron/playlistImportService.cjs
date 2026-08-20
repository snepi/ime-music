const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { logError } = require('./libraryStore.cjs');

/**
 * Parse Spotify CSV / Apple Music text / M3U / "Artist - Title" lines
 * into { title, artist } entries.
 */
function parsePlaylistText(raw, fileName = '') {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const lowerName = String(fileName || '').toLowerCase();
  const lines = text.split(/\r?\n/);

  // Spotify CSV export
  if (lowerName.endsWith('.csv') || (lines[0] && /track name|artist name/i.test(lines[0]))) {
    return parseCsv(lines);
  }

  // M3U / M3U8
  if (lowerName.endsWith('.m3u') || lowerName.endsWith('.m3u8') || lines[0]?.startsWith('#EXTM3U')) {
    return parseM3u(lines);
  }

  return parsePlainLines(lines);
}

function parseCsv(lines) {
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const titleIdx = header.findIndex((h) =>
    ['track name', 'trackname', 'title', 'название', 'name', 'song'].includes(h),
  );
  const artistIdx = header.findIndex((h) =>
    ['artist name', 'artistname', 'artist', 'исполнитель', 'artists'].includes(h),
  );
  if (titleIdx < 0) return parsePlainLines(lines.slice(1));

  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = splitCsvLine(lines[i]);
    if (!row.length) continue;
    const title = (row[titleIdx] || '').trim();
    const artist = artistIdx >= 0 ? (row[artistIdx] || '').trim() : '';
    if (!title) continue;
    out.push({ title, artist: artist || 'Unknown' });
  }
  return out;
}

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseM3u(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const meta = line.replace(/^#EXTINF:\d+\s*,?/i, '').trim();
      const parsed = splitArtistTitle(meta);
      if (parsed) out.push(parsed);
    } else if (line && !line.startsWith('#')) {
      const base = path.basename(line, path.extname(line));
      const parsed = splitArtistTitle(base);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function parsePlainLines(lines) {
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    // Apple Music / Text export often: "1. Artist — Title" or "Artist - Title"
    const cleaned = trimmed.replace(/^\d+[\.)]\s*/, '');
    const parsed = splitArtistTitle(cleaned);
    if (parsed) out.push(parsed);
  }
  return out;
}

function splitArtistTitle(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const seps = [' — ', ' – ', ' - ', ' —', '–', ' — ', '\t'];
  for (const sep of seps) {
    const idx = s.indexOf(sep);
    if (idx > 0) {
      const left = s.slice(0, idx).trim();
      const right = s.slice(idx + sep.length).trim();
      if (left && right) {
        // Prefer "Artist - Title"; if looks like "Title - Artist" still ok for matching
        return { artist: left, title: right };
      }
    }
  }
  return { artist: 'Unknown', title: s };
}

/**
 * Match parsed entries against library; optionally create a playlist + wishlist leftovers.
 */
function importPlaylistEntries(db, entries, options = {}) {
  const name = String(options.name || 'Imported playlist').slice(0, 120);
  const addWishlist = options.addWishlist !== false;
  const createPlaylist = options.createPlaylist !== false;

  const matched = [];
  const unmatched = [];

  for (const entry of entries) {
    const title = String(entry.title || '').trim();
    const artist = String(entry.artist || '').trim();
    if (!title) continue;
    const track = db.findTrackByTitleArtist(title, artist);
    if (track) matched.push(track);
    else unmatched.push({ title, artist });
  }

  let playlist = null;
  if (createPlaylist && matched.length) {
    playlist = db.createPlaylist({
      id: randomUUID(),
      name,
      icon: '♪',
      description: `Импорт · найдено ${matched.length}, не найдено ${unmatched.length}`,
      createdAt: Date.now(),
    });
    db.setPlaylistTracks(
      playlist.id,
      matched.map((t) => t.id),
    );
    playlist = db.getAllPlaylists().find((p) => p.id === playlist.id) || playlist;
  }

  let wishlistAdded = 0;
  if (addWishlist && unmatched.length) {
    const settings = db.getSettings();
    const discovery = { ...(settings.discovery || {}) };
    const wishlist = Array.isArray(discovery.wishlist) ? [...discovery.wishlist] : [];
    const existingKeys = new Set(
      wishlist.map((w) => `${String(w.artist || '').toLowerCase()}::${String(w.title || '').toLowerCase()}`),
    );
    for (const u of unmatched) {
      const key = `${u.artist.toLowerCase()}::${u.title.toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      wishlist.unshift({
        id: `import-${randomUUID()}`,
        deezerId: null,
        title: u.title,
        artist: u.artist,
        album: '',
        coverUrl: null,
        previewUrl: '',
        addedAt: Date.now(),
        source: 'import',
      });
      wishlistAdded += 1;
    }
    discovery.wishlist = wishlist.slice(0, 2000);
    db.updateSettings({ discovery });
  }

  return {
    ok: true,
    matched: matched.length,
    unmatched: unmatched.length,
    wishlistAdded,
    playlist,
    unmatchedSample: unmatched.slice(0, 30),
  };
}

function importPlaylistFromFile(db, filePath, options = {}) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const entries = parsePlaylistText(raw, path.basename(filePath));
    if (!entries.length) {
      return { ok: false, error: 'В файле не найдено треков', matched: 0, unmatched: 0 };
    }
    const name =
      options.name ||
      path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, ' ').trim() ||
      'Imported playlist';
    return importPlaylistEntries(db, entries, { ...options, name });
  } catch (err) {
    logError('playlistImport', 'import failed', err);
    return { ok: false, error: String(err?.message || err), matched: 0, unmatched: 0 };
  }
}

module.exports = {
  parsePlaylistText,
  importPlaylistEntries,
  importPlaylistFromFile,
};
