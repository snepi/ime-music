import {
  DEFAULT_APPEARANCE,
  DEFAULT_COLOR_DARK,
  DEFAULT_COLOR_LIGHT,
  DEFAULT_COMPONENTS,
  DEFAULT_CONTEXT_ACTIONS,
  DEFAULT_DYNAMIC_COLORS,
  DEFAULT_LAYERS,
  DEFAULT_WALLPAPER,
  WALLPAPER_GLASS_LAYERS,
  type AppearanceSettings,
  type ColorTokens,
  type DensityMode,
  type ThemeMode,
} from '../appearance/schema';
import { mixColors, toneForTheme } from '../appearance/colorParse';

const COLOR_CSS_MAP: Record<keyof ColorTokens, string> = {
  bgMain: '--bg-main',
  bgSidebar: '--bg-sidebar',
  bgPanel: '--bg-panel',
  bgHover: '--bg-hover',
  bgActive: '--bg-active',
  bgElevated: '--bg-elevated',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentSoft: '--accent-soft',
  active: '--bg-active-custom',
  button: '--button-accent',
  progress: '--progress',
  selection: '--selection',
  like: '--like',
  danger: '--danger',
  warning: '--warning',
  success: '--success',
  border: '--border',
  borderStrong: '--border-strong',
  titlebarBg: '--titlebar-bg',
  playBtnBg: '--play-btn-bg',
  playBtnFg: '--play-btn-fg',
};

const DENSITY: Record<
  DensityMode,
  { rowHeight: number; coverScale: number; spaceScale: number }
> = {
  compact: { rowHeight: 44, coverScale: 0.9, spaceScale: 0.85 },
  standard: { rowHeight: 52, coverScale: 1, spaceScale: 1 },
  spacious: { rowHeight: 64, coverScale: 1.15, spaceScale: 1.2 },
};

const LEVEL_KEYS: Record<string, (keyof ColorTokens)[]> = {
  off: [],
  accent: ['accent', 'accentHover', 'accentSoft', 'button'],
  accentProgress: ['accent', 'accentHover', 'accentSoft', 'button', 'progress', 'selection'],
  accentBg: [
    'accent',
    'accentHover',
    'accentSoft',
    'button',
    'progress',
    'selection',
    'bgMain',
    'bgSidebar',
    'bgPanel',
    'bgElevated',
  ],
  full: [
    'accent',
    'accentHover',
    'accentSoft',
    'button',
    'progress',
    'selection',
    'bgMain',
    'bgSidebar',
    'bgPanel',
    'bgElevated',
    'bgHover',
    'bgActive',
    'active',
    'like',
  ],
};

export function resolveThemeMode(theme: ThemeMode): 'dark' | 'light' {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }
  return theme;
}

export function getEffectiveAppearance(
  appearance?: AppearanceSettings | null,
): AppearanceSettings {
  if (!appearance) return DEFAULT_APPEARANCE;
  return {
    ...DEFAULT_APPEARANCE,
    ...appearance,
    colors: {
      dark: { ...DEFAULT_COLOR_DARK, ...appearance.colors?.dark },
      light: { ...DEFAULT_COLOR_LIGHT, ...appearance.colors?.light },
    },
    layout: { ...DEFAULT_APPEARANCE.layout, ...appearance.layout },
    library: {
      ...DEFAULT_APPEARANCE.library,
      ...appearance.library,
      visibleColumns: appearance.library?.visibleColumns || DEFAULT_APPEARANCE.library.visibleColumns,
      columnOrder: appearance.library?.columnOrder || DEFAULT_APPEARANCE.library.columnOrder,
    },
    player: { ...DEFAULT_APPEARANCE.player, ...appearance.player },
    covers: { ...DEFAULT_APPEARANCE.covers, ...appearance.covers },
    animations: { ...DEFAULT_APPEARANCE.animations, ...appearance.animations },
    behavior: { ...DEFAULT_APPEARANCE.behavior, ...appearance.behavior },
    wallpaper: { ...DEFAULT_WALLPAPER, ...appearance.wallpaper },
    layers: { ...DEFAULT_LAYERS, ...appearance.layers },
    dynamicColors: {
      ...DEFAULT_DYNAMIC_COLORS,
      ...appearance.dynamicColors,
      allowedKeys: appearance.dynamicColors?.allowedKeys || [...DEFAULT_DYNAMIC_COLORS.allowedKeys],
      cachedPalette: appearance.dynamicColors?.cachedPalette || null,
    },
    components: {
      pages: { ...DEFAULT_COMPONENTS.pages, ...appearance.components?.pages },
      sidebar: { ...DEFAULT_COMPONENTS.sidebar, ...appearance.components?.sidebar },
      contextMenu: {
        ...DEFAULT_COMPONENTS.contextMenu,
        ...appearance.components?.contextMenu,
        hiddenActions: appearance.components?.contextMenu?.hiddenActions || [],
        actionOrder:
          appearance.components?.contextMenu?.actionOrder || [...DEFAULT_CONTEXT_ACTIONS],
      },
    },
  };
}

function applyDynamicPalette(
  base: ColorTokens,
  appearance: AppearanceSettings,
  mode: 'dark' | 'light',
): ColorTokens {
  const dc = appearance.dynamicColors;
  if (!dc?.enabled || dc.level === 'off' || !dc.cachedPalette) return base;
  const levelKeys = LEVEL_KEYS[dc.level] || [];
  const allowed = new Set(dc.allowedKeys?.length ? dc.allowedKeys : levelKeys);
  const keys = levelKeys.filter((k) => allowed.has(k) && dc.cachedPalette?.[k]);
  if (!keys.length) return base;
  const out = { ...base };
  const strength = dc.strength ?? 0.55;
  for (const key of keys) {
    const raw = dc.cachedPalette![key]!;
    const toned = toneForTheme(raw, mode);
    out[key] = mixColors(base[key], toned, strength) as ColorTokens[typeof key];
  }
  // Never wash out primary text
  out.textPrimary = base.textPrimary;
  out.textSecondary = base.textSecondary;
  out.textMuted = base.textMuted;
  return out;
}

function applyColors(root: HTMLElement, colors: ColorTokens) {
  for (const [key, cssVar] of Object.entries(COLOR_CSS_MAP) as [keyof ColorTokens, string][]) {
    root.style.setProperty(cssVar, colors[key]);
  }
  root.style.setProperty('--danger-hover', colors.danger);
  root.style.setProperty('--danger-soft', colors.accentSoft.replace(/[\d.]+\)$/, '0.12)'));
}

export function applyAppearance(appearanceInput: AppearanceSettings = DEFAULT_APPEARANCE) {
  if (typeof document === 'undefined') return;
  const appearance = getEffectiveAppearance(appearanceInput);
  const root = document.documentElement;
  const resolved = resolveThemeMode(appearance.theme);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-density', appearance.layout.density);
  root.setAttribute('data-sidebar-position', appearance.layout.sidebarPosition);
  root.setAttribute('data-player-variant', appearance.player.variant);
  root.setAttribute(
    'data-reduced-motion',
    appearance.animations.reducedMotion || !appearance.animations.enabled ? 'true' : 'false',
  );
  root.setAttribute('data-wallpaper-mode', appearance.wallpaper.mode);
  root.setAttribute('data-wallpaper-scope', appearance.wallpaper.scope);
  const wpOn = appearance.wallpaper.mode !== 'none';
  root.setAttribute('data-wallpaper', wpOn ? 'on' : 'off');
  root.setAttribute(
    'data-wallpaper-fitblur',
    wpOn && (appearance.wallpaper.fitBlur || appearance.wallpaper.mode === 'fitBlur')
      ? 'true'
      : 'false',
  );
  root.setAttribute('data-wallpaper-layout', appearance.wallpaper.layout || 'crop');
  root.setAttribute('data-wp-blur', appearance.wallpaper.blur > 0 ? 'on' : 'off');

  const baseColors = resolved === 'light' ? appearance.colors.light : appearance.colors.dark;
  applyColors(root, applyDynamicPalette(baseColors, appearance, resolved));

  const density = DENSITY[appearance.layout.density] || DENSITY.standard;
  const scale = appearance.layout.uiScale / 100;
  const coverList = Math.round(appearance.library.coverSize * density.coverScale);
  const coverPlayer = appearance.player.coverSize;

  root.style.setProperty('--ui-scale', String(scale));
  root.style.setProperty('--font-size', `${appearance.layout.fontSize * scale}px`);
  root.style.setProperty('--radius-md', `${appearance.layout.borderRadius}px`);
  root.style.setProperty('--radius-sm', `${Math.max(2, appearance.layout.borderRadius - 4)}px`);
  root.style.setProperty('--radius-lg', `${appearance.layout.borderRadius + 4}px`);
  root.style.setProperty('--border-width', `${appearance.layout.borderWidth}px`);
  root.style.setProperty('--icon-size', `${appearance.layout.iconSize}px`);
  root.style.setProperty('--sidebar-width', `${appearance.layout.sidebarWidth}px`);
  root.style.setProperty('--player-height', `${appearance.layout.playerHeight}px`);
  root.style.setProperty('--space-md', `${Math.round(appearance.layout.spacing * density.spaceScale)}px`);
  root.style.setProperty(
    '--space-sm',
    `${Math.round(appearance.layout.spacing * 0.66 * density.spaceScale)}px`,
  );
  root.style.setProperty(
    '--space-lg',
    `${Math.round(appearance.layout.spacing * 1.33 * density.spaceScale)}px`,
  );
  root.style.setProperty('--row-height', `${Math.round(density.rowHeight * scale)}px`);
  root.style.setProperty('--list-cover-size', `${coverList}px`);
  root.style.setProperty('--player-cover-size', `${coverPlayer}px`);
  root.style.setProperty('--cover-radius', `${appearance.covers.radius}px`);
  root.style.setProperty('--cover-fit', appearance.covers.objectFit);
  root.style.setProperty('--cover-fallback', appearance.covers.fallbackColor);
  root.style.setProperty('--blur-amount', `${appearance.covers.blurAmount}px`);
  root.style.setProperty('--blur-dim', String(appearance.covers.dimAmount));
  root.style.setProperty('--motion-speed', String(appearance.animations.speed));

  const wp = appearance.wallpaper;
  const layers = appearance.layers;
  const opaqueGlass =
    wp.mode !== 'none' &&
    layers.windowOpacity >= 0.99 &&
    layers.sidebarOpacity >= 0.99 &&
    layers.playerOpacity >= 0.99;
  const windowOp = opaqueGlass ? WALLPAPER_GLASS_LAYERS.windowOpacity : layers.windowOpacity;
  const sidebarOp = opaqueGlass ? WALLPAPER_GLASS_LAYERS.sidebarOpacity : layers.sidebarOpacity;
  const playerOp = opaqueGlass ? WALLPAPER_GLASS_LAYERS.playerOpacity : layers.playerOpacity;
  const backdropBlur =
    opaqueGlass && layers.backdropBlur === 0
      ? WALLPAPER_GLASS_LAYERS.backdropBlur
      : layers.backdropBlur;

  root.style.setProperty('--wallpaper-opacity', String(wp.opacity));
  root.style.setProperty('--wallpaper-dim', String(wp.dim));
  root.style.setProperty('--wallpaper-blur', `${wp.blur}px`);
  root.style.setProperty('--wp-photo-filter', wp.blur > 0 ? `blur(${wp.blur}px)` : 'none');
  root.style.setProperty('--wallpaper-sat', String(wp.saturation * layers.wallpaperSaturation));
  root.style.setProperty('--wallpaper-contrast', String(wp.contrast));
  root.style.setProperty('--wallpaper-brightness', String(wp.brightness));
  root.style.setProperty('--wallpaper-scale', String(wp.scale));
  root.style.setProperty('--wallpaper-pos-x', `${wp.positionX}%`);
  root.style.setProperty('--wallpaper-pos-y', `${wp.positionY}%`);
  root.style.setProperty('--wallpaper-pan-x', String(wp.positionX));
  root.style.setProperty('--wallpaper-pan-y', String(wp.positionY));
  root.style.setProperty('--wallpaper-radius', `${wp.radius}px`);

  root.style.setProperty('--layer-window', String(windowOp));
  root.style.setProperty('--layer-sidebar', String(sidebarOp));
  root.style.setProperty('--layer-player', String(playerOp));
  root.style.setProperty('--layer-cards', String(layers.cardsOpacity));
  root.style.setProperty('--layer-modal', String(layers.modalOpacity));
  root.style.setProperty('--backdrop-dim', String(layers.backdropDim));
  root.style.setProperty('--backdrop-blur', `${backdropBlur}px`);

  const pages = appearance.components.pages;
  root.style.setProperty('--page-max-width', `${pages.contentMaxWidth}px`);
  root.style.setProperty('--page-padding', `${pages.pagePadding}px`);
  root.style.setProperty('--page-title-size', `${pages.titleSize}px`);
  root.style.setProperty('--page-subtitle-size', `${pages.subtitleSize}px`);
  root.style.setProperty('--page-album-cover', `${pages.albumCoverSize}px`);
  root.style.setProperty(
    '--sidebar-playlist-cover',
    `${appearance.components.sidebar.playlistCoverSize}px`,
  );
  root.style.setProperty(
    '--sidebar-playlist-radius',
    `${appearance.components.sidebar.playlistCoverRadius}px`,
  );
  root.style.setProperty('--menu-radius', `${appearance.components.contextMenu.radius}px`);
  root.style.setProperty('--menu-font-size', `${appearance.components.contextMenu.fontSize}px`);
}

export function resetColorsToDefault(mode: 'dark' | 'light'): ColorTokens {
  return mode === 'light' ? { ...DEFAULT_COLOR_LIGHT } : { ...DEFAULT_COLOR_DARK };
}
