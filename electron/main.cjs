const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const { randomUUID } = require('crypto');
const { logError } = require('./libraryStore.cjs');
const db = require('./database.cjs');
const { runImport } = require('./importService.cjs');
const metadataService = require('./metadataService.cjs');
const youtubeImportService = require('./youtubeImportService.cjs');
const themeService = require('./themeService.cjs');
const appearanceMod = require('./appearance.cjs');
const recommendationService = require('./recommendationService.cjs');
const homeMixService = require('./homeMixService.cjs');
const autoPlaylistService = require('./autoPlaylistService.cjs');
const metaSyncService = require('./metaSyncService.cjs');
const metaEnrichService = require('./metaEnrichService.cjs');
const libraryRepairService = require('./libraryRepairService.cjs');
const artistService = require('./artistService.cjs');
const wavesService = require('./wavesService.cjs');
const scrobbleService = require('./scrobbleService.cjs');
const { createSyncServer } = require('./syncServer.cjs');
const QRCode = require('qrcode');

// Keep userData at "%APPDATA%/IMe Music" (existing library.json location)
app.setName('IMe Music');

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'aiff', 'aif', 'wma', 'webm'];
const PLAYLIST_ICONS = ['♪', '♫', '♬', '🎧', '💿', '📚', '🌙', '☀'];

let mainWindow = null;
let miniWindow = null;
let tray = null;
let isQuitting = false;
let dbReady = false;
let dbErrorMessage = null;
let importRunning = false;
let importAbortController = null;
let currentImportKind = 'files';
let metaSyncRunning = false;
let metaEnrichRunning = false;
let libraryRepairRunning = false;
let lastNowPlaying = null;
let syncServer = null;

function getSyncServer() {
  if (!syncServer) {
    syncServer = createSyncServer({
      getTracks: () => (dbReady ? db.getAllTracks() : []),
      getTrackById: (id) => (dbReady ? db.getTrackById(id) : null),
      onEvent: (evt) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync:event', evt);
        }
      },
    });
  }
  return syncServer;
}

async function buildSyncSessionPayload(status) {
  if (!status?.active) return { ok: false, active: false };
  const qrDataUrl = await QRCode.toDataURL(status.joinUrl, {
    margin: 1,
    width: 280,
    color: { dark: '#111111', light: '#ffffff' },
  });
  return { ok: true, ...status, qrDataUrl };
}

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'public', 'brand', 'icon.ico'),
    path.join(__dirname, '..', 'public', 'brand', 'icon.png'),
    path.join(__dirname, '..', 'dist', 'brand', 'icon.png'),
  ];
  const fs = require('fs');
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

function applyWindowIcon(win) {
  if (!win) return;
  const iconPath = resolveAppIcon();
  if (!iconPath) return;
  try {
    win.setIcon(iconPath);
  } catch (err) {
    logError('startup', 'Failed to set window icon', err);
  }
}

function sendPlaybackCommand(cmd) {
  if (cmd === 'show') {
    showMainWindow();
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('playback:command', cmd);
}

function loadRenderer(win, hash) {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const base = devUrl.replace(/\/$/, '');
    win.loadURL(hash ? `${base}/${hash}` : base);
  } else {
    const file = path.join(__dirname, '..', 'dist', 'index.html');
    if (hash) win.loadFile(file, { hash: hash.replace(/^#/, '') });
    else win.loadFile(file);
  }
}

function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    miniWindow.focus();
    return miniWindow;
  }

  const icon = resolveAppIcon();
  miniWindow = new BrowserWindow({
    width: 360,
    height: 140,
    minWidth: 300,
    minHeight: 120,
    maxWidth: 480,
    maxHeight: 200,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    backgroundColor: '#111315',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
    show: false,
  });

  applyWindowIcon(miniWindow);
  loadRenderer(miniWindow, '#mini');

  miniWindow.once('ready-to-show', () => {
    miniWindow?.show();
    if (lastNowPlaying) {
      miniWindow?.webContents.send('nowplaying:state', lastNowPlaying);
    }
  });

  miniWindow.on('closed', () => {
    miniWindow = null;
  });

  return miniWindow;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const iconPath = resolveAppIcon();
  let image = null;
  if (iconPath) {
    try {
      image = nativeImage.createFromPath(iconPath);
      if (process.platform === 'win32' && !image.isEmpty()) {
        image = image.resize({ width: 16, height: 16 });
      }
    } catch (err) {
      logError('tray', 'Failed to load tray icon', err);
    }
  }
  tray = new Tray(image && !image.isEmpty() ? image : nativeImage.createEmpty());
  tray.setToolTip('IMe Music');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Показать',
      click: () => {
        showMainWindow();
        sendPlaybackCommand('show');
      },
    },
    { type: 'separator' },
    { label: 'Play / Pause', click: () => sendPlaybackCommand('playPause') },
    { label: 'Следующий', click: () => sendPlaybackCommand('next') },
    { label: 'Предыдущий', click: () => sendPlaybackCommand('previous') },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => showMainWindow());
  tray.on('click', () => {
    if (process.platform === 'win32') showMainWindow();
  });
}

function registerGlobalHotkeys() {
  const bindings = [
    ['MediaPlayPause', 'playPause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'previous'],
  ];
  for (const [accel, cmd] of bindings) {
    try {
      const ok = globalShortcut.register(accel, () => sendPlaybackCommand(cmd));
      if (!ok) logError('hotkeys', `Failed to register ${accel}`);
    } catch (err) {
      logError('hotkeys', `Error registering ${accel}`, err);
    }
  }
}

function createWindow() {
  const icon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#111315',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
    show: false,
  });

  applyWindowIcon(mainWindow);

  loadRenderer(mainWindow);

  mainWindow.once('ready-to-show', () => {
    applyWindowIcon(mainWindow);
    mainWindow?.show();
    if (dbErrorMessage) {
      dialog.showErrorBox('IMe Music — ошибка базы данных', dbErrorMessage);
    }
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    let closeToTray = true;
    try {
      if (dbReady) {
        const settings = db.getSettings();
        closeToTray = settings?.playback?.closeToTray !== false;
      }
    } catch {
      /* keep default */
    }
    if (closeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function wrapIpc(channel, handler) {
  const NO_DB_REQUIRED = new Set(['log:error', 'fs:exists', 'mini:open', 'mini:close', 'mini:toggle']);
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!dbReady && !NO_DB_REQUIRED.has(channel)) {
        throw new Error(dbErrorMessage || 'База данных недоступна');
      }
      return await handler(event, ...args);
    } catch (err) {
      logError('ipc', `Handler failed: ${channel}`, err);
      throw err;
    }
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.ime.music');
  }
  const appIcon = resolveAppIcon();
  if (appIcon && process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(appIcon);
    } catch {
      /* ignore */
    }
  }
  try {
    db.openDatabase();
    const migration = db.migrateFromJsonIfNeeded();
    logError('startup', 'SQLite ready', {
      dbPath: db.getDbPath(),
      migration,
      tracks: db.getAllTracks().length,
    });
    dbReady = true;
  } catch (err) {
    dbReady = false;
    const check = err?.sqliteCheck;
    dbErrorMessage = check
      ? `${err.message}\n\nАльтернативы (не активированы): node:sqlite=${check.alternatives?.nodeSqliteAvailable ? 'доступен' : 'нет'}; sql.js=${check.alternatives?.sqlJs || ''}`
      : err?.message ||
        'Не удалось открыть базу данных SQLite. Файл library.json сохранён и не удалён.';
    logError('startup', 'SQLite init failed', { err, check });
  }

  createWindow();
  createTray();
  registerGlobalHotkeys();
});

app.on('before-quit', () => {
  isQuitting = true;
  try {
    getSyncServer().stop();
  } catch {
    /* ignore */
  }
  try {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
  } catch {
    /* ignore */
  }
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* ignore */
  }
  try {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  } catch {
    /* ignore */
  }
  try {
    db.closeDatabase();
  } catch (err) {
    logError('database', 'close on quit failed', err);
  }
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* ignore */
  }
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  isQuitting = true;
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showMainWindow();
});

wrapIpc('library:get', () => {
  if (!dbReady) {
    return { songs: [], playlists: [], settings: { ffmpegPath: '', sortBy: 'title', sortOrder: 'asc', globalVolume: 0.8 }, dbError: dbErrorMessage };
  }
  try {
    autoPlaylistService.rebuildAutoPlaylists(db);
  } catch (err) {
    logError('autoPlaylist', 'rebuild on library:get failed', err);
  }
  return db.getLibrary();
});

wrapIpc('library:import', async () => {
  // Backward-compatible: import files only
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import songs',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return startImportJob(result.filePaths);
});

wrapIpc('library:importFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import songs',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { started: false };
  }
  // Fire-and-progress; return immediately after starting
  void startImportJob(result.filePaths);
  return { started: true };
});

wrapIpc('library:importFolders', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import folders',
    properties: ['openDirectory', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { started: false };
  }
  void startImportJob(result.filePaths);
  return { started: true };
});

wrapIpc('library:importUrl', async (_e, url) => {
  const validation = youtubeImportService.validateYouTubeUrl(url);
  if (!validation.ok) {
    return { started: false, error: validation.message };
  }
  if (importRunning) {
    return { started: false, error: 'Импорт уже выполняется. Дождитесь завершения.' };
  }
  void startUrlImportJob(url);
  return { started: true };
});

wrapIpc('library:importSearch', async (_e, payload) => {
  const title = String(payload?.title || '').trim();
  const artist = String(payload?.artist || '').trim();
  const validation = youtubeImportService.validateSearchImport(title, artist);
  if (!validation.ok) {
    return { started: false, error: validation.message };
  }
  if (importRunning) {
    return { started: false, error: 'Импорт уже выполняется. Дождитесь завершения.' };
  }
  void startSearchImportJob(payload);
  return { started: true };
});

wrapIpc('library:importWishlist', async (_e, items) => {
  const list = Array.isArray(items)
    ? items.filter((item) => String(item?.title || '').trim() || String(item?.artist || '').trim())
    : [];
  if (list.length === 0) {
    return { started: false, error: 'Список «Хочу послушать» пуст' };
  }
  if (importRunning) {
    return { started: false, error: 'Импорт уже выполняется. Дождитесь завершения.' };
  }
  void startWishlistImportJob(list);
  return { started: true };
});

wrapIpc('library:importCancel', async () => {
  if (!importRunning || !importAbortController) {
    return { cancelled: false };
  }
  importAbortController.abort();
  return { cancelled: true };
});

function sendImportProgress(progress) {
  mainWindow?.webContents.send('import:progress', {
    ...progress,
    kind: currentImportKind,
  });
}

async function runManagedImport(kind, job) {
  if (importRunning) return;
  importRunning = true;
  currentImportKind = kind;
  const controller = new AbortController();
  importAbortController = controller;
  try {
    await job(controller.signal);
  } finally {
    importRunning = false;
    importAbortController = null;
  }
}

async function startImportJob(paths) {
  if (importRunning) {
    logError('import', 'Import already running');
    return [];
  }
  let summary = [];
  await runManagedImport('files', async (signal) => {
    summary = await runImport(paths, {
      onProgress: sendImportProgress,
      signal,
    });
    if (signal.aborted) {
      sendImportProgress({
        total: summary.total ?? 0,
        processed: summary.processed ?? 0,
        added: summary.added ?? 0,
        skipped: summary.skipped ?? 0,
        failed: summary.failed ?? 0,
        errors: summary.errors ?? [],
        done: true,
        cancelled: true,
        statusMessage: 'Отменено',
      });
    }
  });
  return summary.addedSongs || [];
}

async function startUrlImportJob(url) {
  await runManagedImport('url', async (signal) => {
    await youtubeImportService.runUrlImport(url, {
      onProgress: sendImportProgress,
      signal,
    });
  });
}

async function startSearchImportJob(payload) {
  await runManagedImport('search', async (signal) => {
    await youtubeImportService.runSearchImport(payload, {
      onProgress: sendImportProgress,
      signal,
    });
  });
}

async function startWishlistImportJob(items) {
  await runManagedImport('wishlist', async (signal) => {
    await youtubeImportService.runWishlistImport(items, {
      onProgress: sendImportProgress,
      signal,
    });
  });
}

wrapIpc('song:update', (_e, id, updates) => db.updateTrack(id, updates));

wrapIpc('song:remove', (_e, id) => db.deleteTrack(id));

wrapIpc('playlist:create', (_e, name, icon) => {
  return db.createPlaylist({
    id: randomUUID(),
    name,
    icon: icon || PLAYLIST_ICONS[Math.floor(Math.random() * PLAYLIST_ICONS.length)],
  });
});

wrapIpc('playlist:update', (_e, id, updates) => db.updatePlaylist(id, updates));

wrapIpc('playlist:delete', (_e, id) => db.deletePlaylist(id));

wrapIpc('playlist:add', (_e, playlistId, songId) => db.addToPlaylist(playlistId, songId));

wrapIpc('playlist:remove', (_e, playlistId, songId) => db.removeFromPlaylist(playlistId, songId));

wrapIpc('settings:update', (_e, updates) => db.updateSettings(updates));

wrapIpc('queue:get', () => db.getPlaybackQueueWithSongs());
wrapIpc('queue:add', (_e, trackId) => db.addQueueEnd(trackId));
wrapIpc('queue:addNext', (_e, trackId) => db.addQueueNext(trackId));
wrapIpc('queue:remove', (_e, queueRowId) => db.removeQueueItem(queueRowId));
wrapIpc('queue:clear', () => {
  db.clearPlaybackQueue();
});
wrapIpc('queue:reorder', (_e, orderedIds) => db.reorderPlaybackQueue(orderedIds));
wrapIpc('queue:takeHead', () => db.takeQueueHeadTrackId());

wrapIpc('discovery:search', async (_e, query) => artistService.searchDiscovery(query));

wrapIpc('artist:profile', async (_e, nameOrId) => artistService.getArtistProfile(nameOrId));
wrapIpc('artist:releaseProfile', async (_e, payload) => artistService.getArtistReleaseProfile(payload));

wrapIpc('recommendations:get', (_e, opts = {}) => {
  const songs = db.getAllTracks();
  const settings = db.getSettings();
  const discovery = settings.discovery || {
    filterMode: 'all',
    blockedArtists: [],
    blockedTracks: [],
    wishlist: [],
  };
  const mode =
    opts?.mode === 'liked' ||
    opts?.mode === 'current' ||
    opts?.mode === 'all' ||
    opts?.mode === 'wishlist' ||
    opts?.mode === 'chart'
      ? opts.mode
      : discovery.filterMode || 'all';
  return recommendationService.buildRecommendations({
    songs,
    force: Boolean(opts?.force),
    mode,
    currentArtist: opts?.currentArtist || null,
    wishlist: discovery.wishlist || [],
    blockedArtists: discovery.blockedArtists || [],
    blockedTracks: discovery.blockedTracks || [],
    chartCountry: discovery.chartCountry || 'ru',
  });
});

wrapIpc('waves:get', async (_e, opts = {}) => {
  const songs = db.getAllTracks();
  const settings = db.getSettings();
  const discovery = settings.discovery || {};
  const waves = { ...(discovery.waves || {}), ...(opts?.waves || {}) };
  try {
    return await wavesService.buildWavesPool({
      songs,
      wishlist: discovery.wishlist || [],
      blockedArtists: discovery.blockedArtists || [],
      blockedTracks: discovery.blockedTracks || [],
      chartCountry: discovery.chartCountry || 'ru',
      waves,
      force: Boolean(opts?.force),
    });
  } catch (err) {
    logError('waves', 'build failed', err);
    return { ok: false, items: [], error: String(err?.message || err) };
  }
});

wrapIpc('history:record', (_e, trackId) => {
  const song = db.recordListen(trackId);
  try {
    autoPlaylistService.rebuildAutoPlaylists(db);
  } catch (err) {
    logError('autoPlaylist', 'rebuild after listen failed', err);
  }
  return song;
});
wrapIpc('history:get', (_e, limit) => db.getListenHistory(limit));

wrapIpc('home:feed', () => homeMixService.buildHomeFeed(db));
wrapIpc('mix:library', (_e, opts = {}) =>
  homeMixService.buildLibraryMix(db, { size: Math.min(80, Math.max(10, Number(opts?.size) || 40)) }),
);
wrapIpc('playlists:rebuildAuto', () => autoPlaylistService.rebuildAutoPlaylists(db));

wrapIpc('meta:resyncStart', async () => {
  if (metaSyncRunning || metaEnrichRunning || libraryRepairRunning) return { started: false };
  metaSyncRunning = true;
  void (async () => {
    try {
      await metaSyncService.resyncLibraryMetadata(db, {
        onProgress: (progress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('meta:resyncProgress', progress);
          }
        },
      });
    } catch (err) {
      logError('metaSync', 'resync failed', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('meta:resyncProgress', {
          total: 0,
          processed: 0,
          updated: 0,
          skipped: 0,
          failed: 1,
          errors: [{ filePath: '', message: String(err?.message || err) }],
          done: true,
        });
      }
    } finally {
      metaSyncRunning = false;
    }
  })();
  return { started: true };
});

wrapIpc('meta:enrichStart', async () => {
  if (metaEnrichRunning || metaSyncRunning || libraryRepairRunning) return { started: false };
  metaEnrichRunning = true;
  const settings = db.getSettings();
  void (async () => {
    try {
      await metaEnrichService.enrichLibraryMetadata(db, {
        settings,
        onProgress: (progress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('meta:enrichProgress', progress);
          }
        },
      });
    } catch (err) {
      logError('metaEnrich', 'enrich failed', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('meta:enrichProgress', {
          total: 0,
          processed: 0,
          updated: 0,
          skipped: 0,
          failed: 1,
          errors: [{ filePath: '', message: String(err?.message || err) }],
          done: true,
        });
      }
    } finally {
      metaEnrichRunning = false;
    }
  })();
  return { started: true };
});

wrapIpc('library:findDuplicates', () => {
  const groups = libraryRepairService.findDuplicateGroups(db.getAllTracks());
  return {
    ok: true,
    totalGroups: groups.length,
    duplicateTracks: groups.reduce((sum, g) => sum + Math.max(0, g.tracks.length - 1), 0),
    groups: groups.slice(0, 50).map((g) => ({
      key: g.key,
      count: g.tracks.length,
      keepId: g.tracks[0]?.id,
      keepTitle: g.tracks[0]?.title,
      keepArtist: g.tracks[0]?.artist,
    })),
  };
});

wrapIpc('library:repairDuplicates', async () => {
  if (libraryRepairRunning || metaEnrichRunning || metaSyncRunning) return { started: false };
  libraryRepairRunning = true;
  void (async () => {
    try {
      libraryRepairService.repairLibraryDuplicates(db, {
        onProgress: (progress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('library:repairProgress', progress);
          }
        },
      });
    } catch (err) {
      logError('libraryRepair', 'repair failed', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('library:repairProgress', {
          totalGroups: 0,
          processed: 0,
          merged: 0,
          removed: 0,
          updated: 0,
          skipped: 0,
          failed: 1,
          errors: [{ filePath: '', message: String(err?.message || err) }],
          groups: [],
          done: true,
        });
      }
    } finally {
      libraryRepairRunning = false;
    }
  })();
  return { started: true };
});

wrapIpc('scrobble:track', async (_e, trackId) => {
  const song = db.getTrackById(trackId);
  if (!song) return { ok: false, error: 'Трек не найден' };
  const settings = db.getSettings();
  return scrobbleService.scrobbleSong(settings, song);
});

wrapIpc('log:error', (_e, category, message, detail) => {
  logError(category || 'renderer', message || 'Unknown', detail);
});

wrapIpc('fs:exists', (_e, filePath) => {
  try {
    const fs = require('fs');
    return Boolean(filePath && fs.existsSync(filePath));
  } catch (err) {
    logError('fs', 'exists check failed', { filePath, err });
    return false;
  }
});

wrapIpc('fs:showInFolder', (_e, filePath) => {
  if (filePath) shell.showItemInFolder(path.normalize(filePath));
});

wrapIpc('shell:openExternal', async (_e, url) => {
  if (typeof url !== 'string' || !url.trim()) return { ok: false, error: 'Пустой URL' };
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: 'Разрешены только http/https ссылки' };
  }
  try {
    await shell.openExternal(trimmed);
    return { ok: true };
  } catch (err) {
    logError('shell', 'openExternal failed', { url: trimmed, err });
    return { ok: false, error: String(err?.message || err) };
  }
});

wrapIpc('song:relocate', async (_e, trackId) => {
  const track = db.getTrackById(trackId);
  if (!track) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Найти файл трека',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return db.updateTrack(trackId, { filePath: result.filePaths[0], dateModified: Date.now() });
});

wrapIpc('metadata:get', (_e, trackId) => metadataService.getTrackDetails(trackId));

wrapIpc('metadata:save', (_e, trackId, payload) => metadataService.saveTrackMetadata(trackId, payload || {}));

wrapIpc('dialog:pickCover', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выбрать обложку',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

wrapIpc('dialog:pickIcon', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Choose Icon',
    message: 'Pick an icon',
    buttons: ['♪', '♫', '♬', '🎧', '💿', '📚', '🌙', '☀', 'Cancel'],
    cancelId: 8,
  });
  const icons = ['♪', '♫', '♬', '🎧', '💿', '📚', '🌙', '☀'];
  if (result.response === 8) return null;
  return icons[result.response] || '♪';
});

wrapIpc('dialog:pickImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

wrapIpc('dialog:browseFFmpeg', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Executable', extensions: ['exe'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

wrapIpc('dialog:browseYtDlp', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выбрать yt-dlp',
    properties: ['openFile'],
    filters: [{ name: 'Executable', extensions: ['exe'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

wrapIpc('dialog:exportUiPreset', async (_e, payload) => {
  const fs = require('fs');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Экспорт пресета',
    defaultPath: `${(payload?.name || 'preset').replace(/[<>:"/\\|?*]/g, '_')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, error: 'Отменено' };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    logError('preset', 'export failed', err);
    return { ok: false, error: err?.message || 'Не удалось сохранить файл' };
  }
});

wrapIpc('dialog:importUiPreset', async () => {
  const fs = require('fs');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Импорт пресета',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Отменено' };
  try {
    const text = fs.readFileSync(result.filePaths[0], 'utf8');
    const data = JSON.parse(text);
    return { ok: true, data };
  } catch (err) {
    logError('preset', 'import failed', err);
    return { ok: false, error: 'Не удалось прочитать JSON' };
  }
});

wrapIpc('themes:get', () => {
  const settings = db.getSettings();
  return {
    activeThemeId: settings.activeThemeId || 'default',
    themes: settings.uiThemes || [],
    wallpapers: themeService.enrichWallpaperMeta(settings.wallpapers || []),
  };
});

wrapIpc('themes:create', (_e, payload) => {
  const settings = db.getSettings();
  const now = Date.now();
  const theme = {
    id: randomUUID(),
    name: String(payload?.name || 'Новая тема').slice(0, 80),
    description: String(payload?.description || '').slice(0, 240),
    builtin: false,
    createdAt: now,
    updatedAt: now,
    thumbnailId: null,
    appearance: appearanceMod.normalizeAppearance(
      payload?.appearance || settings.appearance || appearanceMod.DEFAULT_APPEARANCE,
    ),
  };
  const uiThemes = [...(settings.uiThemes || []), theme];
  const next = db.updateSettings({ uiThemes, activeThemeId: theme.id, appearance: theme.appearance });
  return { ok: true, theme, settings: next };
});

wrapIpc('themes:update', (_e, payload) => {
  const settings = db.getSettings();
  const id = payload?.id;
  if (!id) return { ok: false, error: 'Нет id' };
  const uiThemes = (settings.uiThemes || []).map((t) => {
    if (t.id !== id) return t;
    return {
      ...t,
      name: payload.name != null ? String(payload.name).slice(0, 80) : t.name,
      description:
        payload.description != null ? String(payload.description).slice(0, 240) : t.description,
      updatedAt: Date.now(),
      appearance:
        payload.appearance != null
          ? appearanceMod.normalizeAppearance(payload.appearance)
          : t.appearance,
    };
  });
  if (!(settings.uiThemes || []).some((t) => t.id === id)) {
    return { ok: false, error: 'Тема не найдена' };
  }
  const patch = { uiThemes };
  if (payload.apply) {
    const theme = uiThemes.find((t) => t.id === id);
    if (theme) {
      patch.activeThemeId = id;
      patch.appearance = theme.appearance;
    }
  }
  const next = db.updateSettings(patch);
  return { ok: true, settings: next };
});

wrapIpc('themes:delete', (_e, id) => {
  if (typeof id !== 'string') return { ok: false, error: 'Нет id' };
  if (id === 'default' || !id.startsWith('user-') && ['graphite', 'midnight', 'ocean', 'forest', 'rose', 'amber', 'violet', 'high-contrast'].includes(id)) {
    // builtin ids from presets — never delete from uiThemes anyway
  }
  const settings = db.getSettings();
  const existing = (settings.uiThemes || []).find((t) => t.id === id);
  if (!existing) return { ok: false, error: 'Нельзя удалить встроенную или отсутствующую тему' };
  const uiThemes = (settings.uiThemes || []).filter((t) => t.id !== id);
  const patch = { uiThemes };
  if (settings.activeThemeId === id) {
    patch.activeThemeId = 'default';
    patch.appearance = appearanceMod.DEFAULT_APPEARANCE;
  }
  const next = db.updateSettings(patch);
  return { ok: true, settings: next };
});

wrapIpc('themes:apply', (_e, id) => {
  const settings = db.getSettings();
  if (typeof id !== 'string') return { ok: false, error: 'Нет id' };
  const user = (settings.uiThemes || []).find((t) => t.id === id);
  if (user) {
    const next = db.updateSettings({ activeThemeId: id, appearance: user.appearance });
    return { ok: true, settings: next };
  }
  // Builtin apply: renderer sends appearance with applyThemeBuiltin
  return { ok: false, error: 'Для встроенной темы передайте appearance через settings:update' };
});

wrapIpc('themes:reset', (_e, id) => {
  const settings = db.getSettings();
  if (id && typeof id === 'string') {
    const uiThemes = (settings.uiThemes || []).map((t) =>
      t.id === id
        ? {
            ...t,
            appearance: appearanceMod.DEFAULT_APPEARANCE,
            updatedAt: Date.now(),
          }
        : t,
    );
    const patch = { uiThemes };
    if (settings.activeThemeId === id) patch.appearance = appearanceMod.DEFAULT_APPEARANCE;
    return { ok: true, settings: db.updateSettings(patch) };
  }
  return {
    ok: true,
    settings: db.updateSettings({
      appearance: appearanceMod.DEFAULT_APPEARANCE,
      activeThemeId: 'default',
    }),
  };
});

wrapIpc('themes:export', async (_e, payload) => {
  const fs = require('fs');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Экспорт темы',
    defaultPath: `${(payload?.name || 'theme').replace(/[<>:"/\\|?*]/g, '_')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, error: 'Отменено' };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err?.message || 'Ошибка записи' };
  }
});

wrapIpc('themes:import', async () => {
  const fs = require('fs');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Импорт темы',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Отменено' };
  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Не удалось прочитать JSON' };
  }
});

wrapIpc('wallpaper:list', () => {
  const settings = db.getSettings();
  return themeService.enrichWallpaperMeta(settings.wallpapers || []);
});

wrapIpc('wallpaper:choose', async () => {
  const settings = db.getSettings();
  const result = await themeService.chooseAndSaveWallpaper(mainWindow, settings.wallpapers || []);
  if (!result.ok) return result;
  const next = db.updateSettings({ wallpapers: result.wallpapers.map(({ filePath, previewPath, ...rest }) => rest) });
  return {
    ok: true,
    asset: result.asset,
    wallpapers: themeService.enrichWallpaperMeta(next.wallpapers || []),
  };
});

wrapIpc('wallpaper:delete', (_e, id) => {
  const settings = db.getSettings();
  const result = themeService.deleteWallpaper(id, settings.wallpapers || []);
  if (!result.ok) return result;
  let appearance = settings.appearance;
  if (appearance?.wallpaper?.activeId === id) {
    appearance = {
      ...appearance,
      wallpaper: { ...appearance.wallpaper, activeId: null, mode: 'none' },
    };
  }
  const next = db.updateSettings({
    wallpapers: result.wallpapers.map(({ filePath, previewPath, ...rest }) => rest),
    appearance,
  });
  return {
    ok: true,
    wallpapers: themeService.enrichWallpaperMeta(next.wallpapers || []),
    settings: next,
  };
});

wrapIpc('wallpaper:analyze', (_e, imagePath) => themeService.analyzeImagePalette(imagePath));

wrapIpc('theme:analyzeCover', (_e, imagePath) => themeService.analyzeImagePalette(imagePath));

wrapIpc('mini:open', () => {
  createMiniWindow();
  return { ok: true };
});

wrapIpc('mini:close', () => {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
  return { ok: true };
});

wrapIpc('mini:toggle', () => {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close();
    return { ok: true, open: false };
  }
  createMiniWindow();
  return { ok: true, open: true };
});

wrapIpc('sync:start', async () => {
  const status = await getSyncServer().start();
  return buildSyncSessionPayload(status);
});

wrapIpc('sync:stop', () => getSyncServer().stop());

wrapIpc('sync:status', async () => {
  const status = getSyncServer().status();
  if (!status.active) return { ok: true, active: false };
  return buildSyncSessionPayload(status);
});

ipcMain.on('nowplaying:update', (_e, payload) => {
  lastNowPlaying = payload || null;
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send('nowplaying:state', lastNowPlaying);
  }
});

ipcMain.on('playback:command-relay', (_e, cmd) => {
  sendPlaybackCommand(cmd);
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
