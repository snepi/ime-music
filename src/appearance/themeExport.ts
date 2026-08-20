import type { AppearanceSettings, HotkeyMap } from './schema';
import { DEFAULT_APPEARANCE, DEFAULT_HOTKEYS } from './schema';
import { parseColor } from './colorParse';

const FORBIDDEN = new Set([
  'filePath',
  'coverArt',
  'password',
  'token',
  'secret',
  'ffmpegPath',
  'ytdlpPath',
  'ytdlpProxy',
  'customImagePath',
]);

export interface ThemeExportPayload {
  schemaVersion: 1;
  kind: 'ime-music-theme';
  name: string;
  description?: string;
  colors?: AppearanceSettings['colors'];
  wallpaper?: AppearanceSettings['wallpaper'];
  layout?: AppearanceSettings['layout'];
  components?: AppearanceSettings['components'];
  layers?: AppearanceSettings['layers'];
  dynamicColors?: Omit<AppearanceSettings['dynamicColors'], 'cachedPalette' | 'customImagePath'>;
  appearance?: AppearanceSettings;
  hotkeys?: HotkeyMap;
  exportedAt: number;
}

function scrubAppearance(appearance: AppearanceSettings): AppearanceSettings {
  return {
    ...appearance,
    dynamicColors: {
      ...appearance.dynamicColors,
      customImagePath: null,
      cachedPalette: null,
      cacheKey: null,
    },
    wallpaper: {
      ...appearance.wallpaper,
      // Keep mode/settings; drop local asset ids on export of full theme colors-only paths
    },
  };
}

function hasDangerousColors(colors: AppearanceSettings['colors']): boolean {
  for (const mode of ['dark', 'light'] as const) {
    for (const value of Object.values(colors[mode])) {
      if (typeof value !== 'string' || !parseColor(value).ok) return true;
    }
  }
  return false;
}

export function buildThemeExport(
  name: string,
  appearance: AppearanceSettings,
  opts?: { description?: string; hotkeys?: HotkeyMap; mode?: 'full' | 'colors' | 'wallpaper' },
): ThemeExportPayload {
  const mode = opts?.mode || 'full';
  const safe = scrubAppearance(appearance);
  const base: ThemeExportPayload = {
    schemaVersion: 1,
    kind: 'ime-music-theme',
    name: name.slice(0, 80),
    description: opts?.description,
    exportedAt: Date.now(),
  };
  if (mode === 'colors') {
    return { ...base, colors: safe.colors };
  }
  if (mode === 'wallpaper') {
    return {
      ...base,
      wallpaper: { ...safe.wallpaper, activeId: null, useTrackCover: safe.wallpaper.useTrackCover },
    };
  }
  return {
    ...base,
    appearance: safe,
    colors: safe.colors,
    wallpaper: { ...safe.wallpaper, activeId: null },
    layout: safe.layout,
    components: safe.components,
    layers: safe.layers,
    dynamicColors: {
      enabled: safe.dynamicColors.enabled,
      level: safe.dynamicColors.level,
      strength: safe.dynamicColors.strength,
      autoUpdate: safe.dynamicColors.autoUpdate,
      source: safe.dynamicColors.source,
      allowedKeys: [...safe.dynamicColors.allowedKeys],
      cacheKey: null,
    },
    hotkeys: opts?.hotkeys,
  };
}

export function parseThemeImport(raw: unknown):
  | { ok: true; name: string; description: string; appearance: AppearanceSettings; hotkeys?: HotkeyMap }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Некорректный JSON' };
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (FORBIDDEN.has(key)) return { ok: false, error: `Запрещённое поле: ${key}` };
  }

  if (obj.schemaVersion != null && obj.schemaVersion !== 1) {
    return { ok: false, error: `Неподдерживаемая schemaVersion: ${String(obj.schemaVersion)}` };
  }

  if (obj.kind && obj.kind !== 'ime-music-theme' && obj.kind !== 'ime-music-ui-preset') {
    return { ok: false, error: 'Это не тема IMe Music' };
  }

  const name = typeof obj.name === 'string' ? obj.name.slice(0, 80) : 'Импортированная тема';
  const description = typeof obj.description === 'string' ? obj.description.slice(0, 240) : '';

  let appearance: AppearanceSettings = {
    ...DEFAULT_APPEARANCE,
    colors: {
      dark: { ...DEFAULT_APPEARANCE.colors.dark },
      light: { ...DEFAULT_APPEARANCE.colors.light },
    },
    wallpaper: { ...DEFAULT_APPEARANCE.wallpaper },
    layers: { ...DEFAULT_APPEARANCE.layers },
    dynamicColors: {
      ...DEFAULT_APPEARANCE.dynamicColors,
      allowedKeys: [...DEFAULT_APPEARANCE.dynamicColors.allowedKeys],
    },
    components: JSON.parse(JSON.stringify(DEFAULT_APPEARANCE.components)) as AppearanceSettings['components'],
  };

  if (obj.appearance && typeof obj.appearance === 'object') {
    appearance = { ...appearance, ...(obj.appearance as AppearanceSettings) };
  }
  if (obj.colors && typeof obj.colors === 'object') {
    appearance = {
      ...appearance,
      colors: {
        dark: { ...appearance.colors.dark, ...((obj.colors as AppearanceSettings['colors']).dark || {}) },
        light: { ...appearance.colors.light, ...((obj.colors as AppearanceSettings['colors']).light || {}) },
      },
    };
  }
  if (obj.wallpaper && typeof obj.wallpaper === 'object') {
    appearance = {
      ...appearance,
      wallpaper: { ...appearance.wallpaper, ...(obj.wallpaper as AppearanceSettings['wallpaper']), activeId: null },
    };
  }
  if (obj.layout && typeof obj.layout === 'object') {
    appearance = { ...appearance, layout: { ...appearance.layout, ...(obj.layout as AppearanceSettings['layout']) } };
  }
  if (obj.components && typeof obj.components === 'object') {
    appearance = {
      ...appearance,
      components: {
        ...appearance.components,
        ...(obj.components as AppearanceSettings['components']),
      },
    };
  }
  if (obj.layers && typeof obj.layers === 'object') {
    appearance = { ...appearance, layers: { ...appearance.layers, ...(obj.layers as AppearanceSettings['layers']) } };
  }

  if (hasDangerousColors(appearance.colors)) {
    return { ok: false, error: 'В файле есть недопустимые цвета' };
  }

  const hotkeys =
    obj.hotkeys && typeof obj.hotkeys === 'object'
      ? { ...DEFAULT_HOTKEYS, ...(obj.hotkeys as HotkeyMap) }
      : undefined;

  return { ok: true, name, description, appearance, hotkeys };
}
