import { useState } from 'react';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { SectionReset } from './SectionReset';
import { BUILTIN_PRESETS } from '../../../appearance/presets';
import { DEFAULT_APPEARANCE, DEFAULT_HOTKEYS } from '../../../appearance/schema';
import { buildPresetExport, parsePresetImport } from '../../../appearance/validatePreset';
import type { AppearanceSettings, HotkeyMap, UiPreset } from '../../../types';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  hotkeys: HotkeyMap;
  uiPresets: UiPreset[];
  onApplyAppearance: (appearance: AppearanceSettings, replace?: boolean) => Promise<unknown>;
  onApplyHotkeys?: (hotkeys: HotkeyMap) => Promise<unknown>;
  onSetPresets: (presets: UiPreset[]) => Promise<unknown>;
}

export function PresetsPanel({
  appearance,
  hotkeys,
  uiPresets,
  onApplyAppearance,
  onApplyHotkeys,
  onSetPresets,
}: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [name, setName] = useState('');

  const saveCurrent = async () => {
    const trimmed = name.trim() || t('settings.presets.defaultName', { n: uiPresets.length + 1 });
    const preset: UiPreset = {
      id: crypto.randomUUID(),
      name: trimmed,
      appearance,
      hotkeys,
      createdAt: Date.now(),
    };
    await onSetPresets([...uiPresets, preset]);
    setName('');
    showToast(t('settings.presets.saved'), 'success');
  };

  const removePreset = async (id: string) => {
    await onSetPresets(uiPresets.filter((p) => p.id !== id));
    showToast(t('settings.presets.removed'), 'info');
  };

  const exportPreset = async (preset: { name: string; appearance: AppearanceSettings; hotkeys?: HotkeyMap }) => {
    const payload = buildPresetExport(preset.name, preset.appearance, preset.hotkeys);
    const result = await window.imeMusic.exportUiPreset?.(payload);
    if (result?.ok) showToast(t('settings.presets.exported'), 'success');
    else showToast(result?.error || t('settings.presets.exportCancelled'), 'error');
  };

  const importPreset = async () => {
    const result = await window.imeMusic.importUiPreset?.();
    if (!result?.ok || !result.data) {
      if (result?.error) showToast(result.error, 'error');
      return;
    }
    const parsed = parsePresetImport(result.data);
    if (!parsed.ok) {
      showToast(parsed.error, 'error');
      return;
    }
    const preset: UiPreset = {
      id: crypto.randomUUID(),
      name: parsed.preset.name,
      appearance: parsed.preset.appearance,
      hotkeys: parsed.preset.hotkeys,
      createdAt: Date.now(),
    };
    await onSetPresets([...uiPresets, preset]);
    await onApplyAppearance(preset.appearance, true);
    if (preset.hotkeys && onApplyHotkeys) await onApplyHotkeys(preset.hotkeys);
    showToast(t('settings.presets.importedApplied'), 'success');
  };

  return (
    <div className="settings-panel">
      <SectionReset
        label={t('settings.presets.resetDefault')}
        onReset={() => {
          void onApplyAppearance({ ...DEFAULT_APPEARANCE }, true);
          if (onApplyHotkeys) void onApplyHotkeys({ ...DEFAULT_HOTKEYS });
          showToast(t('settings.presets.defaultApplied'), 'info');
        }}
      />
      <div className="settings-section settings-actions-row">
        <Button variant="secondary" onClick={() => void importPreset()}>
          {t('settings.presets.importJson')}
        </Button>
      </div>

      <div className="field-label">{t('settings.presets.builtin')}</div>
      <div className="preset-grid">
        {BUILTIN_PRESETS.map((preset) => (
          <div key={preset.id} className="preset-card">
            <div
              className="preset-swatches"
              style={{
                background: `linear-gradient(135deg, ${preset.appearance.colors.dark.bgMain}, ${preset.appearance.colors.dark.accent})`,
              }}
            />
            <strong>{preset.name}</strong>
            <Button
              variant="secondary"
              onClick={() => void onApplyAppearance(preset.appearance, true)}
            >
              {t('settings.presets.apply')}
            </Button>
          </div>
        ))}
      </div>

      <div className="settings-section">
        <div className="field-label">{t('settings.presets.saveCurrent')}</div>
        <div className="field-row">
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.presets.namePlaceholder')}
          />
          <Button variant="primary" onClick={() => void saveCurrent()}>
            {t('common.save')}
          </Button>
        </div>
      </div>

      {uiPresets.length > 0 ? (
        <>
          <div className="field-label">{t('settings.presets.myPresets')}</div>
          <ul className="user-preset-list">
            {uiPresets.map((preset) => (
              <li key={preset.id} className="user-preset-item">
                <span>{preset.name}</span>
                <div className="user-preset-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void onApplyAppearance(preset.appearance, true);
                      if (preset.hotkeys && onApplyHotkeys) void onApplyHotkeys(preset.hotkeys);
                    }}
                  >
                    {t('settings.presets.apply')}
                  </Button>
                  <Button variant="ghost" onClick={() => void exportPreset(preset)}>
                    {t('settings.presets.export')}
                  </Button>
                  <Button variant="danger" onClick={() => void removePreset(preset.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
