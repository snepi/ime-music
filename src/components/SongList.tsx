import { useState, useCallback, useMemo, useEffect } from 'react';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { SongRow } from './SongRow';
import { SongContextMenu } from './SongContextMenu';
import { AddToPlaylistModal } from './modals/AddToPlaylistModal';
import { EditMetadataModal } from './modals/EditMetadataModal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { ImportUrlModal } from './modals/ImportUrlModal';
import { useLibraryColumns } from '../hooks/useLibraryColumns';
import { useVirtualList } from '../hooks/useVirtualList';
import { Spinner } from './ui/Spinner';
import { filterSongsByQuery } from '../utils/smartSearch';
import { RecommendationsView } from './RecommendationsView';
import { WishlistView } from './WishlistView';
import { HistoryView } from './HistoryView';
import { HomeView } from './HomeView';
import { ArtistView } from './ArtistView';
import { ReleaseView } from './ReleaseView';
import type { MetaSyncProgress, ViewType } from '../types';
import { getEffectiveAppearance } from '../utils/applyAppearance';
import { DEFAULT_APPEARANCE } from '../appearance/schema';
import { useI18n } from '../i18n';
import { formatTrackCount, playlistDisplayName } from '../i18n/messages';

const SONG_ROW_HEIGHT = 52;
const VIRTUALIZE_THRESHOLD = 80;

function useViewMeta(view: ViewType, playlistName?: string) {
  const { t } = useI18n();
  switch (view.kind) {
    case 'home':
      return { title: t('nav.home'), subtitle: t('lib.homeSubtitle') };
    case 'all':
      return { title: t('nav.all'), subtitle: t('lib.allSubtitle') };
    case 'liked':
      return { title: t('nav.liked'), subtitle: t('lib.likedSubtitle') };
    case 'recommendations':
      return { title: t('nav.recommendations'), subtitle: t('lib.recSubtitle') };
    case 'wishlist':
      return { title: t('nav.wishlist'), subtitle: t('lib.wishSubtitle') };
    case 'history':
      return { title: t('nav.history'), subtitle: t('lib.historySubtitle') };
    case 'artist':
      return { title: view.name, subtitle: t('artist.pageSubtitle') };
    case 'release':
      return { title: view.release.title, subtitle: t('artist.pageSubtitle') };
    case 'playlist':
      return { title: playlistName ?? t('lib.playlist'), subtitle: t('lib.playlist') };
  }
}

export function ViewHeader() {
  const { state, getVisibleSongs } = usePlayer();
  const { t, locale } = useI18n();
  const songs = getVisibleSongs();
  const playlistId = state.currentView.kind === 'playlist' ? state.currentView.id : null;
  const playlist = playlistId ? state.playlists.find((p) => p.id === playlistId) : undefined;
  const meta = useViewMeta(
    state.currentView,
    playlist ? playlistDisplayName(playlist, t) : undefined,
  );
  const pages = getEffectiveAppearance(state.settings.appearance).components.pages;

  return (
    <div
      className="view-header"
      style={{
        maxWidth: pages.contentMaxWidth,
        paddingInline: pages.pagePadding,
      }}
    >
      <div className="view-info">
        <h1 style={{ fontSize: pages.titleSize }}>{meta.title}</h1>
        <p style={{ fontSize: pages.subtitleSize }}>
          {pages.showDescription ? `${meta.subtitle}` : null}
          {pages.showDescription && pages.showTrackCount ? ' · ' : null}
          {pages.showTrackCount ? formatTrackCount(locale, songs.length, t) : null}
        </p>
      </div>
    </div>
  );
}

interface ViewToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function ViewToolbar({ search, onSearchChange }: ViewToolbarProps) {
  const { state, dispatch, refreshLibrary } = usePlayer();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<MetaSyncProgress | null>(null);
  const { showSearch } = useLibraryColumns();
  const pages = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE).components
    .pages;
  const showEnrich =
    state.currentView.kind === 'all' ||
    state.currentView.kind === 'liked' ||
    state.currentView.kind === 'playlist';

  useEffect(() => {
    if (!window.imeMusic?.onMetaEnrichProgress) return;
    return window.imeMusic.onMetaEnrichProgress((progress) => {
      setEnrichProgress(progress);
      if (progress.done) {
        setEnrichBusy(false);
        void refreshLibrary();
        if (progress.total === 0) {
          showToast(t('lib.enrichMetaNone'), 'info');
        } else {
          showToast(
            t('lib.enrichMetaResult', {
              updated: progress.updated,
              skipped: progress.skipped,
              failed: progress.failed,
            }),
            progress.failed ? 'info' : 'success',
          );
        }
      }
    });
  }, [refreshLibrary, showToast, t]);

  const startEnrich = async () => {
    if (enrichBusy) return;
    setEnrichBusy(true);
    setEnrichProgress(null);
    const res = await window.imeMusic.startMetaEnrich?.();
    if (!res?.started) {
      setEnrichBusy(false);
      showToast(t('lib.enrichMetaAlready'), 'info');
    }
  };

  const handleSortChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [sortBy, sortOrder] = e.target.value.split(':') as [
      'title' | 'modifiedAt' | 'dateModified' | 'dateAdded',
      'asc' | 'desc',
    ];
    const settings = await window.imeMusic.updateSettings({ sortBy, sortOrder });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  };

  const sortValue = `${state.settings.sortBy}:${state.settings.sortOrder}`;

  return (
    <div className="view-toolbar">
      {showSearch ? (
        <div className="search-field">
          <Icon name="search" size={16} className="search-icon" />
          <input
            type="search"
            className="search-input"
            placeholder={t('lib.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={t('common.search')}
          />
        </div>
      ) : (
        <div />
      )}
      <div className="view-toolbar-actions">
        <Button
          variant="primary"
          onClick={() => void window.imeMusic.importFiles()}
          aria-label={t('lib.importFiles')}
        >
          <Icon name="import" size={16} />
          <span>{t('lib.files')}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={() => void window.imeMusic.importFolders()}
          aria-label={t('lib.importFolders')}
        >
          <Icon name="folder" size={16} />
          <span>{t('lib.folders')}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={() => setImportUrlOpen(true)}
          aria-label={t('lib.addYoutube')}
        >
          <Icon name="link" size={16} />
          <span>YouTube</span>
        </Button>
        <Button
          variant="secondary"
          onClick={() => void refreshLibrary()}
          aria-label={t('lib.refreshLib')}
        >
          <Icon name="refresh" size={16} />
          <span>{t('common.refresh')}</span>
        </Button>
        {showEnrich ? (
          <Button
            variant="secondary"
            disabled={enrichBusy}
            onClick={() => void startEnrich()}
            aria-label={t('lib.enrichMeta')}
            title={t('lib.enrichMetaHint')}
          >
            <Icon name="refresh" size={16} />
            <span>{enrichBusy ? t('lib.enrichMetaBusy') : t('lib.enrichMeta')}</span>
          </Button>
        ) : null}
        {pages.showSort ? (
          <select
            className="sort-select"
            value={sortValue}
            onChange={handleSortChange}
            aria-label={t('lib.sort')}
          >
            <option value="title:asc">{t('lib.sortTitleAsc')}</option>
            <option value="title:desc">{t('lib.sortTitleDesc')}</option>
            <option value="dateModified:desc">{t('lib.sortModNew')}</option>
            <option value="dateModified:asc">{t('lib.sortModOld')}</option>
            <option value="dateAdded:desc">{t('lib.sortAddNew')}</option>
            <option value="dateAdded:asc">{t('lib.sortAddOld')}</option>
          </select>
        ) : null}
      </div>
      {enrichProgress && enrichBusy ? (
        <p className="field-hint enrich-progress-hint">
          {t('lib.enrichMetaProgress', {
            processed: enrichProgress.processed,
            total: enrichProgress.total,
          })}
        </p>
      ) : null}
      <ImportUrlModal open={importUrlOpen} onClose={() => setImportUrlOpen(false)} />
    </div>
  );
}

function filterSongs(
  songs: ReturnType<ReturnType<typeof usePlayer>['getVisibleSongs']>,
  query: string,
) {
  return filterSongsByQuery(songs, query);
}

interface SongListProps {
  search: string;
}

export function SongList({ search }: SongListProps) {
  const { state, getVisibleSongs, playSong, playNow, togglePlayPause, toggleLike, dispatch } =
    usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const {
    columns,
    gridTemplate,
    headerLabels,
    showSecondaryText,
    showHoverActions,
    showCovers,
    doubleClickAction,
  } = useLibraryColumns();
  const [menuSongId, setMenuSongId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [playlistModalSongId, setPlaylistModalSongId] = useState<string | null>(null);
  const [editSongId, setEditSongId] = useState<string | null>(null);
  const [deleteSongId, setDeleteSongId] = useState<string | null>(null);

  const visible = getVisibleSongs();
  const songs = useMemo(() => filterSongs(visible, search), [visible, search]);
  const confirmDelete = state.settings.appearance?.behavior.confirmDelete ?? true;
  const components = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE)
    .components;
  const hoverActions = showHoverActions && components.contextMenu.showHoverActions;
  const allowContextMenu = components.contextMenu.showOnRightClick;
  const virtual = useVirtualList({
    items: songs,
    rowHeight: SONG_ROW_HEIGHT,
    enabled: songs.length >= VIRTUALIZE_THRESHOLD,
  });

  const handlePlayToggle = useCallback(
    (songId: string) => {
      if (state.currentSongId === songId) togglePlayPause();
      else playSong(songId);
    },
    [playSong, state.currentSongId, togglePlayPause],
  );

  const handleDoubleClick = useCallback(
    (songId: string) => {
      if (doubleClickAction === 'togglePlay') {
        handlePlayToggle(songId);
      } else if (doubleClickAction === 'editMetadata') {
        setEditSongId(songId);
      } else {
        playNow(songId);
      }
    },
    [doubleClickAction, handlePlayToggle, playNow],
  );

  if (state.loading && state.songs.length === 0) {
    return <Spinner label={t('lib.loading')} />;
  }

  const isEmptyLibrary = state.songs.length === 0;
  const isEmptyView = songs.length === 0;

  if (isEmptyLibrary) {
    return (
      <EmptyState
        icon="music"
        title={t('lib.emptyTitle')}
        description={t('lib.emptyHint')}
        actions={
          <>
            <Button variant="primary" onClick={() => void window.imeMusic.importFiles()}>
              <Icon name="import" size={16} />
              {t('lib.importMusic')}
            </Button>
            <Button variant="secondary" onClick={() => void window.imeMusic.importFolders()}>
              <Icon name="folder" size={16} />
              {t('lib.pickFolder')}
            </Button>
          </>
        }
      />
    );
  }

  if (isEmptyView) {
    const isPlaylist = state.currentView.kind === 'playlist';
    const isLiked = state.currentView.kind === 'liked';
    return (
      <EmptyState
        icon={isPlaylist ? 'playlist' : isLiked ? 'heartOutline' : 'search'}
        title={
          search.trim()
            ? t('lib.noneFound')
            : isPlaylist
              ? t('lib.playlistEmpty')
              : isLiked
                ? t('lib.noLiked')
                : t('lib.noTracks')
        }
        description={
          search.trim()
            ? t('lib.tryOther')
            : isPlaylist
              ? t('lib.addViaMenu')
              : t('lib.likeOrImport')
        }
        actions={
          !search.trim() && (
            <Button variant="primary" onClick={() => void window.imeMusic.importFiles()}>
              <Icon name="import" size={16} />
              {t('lib.importMusic')}
            </Button>
          )
        }
      />
    );
  }

  return (
    <>
      <div
        className="song-list"
        ref={virtual.containerRef}
        style={{ ['--song-grid-template' as string]: gridTemplate }}
      >
        <div className="song-list-header">
          {columns.map((id) => (
            <span key={id}>{headerLabels[id]}</span>
          ))}
          <span />
        </div>
        {virtual.virtualized ? (
          <div className="song-list-virtual" style={{ height: virtual.totalHeight }}>
            <div
              className="song-list-virtual-window"
              style={{ transform: `translateY(${virtual.offsetY}px)` }}
            >
              {virtual.visibleItems.map((song, i) => {
                const index = virtual.startIndex + i;
                return (
                  <SongRow
                    key={song.id}
                    song={song}
                    index={index}
                    isCurrent={state.currentSongId === song.id}
                    isPlaying={state.currentSongId === song.id && state.isPlaying}
                    columns={columns}
                    showSecondaryText={showSecondaryText}
                    showHoverActions={hoverActions}
                    showCovers={showCovers}
                    onPlayToggle={() => handlePlayToggle(song.id)}
                    onDoubleClick={() => handleDoubleClick(song.id)}
                    onMenu={
                      allowContextMenu
                        ? (anchor) => {
                            setMenuSongId(song.id);
                            setMenuAnchor(anchor);
                          }
                        : undefined
                    }
                    onToggleLike={() => void toggleLike(song.id)}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          songs.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              index={index}
              isCurrent={state.currentSongId === song.id}
              isPlaying={state.currentSongId === song.id && state.isPlaying}
              columns={columns}
              showSecondaryText={showSecondaryText}
              showHoverActions={hoverActions}
              showCovers={showCovers}
              onPlayToggle={() => handlePlayToggle(song.id)}
              onDoubleClick={() => handleDoubleClick(song.id)}
              onMenu={
                allowContextMenu
                  ? (anchor) => {
                      setMenuSongId(song.id);
                      setMenuAnchor(anchor);
                    }
                  : undefined
              }
              onToggleLike={() => void toggleLike(song.id)}
            />
          ))
        )}
      </div>

      {menuSongId && (
        <SongContextMenu
          songId={menuSongId}
          anchorEl={menuAnchor}
          onClose={() => {
            setMenuSongId(null);
            setMenuAnchor(null);
          }}
          onAddToPlaylist={() => {
            setPlaylistModalSongId(menuSongId);
            setMenuSongId(null);
            setMenuAnchor(null);
          }}
          onEditMetadata={() => {
            setEditSongId(menuSongId);
            setMenuSongId(null);
            setMenuAnchor(null);
          }}
          onDelete={() => {
            if (!confirmDelete) {
              void window.imeMusic.removeSong(menuSongId).then((ok) => {
                if (ok) {
                  dispatch({ type: 'REMOVE_SONG', id: menuSongId });
                  showToast(t('lib.deleted'), 'success');
                }
              });
              setMenuSongId(null);
              setMenuAnchor(null);
              return;
            }
            setDeleteSongId(menuSongId);
            setMenuSongId(null);
            setMenuAnchor(null);
          }}
        />
      )}

      <AddToPlaylistModal
        open={Boolean(playlistModalSongId)}
        songTitle={state.songs.find((s) => s.id === playlistModalSongId)?.title}
        playlists={state.playlists}
        onClose={() => setPlaylistModalSongId(null)}
        onSelect={async (playlistId) => {
          if (!playlistModalSongId) return;
          await window.imeMusic.addToPlaylist(playlistId, playlistModalSongId);
          const data = await window.imeMusic.getLibrary();
          dispatch({
            type: 'SET_LIBRARY',
            songs: data.songs,
            playlists: data.playlists,
            settings: data.settings,
          });
          showToast(t('lib.addedPlaylist'), 'success');
          setPlaylistModalSongId(null);
        }}
      />

      <EditMetadataModal
        open={Boolean(editSongId)}
        songId={editSongId}
        onClose={() => setEditSongId(null)}
        onSaved={(song) => {
          dispatch({ type: 'UPDATE_SONG', song });
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteSongId)}
        title={t('lib.deleteTitle')}
        message={t('lib.deleteMsg')}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setDeleteSongId(null)}
        onConfirm={() => {
          if (!deleteSongId) return;
          void window.imeMusic.removeSong(deleteSongId).then((ok) => {
            if (ok) {
              dispatch({ type: 'REMOVE_SONG', id: deleteSongId });
              showToast(t('lib.deleted'), 'success');
            }
            setDeleteSongId(null);
          });
        }}
      />
    </>
  );
}

export function LibraryView() {
  const { state } = usePlayer();
  const [search, setSearch] = useState('');

  if (state.currentView.kind === 'home') {
    return <HomeView />;
  }
  if (state.currentView.kind === 'recommendations') {
    return <RecommendationsView />;
  }
  if (state.currentView.kind === 'wishlist') {
    return <WishlistView />;
  }
  if (state.currentView.kind === 'history') {
    return <HistoryView />;
  }
  if (state.currentView.kind === 'artist') {
    return <ArtistView view={state.currentView} />;
  }
  if (state.currentView.kind === 'release') {
    return <ReleaseView view={state.currentView} />;
  }

  return (
    <>
      <ViewHeader />
      <ViewToolbar search={search} onSearchChange={setSearch} />
      <SongList search={search} />
    </>
  );
}
