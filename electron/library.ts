import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { parseFile } from 'music-metadata';
import type { Song, Playlist, AppSettings, LibraryData } from '../shared/types.js';

const DEFAULT_SETTINGS: AppSettings = {
  ffmpegPath: '',
  sortBy: 'title',
  sortOrder: 'asc',
  globalVolume: 0.8,
};

const PLAYLIST_ICONS = ['🎵', '🎶', '🎸', '🎹', '🎧', '📚', '💿', '🌙', '☀️', '🔥'];

function getLibraryPath(): string {
  return path.join(app.getPath('userData'), 'library.json');
}

function loadLibrary(): LibraryData {
  const filePath = getLibraryPath();
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as LibraryData;
      return {
        songs: data.songs ?? [],
        playlists: data.playlists ?? [],
        settings: { ...DEFAULT_SETTINGS, ...data.settings },
      };
    } catch {
      // fall through
    }
  }
  return { songs: [], playlists: [], settings: { ...DEFAULT_SETTINGS } };
}

function saveLibrary(data: LibraryData): void {
  const filePath = getLibraryPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function formatDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds);
}

async function readSongFromFile(filePath: string): Promise<Song | null> {
  try {
    const stat = fs.statSync(filePath);
    const metadata = await parseFile(filePath);
    const title = metadata.common.title ?? path.basename(filePath, path.extname(filePath));
    const artist = metadata.common.artist ?? 'Unknown Artist';
    const album = metadata.common.album ?? 'None';
    const duration = formatDuration(metadata.format.duration ?? 0);

    let coverArt: string | undefined;
    const picture = metadata.common.picture?.[0];
    if (picture) {
      coverArt = `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`;
    }

    return {
      id: uuidv4(),
      filePath,
      title,
      artist,
      album,
      duration,
      liked: false,
      volume: 1,
      icon: '🎵',
      modifiedAt: stat.mtimeMs,
      coverArt,
    };
  } catch {
    return null;
  }
}

export class LibraryService {
  private data: LibraryData;

  constructor() {
    this.data = loadLibrary();
  }

  getLibrary(): LibraryData {
    return structuredClone(this.data);
  }

  async importSongs(filePaths: string[]): Promise<Song[]> {
    const added: Song[] = [];
    const existingPaths = new Set(this.data.songs.map((s) => s.filePath));

    for (const filePath of filePaths) {
      if (existingPaths.has(filePath)) continue;
      const song = await readSongFromFile(filePath);
      if (song) {
        this.data.songs.push(song);
        added.push(song);
        existingPaths.add(filePath);
      }
    }

    if (added.length > 0) saveLibrary(this.data);
    return added;
  }

  updateSong(id: string, updates: Partial<Song>): Song | null {
    const index = this.data.songs.findIndex((s) => s.id === id);
    if (index === -1) return null;
    this.data.songs[index] = { ...this.data.songs[index], ...updates };
    saveLibrary(this.data);
    return structuredClone(this.data.songs[index]);
  }

  removeSong(id: string): boolean {
    const before = this.data.songs.length;
    this.data.songs = this.data.songs.filter((s) => s.id !== id);
    for (const playlist of this.data.playlists) {
      playlist.songIds = playlist.songIds.filter((sid) => sid !== id);
    }
    if (this.data.songs.length !== before) {
      saveLibrary(this.data);
      return true;
    }
    return false;
  }

  createPlaylist(name: string, icon?: string): Playlist {
    const playlist: Playlist = {
      id: uuidv4(),
      name,
      icon: icon ?? PLAYLIST_ICONS[Math.floor(Math.random() * PLAYLIST_ICONS.length)],
      songIds: [],
      createdAt: Date.now(),
    };
    this.data.playlists.push(playlist);
    saveLibrary(this.data);
    return structuredClone(playlist);
  }

  updatePlaylist(id: string, updates: Partial<Playlist>): Playlist | null {
    const index = this.data.playlists.findIndex((p) => p.id === id);
    if (index === -1) return null;
    this.data.playlists[index] = { ...this.data.playlists[index], ...updates };
    saveLibrary(this.data);
    return structuredClone(this.data.playlists[index]);
  }

  deletePlaylist(id: string): boolean {
    const before = this.data.playlists.length;
    this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
    if (this.data.playlists.length !== before) {
      saveLibrary(this.data);
      return true;
    }
    return false;
  }

  addToPlaylist(playlistId: string, songId: string): boolean {
    const playlist = this.data.playlists.find((p) => p.id === playlistId);
    if (!playlist || playlist.songIds.includes(songId)) return false;
    playlist.songIds.push(songId);
    saveLibrary(this.data);
    return true;
  }

  removeFromPlaylist(playlistId: string, songId: string): boolean {
    const playlist = this.data.playlists.find((p) => p.id === playlistId);
    if (!playlist) return false;
    const before = playlist.songIds.length;
    playlist.songIds = playlist.songIds.filter((id) => id !== songId);
    if (playlist.songIds.length !== before) {
      saveLibrary(this.data);
      return true;
    }
    return false;
  }

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    saveLibrary(this.data);
    return structuredClone(this.data.settings);
  }
}
