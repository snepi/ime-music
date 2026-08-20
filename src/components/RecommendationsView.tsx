import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Spinner } from './ui/Spinner';
import { useToast } from './ui/Toast';
import { copyTrackLabel } from '../utils/clipboard';
import type { RecommendationItem, RecommendationsFilterMode } from '../types';
import { ArtistLink } from './ArtistLink';
import {
  artistBlockKey,
  getDiscovery,
  primaryArtistName,
  toBlockedArtist,
  toBlockedTrack,
  toWishlistItem,
} from '../utils/discovery';
import { DEFAULT_CHART_COUNTRY } from '../utils/chartCountries';
import { Select } from './ui/Select';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';

const FILTER_KEYS: Record<RecommendationsFilterMode, MessageKey> = {
  all: 'rec.filter.all',
  liked: 'rec.filter.liked',
  current: 'rec.filter.current',
  wishlist: 'rec.filter.wishlist',
  chart: 'rec.filter.chart',
};

export function RecommendationsView() {
  const { state, dispatch, togglePreview } = usePlayer();
  const { showToast } = useToast();
  const { t, chartCountries } = useI18n();
  const discovery = getDiscovery(state.settings);
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [rotatesAt, setRotatesAt] = useState<number | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);

  const currentSong = state.songs.find((s) => s.id === state.currentSongId);
  const filterMode = discovery.filterMode;
  const chartCountry = discovery.chartCountry || DEFAULT_CHART_COUNTRY;

  const patchDiscovery = useCallback(
    async (partial: Partial<typeof discovery>) => {
      const settings = await window.imeMusic.updateSettings({
        discovery: { ...discovery, ...partial },
      });
      dispatch({ type: 'UPDATE_SETTINGS', settings });
      return getDiscovery(settings);
    },
    [discovery, dispatch],
  );

  const load = useCallback(
    async (force = false, mode?: RecommendationsFilterMode) => {
      if (!window.imeMusic?.getRecommendations) {
        setError(t('rec.unavailable'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const nextMode = mode || filterMode;
        const result = await window.imeMusic.getRecommendations({
          force,
          mode: nextMode,
          currentArtist: currentSong?.artist || null,
        });
        setItems(result.items || []);
        setReason(result.reason || null);
        setRotatesAt(typeof result.rotatesAt === 'number' ? result.rotatesAt : null);
        if (!result.ok && result.error) setError(result.error);
        else setError(null);
        if (force && result.ok) showToast(t('rec.updated'), 'success');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [currentSong?.artist, filterMode, showToast, t],
  );

  useEffect(() => {
    void load(false);
  }, [
    load,
    state.songs.length,
    filterMode,
    chartCountry,
    discovery.blockedArtists.length,
    discovery.blockedTracks.length,
    currentSong?.id,
  ]);

  useEffect(() => {
    if (!rotatesAt) return undefined;
    const delay = Math.max(1000, rotatesAt - Date.now());
    const timer = window.setTimeout(() => {
      void load(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [rotatesAt, load]);

  const setFilter = async (mode: RecommendationsFilterMode) => {
    if (mode === filterMode) return;
    await patchDiscovery({ filterMode: mode });
  };

  const setChartCountry = async (code: string) => {
    if (code === chartCountry && filterMode === 'chart') return;
    await patchDiscovery({ chartCountry: code, filterMode: 'chart' });
  };

  const hideTrack = async (item: RecommendationItem) => {
    const next = [...discovery.blockedTracks.filter((x) => x.id !== item.id), toBlockedTrack(item)];
    await patchDiscovery({ blockedTracks: next });
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    showToast(t('rec.trackHidden'), 'success');
  };

  const hideArtist = async (item: RecommendationItem) => {
    const name = primaryArtistName(item);
    const block = toBlockedArtist(name);
    if (!block.key) return;
    const next = [
      ...discovery.blockedArtists.filter((a) => a.key !== block.key),
      block,
    ];
    await patchDiscovery({ blockedArtists: next });
    setItems((prev) => prev.filter((x) => artistBlockKey(x.artist) !== block.key));
    showToast(t('rec.artistHidden', { name }), 'success');
  };

  const unblockArtist = async (key: string) => {
    const next = discovery.blockedArtists.filter((a) => a.key !== key);
    await patchDiscovery({ blockedArtists: next });
    if (next.length + discovery.blockedTracks.length === 0) setBlockedOpen(false);
    showToast(t('rec.artistUnblocked'), 'success');
  };

  const unblockTrack = async (id: string) => {
    const next = discovery.blockedTracks.filter((x) => x.id !== id);
    await patchDiscovery({ blockedTracks: next });
    if (discovery.blockedArtists.length + next.length === 0) setBlockedOpen(false);
    showToast(t('rec.trackUnblocked'), 'success');
  };

  const addWishlist = async (item: RecommendationItem) => {
    if (discovery.wishlist.some((w) => w.id === item.id)) {
      showToast(t('rec.alreadyWish'), 'info');
      return;
    }
    await patchDiscovery({
      wishlist: [toWishlistItem(item), ...discovery.wishlist],
    });
    showToast(t('rec.addedWish'), 'success');
  };

  const blockedCount = discovery.blockedArtists.length + discovery.blockedTracks.length;

  const rotationHint = useMemo(() => {
    if (!rotatesAt) return t('rec.rotationDefault');
    const hours = Math.max(0, Math.ceil((rotatesAt - Date.now()) / (60 * 60 * 1000)));
    if (hours <= 0) return t('rec.rotationSoon');
    return t('rec.rotationHours', { hours });
  }, [rotatesAt, t]);

  const filterModes = Object.keys(FILTER_KEYS) as RecommendationsFilterMode[];

  if (state.loading && state.songs.length === 0) {
    return <Spinner label={t('common.loading')} />;
  }

  if (state.songs.length === 0) {
    return (
      <EmptyState
        icon="music"
        title={t('rec.needLibrary')}
        description={t('rec.needLibraryHint')}
        actions={
          <Button variant="primary" onClick={() => void window.imeMusic.importFiles()}>
            <Icon name="import" size={16} />
            {t('rec.import')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="recommendations-view">
      <div className="view-header">
        <div className="view-info">
          <h1>{t('rec.title')}</h1>
          <p>
            {t('rec.subtitle')}
            <br />
            <span className="recommendations-hint">{rotationHint}</span>
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void load(true)}
          aria-label={t('rec.refresh')}
        >
          <Icon name="refresh" size={16} />
          {t('rec.refresh')}
        </Button>
      </div>

      <div className="recommendations-filters" role="tablist" aria-label={t('rec.filterAria')}>
        {filterModes.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={!blockedOpen && filterMode === mode}
            className={`rec-filter-chip${!blockedOpen && filterMode === mode ? ' active' : ''}`}
            onClick={() => {
              setBlockedOpen(false);
              void setFilter(mode);
            }}
            disabled={mode === 'current' && !currentSong}
            title={
              mode === 'current' && !currentSong ? t('rec.needCurrentTitle') : t(FILTER_KEYS[mode])
            }
          >
            {t(FILTER_KEYS[mode])}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={blockedOpen}
          className={`rec-filter-chip${blockedOpen ? ' active' : ''}`}
          onClick={() => setBlockedOpen((v) => !v)}
          disabled={blockedCount === 0}
          title={blockedCount === 0 ? t('rec.blockedNone') : t('rec.blockedTitle')}
        >
          {t('rec.blocked')}
          {blockedCount > 0 ? ` (${blockedCount})` : ''}
        </button>
      </div>

      {!blockedOpen && filterMode === 'chart' ? (
        <div className="chart-country-bar">
          <Select
            id="chart-country"
            label={t('rec.country')}
            value={chartCountry}
            options={chartCountries}
            onChange={(v) => void setChartCountry(v)}
            className="chart-country-select"
          />
          <p className="field-hint chart-country-hint">{t('rec.countryHint')}</p>
        </div>
      ) : null}

      {blockedOpen ? (
        <div className="recommendations-blocked-body">
          {discovery.blockedArtists.length > 0 ? (
            <div className="blocked-group">
              <div className="blocked-group-title">{t('rec.artists')}</div>
              <ul className="blocked-list">
                {discovery.blockedArtists.map((a) => (
                  <li key={a.key} className="blocked-row">
                    <span className="blocked-row-label">{a.name}</span>
                    <Button variant="ghost" onClick={() => void unblockArtist(a.key)}>
                      {t('rec.unblock')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {discovery.blockedTracks.length > 0 ? (
            <div className="blocked-group">
              <div className="blocked-group-title">{t('rec.tracks')}</div>
              <ul className="blocked-list">
                {discovery.blockedTracks.map((tr) => (
                  <li key={tr.id} className="blocked-row">
                    <span className="blocked-row-label">
                      {tr.title} — {tr.artist}
                    </span>
                    <Button variant="ghost" onClick={() => void unblockTrack(tr.id)}>
                      {t('rec.unblock')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {blockedCount === 0 ? (
            <EmptyState
              icon="check"
              title={t('rec.blockedEmpty')}
              description={t('rec.blockedEmptyHint')}
            />
          ) : null}
        </div>
      ) : null}

      {!blockedOpen && loading ? <Spinner label={t('rec.loadingSimilar')} /> : null}

      {!blockedOpen && !loading && error ? (
        <EmptyState
          icon="warning"
          title={t('rec.loadFailed')}
          description={error}
          actions={
            <Button variant="primary" onClick={() => void load(true)}>
              {t('rec.retry')}
            </Button>
          }
        />
      ) : null}

      {!blockedOpen && !loading && !error && items.length === 0 ? (
        <EmptyState
          icon="disc"
          title={
            reason === 'no_current'
              ? t('rec.needTrack')
              : reason === 'empty_wishlist'
                ? t('rec.emptyWishlist')
                : reason === 'no_matches'
                  ? t('rec.noMatches')
                  : t('rec.empty')
          }
          description={
            reason === 'no_current'
              ? t('rec.needTrackHint')
              : reason === 'empty_wishlist'
                ? t('rec.wishlistEmptyHintLong')
                : reason === 'no_matches'
                  ? filterMode === 'chart'
                    ? t('rec.noMatchesChart')
                    : t('rec.noMatchesHintLong')
                  : filterMode === 'liked'
                    ? t('rec.likedEmpty')
                    : filterMode === 'wishlist'
                      ? t('rec.emptyWishlistRefresh')
                      : filterMode === 'chart'
                        ? t('rec.chartHint')
                        : t('rec.emptyHintLong')
          }
          actions={
            <Button variant="secondary" onClick={() => void load(true)}>
              {t('rec.refresh')}
            </Button>
          }
        />
      ) : null}

      {!blockedOpen && !loading && items.length > 0 ? (
        <ul className="recommendations-grid">
          {items.map((item) => {
            const active = state.previewItem?.id === item.id;
            const playing = active && state.previewPlaying;
            const inWish = discovery.wishlist.some((w) => w.id === item.id);
            return (
              <li key={item.id} className={`recommendation-card${active ? ' is-active' : ''}`}>
                <div className="recommendation-cover-wrap">
                  {item.coverUrl ? (
                    <img className="recommendation-cover" src={item.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="recommendation-cover recommendation-cover-fallback">
                      <Icon name="disc" size={28} />
                    </div>
                  )}
                  <button
                    type="button"
                    className={`recommendation-play${playing ? ' playing' : ''}`}
                    onClick={() => void togglePreview(item)}
                    aria-label={playing ? t('player.pause') : t('rec.listenDemo')}
                    title={playing ? t('player.pause') : t('rec.demo')}
                  >
                    <Icon name={playing ? 'pause' : 'play'} size={20} />
                  </button>
                </div>
                <div className="recommendation-meta">
                  <button
                    type="button"
                    className="recommendation-title copyable-label"
                    title={t('rec.copyTitle')}
                    onClick={() => {
                      void copyTrackLabel(item.title, item.artist).then((ok) => {
                        showToast(ok ? t('common.copy') : t('common.copyFail'), ok ? 'success' : 'error');
                      });
                    }}
                  >
                    {item.title}
                  </button>
                  <ArtistLink artist={item.artist} className="recommendation-artist" />
                  {item.basedOnArtist ? (
                    <div className="recommendation-because">
                      {t('rec.likeBecause', { artist: item.basedOnArtist })}
                    </div>
                  ) : null}
                  <span className="recommendation-badge">{t('rec.demoBadge')}</span>
                  <div className="recommendation-actions">
                    <button
                      type="button"
                      className="rec-action-btn"
                      title={t('rec.addWish')}
                      disabled={inWish}
                      onClick={() => void addWishlist(item)}
                    >
                      <Icon name={inWish ? 'check' : 'add'} size={14} />
                      {inWish ? t('rec.inList') : t('rec.want')}
                    </button>
                    <button
                      type="button"
                      className="rec-action-btn"
                      title={t('rec.hideTrackTitle')}
                      onClick={() => void hideTrack(item)}
                    >
                      {t('rec.hideTrack')}
                    </button>
                    <button
                      type="button"
                      className="rec-action-btn danger"
                      title={t('rec.hideArtistTitle')}
                      onClick={() => void hideArtist(item)}
                    >
                      {t('rec.hideArtist')}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
