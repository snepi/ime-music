import { Slider } from '../../ui/Slider';
import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type PlayerVariant,
} from '../../../appearance/schema';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/messages';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

const PLAYER_TOGGLES = [
  ['showArtwork', 'settings.player.showArtwork'],
  ['showTitle', 'settings.player.showTitle'],
  ['showArtist', 'settings.player.showArtist'],
  ['showPrevNext', 'settings.player.showPrevNext'],
  ['showPlayPause', 'settings.player.showPlayPause'],
  ['showVolume', 'settings.player.showVolume'],
  ['showProgress', 'settings.player.showProgress'],
  ['showTime', 'settings.player.showTime'],
  ['showRemainingTime', 'settings.player.showRemainingTime'],
  ['showSeconds', 'settings.player.showSeconds'],
  ['showQueueButton', 'settings.player.showQueueButton'],
  ['showLike', 'settings.player.showLike'],
] as const satisfies readonly [keyof AppearanceSettings['player'], MessageKey][];

export function PlayerPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const player = appearance.player;
  const set = (partial: Partial<typeof player>) => onChange({ player: { ...player, ...partial } });

  return (
    <div className="settings-panel">
      <SectionReset onReset={() => onChange({ player: { ...DEFAULT_APPEARANCE.player } })} />
      <div className="settings-section">
        <Select
          id="player-variant"
          label={t('settings.player.variant')}
          value={player.variant}
          onChange={(v) => set({ variant: v as PlayerVariant })}
          options={[
            { value: 'compact', label: t('settings.player.variant.compact') },
            { value: 'standard', label: t('settings.player.variant.standard') },
            { value: 'expanded', label: t('settings.player.variant.expanded') },
          ]}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="player-cover"
          label={t('settings.player.coverSize')}
          value={player.coverSize}
          min={40}
          max={96}
          unit="px"
          onChange={(coverSize) => set({ coverSize })}
        />
      </div>
      {PLAYER_TOGGLES.map(([key, labelKey]) => (
        <div className="settings-section" key={key}>
          <Toggle checked={player[key]} onChange={(v) => set({ [key]: v })} label={t(labelKey)} />
        </div>
      ))}
    </div>
  );
}
