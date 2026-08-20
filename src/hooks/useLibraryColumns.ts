import { useMemo } from 'react';
import { usePlayer } from '../store/playerStore';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_LIBRARY_COLUMNS,
  type LibraryColumnId,
} from '../appearance/schema';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';

const COL_WIDTH: Record<LibraryColumnId, string> = {
  index: '40px',
  cover: 'var(--list-cover-size, 44px)',
  title: 'minmax(160px, 2fr)',
  artist: 'minmax(100px, 1fr)',
  album: 'minmax(100px, 1fr)',
  genre: 'minmax(80px, 0.8fr)',
  year: '56px',
  duration: '56px',
  format: '64px',
  bitrate: '72px',
  fileSize: '72px',
  rating: '48px',
  dateAdded: '88px',
  playCount: '56px',
  lastPlayed: '88px',
};

const HEADER_KEY: Partial<Record<LibraryColumnId, MessageKey>> = {
  title: 'lib.col.title',
  artist: 'lib.col.artist',
  album: 'lib.col.album',
  genre: 'lib.col.genre',
  year: 'lib.col.year',
  duration: 'lib.col.duration',
  format: 'lib.col.format',
  bitrate: 'lib.col.bitrate',
  fileSize: 'lib.col.fileSize',
  dateAdded: 'lib.col.dateAdded',
  lastPlayed: 'lib.col.lastPlayed',
};

export function useLibraryColumns() {
  const { state } = usePlayer();
  const { t } = useI18n();
  const appearance = state.settings.appearance || DEFAULT_APPEARANCE;
  const library = appearance.library;

  const columns = useMemo(() => {
    const order = library.columnOrder?.length ? library.columnOrder : DEFAULT_LIBRARY_COLUMNS;
    let visible = (library.visibleColumns?.length ? library.visibleColumns : DEFAULT_LIBRARY_COLUMNS).slice();
    if (!appearance.layout.showTrackNumbers) visible = visible.filter((c) => c !== 'index');
    if (!appearance.layout.showArtworkInList || !appearance.covers.show) {
      visible = visible.filter((c) => c !== 'cover');
    }
    if (!visible.includes('title')) visible = ['title', ...visible];
    return order.filter((id) => visible.includes(id));
  }, [library, appearance.layout.showTrackNumbers, appearance.layout.showArtworkInList, appearance.covers.show]);

  const gridTemplate = useMemo(() => {
    const parts = columns.map((id) => COL_WIDTH[id] || 'minmax(80px, 1fr)');
    parts.push('40px'); // like button
    return parts.join(' ');
  }, [columns]);

  const headerLabels = useMemo(() => {
    const labels = {} as Record<LibraryColumnId, string>;
    for (const id of Object.keys(COL_WIDTH) as LibraryColumnId[]) {
      if (id === 'index') labels[id] = '#';
      else if (id === 'cover') labels[id] = '';
      else if (id === 'rating') labels[id] = '★';
      else if (id === 'playCount') labels[id] = '▶';
      else {
        const key = HEADER_KEY[id];
        labels[id] = key ? t(key) : id;
      }
    }
    return labels;
  }, [t]);

  return {
    columns,
    gridTemplate,
    headerLabels,
    showSecondaryText: library.showSecondaryText,
    showHoverActions: appearance.layout.showHoverActions,
    showCovers: appearance.covers.show && appearance.layout.showArtworkInList,
    doubleClickAction: library.doubleClickAction,
    showSearch: appearance.layout.showSearch,
  };
}
