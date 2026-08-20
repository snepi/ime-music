import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import { DEFAULT_APPEARANCE, type AppearanceSettings } from '../../../appearance/schema';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

export function AnimationsPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const animations = appearance.animations;
  const set = (partial: Partial<typeof animations>) =>
    onChange({ animations: { ...animations, ...partial } });

  return (
    <div className="settings-panel">
      <SectionReset onReset={() => onChange({ animations: { ...DEFAULT_APPEARANCE.animations } })} />
      <div className="settings-section">
        <Toggle
          checked={animations.enabled}
          onChange={(enabled) => set({ enabled })}
          label={t('settings.anim.enabled')}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="motion-speed"
          label={t('settings.anim.speed')}
          value={Math.round(animations.speed * 100)}
          min={50}
          max={200}
          step={10}
          unit="%"
          onChange={(v) => set({ speed: v / 100 })}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={animations.reducedMotion}
          onChange={(reducedMotion) => set({ reducedMotion })}
          label={t('settings.anim.reducedMotion')}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={animations.modalTransitions}
          onChange={(modalTransitions) => set({ modalTransitions })}
          label={t('settings.anim.modalTransitions')}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={animations.listAppear}
          onChange={(listAppear) => set({ listAppear })}
          label={t('settings.anim.listAppear')}
        />
      </div>
      <p className="field-hint">{t('settings.anim.systemHint')}</p>
    </div>
  );
}
