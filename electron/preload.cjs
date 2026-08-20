const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  importSongs: () => ipcRenderer.invoke('library:import'),
  importFiles: () => ipcRenderer.invoke('library:importFiles'),
  importFolders: () => ipcRenderer.invoke('library:importFolders'),
  importUrl: (url) => ipcRenderer.invoke('library:importUrl', url),
  importSearch: (payload) => ipcRenderer.invoke('library:importSearch', payload),
  importWishlist: (items) => ipcRenderer.invoke('library:importWishlist', items),
  cancelImport: () => ipcRenderer.invoke('library:importCancel'),
  onImportProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('import:progress', listener);
    return () => ipcRenderer.removeListener('import:progress', listener);
  },
  updateSong: (id, updates) => ipcRenderer.invoke('song:update', id, updates),
  removeSong: (id) => ipcRenderer.invoke('song:remove', id),
  createPlaylist: (name, icon) => ipcRenderer.invoke('playlist:create', name, icon),
  updatePlaylist: (id, updates) => ipcRenderer.invoke('playlist:update', id, updates),
  deletePlaylist: (id) => ipcRenderer.invoke('playlist:delete', id),
  addToPlaylist: (playlistId, songId) => ipcRenderer.invoke('playlist:add', playlistId, songId),
  removeFromPlaylist: (playlistId, songId) =>
    ipcRenderer.invoke('playlist:remove', playlistId, songId),
  updateSettings: (updates) => ipcRenderer.invoke('settings:update', updates),
  pickIcon: () => ipcRenderer.invoke('dialog:pickIcon'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  browseFFmpeg: () => ipcRenderer.invoke('dialog:browseFFmpeg'),
  browseYtDlp: () => ipcRenderer.invoke('dialog:browseYtDlp'),
  exportUiPreset: (payload) => ipcRenderer.invoke('dialog:exportUiPreset', payload),
  importUiPreset: () => ipcRenderer.invoke('dialog:importUiPreset'),
  getThemes: () => ipcRenderer.invoke('themes:get'),
  createTheme: (payload) => ipcRenderer.invoke('themes:create', payload),
  updateTheme: (payload) => ipcRenderer.invoke('themes:update', payload),
  deleteTheme: (id) => ipcRenderer.invoke('themes:delete', id),
  applyTheme: (id) => ipcRenderer.invoke('themes:apply', id),
  resetTheme: (id) => ipcRenderer.invoke('themes:reset', id),
  exportTheme: (payload) => ipcRenderer.invoke('themes:export', payload),
  importTheme: () => ipcRenderer.invoke('themes:import'),
  listWallpapers: () => ipcRenderer.invoke('wallpaper:list'),
  chooseWallpaper: () => ipcRenderer.invoke('wallpaper:choose'),
  deleteWallpaper: (id) => ipcRenderer.invoke('wallpaper:delete', id),
  analyzeImagePalette: (imagePath) => ipcRenderer.invoke('wallpaper:analyze', imagePath),
  logError: (category, message, detail) =>
    ipcRenderer.invoke('log:error', category, message, detail),
  checkFileExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('fs:showInFolder', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  relocateSongFile: (trackId) => ipcRenderer.invoke('song:relocate', trackId),
  getTrackDetails: (trackId) => ipcRenderer.invoke('metadata:get', trackId),
  saveTrackMetadata: (trackId, payload) => ipcRenderer.invoke('metadata:save', trackId, payload),
  pickCoverImage: () => ipcRenderer.invoke('dialog:pickCover'),
  getQueue: () => ipcRenderer.invoke('queue:get'),
  addToQueue: (trackId) => ipcRenderer.invoke('queue:add', trackId),
  addToQueueNext: (trackId) => ipcRenderer.invoke('queue:addNext', trackId),
  removeFromQueue: (queueRowId) => ipcRenderer.invoke('queue:remove', queueRowId),
  clearQueue: () => ipcRenderer.invoke('queue:clear'),
  reorderQueue: (orderedQueueRowIds) => ipcRenderer.invoke('queue:reorder', orderedQueueRowIds),
  takeQueueHead: () => ipcRenderer.invoke('queue:takeHead'),
  getRecommendations: (opts) => ipcRenderer.invoke('recommendations:get', opts || {}),
  getWavesPool: (opts) => ipcRenderer.invoke('waves:get', opts || {}),
  searchDiscovery: (query) => ipcRenderer.invoke('discovery:search', query),
  getArtistProfile: (nameOrId) => ipcRenderer.invoke('artist:profile', nameOrId),
  getArtistReleaseProfile: (payload) => ipcRenderer.invoke('artist:releaseProfile', payload),
  recordListen: (trackId) => ipcRenderer.invoke('history:record', trackId),
  getHistory: (limit) => ipcRenderer.invoke('history:get', limit),
  getHomeFeed: () => ipcRenderer.invoke('home:feed'),
  getLibraryMix: (opts) => ipcRenderer.invoke('mix:library', opts || {}),
  rebuildAutoPlaylists: () => ipcRenderer.invoke('playlists:rebuildAuto'),
  startMetaSync: () => ipcRenderer.invoke('meta:resyncStart'),
  startMetaEnrich: () => ipcRenderer.invoke('meta:enrichStart'),
  getAppVersion: () => ipcRenderer.invoke('update:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadAndInstallUpdate: (payload) => ipcRenderer.invoke('update:downloadInstall', payload || {}),
  openReleasePage: (url) => ipcRenderer.invoke('update:openReleasePage', url),
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  findLibraryDuplicates: () => ipcRenderer.invoke('library:findDuplicates'),
  repairLibraryDuplicates: () => ipcRenderer.invoke('library:repairDuplicates'),
  onMetaSyncProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('meta:resyncProgress', listener);
    return () => ipcRenderer.removeListener('meta:resyncProgress', listener);
  },
  onMetaEnrichProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('meta:enrichProgress', listener);
    return () => ipcRenderer.removeListener('meta:enrichProgress', listener);
  },
  onLibraryRepairProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('library:repairProgress', listener);
    return () => ipcRenderer.removeListener('library:repairProgress', listener);
  },
  scrobbleTrack: (trackId) => ipcRenderer.invoke('scrobble:track', trackId),
  openMiniPlayer: () => ipcRenderer.invoke('mini:open'),
  closeMiniPlayer: () => ipcRenderer.invoke('mini:close'),
  toggleMiniPlayer: () => ipcRenderer.invoke('mini:toggle'),
  startPhoneSync: () => ipcRenderer.invoke('sync:start'),
  stopPhoneSync: () => ipcRenderer.invoke('sync:stop'),
  getPhoneSyncStatus: () => ipcRenderer.invoke('sync:status'),
  onPhoneSyncEvent: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sync:event', listener);
    return () => ipcRenderer.removeListener('sync:event', listener);
  },
  pushNowPlaying: (payload) => ipcRenderer.send('nowplaying:update', payload),
  relayPlaybackCommand: (cmd) => ipcRenderer.send('playback:command-relay', cmd),
  onPlaybackCommand: (callback) => {
    const listener = (_event, cmd) => callback(cmd);
    ipcRenderer.on('playback:command', listener);
    return () => ipcRenderer.removeListener('playback:command', listener);
  },
  onNowPlaying: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('nowplaying:state', listener);
    return () => ipcRenderer.removeListener('nowplaying:state', listener);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('imeMusic', api);
