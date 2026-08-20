export interface Song {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  genre: string | null;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  comment?: string | null;
  composer?: string | null;
  /** User rating 0–5 */
  rating?: number | null;
  duration: number;
  format: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  fileSize: number | null;
  dateAdded: number;
  dateModified: number;
  coverPath: string | null;
  liked: boolean;
  playCount: number;
  lastPlayedAt: number | null;
  /** Per-track volume multiplier 0–1 (UI feature, kept for compatibility) */
  volume: number;
  /** Display icon / emoji (UI feature, kept for compatibility) */
  icon: string;
  /**
   * Legacy inline cover (data URL). Prefer coverPath.
   * Kept so existing libraries keep showing covers until re-import/extract.
   */
  coverArt?: string;
}

export interface QueueItem {
  id: string;
  trackId: string;
  position: number;
  addedAt: number;
  song?: Song;
}

export interface Playlist {
  id: string;
  name: string;
  icon: string;
  songIds: string[];
  createdAt: number;
  description?: string | null;
  coverPath?: string | null;
  updatedAt?: number;
}

export type RepeatMode = 'off' | 'one' | 'all';
export type EqPreset = 'custom' | 'flat' | 'bassBoost' | 'vocal';
export type SleepTimerMode = 'off' | 'minutes' | 'endOfTrack' | 'endOfAlbum';

export interface PlaybackSettings {
  shuffle: boolean;
  repeat: RepeatMode;
  normalizeVolume: boolean;
  eqEnabled: boolean;
  /** Bass gain in dB, typically -12…12 */
  eqBass: number;
  eqMid: number;
  eqTreble: number;
  eqPreset: EqPreset;
  /** Close window hides to tray instead of quitting */
  closeToTray: boolean;
  /** Soft crossfade length in seconds (0 = off) */
  crossfadeSeconds: number;
  /** Start next track slightly before end when crossfade is off */
  gaplessEnabled: boolean;
}


export interface ScrobbleSettings {
  listenBrainzEnabled: boolean;
  listenBrainzToken: string;
  lastFmEnabled: boolean;
  lastFmApiKey: string;
  lastFmApiSecret: string;
  lastFmSessionKey: string;
  lastFmUsername: string;
}

export interface AppSettings {
  ffmpegPath: string;
  /** Path to yt-dlp executable for YouTube import */
  ytdlpPath?: string;
  /** HTTP/SOCKS proxy for yt-dlp, e.g. socks5://127.0.0.1:1080 */
  ytdlpProxy?: string;
  sortBy: 'title' | 'modifiedAt' | 'dateAdded' | 'dateModified';
  sortOrder: 'asc' | 'desc';
  globalVolume: number;
  muted?: boolean;
  /**
   * Legacy top-level theme (kept for compatibility).
   * Prefer appearance.theme.
   */
  theme?: 'dark' | 'light' | 'system';
  /** UI language: ru | en | zh | hi | es | fr | uk */
  locale?: string;
  appearance?: import('./appearance').AppearanceSettings;
  hotkeys?: import('./appearance').HotkeyMap;
  uiPresets?: import('./appearance').UiPreset[];
  uiThemes?: import('./appearance').UiTheme[];
  activeThemeId?: string;
  wallpapers?: import('./appearance').WallpaperAsset[];
  playbackSongId?: string | null;
  playbackTime?: number;
  playbackQueue?: string[];
  playbackQueueIndex?: number;
  playback?: PlaybackSettings;
  discovery?: DiscoverySettings;
  scrobble?: ScrobbleSettings;
  /** Serialized last ViewType for restoreLastPage */
  lastView?: ViewType | null;
}

export type RecommendationsFilterMode = 'all' | 'liked' | 'current' | 'wishlist' | 'chart';

export interface BlockedArtist {
  key: string;
  name: string;
  blockedAt: number;
}

export interface BlockedTrack {
  id: string;
  deezerId: number | string | null;
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  previewUrl: string;
  blockedAt: number;
}

export interface WishlistItem {
  id: string;
  deezerId: number | string | null;
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  previewUrl: string;
  duration: number;
  basedOnArtist: string | null;
  source: 'deezer' | 'itunes';
  addedAt: number;
}

export type WavesGenre =
  | 'all'
  | 'rock'
  | 'pop'
  | 'rap'
  | 'ruRap'
  | 'electronic'
  | 'rnb'
  | 'indie'
  | 'metal'
  | 'dance'
  | 'jazz';

export type WavesLanguage = 'any' | 'ru' | 'en';
export type WavesMood = 'any' | 'energetic' | 'chill' | 'dark' | 'happy';
export type WavesSeed = 'taste' | 'chart' | 'liked' | 'wishlist';
export type WavesDiversity = 'normal' | 'high';

export interface WavesSettings {
  genre: WavesGenre;
  language: WavesLanguage;
  mood: WavesMood;
  seed: WavesSeed;
  diversity: WavesDiversity;
  /** Skip tracks already present in the local library */
  skipKnown: boolean;
}

export interface DiscoverySettings {
  filterMode: RecommendationsFilterMode;
  blockedArtists: BlockedArtist[];
  blockedTracks: BlockedTrack[];
  favoriteArtists: FavoriteArtist[];
  wishlist: WishlistItem[];
  /** Deezer Charts country code, e.g. ru / us / world */
  chartCountry: string;
  waves: WavesSettings;
}

export interface ListenHistoryItem {
  id: string;
  trackId: string;
  playedAt: number;
  song?: Song | null;
}

export interface ListenStats {
  weekCount: number;
  monthCount: number;
  totalCount: number;
  topArtists: { artist: string; count: number }[];
  topTracks: { trackId: string; title: string; artist: string; count: number }[];
}

export interface HistoryResult {
  items: ListenHistoryItem[];
  stats: ListenStats;
}

export interface PlaybackState {
  currentSongId: string | null;
  currentTime: number;
  queue: string[];
  queueIndex: number;
}

export interface LibraryData {
  songs: Song[];
  playlists: Playlist[];
  settings: AppSettings;
  playback?: PlaybackState;
}

export type ViewType =
  | { kind: 'home' }
  | { kind: 'all' }
  | { kind: 'liked' }
  | { kind: 'recommendations' }
  | { kind: 'wishlist' }
  | { kind: 'history' }
  | { kind: 'artist'; name: string; deezerId?: number | string | null }
  | {
      kind: 'release';
      artistName: string;
      artistDeezerId?: number | string | null;
      release: ArtistRelease;
    }
  | { kind: 'playlist'; id: string };

export interface ArtistSummary {
  id: number | string;
  name: string;
  pictureUrl: string | null;
  nbFan?: number;
}

export interface ArtistProfile extends ArtistSummary {
  nbAlbum?: number;
  /** Top tracks by Deezer rank (most popular first) */
  topTracks: RecommendationItem[];
  albums: ArtistRelease[];
  singles: ArtistRelease[];
  collaborationTracks: RecommendationItem[];
  /** @deprecated use topTracks */
  tracks: RecommendationItem[];
  relatedArtists: ArtistSummary[];
}

export interface DiscoverySearchResult {
  ok: boolean;
  artists: ArtistSummary[];
  tracks: RecommendationItem[];
  error?: string;
}

export interface ArtistProfileResult {
  ok: boolean;
  profile: ArtistProfile | null;
  error?: string;
}

export interface ArtistReleaseProfile {
  release: ArtistRelease;
  tracks: RecommendationItem[];
}

export interface ArtistReleaseProfileResult {
  ok: boolean;
  profile: ArtistReleaseProfile | null;
  error?: string;
}

export interface FavoriteArtist {
  key: string;
  name: string;
  deezerId?: number | string | null;
  pictureUrl?: string | null;
  addedAt: number;
}

export interface HomeFeed {
  continueSong: Song | null;
  continueTime: number;
  recent: Song[];
  similarToday: Song[];
  todayListenCount: number;
}

export interface LibraryMixResult {
  trackIds: string[];
  songs: Song[];
  generatedAt: number;
}

export interface MetaSyncProgress {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { filePath: string; message: string }[];
  done: boolean;
}

export interface LibraryRepairProgress {
  totalGroups: number;
  processed: number;
  merged: number;
  removed: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { filePath: string; message: string }[];
  groups: {
    key: string;
    count: number;
    keepId?: string;
    keepTitle?: string;
    keepArtist?: string;
  }[];
  done: boolean;
}

export interface LibraryDuplicatesResult {
  ok: boolean;
  totalGroups: number;
  duplicateTracks: number;
  groups: LibraryRepairProgress['groups'];
}

export interface PhoneSyncStatus {
  ok: boolean;
  active: boolean;
  token?: string;
  port?: number;
  startedAt?: number;
  expiresAt?: number;
  transferredBytes?: number;
  transferredFiles?: number;
  lastClient?: string | null;
  lanAddresses?: string[];
  joinUrl?: string;
  qrDataUrl?: string;
}

export interface PhoneSyncEvent {
  type: string;
  session?: PhoneSyncStatus;
  missingCount?: number;
  totalBytes?: number;
  trackId?: string;
  bytes?: number;
  received?: number;
}

export interface RecommendationItem {
  id: string;
  deezerId: number | string | null;
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  previewUrl: string;
  duration: number;
  basedOnArtist: string | null;
  source: 'deezer' | 'itunes';
  /** Deezer popularity rank (higher = more popular) */
  rank?: number | null;
  itunesId?: number | string | null;
  /** Deezer/iTunes ordering (optional; used for album release sorting) */
  trackNumber?: number | null;
  discNumber?: number | null;
}

export interface WavesPoolResult {
  ok: boolean;
  items: RecommendationItem[];
  waves?: WavesSettings;
  cached?: boolean;
  error?: string;
}

export interface ArtistRelease {
  id: number | string;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
  recordType: 'album' | 'single' | 'ep' | 'compile' | 'other';
  nbTracks: number;
  deezerUrl: string | null;
  itunesUrl?: string | null;
  source?: 'deezer' | 'itunes';
}

export interface RecommendationsResult {
  ok: boolean;
  items: RecommendationItem[];
  reason?: 'empty_library' | 'empty_wishlist' | 'no_matches' | 'network' | 'no_current' | null;
  error?: string;
  cached?: boolean;
  generatedAt?: number;
  /** Unix ms when the visible set will rotate (every 8h) */
  rotatesAt?: number | null;
  filterMode?: RecommendationsFilterMode;
}

export interface ImportProgress {
  total: number;
  processed: number;
  added: number;
  skipped: number;
  failed: number;
  errors: { filePath: string; message: string }[];
  done: boolean;
  cancelled?: boolean;
  kind?: 'files' | 'url' | 'search' | 'wishlist';
  phase?: 'download' | 'parse' | 'insert';
  statusMessage?: string;
  /** 0–100 while downloading from YouTube */
  downloadPercent?: number | null;
}

export interface ImportUrlResult {
  started: boolean;
  error?: string;
}

export interface ImportSearchPayload {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string | null;
  deezerId?: number | string | null;
  genre?: string | null;
}

export interface ImportWishlistItem extends ImportSearchPayload {}

export interface TrackDetails {
  song: Song;
  fileExists: boolean;
  writeMode: 'file-id3' | 'file-ffmpeg' | 'library' | 'none';
  writeToFileSupported: boolean;
  writeHint: string | null;
}

export interface MetadataSavePayload {
  title: string;
  artist: string;
  album: string;
  albumArtist?: string | null;
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  comment?: string | null;
  composer?: string | null;
  rating?: number | null;
  coverSourcePath?: string | null;
  removeCover?: boolean;
  libraryOnly?: boolean;
}

export interface MetadataSaveResult {
  song: Song;
  writtenToFile: boolean;
  libraryOnly: boolean;
  message: string;
  backupPath?: string | null;
}

export interface ImeMusicAPI {
  getLibrary: () => Promise<LibraryData>;
  importSongs: () => Promise<Song[]>;
  importFiles: () => Promise<{ started: boolean }>;
  importFolders: () => Promise<{ started: boolean }>;
  importUrl: (url: string) => Promise<ImportUrlResult>;
  importSearch: (payload: ImportSearchPayload) => Promise<ImportUrlResult>;
  importWishlist: (items: ImportWishlistItem[]) => Promise<ImportUrlResult>;
  cancelImport: () => Promise<{ cancelled: boolean }>;
  onImportProgress: (callback: (progress: ImportProgress) => void) => () => void;
  updateSong: (id: string, updates: Partial<Song>) => Promise<Song | null>;
  removeSong: (id: string) => Promise<boolean>;
  createPlaylist: (name: string, icon?: string) => Promise<Playlist>;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => Promise<Playlist | null>;
  deletePlaylist: (id: string) => Promise<boolean>;
  addToPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
  removeFromPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>;
  pickIcon: () => Promise<string | null>;
  pickImage: () => Promise<string | null>;
  browseFFmpeg: () => Promise<string | null>;
  browseYtDlp: () => Promise<string | null>;
  exportUiPreset: (payload: unknown) => Promise<{ ok: boolean; path?: string; error?: string }>;
  importUiPreset: () => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  getThemes: () => Promise<{
    activeThemeId: string;
    themes: import('./appearance').UiTheme[];
    wallpapers: import('./appearance').WallpaperAsset[];
  }>;
  createTheme: (payload: {
    name?: string;
    description?: string;
    appearance?: import('./appearance').AppearanceSettings;
  }) => Promise<{ ok: boolean; theme?: import('./appearance').UiTheme; settings?: AppSettings; error?: string }>;
  updateTheme: (payload: {
    id: string;
    name?: string;
    description?: string;
    appearance?: import('./appearance').AppearanceSettings;
    apply?: boolean;
  }) => Promise<{ ok: boolean; settings?: AppSettings; error?: string }>;
  deleteTheme: (id: string) => Promise<{ ok: boolean; settings?: AppSettings; error?: string }>;
  applyTheme: (id: string) => Promise<{ ok: boolean; settings?: AppSettings; error?: string }>;
  resetTheme: (id?: string) => Promise<{ ok: boolean; settings?: AppSettings; error?: string }>;
  exportTheme: (payload: unknown) => Promise<{ ok: boolean; path?: string; error?: string }>;
  importTheme: () => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  listWallpapers: () => Promise<import('./appearance').WallpaperAsset[]>;
  chooseWallpaper: () => Promise<{
    ok: boolean;
    asset?: import('./appearance').WallpaperAsset;
    wallpapers?: import('./appearance').WallpaperAsset[];
    error?: string;
  }>;
  deleteWallpaper: (id: string) => Promise<{
    ok: boolean;
    wallpapers?: import('./appearance').WallpaperAsset[];
    settings?: AppSettings;
    error?: string;
  }>;
  analyzeImagePalette: (imagePath: string) => Promise<{
    ok: boolean;
    cacheKey?: string | null;
    palette?: Record<string, string>;
    cached?: boolean;
    error?: string;
  }>;
  logError: (category: string, message: string, detail?: string) => Promise<void>;
  checkFileExists: (filePath: string) => Promise<boolean>;
  showItemInFolder: (filePath: string) => Promise<void>;
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
  relocateSongFile: (trackId: string) => Promise<Song | null>;
  getTrackDetails: (trackId: string) => Promise<TrackDetails>;
  saveTrackMetadata: (trackId: string, payload: MetadataSavePayload) => Promise<MetadataSaveResult>;
  pickCoverImage: () => Promise<string | null>;
  getQueue: () => Promise<QueueItem[]>;
  addToQueue: (trackId: string) => Promise<QueueItem | null>;
  addToQueueNext: (trackId: string) => Promise<QueueItem | null>;
  removeFromQueue: (queueRowId: string) => Promise<boolean>;
  clearQueue: () => Promise<void>;
  reorderQueue: (orderedQueueRowIds: string[]) => Promise<QueueItem[]>;
  takeQueueHead: () => Promise<string | null>;
  getRecommendations: (opts?: {
    force?: boolean;
    mode?: RecommendationsFilterMode;
    currentArtist?: string | null;
  }) => Promise<RecommendationsResult>;
  getWavesPool: (opts?: {
    force?: boolean;
    waves?: Partial<WavesSettings>;
  }) => Promise<WavesPoolResult>;
  searchDiscovery: (query: string) => Promise<DiscoverySearchResult>;
  getArtistProfile: (nameOrId: string) => Promise<ArtistProfileResult>;
  getArtistReleaseProfile: (payload: {
    artistName: string;
    artistDeezerId?: number | string | null;
    release: ArtistRelease;
  }) => Promise<ArtistReleaseProfileResult>;
  recordListen: (trackId: string) => Promise<Song | null>;
  getHistory: (limit?: number) => Promise<HistoryResult>;
  getHomeFeed: () => Promise<HomeFeed>;
  getLibraryMix: (opts?: { size?: number }) => Promise<LibraryMixResult>;
  rebuildAutoPlaylists: () => Promise<{ ok: boolean; playlists: Playlist[] }>;
  startMetaSync: () => Promise<{ started: boolean }>;
  startMetaEnrich: () => Promise<{ started: boolean }>;
  findLibraryDuplicates: () => Promise<LibraryDuplicatesResult>;
  repairLibraryDuplicates: () => Promise<{ started: boolean }>;
  onMetaSyncProgress: (callback: (progress: MetaSyncProgress) => void) => () => void;
  onMetaEnrichProgress: (callback: (progress: MetaSyncProgress) => void) => () => void;
  onLibraryRepairProgress: (callback: (progress: LibraryRepairProgress) => void) => () => void;
  scrobbleTrack: (trackId: string) => Promise<{ ok: boolean; results?: Record<string, string | null>; error?: string }>;
  openMiniPlayer: () => Promise<{ ok: boolean }>;
  closeMiniPlayer: () => Promise<{ ok: boolean }>;
  toggleMiniPlayer: () => Promise<{ ok: boolean; open: boolean }>;
  startPhoneSync: () => Promise<PhoneSyncStatus>;
  stopPhoneSync: () => Promise<{ ok: boolean; active: boolean }>;
  getPhoneSyncStatus: () => Promise<PhoneSyncStatus>;
  onPhoneSyncEvent: (callback: (evt: PhoneSyncEvent) => void) => () => void;
  pushNowPlaying: (payload: {
    title: string | null;
    artist: string | null;
    coverUrl: string | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  }) => void;
  relayPlaybackCommand: (cmd: 'playPause' | 'next' | 'previous' | 'show') => void;
  onPlaybackCommand: (
    callback: (cmd: 'playPause' | 'next' | 'previous' | 'show') => void,
  ) => () => void;
  onNowPlaying: (
    callback: (payload: {
      title: string | null;
      artist: string | null;
      coverUrl: string | null;
      isPlaying: boolean;
      currentTime: number;
      duration: number;
    }) => void,
  ) => () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    imeMusic: ImeMusicAPI;
  }
}

export {};
