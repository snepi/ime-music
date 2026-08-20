import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { LibraryService } from './library.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const library = new LibraryService();

const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'opus'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#f5f5f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-audio',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

app.whenReady().then(() => {
  protocol.handle('local-audio', (request) => {
    const encoded = request.url.replace('local-audio://', '');
    const filePath = decodeURIComponent(encoded);
    return net.fetch(pathToFileURL(filePath).href);
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('library:get', () => library.getLibrary());

ipcMain.handle('library:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return library.importSongs(result.filePaths);
});

ipcMain.handle('song:update', (_e, id: string, updates: Record<string, unknown>) =>
  library.updateSong(id, updates),
);

ipcMain.handle('song:remove', (_e, id: string) => library.removeSong(id));

ipcMain.handle('playlist:create', (_e, name: string, icon?: string) =>
  library.createPlaylist(name, icon),
);

ipcMain.handle('playlist:update', (_e, id: string, updates: Record<string, unknown>) =>
  library.updatePlaylist(id, updates),
);

ipcMain.handle('playlist:delete', (_e, id: string) => library.deletePlaylist(id));

ipcMain.handle('playlist:add', (_e, playlistId: string, songId: string) =>
  library.addToPlaylist(playlistId, songId),
);

ipcMain.handle('playlist:remove', (_e, playlistId: string, songId: string) =>
  library.removeFromPlaylist(playlistId, songId),
);

ipcMain.handle('settings:update', (_e, updates: Record<string, unknown>) =>
  library.updateSettings(updates),
);

ipcMain.handle('dialog:pickIcon', async () => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    title: 'Choose Icon',
    message: 'Enter an emoji or short text for the icon',
    buttons: ['🎵', '🎶', '🎸', '🎹', '🎧', '📚', '💿', '🌙', 'Cancel'],
    cancelId: 8,
  });
  const icons = ['🎵', '🎶', '🎸', '🎹', '🎧', '📚', '💿', '🌙'];
  if (result.response === 8) return null;
  return icons[result.response] ?? '🎵';
});

ipcMain.handle('dialog:pickImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:browseFFmpeg', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Executable', extensions: ['exe', ''] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
