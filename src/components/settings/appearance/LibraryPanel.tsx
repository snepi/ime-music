import { Button } from '../../ui/Button';
import { Slider } from '../../ui/Slider';
import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import {
  ALL_LIBRARY_COLUMNS,
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type DoubleClickAction,
  type LibraryColumnId,
} from '../../../appearance/schema';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/messages';

interface Props {
  appearance: AppearanceSettings;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}

const COLUMN_LABEL_KEYS: Record<LibraryColumnId, MessageKey> = {
  index: 'settings.library.column.index',
  cover: 'settings.library.column.cover',
  title: 'settings.library.column.title',
  artist: 'settings.library.column.artist',
  album: 'settings.library.column.album',
  genre: 'settings.library.column.genre',
  year: 'settings.library.column.year',
  duration: 'settings.library.column.duration',
  format: 'settings.library.column.format',
  bitrate: 'settings.library.column.bitrate',
  fileSize: 'settings.library.column.fileSize',
  rating: 'settings.library.column.rating',
  dateAdded: 'settings.library.column.dateAdded',
  playCount: 'settings.library.column.playCount',
  lastPlayed: 'settings.library.column.lastPlayed',
};

export function LibraryPanel({ appearance, onChange }: Props) {
  const { t } = useI18n();
  const library = appearance.library;
  const set = (partial: Partial<typeof library>) => onChange({ library: { ...library, ...partial } });

  const toggleColumn = (id: LibraryColumnId) => {
    const visible = new Set(library.visibleColumns);
    if (visible.has(id)) {
      if (id === 'title') return;
      visible.delete(id);
    } else {
      visible.add(id);
    }
    set({ visibleColumns: library.columnOrder.filter((c) => visible.has(c)) });
  };

  const move = (id: LibraryColumnId, dir: -1 | 1) => {
    const order = [...library.columnOrder];
    const idx = order.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= order.length) return;
    [order[idx], order[next]] = [order[next], order[idx]];
    set({
      columnOrder: order,
      visibleColumns: order.filter((c) => library.visibleColumns.includes(c)),
    });
  };

  return (
    <div className="settings-panel">
      <SectionReset
        onReset={() =>
          onChange({
            library: {
              ...DEFAULT_APPEARANCE.library,
              visibleColumns: [...DEFAULT_APPEARANCE.library.visibleColumns],
              columnOrder: [...DEFAULT_APPEARANCE.library.columnOrder],
            },
          })
        }
      />
      <div className="settings-section">
        <Slider
          id="lib-cover"
          label={t('settings.library.coverSize')}
          value={library.coverSize}
          min={28}
          max={72}
          unit="px"
          onChange={(coverSize) => set({ coverSize })}
        />
      </div>
      <div className="settings-section">
        <Toggle
          checked={library.showSecondaryText}
          onChange={(showSecondaryText) => set({ showSecondaryText })}
          label={t('settings.library.showSecondaryText')}
        />
      </div>
      <div className="settings-section">
        <Select
          id="dblclick"
          label={t('settings.library.doubleClick')}
          value={library.doubleClickAction}
          onChange={(v) => set({ doubleClickAction: v as DoubleClickAction })}
          options={[
            { value: 'playNow', label: t('settings.library.doubleClick.playNow') },
            { value: 'togglePlay', label: t('settings.library.doubleClick.togglePlay') },
            { value: 'editMetadata', label: t('settings.library.doubleClick.editMetadata') },
          ]}
        />
      </div>

      <div className="settings-section">
        <div className="field-label">{t('settings.library.columnsTitle')}</div>
        <ul className="column-config-list">
          {library.columnOrder.map((id) => (
            <li key={id} className="column-config-item">
              <Toggle
                checked={library.visibleColumns.includes(id)}
                onChange={() => toggleColumn(id)}
                label={t(COLUMN_LABEL_KEYS[id])}
                disabled={id === 'title'}
              />
              <div className="column-config-actions">
                <Button variant="ghost" onClick={() => move(id, -1)} aria-label={t('common.moveUp')}>
                  ↑
                </Button>
                <Button variant="ghost" onClick={() => move(id, 1)} aria-label={t('common.moveDown')}>
                  ↓
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="field-hint">{t('settings.library.columnsHint')}</p>
      </div>
    </div>
  );
}

export { ALL_LIBRARY_COLUMNS, COLUMN_LABEL_KEYS };
