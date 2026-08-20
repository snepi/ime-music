import { useCallback, useEffect, useState } from 'react';
import { usePlayer, formatTime } from '../store/playerStore';
import { getCoverSrc } from '../utils/media';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { HomeDiscoverySearch } from './HomeDiscoverySearch';
import { HomeWavesCard } from './HomeWavesCard';
import { ArtistLink } from './ArtistLink';
import { useOpenArtist } from '../hooks/useOpenArtist';
import { getDiscovery } from '../utils/discovery';
import { useToast } from './ui/Toast';
import type { HomeFeed, RecommendationItem, Song } from '../types';
import { useI18n } from '../i18n';

function SongRail({
  title,
  songs,
  currentSongId,
  isPlaying,
  onToggle,
  empty,
}: {
  title: string;
  songs: Song[];
  currentSongId: string | null;
  isPlaying: boolean;
  onToggle: (id: string) => void;
  empty?: string;
}) {
  const { t } = useI18n();
  if (!songs.length) {
    return (
      <section className="home-section">
        <h2 className="home-section-title">{title}</h2>
        <p className="home-section-empty">{empty || t('home.empty')}</p>
      </section>
    );
  }
  return (
    <section className="home-section">
      <h2 className="home-section-title">{title}</h2>
      <ul className="home-rail">
        {songs.map((song) => {
          const cover = getCoverSrc(song);
          const active = currentSongId === song.id;
          const playing = active && isPlaying;
          return (
            <li key={song.id}>
              <button
                type="button"
                className={`home-card${active ? ' is-active' : ''}${playing ? ' is-playing' : ''}`}
                onClick={() => onToggle(song.id)}
                aria-label={
                  playing
                    ? `${t('player.pause')}: ${song.title}`
                    : `${t('player.play')}: ${song.title}`
                }
              >
                <div className="home-card-cover">
                  {cover ? <img src={cover} alt="" /> : <Icon name="music" size={22} />}
                  <span className="home-card-play" aria-hidden>
                    <Icon name={playing ? 'pause' : 'play'} size={14} />
                  </span>
                </div>
                <div className="home-card-title">{song.title}</div>
                <div className="home-card-artist">
                  <ArtistLink artist={song.artist} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeView() {
  const {
    state,
    dispatch,
    playSong,
    pause,
    togglePlayPause,
    startLibraryMix,
    togglePreview,
  } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [demos, setDemos] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mixBusy, setMixBusy] = useState(false);
  const openArtist = useOpenArtist();
  const discovery = getDiscovery(state.settings);

  const previewActive = Boolean(state.previewItem);
  const isPlaying = previewActive ? state.previewPlaying : state.isPlaying;
  const currentSongId = previewActive ? null : state.currentSongId;

  const playOrToggle = useCallback(
    (songId: string) => {
      if (state.previewItem) {
        // Switching from demo preview to library track
        playSong(songId);
        return;
      }
      if (state.currentSongId === songId) {
        togglePlayPause();
        return;
      }
      playSong(songId);
    },
    [playSong, state.currentSongId, state.previewItem, togglePlayPause],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.imeMusic.getHomeFeed();
      setFeed(next);
      try {
        const recs = await window.imeMusic.getRecommendations({ mode: 'all', force: false });
        setDemos((recs.items || []).slice(0, 8));
      } catch {
        setDemos([]);
      }
    } catch {
      setFeed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, state.songs.length]);

  const startDailyMix = async () => {
    setMixBusy(true);
    try {
      const n = await startLibraryMix();
      if (!n) showToast(t('home.mixNotEnough'), 'info');
      else showToast(t('home.mixStarted'), 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('home.mixFailed'), 'error');
    } finally {
      setMixBusy(false);
    }
  };

  if (state.loading && state.songs.length === 0) {
    return <Spinner label={t('common.loading')} />;
  }

  if (state.songs.length === 0) {
    return (
      <div className="home-view">
        <div className="view-header">
          <div className="view-info">
            <h1>{t('home.title')}</h1>
            <p>{t('home.welcomeHint')}</p>
          </div>
          <Button variant="primary" onClick={() => void window.imeMusic.importFolders()}>
            <Icon name="import" size={16} />
            {t('home.importFolder')}
          </Button>
        </div>
        <HomeWavesCard />
        <HomeDiscoverySearch />
      </div>
    );
  }

  if (loading || !feed) {
    return <Spinner label={t('home.building')} />;
  }

  const continueSong = feed.continueSong;
  const continueCover = continueSong ? getCoverSrc(continueSong) : null;
  const continueActive = Boolean(continueSong && currentSongId === continueSong.id);
  const continuePlaying = continueActive && isPlaying;

  return (
    <div className="home-view">
      <div className="view-header">
        <div className="view-info">
          <h1>{t('home.title')}</h1>
          <p>
            {t('home.subtitle')}
            {feed.todayListenCount > 0
              ? ` · ${t('home.todayListens', { count: feed.todayListenCount })}`
              : ''}
          </p>
        </div>
        <Button variant="primary" disabled={mixBusy} onClick={() => void startDailyMix()}>
          <Icon name="shuffle" size={16} />
          {t('home.mix')}
        </Button>
      </div>

      <HomeWavesCard />

      <HomeDiscoverySearch />

      {discovery.favoriteArtists.length > 0 ? (
        <section className="home-section">
          <h2 className="home-section-title">{t('artist.favorites')}</h2>
          <ul className="artist-chip-grid">
            {discovery.favoriteArtists.slice(0, 12).map((artist) => (
              <li key={artist.key}>
                <button
                  type="button"
                  className="artist-chip"
                  onClick={() => openArtist(artist.name, artist.deezerId)}
                >
                  {artist.pictureUrl ? (
                    <img src={artist.pictureUrl} alt="" className="artist-chip-avatar" />
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
      ) : null}

      {continueSong ? (
        <section className="home-continue">
          <div
            className={`home-continue-card${continueActive ? ' is-active' : ''}${continuePlaying ? ' is-playing' : ''}`}
          >
            <button
              type="button"
              className="home-continue-main"
              onClick={() => playOrToggle(continueSong.id)}
              aria-label={
                continuePlaying
                  ? `${t('player.pause')}: ${continueSong.title}`
                  : `${t('home.continue')}: ${continueSong.title}`
              }
            >
              <div className="home-continue-cover">
                {continueCover ? <img src={continueCover} alt="" /> : <Icon name="disc" size={32} />}
              </div>
              <div className="home-continue-text">
                <div className="home-continue-label">
                  {continuePlaying
                    ? t('home.playingNow')
                    : continueActive
                      ? t('home.onPause')
                      : t('home.continue')}
                </div>
                <div className="home-continue-title">{continueSong.title}</div>
                <div className="home-continue-meta">
                  <ArtistLink artist={continueSong.artist} />
                  {!continueActive && feed.continueTime > 5 ? (
                    <span> · с {formatTime(feed.continueTime)}</span>
                  ) : null}
                  {continueActive ? (
                    <span> · {formatTime(state.currentTime)}</span>
                  ) : null}
                </div>
              </div>
            </button>
            <button
              type="button"
              className="home-continue-play"
              onClick={() => playOrToggle(continueSong.id)}
              aria-label={continuePlaying ? t('player.pause') : t('player.play')}
              title={continuePlaying ? t('player.pause') : t('player.play')}
            >
              <Icon name={continuePlaying ? 'pause' : 'play'} size={22} />
            </button>
          </div>
        </section>
      ) : null}

      <SongRail
        title={t('home.recent')}
        songs={feed.recent}
        currentSongId={currentSongId}
        isPlaying={isPlaying}
        onToggle={playOrToggle}
        empty={t('home.recentEmpty')}
      />
      <SongRail
        title={t('home.similar')}
        songs={feed.similarToday}
        currentSongId={currentSongId}
        isPlaying={isPlaying}
        onToggle={playOrToggle}
        empty={t('home.similarEmpty')}
      />

      {demos.length > 0 ? (
        <section className="home-section">
          <div className="home-section-head">
            <h2 className="home-section-title">{t('home.demos')}</h2>
            <Button
              variant="ghost"
              onClick={() => dispatch({ type: 'SET_VIEW', view: { kind: 'recommendations' } })}
            >
              {t('home.all')}
            </Button>
          </div>
          <p className="home-section-hint">{t('home.demosHint')}</p>
          <ul className="home-rail">
            {demos.map((item) => {
              const active = state.previewItem?.id === item.id;
              const playing = active && state.previewPlaying;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`home-card home-card-demo${active ? ' is-active' : ''}${playing ? ' is-playing' : ''}`}
                    onClick={() => {
                      if (state.isPlaying) pause();
                      void togglePreview(item);
                    }}
                    aria-label={
                      playing
                        ? `${t('player.pause')}: ${item.title}`
                        : `${t('rec.demo')}: ${item.title}`
                    }
                  >
                    <div className="home-card-cover">
                      {item.coverUrl ? <img src={item.coverUrl} alt="" /> : <Icon name="disc" size={22} />}
                      <span className="home-card-play" aria-hidden>
                        <Icon name={playing ? 'pause' : 'play'} size={14} />
                      </span>
                    </div>
                    <div className="home-card-title">{item.title}</div>
                    <div className="home-card-artist">
                      <ArtistLink artist={item.artist} deezerId={item.deezerId} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
