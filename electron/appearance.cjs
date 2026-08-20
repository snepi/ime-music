/**
 * Appearance normalize / merge for Electron main process.
 * Keep defaults in sync with shared/appearance.ts.
 */

const DEFAULT_LIBRARY_COLUMNS = ['index', 'cover', 'title', 'album', 'duration'];
const ALL_LIBRARY_COLUMNS = [
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

const DEFAULT_COLOR_DARK = {
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

const DEFAULT_COLOR_LIGHT = {
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

const DEFAULT_APPEARANCE = {
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
  wallpaper: {
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
  },
  layers: {
    windowOpacity: 1,
    sidebarOpacity: 1,
    cardsOpacity: 1,
    playerOpacity: 1,
    modalOpacity: 1,
    backdropDim: 0.45,
    backdropBlur: 0,
    wallpaperSaturation: 1,
  },
  dynamicColors: {
    enabled: false,
    level: 'off',
    strength: 0.55,
    autoUpdate: true,
    source: 'current',
    customImagePath: null,
    allowedKeys: ['accent', 'accentHover', 'button', 'progress', 'selection', 'accentSoft'],
    cacheKey: null,
    cachedPalette: null,
  },
  components: {
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
      actionOrder: [
        'play',
        'playNext',
        'addToQueue',
        'like',
        'addToPlaylist',
        'editMetadata',
        'showInFolder',
        'remove',
      ],
    },
  },
};

const DEFAULT_HOTKEYS = {
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (!isPlainObject(base)) return patch !== undefined ? patch : base;
  if (!isPlainObject(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.slice();
    } else if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function clamp(n, min, max, fallback) {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

function asBool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

function asString(v, fallback) {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

function normalizeColumns(raw, fallback) {
  if (!Array.isArray(raw)) return fallback.slice();
  const allowed = new Set(ALL_LIBRARY_COLUMNS);
  const out = [];
  for (const id of raw) {
    if (typeof id === 'string' && allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out.length ? out : fallback.slice();
}

function normalizeColors(raw, fallback) {
  const out = { ...fallback };
  if (!isPlainObject(raw)) return out;
  for (const key of Object.keys(fallback)) {
    if (typeof raw[key] === 'string' && raw[key].trim()) out[key] = raw[key].trim();
  }
  return out;
}

function normalizeWallpaper(raw, fallback) {
  const base = { ...fallback, ...(isPlainObject(raw) ? raw : {}) };
  const modes = ['none', 'full', 'stretch', 'crop', 'fit', 'contain', 'window', 'content', 'fitBlur'];
  const layouts = ['full', 'stretch', 'crop', 'window', 'content'];
  let mode = modes.includes(base.mode) ? base.mode : 'none';
  let layout = layouts.includes(base.layout) ? base.layout : 'crop';
  // Migrate legacy: mode was used as layout
  if (!base.layout && mode !== 'none' && mode !== 'fitBlur' && layouts.includes(mode)) {
    layout = mode;
  }
  if (mode === 'fit' || mode === 'contain') layout = 'crop';
  const fitBlur =
    typeof base.fitBlur === 'boolean' ? base.fitBlur : mode === 'fitBlur' || mode !== 'none';
  if (mode === 'fitBlur') mode = 'fitBlur';
  return {
    activeId: typeof base.activeId === 'string' ? base.activeId : null,
    mode,
    layout,
    fitBlur: asBool(fitBlur, true),
    opacity: clamp(base.opacity, 0, 1, fallback.opacity),
    dim: clamp(base.dim, 0, 0.95, fallback.dim),
    blur: clamp(base.blur, 0, 80, fallback.blur),
    saturation: clamp(base.saturation, 0, 2, fallback.saturation),
    contrast: clamp(base.contrast, 0.5, 1.5, fallback.contrast),
    brightness: clamp(base.brightness, 0.5, 1.5, fallback.brightness),
    scale: clamp(base.scale, 0.25, 4, fallback.scale),
    positionX: clamp(base.positionX, 0, 100, fallback.positionX),
    positionY: clamp(base.positionY, 0, 100, fallback.positionY),
    radius: clamp(base.radius, 0, 40, fallback.radius),
    scope: base.scope === 'home' ? 'home' : 'all',
    showInPlayer: asBool(base.showInPlayer, true),
    showInSidebar: asBool(base.showInSidebar, true),
    useTrackCover: asBool(base.useTrackCover, false),
  };
}

function normalizeLayers(raw, fallback) {
  const base = { ...fallback, ...(isPlainObject(raw) ? raw : {}) };
  return {
    windowOpacity: clamp(base.windowOpacity, 0.05, 1, fallback.windowOpacity),
    sidebarOpacity: clamp(base.sidebarOpacity, 0.05, 1, fallback.sidebarOpacity),
    cardsOpacity: clamp(base.cardsOpacity, 0.05, 1, fallback.cardsOpacity),
    playerOpacity: clamp(base.playerOpacity, 0.05, 1, fallback.playerOpacity),
    modalOpacity: clamp(base.modalOpacity, 0.2, 1, fallback.modalOpacity),
    backdropDim: clamp(base.backdropDim, 0, 0.95, fallback.backdropDim),
    backdropBlur: clamp(base.backdropBlur, 0, 60, fallback.backdropBlur),
    wallpaperSaturation: clamp(base.wallpaperSaturation, 0, 2, fallback.wallpaperSaturation),
  };
}

function normalizeDynamicColors(raw, fallback) {
  const base = { ...fallback, ...(isPlainObject(raw) ? raw : {}) };
  const levels = ['off', 'accent', 'accentProgress', 'accentBg', 'full'];
  const allowedFallback = fallback.allowedKeys.slice();
  let allowedKeys = allowedFallback;
  if (Array.isArray(base.allowedKeys)) {
    allowedKeys = base.allowedKeys.filter((k) => typeof k === 'string').slice(0, 40);
  }
  let cachedPalette = null;
  if (isPlainObject(base.cachedPalette)) {
    cachedPalette = {};
    for (const [k, v] of Object.entries(base.cachedPalette)) {
      if (typeof v === 'string' && v.trim() && v.length < 64) cachedPalette[k] = v.trim();
    }
  }
  return {
    enabled: asBool(base.enabled, false),
    level: levels.includes(base.level) ? base.level : 'off',
    strength: clamp(base.strength, 0, 1, fallback.strength),
    autoUpdate: asBool(base.autoUpdate, true),
    source: ['current', 'selected', 'custom'].includes(base.source) ? base.source : 'current',
    customImagePath: null,
    allowedKeys,
    cacheKey: typeof base.cacheKey === 'string' ? base.cacheKey.slice(0, 128) : null,
    cachedPalette,
  };
}

function normalizeComponents(raw, fallback) {
  const pages = { ...fallback.pages, ...(isPlainObject(raw?.pages) ? raw.pages : {}) };
  const sidebar = { ...fallback.sidebar, ...(isPlainObject(raw?.sidebar) ? raw.sidebar : {}) };
  const contextMenu = {
    ...fallback.contextMenu,
    ...(isPlainObject(raw?.contextMenu) ? raw.contextMenu : {}),
  };
  return {
    pages: {
      contentMaxWidth: clamp(pages.contentMaxWidth, 720, 2400, fallback.pages.contentMaxWidth),
      pagePadding: clamp(pages.pagePadding, 8, 64, fallback.pages.pagePadding),
      titleSize: clamp(pages.titleSize, 18, 48, fallback.pages.titleSize),
      subtitleSize: clamp(pages.subtitleSize, 11, 22, fallback.pages.subtitleSize),
      albumCoverSize: clamp(pages.albumCoverSize, 80, 320, fallback.pages.albumCoverSize),
      showDescription: asBool(pages.showDescription, true),
      showTrackCount: asBool(pages.showTrackCount, true),
      showSort: asBool(pages.showSort, true),
      emptyStateStyle: pages.emptyStateStyle === 'illustrated' ? 'illustrated' : 'simple',
    },
    sidebar: {
      showSectionLabels: asBool(sidebar.showSectionLabels, true),
      showTrackCounts: asBool(sidebar.showTrackCounts, true),
      playlistCoverSize: clamp(sidebar.playlistCoverSize, 20, 48, fallback.sidebar.playlistCoverSize),
      playlistCoverRadius: clamp(
        sidebar.playlistCoverRadius,
        0,
        24,
        fallback.sidebar.playlistCoverRadius,
      ),
      hideLiked: asBool(sidebar.hideLiked, false),
      hidePlaylists: asBool(sidebar.hidePlaylists, false),
    },
    contextMenu: {
      showOnRightClick: asBool(contextMenu.showOnRightClick, true),
      showHoverActions: asBool(contextMenu.showHoverActions, true),
      radius: clamp(contextMenu.radius, 0, 24, fallback.contextMenu.radius),
      fontSize: clamp(contextMenu.fontSize, 11, 18, fallback.contextMenu.fontSize),
      hiddenActions: Array.isArray(contextMenu.hiddenActions)
        ? contextMenu.hiddenActions.filter((x) => typeof x === 'string').slice(0, 40)
        : [],
      actionOrder: Array.isArray(contextMenu.actionOrder)
        ? contextMenu.actionOrder.filter((x) => typeof x === 'string').slice(0, 40)
        : fallback.contextMenu.actionOrder.slice(),
    },
  };
}

function normalizeAppearance(raw, legacyTheme) {
  const base = deepMerge(DEFAULT_APPEARANCE, isPlainObject(raw) ? raw : {});
  const themeRaw = asString(raw?.theme, asString(legacyTheme, 'dark'));
  const theme = ['dark', 'light', 'system'].includes(themeRaw) ? themeRaw : 'dark';

  return {
    theme,
    colors: {
      dark: normalizeColors(raw?.colors?.dark, DEFAULT_COLOR_DARK),
      light: normalizeColors(raw?.colors?.light, DEFAULT_COLOR_LIGHT),
    },
    layout: {
      uiScale: clamp(raw?.layout?.uiScale, 80, 140, base.layout.uiScale),
      fontSize: clamp(raw?.layout?.fontSize, 11, 20, base.layout.fontSize),
      density: ['compact', 'standard', 'spacious'].includes(raw?.layout?.density)
        ? raw.layout.density
        : 'standard',
      borderRadius: clamp(raw?.layout?.borderRadius, 0, 24, base.layout.borderRadius),
      borderWidth: clamp(raw?.layout?.borderWidth, 0, 3, base.layout.borderWidth),
      iconSize: clamp(raw?.layout?.iconSize, 14, 28, base.layout.iconSize),
      sidebarWidth: clamp(raw?.layout?.sidebarWidth, 180, 360, base.layout.sidebarWidth),
      playerHeight: clamp(raw?.layout?.playerHeight, 72, 140, base.layout.playerHeight),
      spacing: clamp(raw?.layout?.spacing, 4, 24, base.layout.spacing),
      sidebarPosition: raw?.layout?.sidebarPosition === 'right' ? 'right' : 'left',
      showSidebar: asBool(raw?.layout?.showSidebar, true),
      showQueue: asBool(raw?.layout?.showQueue, true),
      showSearch: asBool(raw?.layout?.showSearch, true),
      showTrackNumbers: asBool(raw?.layout?.showTrackNumbers, true),
      showArtworkInList: asBool(raw?.layout?.showArtworkInList, true),
      showHoverActions: asBool(raw?.layout?.showHoverActions, true),
    },
    library: {
      visibleColumns: normalizeColumns(raw?.library?.visibleColumns, DEFAULT_LIBRARY_COLUMNS),
      columnOrder: normalizeColumns(raw?.library?.columnOrder, ALL_LIBRARY_COLUMNS),
      coverSize: clamp(raw?.library?.coverSize, 28, 72, base.library.coverSize),
      showSecondaryText: asBool(raw?.library?.showSecondaryText, true),
      doubleClickAction: ['playNow', 'togglePlay', 'editMetadata'].includes(
        raw?.library?.doubleClickAction,
      )
        ? raw.library.doubleClickAction
        : 'playNow',
    },
    player: {
      variant: ['compact', 'standard', 'expanded'].includes(raw?.player?.variant)
        ? raw.player.variant
        : 'standard',
      showArtwork: asBool(raw?.player?.showArtwork, true),
      showTitle: asBool(raw?.player?.showTitle, true),
      showArtist: asBool(raw?.player?.showArtist, true),
      showPrevNext: asBool(raw?.player?.showPrevNext, true),
      showPlayPause: asBool(raw?.player?.showPlayPause, true),
      showVolume: asBool(raw?.player?.showVolume, true),
      showProgress: asBool(raw?.player?.showProgress, true),
      showTime: asBool(raw?.player?.showTime, true),
      showRemainingTime: asBool(raw?.player?.showRemainingTime, false),
      showSeconds: asBool(raw?.player?.showSeconds, true),
      showQueueButton: asBool(raw?.player?.showQueueButton, true),
      showLike: asBool(raw?.player?.showLike, true),
      coverSize: clamp(raw?.player?.coverSize, 40, 96, base.player.coverSize),
    },
    covers: {
      show: asBool(raw?.covers?.show, true),
      objectFit: ['cover', 'contain', 'fill'].includes(raw?.covers?.objectFit)
        ? raw.covers.objectFit
        : 'cover',
      radius: clamp(raw?.covers?.radius, 0, 24, base.covers.radius),
      blurBackground: asBool(raw?.covers?.blurBackground, false),
      blurAmount: clamp(raw?.covers?.blurAmount, 0, 60, base.covers.blurAmount),
      dimAmount: clamp(raw?.covers?.dimAmount, 0, 0.9, base.covers.dimAmount),
      fallbackColor: asString(raw?.covers?.fallbackColor, base.covers.fallbackColor),
    },
    animations: {
      enabled: asBool(raw?.animations?.enabled, true),
      speed: clamp(raw?.animations?.speed, 0.5, 2, base.animations.speed),
      reducedMotion: asBool(raw?.animations?.reducedMotion, false),
      modalTransitions: asBool(raw?.animations?.modalTransitions, true),
      listAppear: asBool(raw?.animations?.listAppear, false),
    },
    behavior: {
      startView: ['home', 'all', 'liked', 'last'].includes(raw?.behavior?.startView)
        ? raw.behavior.startView
        : 'home',
      restoreLastPage: asBool(raw?.behavior?.restoreLastPage, true),
      restoreTrack: asBool(raw?.behavior?.restoreTrack, true),
      restoreQueue: asBool(raw?.behavior?.restoreQueue, true),
      focusSearchOnOpen: asBool(raw?.behavior?.focusSearchOnOpen, false),
      confirmDelete: asBool(raw?.behavior?.confirmDelete, true),
      confirmClearQueue: asBool(raw?.behavior?.confirmClearQueue, true),
      spaceTogglesPlayback: asBool(raw?.behavior?.spaceTogglesPlayback, true),
      autoResumeOnLaunch: asBool(raw?.behavior?.autoResumeOnLaunch, false),
    },
    wallpaper: normalizeWallpaper(raw?.wallpaper, DEFAULT_APPEARANCE.wallpaper),
    layers: normalizeLayers(raw?.layers, DEFAULT_APPEARANCE.layers),
    dynamicColors: normalizeDynamicColors(raw?.dynamicColors, DEFAULT_APPEARANCE.dynamicColors),
    components: normalizeComponents(raw?.components, DEFAULT_APPEARANCE.components),
  };
}

function normalizeHotkeys(raw) {
  const out = { ...DEFAULT_HOTKEYS };
  if (isPlainObject(raw)) {
    for (const key of Object.keys(DEFAULT_HOTKEYS)) {
      if (typeof raw[key] !== 'string') continue;
      const v = raw[key].trim();
      if (v) out[key] = v;
      else if (key === 'addToQueue') out[key] = '';
    }
  }
  if (out.addToQueue === 'KeyQ') {
    if (!out.queue || out.queue === 'KeyE' || out.queue === 'KeyQ') out.queue = 'KeyQ';
    out.addToQueue = '';
  }
  return out;
}

function normalizeUiPresets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    if (typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    out.push({
      id: item.id,
      name: String(item.name).slice(0, 80),
      appearance: normalizeAppearance(item.appearance),
      hotkeys: item.hotkeys ? normalizeHotkeys(item.hotkeys) : undefined,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    });
  }
  return out;
}

function normalizeUiThemes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    if (typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    if (item.builtin) continue;
    out.push({
      id: item.id,
      name: String(item.name).slice(0, 80),
      description: typeof item.description === 'string' ? item.description.slice(0, 240) : '',
      builtin: false,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      thumbnailId: typeof item.thumbnailId === 'string' ? item.thumbnailId : null,
      appearance: normalizeAppearance(item.appearance),
    });
  }
  return out;
}

function normalizeWallpapersMeta(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    if (typeof item.id !== 'string' || typeof item.fileName !== 'string') continue;
    out.push({
      id: item.id,
      name: typeof item.name === 'string' ? item.name.slice(0, 80) : item.id,
      fileName: item.fileName,
      previewFileName:
        typeof item.previewFileName === 'string' ? item.previewFileName : item.fileName,
      mime: typeof item.mime === 'string' ? item.mime : 'image/jpeg',
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    });
  }
  return out;
}

module.exports = {
  DEFAULT_APPEARANCE,
  DEFAULT_HOTKEYS,
  DEFAULT_COLOR_DARK,
  DEFAULT_COLOR_LIGHT,
  deepMerge,
  normalizeAppearance,
  normalizeHotkeys,
  normalizeUiPresets,
  normalizeUiThemes,
  normalizeWallpapersMeta,
};
