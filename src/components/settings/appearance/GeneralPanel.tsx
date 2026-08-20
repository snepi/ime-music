import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import { DEFAULT_APPEARANCE, type AppearanceSettings, type ThemeMode } from '../../../appearance/schema';
import { useI18n } from '../../../i18n';
import { LOCALES, type LocaleCode } from '../../../i18n/locales';
import { usePlayer } from '../../../store/playerStore';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

export function GeneralPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const { state, dispatch } = usePlayer();
  const locale = state.settings.locale || 'ru';

  const setLocale = async (next: string) => {
    const settings = await window.imeMusic.updateSettings({ locale: next });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  };

  return (
    <div className="settings-panel">
      <SectionReset
        onReset={() =>
          onChange({
            theme: DEFAULT_APPEARANCE.theme,
            layout: {
              ...appearance.layout,
              showSidebar: DEFAULT_APPEARANCE.layout.showSidebar,
              showQueue: DEFAULT_APPEARANCE.layout.showQueue,
              showSearch: DEFAULT_APPEARANCE.layout.showSearch,
            },
          })
        }
      />
      <div className="settings-section">
        <Select
          id="ui-locale"
          label={t('settings.language')}
          value={locale}
          onChange={(v) => void setLocale(v as LocaleCode)}
          options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
        />
      </div>
      <div className="settings-section">
        <Select
          id="theme-mode"
          label={t('settings.theme')}
          value={appearance.theme}
          onChange={(v) => onChange({ theme: v as ThemeMode })}
          options={[
            { value: 'dark', label: t('settings.theme.dark') },
            { value: 'light', label: t('settings.theme.light') },
            { value: 'system', label: t('settings.theme.system') },
          ]}
        />
      </div>
      <div className="settings-section">
        <Toggle
          id="show-sidebar"
          checked={appearance.layout.showSidebar}
          onChange={(showSidebar) => onChange({ layout: { ...appearance.layout, showSidebar } })}
          label={t('settings.showSidebar')}
        />
      </div>
      <div className="settings-section">
        <Toggle
          id="show-queue"
          checked={appearance.layout.showQueue}
          onChange={(showQueue) => onChange({ layout: { ...appearance.layout, showQueue } })}
          label={t('settings.showQueue')}
        />
      </div>
      <div className="settings-section">
        <Toggle
          id="show-search"
          checked={appearance.layout.showSearch}
          onChange={(showSearch) => onChange({ layout: { ...appearance.layout, showSearch } })}
          label={t('settings.showSearch')}
        />
      </div>
    </div>
  );
}
