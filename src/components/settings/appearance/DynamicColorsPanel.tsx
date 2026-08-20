import { useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import { useToast } from '../../ui/Toast';
import { usePlayer } from '../../../store/playerStore';
import {
  DEFAULT_DYNAMIC_COLORS,
  type AppearanceSettings,
  type ColorTokens,
  type DynamicColorLevel,
} from '../../../appearance/schema';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

export function DynamicColorsPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const { state } = usePlayer();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const lastHash = useRef<string | null>(null);
  const dc = appearance.dynamicColors;

  const set = (partial: Partial<typeof dc>) =>
    onChange({ dynamicColors: { ...dc, ...partial } });

  const analyze = async (imagePath: string | null | undefined) => {
    if (!imagePath) {
      showToast(t('settings.dynamic.noImage'), 'info');
      set({ cachedPalette: null, cacheKey: null });
      return;
    }
    setBusy(true);
    try {
      const result = await window.imeMusic.analyzeImagePalette(imagePath);
      if (!result.ok || !result.palette) {
        showToast(result.error || t('settings.dynamic.paletteFailed'), 'error');
        return;
      }
      if (result.cacheKey && result.cacheKey === lastHash.current && result.cached) {
        showToast(t('settings.dynamic.paletteCached'), 'info');
      }
      lastHash.current = result.cacheKey || null;
      set({
        enabled: true,
        cachedPalette: result.palette as Partial<ColorTokens>,
        cacheKey: result.cacheKey || null,
      });
      showToast(t(result.cached ? 'settings.dynamic.paletteCached' : 'settings.dynamic.paletteUpdated'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const fromCurrent = async () => {
    const song = state.songs.find((s) => s.id === state.currentSongId);
    await analyze(song?.coverPath || null);
  };

  const fromSelected = async () => {
    await fromCurrent();
  };

  const fromCustom = async () => {
    const path = await window.imeMusic.pickImage?.();
    if (!path) return;
    // Copy into wallpaper flow would be better; analyze path directly if under userData
    const chosen = await window.imeMusic.chooseWallpaper();
    if (chosen.ok && chosen.asset?.filePath) {
      await analyze(chosen.asset.filePath);
    } else {
      showToast(t('settings.dynamic.chooseThroughWallpaper'), 'info');
    }
  };

  return (
    <div className="settings-panel">
      <SectionReset
        label={t('settings.dynamic.reset')}
        onReset={() =>
          onChange({
            dynamicColors: {
              ...DEFAULT_DYNAMIC_COLORS,
              allowedKeys: [...DEFAULT_DYNAMIC_COLORS.allowedKeys],
            },
          })
        }
      />
      <Toggle
        checked={dc.enabled}
        onChange={(enabled) => set({ enabled })}
        label={t('settings.dynamic.fromCover')}
      />
      <Select
        id="dc-level"
        label={t('settings.dynamic.level')}
        value={dc.level}
        onChange={(v) => set({ level: v as DynamicColorLevel })}
        options={[
          { value: 'off', label: t('settings.dynamic.level.off') },
          { value: 'accent', label: t('settings.dynamic.level.accent') },
          { value: 'accentProgress', label: t('settings.dynamic.level.accentProgress') },
          { value: 'accentBg', label: t('settings.dynamic.level.accentBg') },
          { value: 'full', label: t('settings.dynamic.level.full') },
        ]}
      />
      <Slider
        id="dc-strength"
        label={t('settings.dynamic.strength')}
        value={Math.round(dc.strength * 100)}
        min={0}
        max={100}
        unit="%"
        onChange={(v) => set({ strength: v / 100 })}
      />
      <Toggle
        checked={dc.autoUpdate}
        onChange={(autoUpdate) => set({ autoUpdate })}
        label={t('settings.dynamic.autoUpdate')}
      />
      <div className="settings-actions-row">
        <Button variant="secondary" disabled={busy} onClick={() => void fromCurrent()}>
          {t('settings.dynamic.fromCurrentCover')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void fromSelected()}>
          {t('settings.dynamic.fromSelectedTrack')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void fromCustom()}>
          {t('settings.dynamic.fromImage')}
        </Button>
      </div>
      {dc.cachedPalette ? (
        <div className="dc-swatches">
          {Object.entries(dc.cachedPalette).map(([k, v]) => (
            <div key={k} className="dc-swatch" title={k} style={{ background: v }} />
          ))}
        </div>
      ) : (
        <p className="field-hint">{t('settings.dynamic.noCoverHint')}</p>
      )}
    </div>
  );
}
