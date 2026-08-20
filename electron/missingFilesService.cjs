const fs = require('fs');
const path = require('path');
const { logError } = require('./libraryStore.cjs');

/**
 * Scan library for tracks whose filePath no longer exists on disk.
 */
function findMissingTracks(db) {
  const tracks = db.getAllTracks() || [];
  const missing = [];
  for (const track of tracks) {
    const filePath = track.filePath;
    if (!filePath) {
      missing.push(track);
      continue;
    }
    try {
      if (!fs.existsSync(filePath)) missing.push(track);
    } catch {
      missing.push(track);
    }
  }
  return {
    ok: true,
    total: tracks.length,
    missingCount: missing.length,
    tracks: missing.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      filePath: t.filePath,
    })),
  };
}

/**
 * Remap missing tracks by matching basename under a new root folder (recursive).
 */
function relocateMissingByFolder(db, rootFolder) {
  const root = path.resolve(String(rootFolder || ''));
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, error: 'Папка не найдена', relocated: 0, stillMissing: 0 };
  }

  const byBase = new Map();
  const walk = (dir, depth = 0) => {
    if (depth > 12) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
        walk(full, depth + 1);
      } else if (ent.isFile()) {
        const base = ent.name.toLowerCase();
        if (!byBase.has(base)) byBase.set(base, []);
        byBase.get(base).push(full);
      }
    }
  };

  try {
    walk(root);
  } catch (err) {
    logError('missingFiles', 'walk failed', err);
    return { ok: false, error: String(err?.message || err), relocated: 0, stillMissing: 0 };
  }

  const scan = findMissingTracks(db);
  let relocated = 0;
  const still = [];

  for (const track of scan.tracks) {
    const base = path.basename(String(track.filePath || '')).toLowerCase();
    const candidates = byBase.get(base) || [];
    if (candidates.length === 1) {
      try {
        db.updateTrack(track.id, { filePath: candidates[0] });
        relocated += 1;
      } catch (err) {
        logError('missingFiles', 'updateTrack failed', { id: track.id, err });
        still.push(track);
      }
    } else if (candidates.length > 1) {
      // Prefer same relative tail when possible
      const oldNorm = String(track.filePath || '').replace(/\\/g, '/').toLowerCase();
      const best =
        candidates.find((c) => {
          const n = c.replace(/\\/g, '/').toLowerCase();
          const parts = oldNorm.split('/');
          const tail = parts.slice(-3).join('/');
          return tail && n.endsWith(tail);
        }) || candidates[0];
      try {
        db.updateTrack(track.id, { filePath: best });
        relocated += 1;
      } catch (err) {
        logError('missingFiles', 'updateTrack failed', { id: track.id, err });
        still.push(track);
      }
    } else {
      still.push(track);
    }
  }

  return {
    ok: true,
    relocated,
    stillMissing: still.length,
    stillMissingTracks: still.slice(0, 50),
  };
}

module.exports = {
  findMissingTracks,
  relocateMissingByFolder,
};
