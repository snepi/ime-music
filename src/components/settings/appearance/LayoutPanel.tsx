import { Slider } from '../../ui/Slider';
import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type DensityMode,
  type SidebarPosition,
} from '../../../appearance/schema';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

export function LayoutPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const layout = appearance.layout;
  const set = (partial: Partial<typeof layout>) => onChange({ layout: { ...layout, ...partial } });

  return (
    <div className="settings-panel">
      <SectionReset
        onReset={() =>
          onChange({
            layout: {
              ...DEFAULT_APPEARANCE.layout,
              showSidebar: layout.showSidebar,
              showQueue: layout.showQueue,
              showSearch: layout.showSearch,
            },
          })
        }
      />
      <div className="settings-section">
        <Slider
          id="ui-scale"
          label={t('settings.layout.uiScale')}
          value={layout.uiScale}
          min={80}
          max={140}
          step={5}
          unit="%"
          onChange={(uiScale) => set({ uiScale })}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="font-size"
          label={t('settings.layout.fontSize')}
          value={layout.fontSize}
          min={11}
          max={20}
          unit="px"
          onChange={(fontSize) => set({ fontSize })}
        />
      </div>
      <div className="settings-section">
        <Select
          id="density"
          label={t('settings.layout.density')}
          value={layout.density}
          onChange={(v) => set({ density: v as DensityMode })}
          options={[
            { value: 'compact', label: t('settings.layout.density.compact') },
            { value: 'standard', label: t('settings.layout.density.standard') },
            { value: 'spacious', label: t('settings.layout.density.spacious') },
          ]}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="radius"
          label={t('settings.layout.borderRadius')}
          value={layout.borderRadius}
          min={0}
          max={20}
          unit="px"
          onChange={(borderRadius) => set({ borderRadius })}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="border-w"
          label={t('settings.layout.borderWidth')}
          value={layout.borderWidth}
          min={0}
          max={3}
          step={0.5}
          unit="px"
          onChange={(borderWidth) => set({ borderWidth })}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="icon-size"
          label={t('settings.layout.iconSize')}
          value={layout.iconSize}
          min={14}
          max={24}
          unit="px"
          onChange={(iconSize) => set({ iconSize })}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="sidebar-w"
          label={t('settings.layout.sidebarWidth')}
          value={layout.sidebarWidth}
          min={180}
          max={360}
          step={10}
          unit="px"
          onChange={(sidebarWidth) => set({ sidebarWidth })}
        />
      </div>
      <div className="settings-section">
        <Slider
          id="player-h"
          label={t('settings.layout.playerHeight')}
          value={layout.playerHeight}
          min={72}
          max={140}
          step={4}
          unit="px"
          onChange={(playerHeight) => set({ playerHeight })}
        />
      </div>
      <div className="settings-section">
        <Select
          id="sidebar-pos"
          label={t('settings.layout.sidebarPosition')}
          value={layout.sidebarPosition}
          onChange={(v) => set({ sidebarPosition: v as SidebarPosition })}
          options={[
            { value: 'left', label: t('settings.layout.sidebarPosition.left') },
            { value: 'right', label: t('settings.layout.sidebarPosition.right') },
          ]}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={layout.showTrackNumbers}
          onChange={(showTrackNumbers) => set({ showTrackNumbers })}
          label={t('settings.layout.showTrackNumbers')}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={layout.showArtworkInList}
          onChange={(showArtworkInList) => set({ showArtworkInList })}
          label={t('settings.layout.showArtworkInList')}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={layout.showHoverActions}
          onChange={(showHoverActions) => set({ showHoverActions })}
          label={t('settings.layout.showHoverActions')}
        />
      </div>
    </div>
  );
}
