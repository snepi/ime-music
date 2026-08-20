import {
  DEFAULT_APPEARANCE,
  DEFAULT_COLOR_DARK,
  DEFAULT_COLOR_LIGHT,
  type AppearanceSettings,
  type ColorTokens,
} from '../appearance/schema';

function withAccent(base: ColorTokens, accent: string, accentHover: string): ColorTokens {
  return {
    ...base,
    accent,
    accentHover,
    accentSoft: accent.startsWith('#')
      ? `${accent}22`
      : base.accentSoft,
    button: accent,
    progress: accent,
    selection: accent.startsWith('#') ? `${accent}33` : base.selection,
  };
}

function makePreset(
  id: string,
  name: string,
  darkAccent: string,
  darkHover: string,
  lightAccent: string,
  lightHover: string,
  extraDark?: Partial<ColorTokens>,
  extraLight?: Partial<ColorTokens>,
): { id: string; name: string; appearance: AppearanceSettings } {
  return {
    id,
    name,
    appearance: {
      ...DEFAULT_APPEARANCE,
      colors: {
        dark: { ...withAccent(DEFAULT_COLOR_DARK, darkAccent, darkHover), ...extraDark },
        light: { ...withAccent(DEFAULT_COLOR_LIGHT, lightAccent, lightHover), ...extraLight },
      },
    },
  };
}

export const BUILTIN_PRESETS = [
  {
    id: 'default',
    name: 'Default',
    appearance: { ...DEFAULT_APPEARANCE, colors: { dark: { ...DEFAULT_COLOR_DARK }, light: { ...DEFAULT_COLOR_LIGHT } } },
  },
  makePreset('graphite', 'Graphite', '#9aa4b2', '#b0b8c4', '#4b5563', '#374151', {
    bgMain: '#121417',
    bgSidebar: '#1a1d22',
    accent: '#9aa4b2',
  }),
  makePreset('midnight', 'Midnight', '#7aa2ff', '#9bb6ff', '#3b6ef5', '#2f5ad6', {
    bgMain: '#0b1020',
    bgSidebar: '#11182b',
    bgPanel: '#162038',
  }),
  makePreset('ocean', 'Ocean', '#3dbbce', '#5fd0df', '#0f8a9a', '#0c7381', {
    bgMain: '#0d1518',
    bgSidebar: '#132022',
  }),
  makePreset('forest', 'Forest', '#6fbf8a', '#88cfa0', '#2f8f57', '#267448', {
    bgMain: '#101612',
    bgSidebar: '#16201a',
  }),
  makePreset('rose', 'Rose', '#e089a8', '#ebabbf', '#c45d7e', '#a84c6a', {
    bgMain: '#161014',
    bgSidebar: '#20181d',
  }),
  makePreset('amber', 'Amber', '#e0b15a', '#ebc57a', '#c8891f', '#a87012', {
    bgMain: '#16130e',
    bgSidebar: '#1f1a14',
  }),
  makePreset('violet', 'Violet', '#a78bfa', '#bba6fc', '#7c5cfc', '#6846e8', {
    bgMain: '#120f1a',
    bgSidebar: '#1a1526',
  }),
  {
    id: 'high-contrast',
    name: 'High Contrast',
    appearance: {
      ...DEFAULT_APPEARANCE,
      colors: {
        dark: {
          ...DEFAULT_COLOR_DARK,
          bgMain: '#000000',
          bgSidebar: '#0a0a0a',
          bgPanel: '#141414',
          textPrimary: '#ffffff',
          textSecondary: '#e0e0e0',
          textMuted: '#b0b0b0',
          accent: '#66ddff',
          accentHover: '#99e9ff',
          border: 'rgba(255,255,255,0.35)',
          borderStrong: 'rgba(255,255,255,0.55)',
        },
        light: {
          ...DEFAULT_COLOR_LIGHT,
          bgMain: '#ffffff',
          bgSidebar: '#f0f0f0',
          bgPanel: '#ffffff',
          textPrimary: '#000000',
          textSecondary: '#222222',
          textMuted: '#444444',
          accent: '#0050c8',
          accentHover: '#003a94',
          border: 'rgba(0,0,0,0.35)',
          borderStrong: 'rgba(0,0,0,0.55)',
        },
      },
      layout: {
        ...DEFAULT_APPEARANCE.layout,
        borderWidth: 2,
      },
    },
  },
] as const;

export type BuiltinPresetId = (typeof BUILTIN_PRESETS)[number]['id'];
