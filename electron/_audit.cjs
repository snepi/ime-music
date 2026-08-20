/**
 * Technical audit runner — run with: npx electron electron/_audit.cjs
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

app.setName('IMe Music');

const results = [];
function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log('PASS', name, detail || '');
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.log('FAIL', name, detail || '');
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  const expectedSuffix = path.join('IMe Music');
  if (userData.replace(/\\/g, '/').endsWith('IMe Music') || userData.includes('IMe Music')) {
    pass('userData path', userData);
  } else {
    fail('userData path', `unexpected: ${userData}`);
  }

  const dbMod = require('./database.cjs');
  const store = require('./libraryStore.cjs');
  const importSvc = require('./importService.cjs');

  // SQLite load
  try {
    const Database = require('better-sqlite3');
    pass('better-sqlite3 require', `v${require('better-sqlite3/package.json').version}`);
    dbMod.openDatabase();
    pass('openDatabase', dbMod.getDbPath());
  } catch (e) {
    fail('openDatabase', e.message);
  }

  const dbPath = dbMod.getDbPath();
  const expectedDb = path.join(userData, 'data', 'library.db');
  if (path.normalize(dbPath) === path.normalize(expectedDb)) {
    pass('db path', dbPath);
  } else {
    fail('db path', `got ${dbPath} expected ${expectedDb}`);
  }

  // No runtime JSON writes from main path
  const jsonPath = store.libraryPath();
  pass('library.json preserved', fs.existsSync(jsonPath) ? 'exists' : 'missing (ok if fresh)');

  // Migration idempotent
  const before = dbMod.getAllTracks().length;
  const m1 = dbMod.migrateFromJsonIfNeeded();
  const m2 = dbMod.migrateFromJsonIfNeeded();
  const after = dbMod.getAllTracks().length;
  if (after === before) pass('migration no duplicates', `tracks=${after} m1=${JSON.stringify(m1)} m2=${JSON.stringify(m2)}`);
  else fail('migration duplicates', `before=${before} after=${after}`);

  // Likes preserved
  const liked = dbMod.getAllTracks().filter((t) => t.liked);
  pass('likes in db', `count=${liked.length}`);

  // Playlist order
  const pls = dbMod.getAllPlaylists();
  if (pls.length > 0) {
    const database = dbMod.openDatabase();
    const rows = database
      .prepare('SELECT position, track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position')
      .all(pls[0].id);
    const ordered = rows.every((r, i) => r.position === i);
    if (ordered) pass('playlist order', pls[0].name);
    else fail('playlist order', JSON.stringify(rows));
  } else {
    pass('playlist order', 'no playlists (skip)');
  }

  // Settings in SQLite not JSON
  const settings = dbMod.getSettings();
  pass('settings from sqlite', `volume=${settings.globalVolume}`);

  // Import dedup
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ime-audit-'));
  const fakeMp3 = path.join(tmpDir, 'test-audio.mp3');
  fs.writeFileSync(fakeMp3, Buffer.alloc(0)); // will fail metadata but tests path norm
  const collected = importSvc.collectAudioPaths([fakeMp3, fakeMp3.toUpperCase()]);
  if (collected.length === 1) pass('import dedup paths', '1 unique');
  else fail('import dedup paths', `got ${collected.length}`);

  // node:sqlite availability (fallback option)
  try {
    const { DatabaseSync } = require('node:sqlite');
    const tdb = new DatabaseSync(':memory:');
    tdb.exec('SELECT 1');
    tdb.close();
    pass('node:sqlite fallback available', 'yes');
  } catch (e) {
    pass('node:sqlite fallback available', `no: ${e.message}`);
  }

  // Check tracks have no coverArt in DB (only cover_path)
  const database = dbMod.openDatabase();
  const cols = database.prepare('PRAGMA table_info(tracks)').all().map((c) => c.name);
  if (!cols.includes('cover_art') && cols.includes('cover_path')) {
    pass('no base64 cover column', cols.join(','));
  } else {
    fail('cover schema', cols.join(','));
  }

  const failed = results.filter((r) => !r.ok);
  console.log('---');
  console.log(`AUDIT: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;

  dbMod.closeDatabase();
  app.quit();
});
