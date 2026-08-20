import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { Select } from '../../ui/Select';
import { SectionReset } from './SectionReset';
import { DEFAULT_COMPONENTS, type AppearanceSettings } from '../../../appearance/schema';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

export function ComponentsPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const c = appearance.components;
  const setPages = (partial: Partial<typeof c.pages>) =>
    onChange({ components: { ...c, pages: { ...c.pages, ...partial } } });
  const setSidebar = (partial: Partial<typeof c.sidebar>) =>
    onChange({ components: { ...c, sidebar: { ...c.sidebar, ...partial } } });
  const setMenu = (partial: Partial<typeof c.contextMenu>) =>
    onChange({ components: { ...c, contextMenu: { ...c.contextMenu, ...partial } } });

  return (
    <div className="settings-panel">
      <SectionReset
        onReset={() =>
          onChange({
            components: {
              pages: { ...DEFAULT_COMPONENTS.pages },
              sidebar: { ...DEFAULT_COMPONENTS.sidebar },
              contextMenu: {
                ...DEFAULT_COMPONENTS.contextMenu,
                hiddenActions: [],
                actionOrder: [...DEFAULT_COMPONENTS.contextMenu.actionOrder],
              },
            },
          })
        }
      />

      <h4 className="field-label">{t('settings.components.pages')}</h4>
      <Slider
        id="page-max"
        label={t('settings.components.contentMaxWidth')}
        value={c.pages.contentMaxWidth}
        min={720}
        max={2400}
        step={20}
        unit="px"
        onChange={(contentMaxWidth) => setPages({ contentMaxWidth })}
      />
      <Slider
        id="page-pad"
        label={t('settings.components.pagePadding')}
        value={c.pages.pagePadding}
        min={8}
        max={64}
        unit="px"
        onChange={(pagePadding) => setPages({ pagePadding })}
      />
      <Slider
        id="page-title"
        label={t('settings.components.titleSize')}
        value={c.pages.titleSize}
        min={18}
        max={48}
        unit="px"
        onChange={(titleSize) => setPages({ titleSize })}
      />
      <Slider
        id="page-sub"
        label={t('settings.components.subtitleSize')}
        value={c.pages.subtitleSize}
        min={11}
        max={22}
        unit="px"
        onChange={(subtitleSize) => setPages({ subtitleSize })}
      />
      <Toggle
        checked={c.pages.showTrackCount}
        onChange={(showTrackCount) => setPages({ showTrackCount })}
        label={t('settings.components.showTrackCount')}
      />
      <Toggle
        checked={c.pages.showSort}
        onChange={(showSort) => setPages({ showSort })}
        label={t('settings.components.showSort')}
      />
      <Select
        id="empty-style"
        label={t('settings.components.emptyState')}
        value={c.pages.emptyStateStyle}
        onChange={(v) => setPages({ emptyStateStyle: v as 'simple' | 'illustrated' })}
        options={[
          { value: 'simple', label: t('settings.components.emptyState.simple') },
          { value: 'illustrated', label: t('settings.components.emptyState.illustrated') },
        ]}
      />

      <h4 className="field-label">{t('settings.components.sidebar')}</h4>
      <Toggle
        checked={c.sidebar.showSectionLabels}
        onChange={(showSectionLabels) => setSidebar({ showSectionLabels })}
        label={t('settings.components.showSectionLabels')}
      />
      <Toggle
        checked={c.sidebar.showTrackCounts}
        onChange={(showTrackCounts) => setSidebar({ showTrackCounts })}
        label={t('settings.components.sidebarTrackCounts')}
      />
      <Toggle
        checked={c.sidebar.hideLiked}
        onChange={(hideLiked) => setSidebar({ hideLiked })}
        label={t('settings.components.hideLiked')}
      />
      <Toggle
        checked={c.sidebar.hidePlaylists}
        onChange={(hidePlaylists) => setSidebar({ hidePlaylists })}
        label={t('settings.components.hidePlaylists')}
      />
      <p className="field-hint">{t('settings.components.settingsAlwaysVisible')}</p>
      <Slider
        id="pl-cover"
        label={t('settings.components.playlistCovers')}
        value={c.sidebar.playlistCoverSize}
        min={20}
        max={48}
        unit="px"
        onChange={(playlistCoverSize) => setSidebar({ playlistCoverSize })}
      />

      <h4 className="field-label">{t('settings.components.contextMenu')}</h4>
      <Toggle
        checked={c.contextMenu.showOnRightClick}
        onChange={(showOnRightClick) => setMenu({ showOnRightClick })}
        label={t('settings.components.showOnRightClick')}
      />
      <Toggle
        checked={c.contextMenu.showHoverActions}
        onChange={(showHoverActions) => setMenu({ showHoverActions })}
        label={t('settings.components.menuHoverActions')}
      />
      <Slider
        id="menu-radius"
        label={t('settings.components.menuRadius')}
        value={c.contextMenu.radius}
        min={0}
        max={24}
        unit="px"
        onChange={(radius) => setMenu({ radius })}
      />
      <Slider
        id="menu-font"
        label={t('settings.components.menuFontSize')}
        value={c.contextMenu.fontSize}
        min={11}
        max={18}
        unit="px"
        onChange={(fontSize) => setMenu({ fontSize })}
      />
    </div>
  );
}
