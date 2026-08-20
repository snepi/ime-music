import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArtistProfile, ArtistRelease, ViewType } from '../types';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { EmptyState } from './ui/EmptyState';
import { DemoTracksGrid } from './DemoTracksGrid';
import { ArtistReleasesGrid } from './ArtistReleasesGrid';
import { ArtistShowAllButton } from './ArtistShowAllButton';
import { useOpenArtist } from '../hooks/useOpenArtist';
import { useExpandableList, ARTIST_SECTION_PREVIEW } from '../hooks/useExpandableList';
import { useToast } from './ui/Toast';
import {
  artistBlockKey,
  getDiscovery,
  isFavoriteArtist,
  toFavoriteArtist,
} from '../utils/discovery';
import { splitArtists } from '../utils/artists';
import { useI18n } from '../i18n';

type ArtistTab = 'top' | 'releases' | 'collabs' | 'related';
type ReleaseTypeFilter = 'all' | 'album' | 'single' | 'ep';

function libraryTracksForArtist(songs: import('../types').Song[], artistName: string) {
  const key = artistBlockKey(artistName);
  return songs.filter((song) =>
    splitArtists(song.artist).some((name) => artistBlockKey(name) === key),
  );
}

function releaseYear(release: ArtistRelease): number | null {
  const raw = String(release.releaseDate || '').slice(0, 4);
  const year = Number(raw);
  return Number.isFinite(year) && year >= 1900 ? year : null;
}

function ArtistTracksSection({
  title,
  hint,
  items,
  showArtist,
  resetKey,
}: {
  title: string;
  hint?: string;
  items: import('../types').RecommendationItem[];
  showArtist?: boolean;
  resetKey: string;
}) {
  const { t } = useI18n();
  const { visible, hasMore, hiddenCount, showAll } = useExpandableList(
    items,
    ARTIST_SECTION_PREVIEW,
    resetKey,
  );

  if (!items.length) return null;

  return (
    <section className="artist-view-section">
      <h2>{title}</h2>
      {hint ? <p className="artist-view-section-hint">{hint}</p> : null}
      <DemoTracksGrid items={visible} showArtist={showArtist} showRank />
      {hasMore ? <ArtistShowAllButton hiddenCount={hiddenCount} onShowAll={showAll} /> : null}
      {!hasMore && items.length > 0 ? (
        <p className="artist-view-section-count">{t('artist.totalTracks', { count: items.length })}</p>
      ) : null}
    </section>
  );
}

function ReleasesTab({
  releases,
  typeFilter,
  yearFilter,
  yearOptions,
  resetKey,
  onTypeFilter,
  onYearFilter,
  onOpenRelease,
}: {
  releases: ArtistRelease[];
  typeFilter: ReleaseTypeFilter;
  yearFilter: 'all' | number;
  yearOptions: number[];
  resetKey: string;
  onTypeFilter: (value: ReleaseTypeFilter) => void;
  onYearFilter: (value: 'all' | number) => void;
  onOpenRelease: (release: ArtistRelease) => void;
}) {
  const { t } = useI18n();
  const { visible, hasMore, hiddenCount, showAll } = useExpandableList(
    releases,
    ARTIST_SECTION_PREVIEW,
    resetKey,
  );

  return (
    <section className="artist-view-section">
      <div className="artist-view-filters">
        <label className="artist-view-filter">
          <span>{t('artist.filterType')}</span>
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilter(e.target.value as ReleaseTypeFilter)}
            aria-label={t('artist.filterType')}
          >
            <option value="all">{t('artist.filterAllTypes')}</option>
            <option value="album">{t('artist.filterAlbum')}</option>
            <option value="single">{t('artist.filterSingle')}</option>
            <option value="ep">{t('artist.filterEp')}</option>
          </select>
        </label>
        <label className="artist-view-filter">
          <span>{t('artist.filterYear')}</span>
          <select
            value={yearFilter === 'all' ? 'all' : String(yearFilter)}
            onChange={(e) => {
              const v = e.target.value;
              onYearFilter(v === 'all' ? 'all' : Number(v));
            }}
            aria-label={t('artist.filterYear')}
          >
            <option value="all">{t('artist.filterAllYears')}</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      {releases.length > 0 ? (
        <>
          <ArtistReleasesGrid items={visible} onOpenRelease={onOpenRelease} />
          {hasMore ? <ArtistShowAllButton hiddenCount={hiddenCount} onShowAll={showAll} /> : null}
          {!hasMore ? (
            <p className="artist-view-section-count">
              {t('artist.totalReleases', { count: releases.length })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="artist-view-empty">{t('artist.noReleases')}</p>
      )}
    </section>
  );
}

export function ArtistView({ view }: { view: Extract<ViewType, { kind: 'artist' }> }) {
  const { state, dispatch, playSong, pause, togglePlayPause } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const openArtist = useOpenArtist();
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ArtistTab>('top');
  const [typeFilter, setTypeFilter] = useState<ReleaseTypeFilter>('all');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');

  const discovery = getDiscovery(state.settings);
  const favorite = isFavoriteArtist(state.settings, view.name);
  const libraryTracks = useMemo(
    () => libraryTracksForArtist(state.songs, view.name),
    [state.songs, view.name],
  );
  const libraryExpand = useExpandableList(libraryTracks, ARTIST_SECTION_PREVIEW, `${view.name}-library`);

  const topTracks = profile?.topTracks ?? profile?.tracks ?? [];
  const resetKey = `${view.name}-${view.deezerId ?? ''}-${profile?.id ?? ''}`;

  const allReleases = useMemo(() => {
    if (!profile) return [] as ArtistRelease[];
    return [...(profile.albums || []), ...(profile.singles || [])];
  }, [profile]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const release of allReleases) {
      const y = releaseYear(release);
      if (y != null) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allReleases]);

  const filteredReleases = useMemo(() => {
    return allReleases.filter((release) => {
      if (typeFilter === 'album' && release.recordType !== 'album' && release.recordType !== 'compile') {
        return false;
      }
      if (typeFilter === 'single' && release.recordType !== 'single') return false;
      if (typeFilter === 'ep' && release.recordType !== 'ep') return false;
      if (yearFilter !== 'all') {
        const y = releaseYear(release);
        if (y !== yearFilter) return false;
      }
      return true;
    });
  }, [allReleases, typeFilter, yearFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lookup = view.deezerId != null ? String(view.deezerId) : view.name;
      const res = await window.imeMusic.getArtistProfile?.(lookup);
      if (!res?.ok || !res.profile) {
        setProfile(null);
        setError(res?.error || t('artist.notFound'));
        return;
      }
      const p = res.profile;
      setProfile({
        ...p,
        topTracks: p.topTracks?.length ? p.topTracks : p.tracks ?? [],
        albums: p.albums ?? [],
        singles: p.singles ?? [],
        collaborationTracks: p.collaborationTracks ?? [],
      });
    } catch {
      setProfile(null);
      setError(t('artist.notFound'));
    } finally {
      setLoading(false);
    }
  }, [view.deezerId, view.name, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTab('top');
    setTypeFilter('all');
    setYearFilter('all');
  }, [view.name, view.deezerId]);

  const toggleFavorite = async () => {
    const key = artistBlockKey(view.name);
    const next = favorite
      ? discovery.favoriteArtists.filter((a) => a.key !== key)
      : [
          toFavoriteArtist(view.name, {
            id: profile?.id ?? view.deezerId ?? undefined,
            pictureUrl: profile?.pictureUrl ?? null,
          }),
          ...discovery.favoriteArtists.filter((a) => a.key !== key),
        ];
    const settings = await window.imeMusic.updateSettings({
      discovery: { ...discovery, favoriteArtists: next },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    showToast(favorite ? t('artist.removedFavorite') : t('artist.addedFavorite'), 'success');
  };

  const playLibraryTrack = (songId: string) => {
    if (state.previewItem) pause();
    if (state.currentSongId === songId) {
      void togglePlayPause();
      return;
    }
    playSong(songId);
  };

  const openRelease = (release: ArtistRelease) => {
    dispatch({
      type: 'SET_VIEW',
      view: {
        kind: 'release',
        artistName: view.name,
        artistDeezerId: view.deezerId ?? profile?.id ?? null,
        release,
      },
    });
  };

  if (loading) {
    return <Spinner label={t('artist.loading')} />;
  }

  if (error || !profile) {
    return (
      <EmptyState
        icon="disc"
        title={t('artist.notFound')}
        description={error || view.name}
        actions={
          <Button variant="secondary" onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'home' } })}>
            {t('nav.home')}
          </Button>
        }
      />
    );
  }

  const tabs: { id: ArtistTab; label: string; count?: number }[] = [
    { id: 'top', label: t('artist.tabTop'), count: topTracks.length || undefined },
    { id: 'releases', label: t('artist.tabReleases'), count: allReleases.length || undefined },
    {
      id: 'collabs',
      label: t('artist.tabCollabs'),
      count: profile.collaborationTracks.length || undefined,
    },
    {
      id: 'related',
      label: t('artist.tabRelated'),
      count: profile.relatedArtists.length || undefined,
    },
  ];

  return (
    <div className="artist-view">
      <div className="artist-view-header">
        <button
          type="button"
          className="artist-view-back"
          onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'home' } })}
        >
          <span className="artist-view-back-icon" aria-hidden>
            <Icon name="chevronRight" size={16} />
          </span>
          {t('common.back')}
        </button>
        <div className="artist-view-hero">
          <div className="artist-view-cover">
            {profile.pictureUrl ? (
              <img src={profile.pictureUrl} alt="" loading="lazy" decoding="async" />
            ) : (
              <Icon name="disc" size={48} />
            )}
          </div>
          <div className="artist-view-info">
            <h1>{profile.name}</h1>
            <p className="artist-view-stats">
              {(profile.nbFan ?? 0) > 0 ? t('artist.fans', { count: profile.nbFan ?? 0 }) : null}
              {(profile.nbAlbum ?? 0) > 0 ? (
                <>
                  {(profile.nbFan ?? 0) > 0 ? ' · ' : null}
                  {t('artist.albums', { count: profile.nbAlbum ?? 0 })}
                </>
              ) : null}
            </p>
            <div className="artist-view-actions">
              <Button variant={favorite ? 'primary' : 'secondary'} onClick={() => void toggleFavorite()}>
                <Icon name={favorite ? 'heart' : 'heartOutline'} size={16} />
                {favorite ? t('artist.inFavorites') : t('artist.addFavorite')}
              </Button>
            </div>
          </div>
        </div>

        <div className="artist-view-tabs" role="tablist" aria-label={profile.name}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`artist-view-tab${tab === item.id ? ' is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.count != null && item.count > 0 ? (
                <span className="artist-view-tab-count">{item.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {tab === 'top' ? (
        <>
          {topTracks.length > 0 ? (
            <ArtistTracksSection
              title={t('artist.topTracks')}
              hint={t('artist.topTracksHint')}
              items={topTracks}
              showArtist={false}
              resetKey={`${resetKey}-top`}
            />
          ) : (
            <section className="artist-view-section">
              <h2>{t('artist.topTracks')}</h2>
              <p className="artist-view-empty">{t('artist.noDemos')}</p>
            </section>
          )}

          {libraryTracks.length > 0 ? (
            <section className="artist-view-section">
              <h2>{t('artist.inLibrary')}</h2>
              <ul className="artist-library-list">
                {libraryExpand.visible.map((song) => {
                  const active = state.currentSongId === song.id && !state.previewItem;
                  const playing = active && state.isPlaying;
                  return (
                    <li key={song.id}>
                      <button
                        type="button"
                        className={`artist-library-row${active ? ' is-active' : ''}`}
                        onClick={() => playLibraryTrack(song.id)}
                      >
                        <Icon name={playing ? 'pause' : 'play'} size={14} />
                        <span className="artist-library-title">{song.title}</span>
                        <span className="artist-library-album">{song.album}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {libraryExpand.hasMore ? (
                <ArtistShowAllButton
                  hiddenCount={libraryExpand.hiddenCount}
                  onShowAll={libraryExpand.showAll}
                />
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'releases' ? (
        <ReleasesTab
          releases={filteredReleases}
          typeFilter={typeFilter}
          yearFilter={yearFilter}
          yearOptions={yearOptions}
          resetKey={`${resetKey}-releases-${typeFilter}-${yearFilter}`}
          onTypeFilter={setTypeFilter}
          onYearFilter={setYearFilter}
          onOpenRelease={openRelease}
        />
      ) : null}

      {tab === 'collabs' ? (
        profile.collaborationTracks.length > 0 ? (
          <ArtistTracksSection
            title={t('artist.collaborations')}
            hint={t('artist.collaborationsHint')}
            items={profile.collaborationTracks}
            showArtist
            resetKey={`${resetKey}-collab`}
          />
        ) : (
          <section className="artist-view-section">
            <p className="artist-view-empty">{t('artist.noCollabs')}</p>
          </section>
        )
      ) : null}

      {tab === 'related' ? (
        profile.relatedArtists.length > 0 ? (
          <section className="artist-view-section">
            <h2>{t('artist.related')}</h2>
            <ul className="artist-chip-grid">
              {profile.relatedArtists.map((artist) => (
                <li key={String(artist.id)}>
                  <button
                    type="button"
                    className="artist-chip"
                    onClick={() => openArtist(artist.name, artist.id)}
                  >
                    {artist.pictureUrl ? (
                      <img
                        src={artist.pictureUrl}
                        alt=""
                        className="artist-chip-avatar"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="artist-chip-avatar artist-chip-avatar-fallback">
                        <Icon name="disc" size={18} />
                      </span>
                    )}
                    <span className="artist-chip-name">{artist.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="artist-view-section">
            <p className="artist-view-empty">{t('artist.noRelated')}</p>
          </section>
        )
      ) : null}
    </div>
  );
}
