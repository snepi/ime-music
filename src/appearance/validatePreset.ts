import type { AppearanceSettings, HotkeyMap, UiPreset } from './schema';
import { DEFAULT_APPEARANCE, DEFAULT_HOTKEYS } from './schema';

const FORBIDDEN_KEYS = new Set([
  'filePath',
  'coverArt',
  'password',
  'token',
  'secret',
  'ffmpegPath',
  'ytdlpPath',
  'ytdlpProxy',
]);

export interface PresetExportPayload {
  version: 1;
  kind: 'ime-music-ui-preset';
  name: string;
  appearance: AppearanceSettings;
  hotkeys?: HotkeyMap;
  exportedAt: number;
}

export function buildPresetExport(
  name: string,
  appearance: AppearanceSettings,
  hotkeys?: HotkeyMap,
): PresetExportPayload {
  return {
    version: 1,
    kind: 'ime-music-ui-preset',
    name: name.slice(0, 80),
    appearance,
    hotkeys,
    exportedAt: Date.now(),
  };
}

export function parsePresetImport(raw: unknown): {
  ok: true;
  preset: Omit<UiPreset, 'id' | 'createdAt'> & { name: string };
} | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Некорректный JSON' };
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return { ok: false, error: `Файл содержит запрещённое поле: ${key}` };
    }
  }

  if (obj.kind && obj.kind !== 'ime-music-ui-preset') {
    return { ok: false, error: 'Это не пресет IMe Music' };
  }

  const name = typeof obj.name === 'string' ? obj.name.slice(0, 80) : 'Импортированный пресет';
  const appearance =
    obj.appearance && typeof obj.appearance === 'object'
      ? (obj.appearance as AppearanceSettings)
      : DEFAULT_APPEARANCE;
  const hotkeys =
    obj.hotkeys && typeof obj.hotkeys === 'object' ? (obj.hotkeys as HotkeyMap) : DEFAULT_HOTKEYS;

  return {
    ok: true,
    preset: { name, appearance, hotkeys },
  };
}
