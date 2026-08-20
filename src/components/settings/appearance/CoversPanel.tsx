import { Slider } from '../../ui/Slider';
import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { ColorField } from '../../ui/ColorField';
import { SectionReset } from './SectionReset';
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type CoverObjectFit,
} from '../../../appearance/schema';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

export function CoversPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const covers = appearance.covers;
  const set = (partial: Partial<typeof covers>) => onChange({ covers: { ...covers, ...partial } });

  return (
    <div className="settings-panel">
      <SectionReset onReset={() => onChange({ covers: { ...DEFAULT_APPEARANCE.covers } })} />
      <div className="settings-section">
        <Toggle
          checked={covers.show}
          onChange={(show) => set({ show })}
          label={t('settings.covers.show')}
        />
      </div>
      <div className="settings-section">
        <Select
          id="cover-fit"
          label={t('settings.covers.objectFit')}
          value={covers.objectFit}
          onChange={(v) => set({ objectFit: v as CoverObjectFit })}
          options={[
            { value: 'cover', label: t('settings.covers.objectFit.cover') },
            { value: 'contain', label: t('settings.covers.objectFit.contain') },
            { value: 'fill', label: t('settings.covers.objectFit.fill') },
          ]}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="cover-radius"
          label={t('settings.covers.radius')}
          value={covers.radius}
          min={0}
          max={24}
          unit="px"
          onChange={(radius) => set({ radius })}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={covers.blurBackground}
          onChange={(blurBackground) => set({ blurBackground })}
          label={t('settings.covers.blurBackground')}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="blur-amount"
          label={t('settings.covers.blurAmount')}
          value={covers.blurAmount}
          min={0}
          max={60}
          unit="px"
          onChange={(blurAmount) => set({ blurAmount })}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="blur-dim"
          label={t('settings.covers.dimAmount')}
          value={Math.round(covers.dimAmount * 100)}
          min={0}
          max={90}
          unit="%"
          onChange={(v) => set({ dimAmount: v / 100 })}
        />
      </div>
      <div className="settings-section">
        <ColorField
          id="cover-fallback"
          label={t('settings.covers.fallbackColor')}
          value={covers.fallbackColor}
          onChange={(fallbackColor) => set({ fallbackColor })}
        />
      </div>
    </div>
  );
}
