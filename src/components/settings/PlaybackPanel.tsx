import { usePlayer } from '../../store/playerStore';
import type { EqPreset, PlaybackSettings, RepeatMode } from '../../types';
import { DEFAULT_PLAYBACK, EQ_PRESETS } from '../../utils/playbackSettings';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { useI18n } from '../../i18n';

function EqSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="eq-slider">
      <span className="field-label">
        {label}: {value > 0 ? `+${value}` : value} dB
      </span>
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function PlaybackPanel() {
  const { state, dispatch } = usePlayer();
  const { t } = useI18n();
  const playback = { ...DEFAULT_PLAYBACK, ...(state.settings.playback || {}) };

  const patch = async (partial: Partial<PlaybackSettings>) => {
    const settings = await window.imeMusic.updateSettings({
      playback: { ...playback, ...partial },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  };

  const applyPreset = async (preset: EqPreset) => {
    if (preset === 'custom') {
      await patch({ eqPreset: 'custom' });
      return;
    }
    const bands = EQ_PRESETS[preset];
    await patch({
      eqPreset: preset,
      eqEnabled: true,
      eqBass: bands.bass,
      eqMid: bands.mid,
      eqTreble: bands.treble,
    });
  };

  return (
    <div className="settings-panel" style={{ marginTop: 16 }}>
      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('playback.title')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('playback.hint')}
        </p>
        <div className="settings-toggles">
          <Toggle
            checked={playback.shuffle}
            onChange={(v) => void patch({ shuffle: v })}
            label={t('playback.shuffle')}
          />
          <Select
            id="repeat-mode"
            label={t('playback.repeat')}
            value={playback.repeat}
            onChange={(v) => void patch({ repeat: v as RepeatMode })}
            options={[
              { value: 'off', label: t('playback.repeatOff') },
              { value: 'one', label: t('playback.repeatOne') },
              { value: 'all', label: t('playback.repeatAll') },
            ]}
          />
          <Toggle
            checked={playback.normalizeVolume}
            onChange={(v) => void patch({ normalizeVolume: v })}
            label={t('playback.normalize')}
          />
          <label className="eq-slider">
            <span className="field-label">
              {t('playback.crossfade')}:{' '}
              {playback.crossfadeSeconds > 0
                ? `${playback.crossfadeSeconds} ${t('playback.sec')}`
                : t('playback.off')}
            </span>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={playback.crossfadeSeconds}
              onChange={(e) => void patch({ crossfadeSeconds: Number(e.target.value) })}
            />
          </label>
          <Toggle
            checked={playback.gaplessEnabled}
            onChange={(v) => void patch({ gaplessEnabled: v })}
            label={t('playback.gapless')}
          />
          <Toggle
            checked={playback.eqEnabled}
            onChange={(v) => void patch({ eqEnabled: v })}
            label={t('playback.eq')}
          />
          {playback.eqEnabled ? (
            <>
              <Select
                id="eq-preset"
                label={t('playback.eqPreset')}
                value={playback.eqPreset}
                onChange={(v) => void applyPreset(v as EqPreset)}
                options={[
                  { value: 'flat', label: EQ_PRESETS.flat.label },
                  { value: 'bassBoost', label: EQ_PRESETS.bassBoost.label },
                  { value: 'vocal', label: EQ_PRESETS.vocal.label },
                  { value: 'custom', label: t('playback.eqCustom') },
                ]}
              />
              <div className="eq-sliders">
                <EqSlider
                  label={t('playback.eqBass')}
                  value={playback.eqBass}
                  onChange={(v) => void patch({ eqBass: v, eqPreset: 'custom' })}
                />
                <EqSlider
                  label={t('playback.eqMid')}
                  value={playback.eqMid}
                  onChange={(v) => void patch({ eqMid: v, eqPreset: 'custom' })}
                />
                <EqSlider
                  label={t('playback.eqTreble')}
                  value={playback.eqTreble}
                  onChange={(v) => void patch({ eqTreble: v, eqPreset: 'custom' })}
                />
              </div>
            </>
          ) : null}
          <Toggle
            checked={playback.closeToTray}
            onChange={(v) => void patch({ closeToTray: v })}
            label={t('playback.tray')}
          />
        </div>
      </div>
    </div>
  );
}
