import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type StartViewKind,
} from '../../../appearance/schema';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/messages';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

const BEHAVIOR_TOGGLES = [
  ['restoreLastPage', 'settings.behavior.restoreLastPage'],
  ['restoreTrack', 'settings.behavior.restoreTrack'],
  ['restoreQueue', 'settings.behavior.restoreQueue'],
  ['focusSearchOnOpen', 'settings.behavior.focusSearchOnOpen'],
  ['confirmDelete', 'settings.behavior.confirmDelete'],
  ['confirmClearQueue', 'settings.behavior.confirmClearQueue'],
  ['spaceTogglesPlayback', 'settings.behavior.spaceTogglesPlayback'],
  ['autoResumeOnLaunch', 'settings.behavior.autoResumeOnLaunch'],
] as const satisfies readonly [keyof AppearanceSettings['behavior'], MessageKey][];

export function NavigationPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const behavior = appearance.behavior;
  const set = (partial: Partial<typeof behavior>) =>
    onChange({ behavior: { ...behavior, ...partial } });

  return (
    <div className="settings-panel">
      <SectionReset onReset={() => onChange({ behavior: { ...DEFAULT_APPEARANCE.behavior } })} />
      <div className="settings-section">
        <Select
          id="start-view"
          label={t('settings.behavior.startView')}
          value={behavior.startView}
          onChange={(v) => set({ startView: v as StartViewKind })}
          options={[
            { value: 'home', label: t('nav.home') },
            { value: 'all', label: t('nav.all') },
            { value: 'liked', label: t('nav.liked') },
            { value: 'last', label: t('settings.behavior.startView.last') },
          ]}
        />
      </div>
      {BEHAVIOR_TOGGLES.map(([key, labelKey]) => (
        <div className="settings-section" key={key}>
          <Toggle checked={behavior[key]} onChange={(v) => set({ [key]: v })} label={t(labelKey)} />
        </div>
      ))}
    </div>
  );
}
