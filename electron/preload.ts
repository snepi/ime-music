import { contextBridge, ipcRenderer } from 'electron';
import type { Song, Playlist, AppSettings, LibraryData } from '../shared/types.js';

const api = {
  getLibrary: (): Promise<LibraryData> => ipcRenderer.invoke('library:get'),
  importSongs: (): Promise<Song[]> => ipcRenderer.invoke('library:import'),
  updateSong: (id: string, updates: Partial<Song>): Promise<Song | null> =>
    ipcRenderer.invoke('song:update', id, updates),
  removeSong: (id: string): Promise<boolean> => ipcRenderer.invoke('song:remove', id),
  createPlaylist: (name: string, icon?: string): Promise<Playlist> =>
    ipcRenderer.invoke('playlist:create', name, icon),
  updatePlaylist: (id: string, updates: Partial<Playlist>): Promise<Playlist | null> =>
    ipcRenderer.invoke('playlist:update', id, updates),
  deletePlaylist: (id: string): Promise<boolean> => ipcRenderer.invoke('playlist:delete', id),
  addToPlaylist: (playlistId: string, songId: string): Promise<boolean> =>
    ipcRenderer.invoke('playlist:add', playlistId, songId),
  removeFromPlaylist: (playlistId: string, songId: string): Promise<boolean> =>
    ipcRenderer.invoke('playlist:remove', playlistId, songId),
  updateSettings: (updates: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', updates),
  pickIcon: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickIcon'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickImage'),
  browseFFmpeg: (): Promise<string | null> => ipcRenderer.invoke('dialog:browseFFmpeg'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('imeMusic', api);
