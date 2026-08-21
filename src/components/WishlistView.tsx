import { useMemo, useState } from 'react';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { useToast } from './ui/Toast';
import { ArtistLink } from './ArtistLink';
import { getDiscovery, platformSearchUrls } from '../utils/discovery';
import { filterSongsByQuery } from '../utils/smartSearch';
import { useI18n } from '../i18n';
import { buildOwnedTrackMap, trackMatchKey } from '../utils/trackMatch';

export function WishlistView() {
  const { state, dispatch, togglePreview, playSong } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const discovery = getDiscovery(state.settings);
  const items = discovery.wishlist;
  const ownedMap = useMemo(() => buildOwnedTrackMap(state.songs), [state.songs]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    return filterSongsByQuery(
      items.map((item) => ({
        ...item,
        album: item.album || '',
      })),
      search,
    );
  }, [items, search]);

  const itemsNeedingDownload = useMemo(
    () => filteredItems.filter((item) => !ownedMap.get(trackMatchKey(item.artist, item.title))),
    [filteredItems, ownedMap],
  );

  const remove = async (id: string) => {
    const settings = await window.imeMusic.updateSettings({
      discovery: {
        ...discovery,
        wishlist: discovery.wishlist.filter((w) => w.id !== id),
      },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    showToast(t('wish.removed'), 'success');
  };

  const startImport = async (
    action: () => Promise<{ started: boolean; error?: string } | undefined>,
    startedKey: 'wish.downloadStarted' | 'wish.downloadAllStarted',
  ) => {
    try {
      if (!window.imeMusic?.importSearch && !window.imeMusic?.importWishlist) {
        showToast(t('yt.unavailable'), 'error');
        return false;
      }
      const result = await action();
      if (!result?.started) {
        showToast(result?.error || t('yt.startFail'), 'error');
        return false;
      }
      showToast(t(startedKey), 'success');
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('yt.error'), 'error');
      return false;
    }
  };

  const toImportPayload = (item: (typeof items)[number]) => ({
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.coverUrl,
    deezerId: item.deezerId,
  });

  const downloadOne = async (item: (typeof items)[number]) => {
    if (downloadingId || downloadingAll) return;
    setDownloadingId(item.id);
    try {
      await startImport(
        () => window.imeMusic.importSearch?.(toImportPayload(item)),
        'wish.downloadStarted',
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAll = async () => {
    if (downloadingId || downloadingAll) return;
    const batch = (search.trim() ? filteredItems : items).filter(
      (item) => !ownedMap.get(trackMatchKey(item.artist, item.title)),
    );
    if (batch.length === 0) {
      showToast(t('wish.allOwned'), 'info');
      return;
    }
    setDownloadingAll(true);
    try {
      await startImport(
        () => window.imeMusic.importWishlist?.(batch.map((item) => toImportPayload(item))),
        'wish.downloadAllStarted',
      );
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="wishlist-view">
      <div className="view-header">
        <div className="view-info">
          <h1>{t('wish.title')}</h1>
          <p>{t('wish.subtitle')}</p>
        </div>
        {items.length > 0 ? (
          <div className="view-actions">
            <Button
              variant="secondary"
              onClick={() => void downloadAll()}
              disabled={
                downloadingAll || downloadingId != null || itemsNeedingDownload.length === 0
              }
            >
              <Icon name="import" size={16} />
              {downloadingAll ? t('sync.starting') : t('wish.downloadAll')}
            </Button>
          </div>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="wishlist-toolbar">
          <div className="search-field">
            <Icon name="search" size={16} className="search-icon" />
            <input
              type="search"
              className="search-input"
              placeholder={t('wish.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('common.search')}
            />
          </div>
          {search.trim() ? (
            <span className="wishlist-search-count">
              {t('wish.searchCount', { count: filteredItems.length, total: items.length })}
            </span>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon="heartOutline"
          title={t('wish.empty')}
          description={t('wish.emptyHint')}
          actions={
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'recommendations' } })}
            >
              {t('wish.toRecs')}
            </Button>
          }
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon="search"
          title={t('wish.searchEmpty')}
          description={t('wish.searchEmptyHint')}
        />
      ) : (
        <ul className="wishlist-list">
          {filteredItems.map((item) => {
            const active = state.previewItem?.id === item.id;
            const playing = active && state.previewPlaying;
            const local = ownedMap.get(trackMatchKey(item.artist, item.title));
            const localPlaying = Boolean(local && state.currentSongId === local.id && state.isPlaying);
            const links = platformSearchUrls(`${item.title} ${item.artist}`);
            return (
              <li
                key={item.id}
                className={`wishlist-row${active || localPlaying ? ' is-active' : ''}${local ? ' has-local' : ''}`}
              >
                <button
                  type="button"
                  className="wishlist-play"
                  onClick={() => {
                    if (local) {
                      playSong(local.id);
                      return;
                    }
                    void togglePreview(item);
                  }}
                  aria-label={
                    local
                      ? t('rec.playLocal')
                      : playing
                        ? t('player.pause')
                        : t('rec.listenDemo')
                  }
                >
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <Icon name="disc" size={22} />
                  )}
                  <span className="wishlist-play-icon">
                    <Icon name={playing || localPlaying ? 'pause' : 'play'} size={16} />
                  </span>
                </button>
                <div className="wishlist-meta">
                  <div className="wishlist-title">
                    {item.title}
                    {local ? <span className="owned-badge">{t('rec.inLibraryShort')}</span> : null}
                  </div>
                  <ArtistLink artist={item.artist} className="wishlist-artist" />
                  <div className="wishlist-links">
                    {links.map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        className="wishlist-link-btn"
                        onClick={() => {
                          void window.imeMusic.openExternal?.(link.url).then((res) => {
                            if (res && !res.ok) showToast(res.error || t('wish.openFail'), 'error');
                          });
                        }}
                      >
                        {link.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="wishlist-actions">
                  {local ? (
                    <Button
                      variant="secondary"
                      onClick={() => playSong(local.id)}
                      title={t('rec.playLocal')}
                    >
                      <Icon name="play" size={16} />
                      {t('rec.playLocal')}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="wishlist-download-btn"
                      onClick={() => void downloadOne(item)}
                      disabled={downloadingAll || downloadingId === item.id}
                      title={t('wish.download')}
                    >
                      <Icon name="import" size={16} />
                      {downloadingId === item.id ? t('sync.starting') : t('wish.download')}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => void remove(item.id)} title={t('wish.remove')}>
                    <Icon name="delete" size={16} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
