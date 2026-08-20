/** Appearance, hotkeys and UI preset types for IMe Music */

export type ThemeMode = 'dark' | 'light' | 'system';
export type DensityMode = 'compact' | 'standard' | 'spacious';
export type SidebarPosition = 'left' | 'right';
export type PlayerVariant = 'compact' | 'standard' | 'expanded';
export type CoverObjectFit = 'cover' | 'contain' | 'fill';
export type DoubleClickAction = 'playNow' | 'togglePlay' | 'editMetadata';
export type StartViewKind = 'home' | 'all' | 'liked' | 'last';

export type LibraryColumnId =
  | 'index'
  | 'cover'
  | 'title'
  | 'artist'
  | 'album'
  | 'genre'
  | 'year'
  | 'duration'
  | 'format'
  | 'bitrate'
  | 'fileSize'
  | 'rating'
  | 'dateAdded'
  | 'playCount'
  | 'lastPlayed';

export interface ColorTokens {
  bgMain: string;
  bgSidebar: string;
  bgPanel: string;
  bgHover: string;
  bgActive: string;
  bgElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  active: string;
  button: string;
  progress: string;
  selection: string;
  like: string;
  danger: string;
  warning: string;
  success: string;
  border: string;
  borderStrong: string;
  titlebarBg: string;
  playBtnBg: string;
  playBtnFg: string;
}

export interface LayoutAppearance {
  uiScale: number;
  fontSize: number;
  density: DensityMode;
  borderRadius: number;
  borderWidth: number;
  iconSize: number;
  sidebarWidth: number;
  playerHeight: number;
  spacing: number;
  sidebarPosition: SidebarPosition;
  showSidebar: boolean;
  showQueue: boolean;
  showSearch: boolean;
  showTrackNumbers: boolean;
  showArtworkInList: boolean;
  showHoverActions: boolean;
}

export interface LibraryAppearance {
  visibleColumns: LibraryColumnId[];
  columnOrder: LibraryColumnId[];
  coverSize: number;
  showSecondaryText: boolean;
  doubleClickAction: DoubleClickAction;
}

export interface PlayerAppearance {
  variant: PlayerVariant;
  showArtwork: boolean;
  showTitle: boolean;
  showArtist: boolean;
  showPrevNext: boolean;
  showPlayPause: boolean;
  showVolume: boolean;
  showProgress: boolean;
  showTime: boolean;
  showRemainingTime: boolean;
  showSeconds: boolean;
  showQueueButton: boolean;
  showLike: boolean;
  coverSize: number;
}

export interface CoversAppearance {
  show: boolean;
  objectFit: CoverObjectFit;
  radius: number;
  blurBackground: boolean;
  blurAmount: number;
  dimAmount: number;
  fallbackColor: string;
}

export interface AnimationsAppearance {
  enabled: boolean;
  speed: number;
  reducedMotion: boolean;
  modalTransitions: boolean;
  listAppear: boolean;
}

export interface BehaviorAppearance {
  startView: StartViewKind;
  restoreLastPage: boolean;
  restoreTrack: boolean;
  restoreQueue: boolean;
  focusSearchOnOpen: boolean;
  confirmDelete: boolean;
  confirmClearQueue: boolean;
  spaceTogglesPlayback: boolean;
  autoResumeOnLaunch: boolean;
}

export type WallpaperMode =
  | 'none'
  | 'full'
  | 'stretch'
  | 'crop'
  | 'fit'
  | 'contain'
  | 'window'
  | 'content'
  | 'fitBlur';

export type WallpaperLayout = 'full' | 'stretch' | 'crop' | 'window' | 'content';

export interface WallpaperSettings {
  activeId: string | null;
  /** none = off; fitBlur = Mei-style acrylic; other values = layout mapping */
  mode: WallpaperMode;
  /** Framing when wallpaper is on (Mei: Full / Stretch / Crop / Window / Content) */
  layout: WallpaperLayout;
  /** Soft blurred fill behind glass panels (Mei Fit-blur) */
  fitBlur: boolean;
  opacity: number;
  dim: number;
  blur: number;
  saturation: number;
  contrast: number;
  brightness: number;
  scale: number;
  positionX: number;
  positionY: number;
  radius: number;
  scope: 'home' | 'all';
  showInPlayer: boolean;
  showInSidebar: boolean;
  useTrackCover: boolean;
}

export interface LayerSettings {
  windowOpacity: number;
  sidebarOpacity: number;
  cardsOpacity: number;
  playerOpacity: number;
  modalOpacity: number;
  backdropDim: number;
  backdropBlur: number;
  wallpaperSaturation: number;
}

export type DynamicColorLevel = 'off' | 'accent' | 'accentProgress' | 'accentBg' | 'full';

export interface DynamicColorSettings {
  enabled: boolean;
  level: DynamicColorLevel;
  strength: number;
  autoUpdate: boolean;
  source: 'current' | 'selected' | 'custom';
  customImagePath: string | null;
  allowedKeys: (keyof ColorTokens)[];
  cacheKey: string | null;
  cachedPalette: Partial<ColorTokens> | null;
}

export interface ComponentsAppearance {
  pages: {
    contentMaxWidth: number;
    pagePadding: number;
    titleSize: number;
    subtitleSize: number;
    albumCoverSize: number;
    showDescription: boolean;
    showTrackCount: boolean;
    showSort: boolean;
    emptyStateStyle: 'simple' | 'illustrated';
  };
  sidebar: {
    showSectionLabels: boolean;
    showTrackCounts: boolean;
    playlistCoverSize: number;
    playlistCoverRadius: number;
    hideLiked: boolean;
    hidePlaylists: boolean;
  };
  contextMenu: {
    showOnRightClick: boolean;
    showHoverActions: boolean;
    radius: number;
    fontSize: number;
    hiddenActions: string[];
    actionOrder: string[];
  };
}

export interface AppearanceSettings {
  theme: ThemeMode;
  colors: { dark: ColorTokens; light: ColorTokens };
  layout: LayoutAppearance;
  library: LibraryAppearance;
  player: PlayerAppearance;
  covers: CoversAppearance;
  animations: AnimationsAppearance;
  behavior: BehaviorAppearance;
  wallpaper: WallpaperSettings;
  layers: LayerSettings;
  dynamicColors: DynamicColorSettings;
  components: ComponentsAppearance;
}

export interface WallpaperAsset {
  id: string;
  name: string;
  fileName: string;
  previewFileName: string;
  mime: string;
  createdAt: number;
  /** Absolute path resolved in main; for renderer use getWallpaperUrl */
  filePath?: string;
  previewPath?: string;
}

export interface UiTheme {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
  thumbnailId?: string | null;
  appearance: AppearanceSettings;
}

export const DEFAULT_WALLPAPER: WallpaperSettings = {
  activeId: null,
  mode: 'none',
  layout: 'crop',
  fitBlur: true,
  opacity: 1,
  dim: 0.22,
  blur: 0,
  saturation: 1,
  contrast: 1,
  brightness: 1,
  scale: 1,
  positionX: 50,
  positionY: 50,
  radius: 0,
  scope: 'all',
  showInPlayer: true,
  showInSidebar: true,
  useTrackCover: false,
};

export const DEFAULT_LAYERS: LayerSettings = {
  windowOpacity: 1,
  sidebarOpacity: 1,
  cardsOpacity: 1,
  playerOpacity: 1,
  modalOpacity: 1,
  backdropDim: 0.45,
  backdropBlur: 0,
  wallpaperSaturation: 1,
};

/** Sensible glass defaults when wallpaper turns on */
export const WALLPAPER_GLASS_LAYERS: LayerSettings = {
  windowOpacity: 0.42,
  sidebarOpacity: 0.55,
  cardsOpacity: 0.5,
  playerOpacity: 0.55,
  modalOpacity: 0.92,
  backdropDim: 0.4,
  backdropBlur: 22,
  wallpaperSaturation: 1,
};

export const DEFAULT_DYNAMIC_COLORS: DynamicColorSettings = {
  enabled: false,
  level: 'off',
  strength: 0.55,
  autoUpdate: true,
  source: 'current',
  customImagePath: null,
  allowedKeys: ['accent', 'accentHover', 'button', 'progress', 'selection', 'accentSoft'],
  cacheKey: null,
  cachedPalette: null,
};

export const DEFAULT_CONTEXT_ACTIONS = [
  'play',
  'playNext',
  'addToQueue',
  'like',
  'addToPlaylist',
  'editMetadata',
  'showInFolder',
  'remove',
];

export const DEFAULT_COMPONENTS: ComponentsAppearance = {
  pages: {
    contentMaxWidth: 1400,
    pagePadding: 24,
    titleSize: 28,
    subtitleSize: 14,
    albumCoverSize: 160,
    showDescription: true,
    showTrackCount: true,
    showSort: true,
    emptyStateStyle: 'simple',
  },
  sidebar: {
    showSectionLabels: true,
    showTrackCounts: true,
    playlistCoverSize: 28,
    playlistCoverRadius: 6,
    hideLiked: false,
    hidePlaylists: false,
  },
  contextMenu: {
    showOnRightClick: true,
    showHoverActions: true,
    radius: 10,
    fontSize: 13,
    hiddenActions: [],
    actionOrder: [...DEFAULT_CONTEXT_ACTIONS],
  },
};

export type HotkeyAction =
  | 'playPause'
  | 'next'
  | 'previous'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'like'
  | 'addToQueue'
  | 'search'
  | 'settings'
  | 'queue'
  | 'toggleTheme'
  | 'editMetadata';

export type HotkeyMap = Record<HotkeyAction, string>;

export interface UiPreset {
  id: string;
  name: string;
  appearance: AppearanceSettings;
  hotkeys?: HotkeyMap;
  createdAt: number;
}

export const DEFAULT_LIBRARY_COLUMNS: LibraryColumnId[] = [
  'index',
  'cover',
  'title',
  'album',
  'duration',
];

export const ALL_LIBRARY_COLUMNS: LibraryColumnId[] = [
  'index',
  'cover',
  'title',
  'artist',
  'album',
  'genre',
  'year',
  'duration',
  'format',
  'bitrate',
  'fileSize',
  'rating',
  'dateAdded',
  'playCount',
  'lastPlayed',
];

export const DEFAULT_COLOR_DARK: ColorTokens = {
  bgMain: '#111315',
  bgSidebar: '#181b1f',
  bgPanel: '#20242a',
  bgHover: '#2a3037',
  bgActive: '#303842',
  bgElevated: '#252a31',
  textPrimary: '#f2f4f7',
  textSecondary: '#9da5af',
  textMuted: '#6f7883',
  accent: '#6ea8fe',
  accentHover: '#82b5ff',
  accentSoft: 'rgba(110, 168, 254, 0.12)',
  active: '#303842',
  button: '#6ea8fe',
  progress: '#6ea8fe',
  selection: 'rgba(110, 168, 254, 0.22)',
  like: '#ef6b73',
  danger: '#ef6b73',
  warning: '#e6a23c',
  success: '#5ec992',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  titlebarBg: '#0d0f11',
  playBtnBg: '#f2f4f7',
  playBtnFg: '#111315',
};

export const DEFAULT_COLOR_LIGHT: ColorTokens = {
  bgMain: '#f4f5f7',
  bgSidebar: '#ebecef',
  bgPanel: '#ffffff',
  bgHover: '#e2e5ea',
  bgActive: '#d6dae1',
  bgElevated: '#f8f9fb',
  textPrimary: '#1a1d23',
  textSecondary: '#5c6570',
  textMuted: '#8a939e',
  accent: '#3b82f6',
  accentHover: '#2563eb',
  accentSoft: 'rgba(59, 130, 246, 0.12)',
  active: '#d6dae1',
  button: '#3b82f6',
  progress: '#3b82f6',
  selection: 'rgba(59, 130, 246, 0.18)',
  like: '#dc4c55',
  danger: '#dc4c55',
  warning: '#d48806',
  success: '#2f9e6c',
  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.14)',
  titlebarBg: '#e8eaee',
  playBtnBg: '#1a1d23',
  playBtnFg: '#ffffff',
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'dark',
  colors: {
    dark: { ...DEFAULT_COLOR_DARK },
    light: { ...DEFAULT_COLOR_LIGHT },
  },
  layout: {
    uiScale: 100,
    fontSize: 14,
    density: 'standard',
    borderRadius: 10,
    borderWidth: 1,
    iconSize: 18,
    sidebarWidth: 260,
    playerHeight: 96,
    spacing: 12,
    sidebarPosition: 'left',
    showSidebar: true,
    showQueue: true,
    showSearch: true,
    showTrackNumbers: true,
    showArtworkInList: true,
    showHoverActions: true,
  },
  library: {
    visibleColumns: [...DEFAULT_LIBRARY_COLUMNS],
    columnOrder: [...ALL_LIBRARY_COLUMNS],
    coverSize: 40,
    showSecondaryText: true,
    doubleClickAction: 'playNow',
  },
  player: {
    variant: 'standard',
    showArtwork: true,
    showTitle: true,
    showArtist: true,
    showPrevNext: true,
    showPlayPause: true,
    showVolume: true,
    showProgress: true,
    showTime: true,
    showRemainingTime: false,
    showSeconds: true,
    showQueueButton: true,
    showLike: true,
    coverSize: 56,
  },
  covers: {
    show: true,
    objectFit: 'cover',
    radius: 8,
    blurBackground: false,
    blurAmount: 24,
    dimAmount: 0.55,
    fallbackColor: '#2a3037',
  },
  animations: {
    enabled: true,
    speed: 1,
    reducedMotion: false,
    modalTransitions: true,
    listAppear: false,
  },
  behavior: {
    startView: 'home',
    restoreLastPage: true,
    restoreTrack: true,
    restoreQueue: true,
    focusSearchOnOpen: false,
    confirmDelete: true,
    confirmClearQueue: true,
    spaceTogglesPlayback: true,
    autoResumeOnLaunch: false,
  },
  wallpaper: { ...DEFAULT_WALLPAPER },
  layers: { ...DEFAULT_LAYERS },
  dynamicColors: {
    ...DEFAULT_DYNAMIC_COLORS,
    allowedKeys: [...DEFAULT_DYNAMIC_COLORS.allowedKeys],
  },
  components: {
    pages: { ...DEFAULT_COMPONENTS.pages },
    sidebar: { ...DEFAULT_COMPONENTS.sidebar },
    contextMenu: {
      ...DEFAULT_COMPONENTS.contextMenu,
      hiddenActions: [],
      actionOrder: [...DEFAULT_CONTEXT_ACTIONS],
    },
  },
};

export const DEFAULT_HOTKEYS: HotkeyMap = {
  playPause: 'Space',
  next: 'MediaTrackNext',
  previous: 'MediaTrackPrevious',
  volumeUp: 'ArrowUp',
  volumeDown: 'ArrowDown',
  mute: 'KeyM',
  like: 'KeyL',
  addToQueue: '',
  search: 'KeyF',
  settings: 'Comma',
  queue: 'KeyQ',
  toggleTheme: 'KeyT',
  editMetadata: 'KeyI',
};

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  playPause: 'Play / Pause',
  next: 'Следующий трек',
  previous: 'Предыдущий трек',
  volumeUp: 'Громкость +',
  volumeDown: 'Громкость −',
  mute: 'Без звука',
  like: 'Лайк',
  addToQueue: 'В очередь',
  search: 'Поиск',
  settings: 'Настройки',
  queue: 'Очередь',
  toggleTheme: 'Переключить тему',
  editMetadata: 'Редактор метаданных',
};
