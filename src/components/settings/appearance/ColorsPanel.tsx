import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ColorField } from '../../ui/ColorField';
import { Select } from '../../ui/Select';
import { SectionReset } from './SectionReset';
import {
  DEFAULT_COLOR_DARK,
  DEFAULT_COLOR_LIGHT,
  type AppearanceSettings,
  type ColorTokens,
} from '../../../appearance/schema';
import { resolveThemeMode } from '../../../utils/applyAppearance';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/messages';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

const COLOR_LABEL_KEYS: { key: keyof ColorTokens; labelKey: MessageKey }[] = [
  { key: 'accent', labelKey: 'settings.colors.accent' },
  { key: 'accentHover', labelKey: 'settings.colors.accentHover' },
  { key: 'button', labelKey: 'settings.colors.button' },
  { key: 'progress', labelKey: 'settings.colors.progress' },
  { key: 'selection', labelKey: 'settings.colors.selection' },
  { key: 'like', labelKey: 'settings.colors.like' },
  { key: 'danger', labelKey: 'settings.colors.danger' },
  { key: 'warning', labelKey: 'settings.colors.warning' },
  { key: 'success', labelKey: 'settings.colors.success' },
  { key: 'bgMain', labelKey: 'settings.colors.bgMain' },
  { key: 'bgSidebar', labelKey: 'settings.colors.bgSidebar' },
  { key: 'bgPanel', labelKey: 'settings.colors.bgPanel' },
  { key: 'bgElevated', labelKey: 'settings.colors.bgElevated' },
  { key: 'bgHover', labelKey: 'settings.colors.bgHover' },
  { key: 'bgActive', labelKey: 'settings.colors.bgActive' },
  { key: 'border', labelKey: 'settings.colors.border' },
  { key: 'borderStrong', labelKey: 'settings.colors.borderStrong' },
  { key: 'textPrimary', labelKey: 'settings.colors.textPrimary' },
  { key: 'textSecondary', labelKey: 'settings.colors.textSecondary' },
  { key: 'textMuted', labelKey: 'settings.colors.textMuted' },
];

export function ColorsPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const resolved = resolveThemeMode(appearance.theme);
  const [editMode, setEditMode] = useState<'dark' | 'light'>(resolved);
  const colors = appearance.colors[editMode];

  const previewStyle = useMemo(
    () =>
      ({
        background: colors.bgMain,
        color: colors.textPrimary,
        borderColor: colors.border,
        ['--accent' as string]: colors.accent,
      }) as CSSProperties,
    [colors],
  );

  const setColor = (key: keyof ColorTokens, value: string) => {
    onChange({
      colors: {
        ...appearance.colors,
        [editMode]: { ...colors, [key]: value },
      },
    });
  };

  const reset = () => {
    onChange({
      colors: {
        ...appearance.colors,
        [editMode]: editMode === 'light' ? { ...DEFAULT_COLOR_LIGHT } : { ...DEFAULT_COLOR_DARK },
      },
    });
  };

  return (
    <div className="settings-panel">
      <SectionReset onReset={reset} label={t('settings.colors.reset')} />
      <div className="settings-section">
        <Select
          id="color-edit-mode"
          label={t('settings.colors.editPalette')}
          value={editMode}
          onChange={(v) => setEditMode(v as 'dark' | 'light')}
          options={[
            { value: 'dark', label: t('settings.theme.dark') },
            { value: 'light', label: t('settings.theme.light') },
          ]}
        />
      </div>

      <div className="color-preview" style={previewStyle}>
        <div className="color-preview-sidebar" style={{ background: colors.bgSidebar }}>
          {t('settings.colors.previewSidebar')}
        </div>
        <div className="color-preview-main">
          <div className="color-preview-card" style={{ background: colors.bgPanel, borderColor: colors.border }}>
            <strong style={{ color: colors.textPrimary }}>{t('settings.colors.previewTitle')}</strong>
            <span style={{ color: colors.textSecondary }}>{t('settings.colors.previewSecondary')}</span>
            <div className="color-preview-bar" style={{ background: colors.progress }} />
            <button type="button" className="color-preview-btn" style={{ background: colors.button, color: '#fff' }}>
              {t('settings.colors.previewButton')}
            </button>
          </div>
        </div>
      </div>

      <div className="color-grid">
        {COLOR_LABEL_KEYS.map((item) => (
          <ColorField
            key={item.key}
            id={`color-${editMode}-${item.key}`}
            label={t(item.labelKey)}
            value={colors[item.key]}
            onChange={(v) => setColor(item.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
