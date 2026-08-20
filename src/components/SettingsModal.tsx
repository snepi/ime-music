import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useAppearanceSettings } from './settings/useAppearanceSettings';
import { GeneralPanel } from './settings/appearance/GeneralPanel';
import { ColorsPanel } from './settings/appearance/ColorsPanel';
import { LayoutPanel } from './settings/appearance/LayoutPanel';
import { PlayerPanel } from './settings/appearance/PlayerPanel';
import { LibraryPanel } from './settings/appearance/LibraryPanel';
import { NavigationPanel } from './settings/appearance/NavigationPanel';
import { CoversPanel } from './settings/appearance/CoversPanel';
import { AnimationsPanel } from './settings/appearance/AnimationsPanel';
import { ExtrasPanel } from './settings/appearance/ExtrasPanel';
import { PresetsPanel } from './settings/appearance/PresetsPanel';
import { ThemeEditorPanel } from './settings/appearance/ThemeEditorPanel';
import { WallpaperPanel } from './settings/appearance/WallpaperPanel';
import { DynamicColorsPanel } from './settings/appearance/DynamicColorsPanel';
import { ComponentsPanel } from './settings/appearance/ComponentsPanel';
import { HotkeysPanel } from './settings/HotkeysPanel';
import { ToolsPanel } from './settings/ToolsPanel';
import { PlaybackPanel } from './settings/PlaybackPanel';
import { DEFAULT_APPEARANCE, DEFAULT_HOTKEYS } from '../appearance/schema';
import { useToast } from './ui/Toast';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onOpenPhoneSync?: () => void;
}

type TabId = 'appearance' | 'behavior' | 'hotkeys' | 'tools';
type AppearanceSection =
  | 'general'
  | 'theme-editor'
  | 'colors'
  | 'wallpaper'
  | 'dynamic'
  | 'components'
  | 'layout'
  | 'player'
  | 'library'
  | 'navigation'
  | 'covers'
  | 'animations'
  | 'presets'
  | 'extras';

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: 'appearance', labelKey: 'settings.appearance' },
  { id: 'behavior', labelKey: 'settings.behavior' },
  { id: 'hotkeys', labelKey: 'settings.hotkeys' },
  { id: 'tools', labelKey: 'settings.tools' },
];

const APPEARANCE_SECTIONS: { id: AppearanceSection; labelKey: MessageKey }[] = [
  { id: 'general', labelKey: 'settings.general' },
  { id: 'theme-editor', labelKey: 'settings.themeEditor' },
  { id: 'colors', labelKey: 'settings.colors' },
  { id: 'wallpaper', labelKey: 'settings.wallpaper' },
  { id: 'dynamic', labelKey: 'settings.dynamic' },
  { id: 'components', labelKey: 'settings.components' },
  { id: 'layout', labelKey: 'settings.layout' },
  { id: 'player', labelKey: 'settings.player' },
  { id: 'library', labelKey: 'settings.library' },
  { id: 'navigation', labelKey: 'settings.navigation' },
  { id: 'covers', labelKey: 'settings.covers' },
  { id: 'animations', labelKey: 'settings.animations' },
  { id: 'presets', labelKey: 'settings.presets' },
  { id: 'extras', labelKey: 'settings.extras' },
];

export function SettingsModal({ open, onClose, onOpenPhoneSync }: SettingsModalProps) {
  const {
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
  } = useAppearanceSettings();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('appearance');
  const [section, setSection] = useState<AppearanceSection>('general');

  useEffect(() => {
    if (!open) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open]);

  const onPatch = (patch: Parameters<typeof patchAppearance>[0], replace?: boolean) => {
    void patchAppearance(patch, replace).catch((err) => {
      showToast(err instanceof Error ? err.message : t('settings.saveFailed'), 'error');
    });
  };

  return (
    <Modal
      open={open}
      title={t('settings.title')}
      onClose={onClose}
      className="settings-modal-wide"
      width={section === 'theme-editor' ? 1100 : 920}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('settings.close')}
        </Button>
      }
    >
      <div className="settings-shell">
        <nav className="settings-tabs" aria-label={t('settings.tabsAria')}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-tab${tab === item.id ? ' active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        {tab === 'appearance' ? (
          <div className="settings-appearance-layout">
            <aside className="settings-subnav">
              {APPEARANCE_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`settings-subnav-item${section === s.id ? ' active' : ''}`}
                  onClick={() => setSection(s.id)}
                >
                  {t(s.labelKey)}
                </button>
              ))}
            </aside>
            <div className="settings-panel-scroll">
              {section === 'general' && (
                <GeneralPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'theme-editor' && (
                <ThemeEditorPanel
                  appearance={appearance}
                  activeThemeId={activeThemeId}
                  uiThemes={uiThemes}
                  wallpapers={wallpapers}
                  liveApply={liveApply}
                  onLiveApplyChange={setLiveApply}
                  onCommitAppearance={patchAppearance}
                  onSettingsUpdate={applySettingsSlice}
                />
              )}
              {section === 'colors' && (
                <ColorsPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'wallpaper' && (
                <WallpaperPanel
                  appearance={appearance}
                  wallpapers={wallpapers}
                  onChange={(p) => onPatch(p)}
                  onWallpapersChange={(next) => {
                    void applySettingsSlice({ wallpapers: next });
                  }}
                />
              )}
              {section === 'dynamic' && (
                <DynamicColorsPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'components' && (
                <ComponentsPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'layout' && (
                <LayoutPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'player' && (
                <PlayerPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'library' && (
                <LibraryPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'navigation' && (
                <NavigationPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'covers' && (
                <CoversPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'animations' && (
                <AnimationsPanel appearance={appearance} onChange={(p) => onPatch(p)} />
              )}
              {section === 'presets' && (
                <PresetsPanel
                  appearance={appearance}
                  hotkeys={hotkeys}
                  uiPresets={uiPresets}
                  onApplyAppearance={(a, replace) => patchAppearance(a, replace)}
                  onApplyHotkeys={patchHotkeys}
                  onSetPresets={setUiPresets}
                />
              )}
              {section === 'extras' && (
                <ExtrasPanel
                  onResetAll={async () => {
                    await patchAppearance(DEFAULT_APPEARANCE, true);
                    await patchHotkeys({ ...DEFAULT_HOTKEYS });
                    showToast(t('settings.appearanceReset'), 'success');
                  }}
                />
              )}
            </div>
          </div>
        ) : null}

        {tab === 'behavior' ? (
          <div className="settings-panel-scroll">
            <NavigationPanel appearance={appearance} onChange={(p) => onPatch(p)} />
            <PlaybackPanel />
          </div>
        ) : null}

        {tab === 'hotkeys' ? (
          <div className="settings-panel-scroll">
            <HotkeysPanel
              hotkeys={hotkeys}
              onChange={async (next) => {
                await patchHotkeys(next);
              }}
            />
          </div>
        ) : null}

        {tab === 'tools' ? (
          <div className="settings-panel-scroll">
            <ToolsPanel
              onOpenPhoneSync={() => {
                onOpenPhoneSync?.();
              }}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
