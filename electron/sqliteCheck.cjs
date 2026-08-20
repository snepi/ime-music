/**
 * Validates better-sqlite3 can load in the current Electron runtime.
 * Returns { ok, version, error, hint, alternatives }
 */
function checkBetterSqlite3() {
  const version = (() => {
    try {
      return require('better-sqlite3/package.json').version;
    } catch {
      return 'unknown';
    }
  })();

  try {
    const Database = require('better-sqlite3');
    const probe = new Database(':memory:');
    probe.pragma('journal_mode = WAL');
    probe.close();
    return { ok: true, version, engine: 'better-sqlite3' };
  } catch (err) {
    const message = err?.message || String(err);
    let nodeSqlite = false;
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(':memory:');
      db.close();
      nodeSqlite = true;
    } catch {
      // ignore
    }

    const hint = message.includes('NODE_MODULE_VERSION') || message.includes('was compiled against')
      ? 'Запустите: npx electron-rebuild -f -w better-sqlite3 (нужны Visual Studio Build Tools на Windows).'
      : 'Проверьте установку better-sqlite3: npm install better-sqlite3 && npx electron-rebuild -f -w better-sqlite3';

    return {
      ok: false,
      version,
      error: message,
      hint,
      alternatives: {
        nodeSqliteAvailable: nodeSqlite,
        sqlJs: 'npm install sql.js — pure WASM, без native rebuild, но медленнее',
        note: 'Текущая сборка использует better-sqlite3. Не переключать без подтверждения пользователя.',
      },
    };
  }
}

module.exports = { checkBetterSqlite3 };
