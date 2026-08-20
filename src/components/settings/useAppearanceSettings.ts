import { useCallback, useRef, useState } from 'react';
import { usePlayer } from '../../store/playerStore';
import { applyAppearance, getEffectiveAppearance } from '../../utils/applyAppearance';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_HOTKEYS,
  type AppearanceSettings,
  type HotkeyMap,
  type UiPreset,
  type UiTheme,
  type WallpaperAsset,
} from '../../appearance/schema';

function mergeAppearance(
  current: AppearanceSettings,
  patch: Partial<AppearanceSettings>,
): AppearanceSettings {
  return getEffectiveAppearance({
    ...current,
    ...patch,
    colors: {
      dark: { ...current.colors.dark, ...patch.colors?.dark },
      light: { ...current.colors.light, ...patch.colors?.light },
    },
    layout: { ...current.layout, ...patch.layout },
    library: { ...current.library, ...patch.library },
    player: { ...current.player, ...patch.player },
    covers: { ...current.covers, ...patch.covers },
    animations: { ...current.animations, ...patch.animations },
    behavior: { ...current.behavior, ...patch.behavior },
    wallpaper: { ...current.wallpaper, ...patch.wallpaper },
    layers: { ...current.layers, ...patch.layers },
    dynamicColors: {
      ...current.dynamicColors,
      ...patch.dynamicColors,
      allowedKeys: patch.dynamicColors?.allowedKeys || current.dynamicColors.allowedKeys,
    },
    components: {
      pages: { ...current.components.pages, ...patch.components?.pages },
      sidebar: { ...current.components.sidebar, ...patch.components?.sidebar },
      contextMenu: {
        ...current.components.contextMenu,
        ...patch.components?.contextMenu,
      },
    },
  });
}

export function useAppearanceSettings() {
  const { state, dispatch } = usePlayer();
  const stored = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE);
  const [optimistic, setOptimistic] = useState<AppearanceSettings | null>(null);
  const optimisticRef = useRef<AppearanceSettings | null>(null);
  const seq = useRef(0);

  const appearance = optimistic ?? stored;
  const hotkeys = state.settings.hotkeys || DEFAULT_HOTKEYS;
  const uiPresets = state.settings.uiPresets || [];
  const uiThemes = state.settings.uiThemes || [];
  const activeThemeId = state.settings.activeThemeId || 'default';
  const wallpapers = state.settings.wallpapers || [];
  const [liveApply, setLiveApply] = useState(true);

  const patchAppearance = useCallback(
    async (patch: Partial<AppearanceSettings> | AppearanceSettings, replace = false) => {
      const current = optimisticRef.current ?? getEffectiveAppearance(stored);
      const nextAppearance = replace
        ? getEffectiveAppearance(patch as AppearanceSettings)
        : mergeAppearance(current, patch as Partial<AppearanceSettings>);

      optimisticRef.current = nextAppearance;
      setOptimistic(nextAppearance);
      applyAppearance(nextAppearance);

      const my = ++seq.current;
      const settings = await window.imeMusic.updateSettings({
        appearance: nextAppearance,
        theme: nextAppearance.theme,
      });
      if (my !== seq.current) return settings;
      dispatch({ type: 'UPDATE_SETTINGS', settings });
      optimisticRef.current = null;
      setOptimistic(null);
      return settings;
    },
    [stored, dispatch],
  );

  const patchHotkeys = useCallback(
    async (next: HotkeyMap) => {
      const settings = await window.imeMusic.updateSettings({ hotkeys: next });
      dispatch({ type: 'UPDATE_SETTINGS', settings });
      return settings;
    },
    [dispatch],
  );

  const setUiPresets = useCallback(
    async (presets: UiPreset[]) => {
      const settings = await window.imeMusic.updateSettings({ uiPresets: presets });
      dispatch({ type: 'UPDATE_SETTINGS', settings });
      return settings;
    },
    [dispatch],
  );

  const applySettingsSlice = useCallback(
    async (slice: {
      appearance?: AppearanceSettings;
      uiThemes?: UiTheme[];
      activeThemeId?: string;
      wallpapers?: WallpaperAsset[];
    }) => {
      if (slice.appearance) {
        const next = getEffectiveAppearance(slice.appearance);
        optimisticRef.current = next;
        setOptimistic(next);
        applyAppearance(next);
      }
      const settings = await window.imeMusic.updateSettings(slice);
      dispatch({ type: 'UPDATE_SETTINGS', settings });
      optimisticRef.current = null;
      setOptimistic(null);
      return settings;
    },
    [dispatch],
  );

  return {
    appearance,
    hotkeys,
    uiPresets,
    uiThemes,
    activeThemeId,
    wallpapers,
    liveApply,
    setLiveApply,
    patchAppearance,
    patchHotkeys,
    setUiPresets,
    applySettingsSlice,
  };
}
