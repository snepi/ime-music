import { useRef, useCallback, useState, memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePlayer, formatTime } from '../store/playerStore';
import { getCoverSrc } from '../utils/media';
import { DEFAULT_PLAYBACK } from '../utils/playbackSettings';
import { QueuePanel } from './QueuePanel';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { copyTrackLabel } from '../utils/clipboard';
import { DEFAULT_APPEARANCE } from '../appearance/schema';
import { ArtistLink } from './ArtistLink';
import type { SleepTimerMode } from '../types';
import { useI18n } from '../i18n';
import { getDiscovery, toWishlistItem } from '../utils/discovery';
import { LyricsPanel } from './LyricsPanel';

const PlayerProgress = memo(function PlayerProgress({
  currentTime,
  duration,
  disabled,
  showTime,
  showRemainingTime,
  showSeconds,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  disabled: boolean;
  showTime: boolean;
  showRemainingTime: boolean;
  showSeconds: boolean;
  onSeek: (clientX: number, progressEl: HTMLDivElement) => void;
}) {
  const progressRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fmt = (t: number) => formatTime(t, showSeconds);
  const rightLabel = showRemainingTime
    ? `-${fmt(Math.max(0, duration - currentTime))}`
    : fmt(duration);

  return (
    <div className="player-progress">
      {showTime ? <span className="player-time">{fmt(currentTime)}</span> : null}
      <div
        className="progress-bar"
        ref={progressRef}
        onPointerDown={(e) => {
          if (disabled || !progressRef.current) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onSeek(e.clientX, progressRef.current);
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !progressRef.current) return;
          onSeek(e.clientX, progressRef.current);
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        <div className="progress-fill" style={{ width: `${progress}%` }} />
        <div className="progress-thumb" style={{ left: `${progress}%` }} />
      </div>
      {showTime ? <span className="player-time">{rightLabel}</span> : null}
    </div>
  );
});

export function PlayerBar() {
  const { t } = useI18n();
  const {
    state,
    dispatch,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seek,
    toggleMute,
    toggleLike,
    removeMissingCurrent,
    clearPlaybackError,
    toggleShuffle,
    cycleRepeat,
    queueSimilarNext,
    setSleepTimer,
    clearSleepTimer,
  } = usePlayer();
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.previewError) return;
    showToast(t('rec.previewFail'), 'error');
    dispatch({ type: 'CLEAR_PREVIEW_ERROR' });
  }, [state.previewError, showToast, dispatch, t]);

  const [queueOpen, setQueueOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [sleepMenuPos, setSleepMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const sleepBtnRef = useRef<HTMLButtonElement>(null);
  const sleepMenuRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const draggingVolume = useRef(false);
  const volumeDraft = useRef(state.settings.globalVolume);

  const preview = state.previewItem;
  const discovery = getDiscovery(state.settings);
  const previewInWishlist = Boolean(
    preview && discovery.wishlist.some((w) => w.id === preview.id),
  );
  const currentSong = state.songs.find((s) => s.id === state.currentSongId);
  const coverSrc = preview?.coverUrl || (currentSong ? getCoverSrc(currentSong) : null);
  const displayTitle = preview?.title || currentSong?.title;
  const displayArtist = preview ? `${preview.artist} · ${t('player.demoSuffix')}` : currentSong?.artist;
  const duration = preview ? preview.duration || 30 : (currentSong?.duration ?? 0);
  const currentTime = preview ? state.previewTime : state.currentTime;
  const isPlaying = preview ? state.previewPlaying : state.isPlaying;
  const displayVolume = state.muted ? 0 : state.settings.globalVolume;
  const appearance = state.settings.appearance || DEFAULT_APPEARANCE;
  const player = appearance.player;
  const covers = appearance.covers;
  const showQueue = appearance.layout.showQueue && player.showQueueButton;
  const playback = { ...DEFAULT_PLAYBACK, ...(state.settings.playback || {}) };
  const sleepActive = state.sleepMode !== 'off';

  const applySleep = (mode: SleepTimerMode, minutes?: number) => {
    setSleepTimer(mode, minutes);
    setSleepOpen(false);
    setSleepMenuPos(null);
    if (mode === 'off') {
      showToast(t('player.sleepOffToast'), 'info');
      return;
    }
    if (mode === 'minutes') showToast(t('player.sleepIn', { minutes: minutes ?? 0 }), 'success');
    else if (mode === 'endOfTrack') showToast(t('player.sleepTrackToast'), 'success');
    else showToast(t('player.sleepAlbumToast'), 'success');
  };

  const toggleSleepMenu = () => {
    if (sleepOpen) {
      setSleepOpen(false);
      setSleepMenuPos(null);
      return;
    }
    const btn = sleepBtnRef.current;
    if (!btn) {
      setSleepOpen(true);
      return;
    }
    const rect = btn.getBoundingClientRect();
    setSleepMenuPos({
      left: Math.min(window.innerWidth - 160, Math.max(8, rect.left + rect.width / 2 - 70)),
      bottom: window.innerHeight - rect.top + 8,
    });
    setSleepOpen(true);
  };

  useEffect(() => {
    if (!sleepOpen) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (sleepBtnRef.current?.contains(t) || sleepMenuRef.current?.contains(t)) return;
      setSleepOpen(false);
      setSleepMenuPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSleepOpen(false);
        setSleepMenuPos(null);
      }
    };
    const onReposition = () => {
      const btn = sleepBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setSleepMenuPos({
        left: Math.min(window.innerWidth - 160, Math.max(8, rect.left + rect.width / 2 - 70)),
        bottom: window.innerHeight - rect.top + 8,
      });
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
    };
  }, [sleepOpen]);

  const applyVolumeLocal = useCallback(
    (ratio: number) => {
      const next = Math.max(0, Math.min(1, ratio));
      volumeDraft.current = next;
      void window.imeMusic.updateSettings({ globalVolume: next, muted: false }).then((settings) => {
        dispatch({ type: 'UPDATE_SETTINGS', settings });
      });
      if (state.muted) dispatch({ type: 'SET_MUTED', muted: false });
    },
    [dispatch, state.muted],
  );

  const persistVolume = useCallback(async () => {
    const settings = await window.imeMusic.updateSettings({
      globalVolume: volumeDraft.current,
      muted: false,
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  }, [dispatch]);

  const seekFromClientX = useCallback(
    (clientX: number, el: HTMLDivElement) => {
      if (preview) {
        if (duration <= 0) return;
        const rect = el.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        seek(ratio * duration);
        return;
      }
      if (!currentSong || duration <= 0 || state.playbackError) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seek(ratio * duration);
    },
    [currentSong, duration, preview, seek, state.playbackError],
  );

  const handleRelocate = async () => {
    if (!currentSong) return;
    const updated = await window.imeMusic.relocateSongFile(currentSong.id);
    if (updated) {
      dispatch({ type: 'UPDATE_SONG', song: updated });
      clearPlaybackError();
    }
  };

  const handleShowInFolder = () => {
    if (currentSong?.filePath) void window.imeMusic.showItemInFolder(currentSong.filePath);
  };

  const addPreviewToWishlist = async () => {
    if (!preview) return;
    if (discovery.wishlist.some((w) => w.id === preview.id)) {
      showToast(t('rec.alreadyWish'), 'info');
      return;
    }
    const settings = await window.imeMusic.updateSettings({
      discovery: {
        ...discovery,
        wishlist: [toWishlistItem(preview), ...discovery.wishlist],
      },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    showToast(t('rec.addedWish'), 'success');
  };

  return (
    <div className={`player-bar-wrap player-variant-${player.variant}`}>
      {covers.blurBackground && coverSrc ? (
        <div
          className="player-blur-bg"
          style={{ backgroundImage: `url(${coverSrc})` }}
          aria-hidden
        />
      ) : null}
      {state.playbackError && (
        <div className="playback-error-banner" role="alert">
          <div className="playback-error-text">
            <Icon name={state.playbackError === 'missing' ? 'fileMissing' : 'warning'} size={18} />
            <span>
              {state.playbackError === 'missing' ? t('player.fileMissing') : t('player.playbackError')}
              {state.playbackErrorMessage ? ` — ${state.playbackErrorMessage}` : ''}
            </span>
          </div>
          <div className="playback-error-actions">
            {state.playbackError === 'missing' && (
              <>
                <Button variant="secondary" onClick={() => void handleRelocate()}>
                  {t('player.findFile')}
                </Button>
                <Button variant="secondary" onClick={handleShowInFolder}>
                  {t('player.showInFolder')}
                </Button>
                <Button variant="danger" onClick={() => void removeMissingCurrent()}>
                  {t('player.removeFromLib')}
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={clearPlaybackError}>
              {t('common.hide')}
            </Button>
            <Button variant="secondary" onClick={nextTrack}>
              {t('player.next')}
            </Button>
          </div>
        </div>
      )}

      <div className="player-bar">
        <div className="player-track-info">
          {displayTitle ? (
            <>
              {player.showArtwork && covers.show ? (
                coverSrc ? (
                  <img className="player-cover" src={coverSrc} alt="" />
                ) : (
                  <div className="player-cover player-cover-fallback">
                    <Icon name="disc" size={20} />
                  </div>
                )
              ) : null}
              <div className="player-track-text">
                {player.showTitle ? (
                  <button
                    type="button"
                    className="player-track-title copyable-label"
                    title={t('rec.copyTitle')}
                    onClick={() => {
                      const artist = preview?.artist || currentSong?.artist || '';
                      void copyTrackLabel(displayTitle || '', artist).then((ok) => {
                        showToast(ok ? t('common.copy') : t('common.copyFail'), ok ? 'success' : 'error');
                      });
                    }}
                  >
                    {displayTitle}
                  </button>
                ) : null}
                {player.showArtist && displayArtist ? (
                  <ArtistLink
                    artist={preview?.artist || currentSong?.artist || ''}
                    className="player-track-artist"
                    title={t('artist.platforms', {
                      name: preview?.artist || currentSong?.artist || '',
                    })}
                  />
                ) : null}
              </div>
              {preview ? (
                <button
                  type="button"
                  className={`like-btn player-wish-btn${previewInWishlist ? ' liked' : ''}`}
                  onClick={() => void addPreviewToWishlist()}
                  disabled={previewInWishlist}
                  aria-label={previewInWishlist ? t('rec.inList') : t('rec.addWish')}
                  title={previewInWishlist ? t('rec.inList') : t('rec.addWish')}
                >
                  <Icon name={previewInWishlist ? 'check' : 'add'} size={16} />
                </button>
              ) : null}
              {player.showLike && currentSong && !preview ? (
                <button
                  type="button"
                  className={`like-btn ${currentSong.liked ? 'liked' : ''}`}
                  onClick={() => void toggleLike(currentSong.id)}
                  aria-label={currentSong.liked ? t('player.unlike') : t('player.like')}
                >
                  <Icon name={currentSong.liked ? 'heart' : 'heartOutline'} size={16} />
                </button>
              ) : null}
            </>
          ) : (
            <div className="player-track-text muted">
              <div className="player-track-title">{t('player.nothing')}</div>
            </div>
          )}
        </div>

        <div className="player-center">
          <div className="player-controls">
            {!preview ? (
              <button
                type="button"
                className={`player-btn ${playback.shuffle ? 'active' : ''}`}
                onClick={() => void toggleShuffle()}
                aria-label={t('player.shuffle')}
                title={playback.shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}
              >
                <Icon name="shuffle" size={16} />
              </button>
            ) : null}
            {player.showPrevNext ? (
              <button
                type="button"
                className="player-btn"
                onClick={prevTrack}
                aria-label={t('player.prev')}
                title={t('player.prev')}
              >
                <Icon name="previous" size={20} />
              </button>
            ) : null}
            {player.showPlayPause ? (
              <button
                type="button"
                className="player-btn play-pause"
                onClick={togglePlayPause}
                aria-label={isPlaying ? t('player.pause') : t('player.play')}
                title={isPlaying ? t('player.pause') : t('player.play')}
                disabled={Boolean(!preview && state.playbackError === 'missing')}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
              </button>
            ) : null}
            {player.showPrevNext ? (
              <button
                type="button"
                className="player-btn"
                onClick={nextTrack}
                aria-label={t('player.next')}
                title={t('player.next')}
              >
                <Icon name="next" size={20} />
              </button>
            ) : null}
            {!preview ? (
              <>
                <button
                  type="button"
                  className={`player-btn ${playback.repeat !== 'off' ? 'active' : ''}`}
                  onClick={() => void cycleRepeat()}
                  aria-label={t('player.repeat')}
                  title={
                    playback.repeat === 'one'
                      ? t('player.repeatOne')
                      : playback.repeat === 'all'
                        ? t('player.repeatAll')
                        : t('player.repeatOff')
                  }
                >
                  <Icon name={playback.repeat === 'one' ? 'repeatOne' : 'repeat'} size={16} />
                </button>
                <button
                  type="button"
                  className="player-btn"
                  disabled={!currentSong}
                  onClick={() => {
                    void queueSimilarNext().then((n) => {
                      if (n > 0) showToast(t('player.queuedSimilar', { count: n }), 'success');
                      else showToast(t('player.noSimilar'), 'info');
                    });
                  }}
                  aria-label={t('player.similar')}
                  title={t('player.similar')}
                >
                  <Icon name="similar" size={16} />
                </button>
                <div className="player-sleep-wrap">
                  <button
                    ref={sleepBtnRef}
                    type="button"
                    className={`player-btn ${sleepActive ? 'active' : ''}`}
                    onClick={toggleSleepMenu}
                    aria-label={t('player.sleep')}
                    aria-expanded={sleepOpen}
                    title={
                      sleepActive
                        ? state.sleepMode === 'minutes' && state.sleepEndsAt
                          ? t('player.sleepIn', {
                              minutes: Math.max(1, Math.ceil((state.sleepEndsAt - Date.now()) / 60000)),
                            })
                          : state.sleepMode === 'endOfAlbum'
                            ? t('player.sleepAlbum')
                            : t('player.sleepTrack')
                        : t('player.sleep')
                    }
                  >
                    <Icon name="timer" size={16} />
                  </button>
                  {sleepOpen && sleepMenuPos
                    ? createPortal(
                        <div
                          ref={sleepMenuRef}
                          className="player-sleep-menu"
                          role="menu"
                          style={{ left: sleepMenuPos.left, bottom: sleepMenuPos.bottom }}
                        >
                          <button type="button" onClick={() => applySleep('off')}>
                            {t('player.sleepOff')}
                          </button>
                          <button type="button" onClick={() => applySleep('minutes', 15)}>
                            15 {t('player.min')}
                          </button>
                          <button type="button" onClick={() => applySleep('minutes', 30)}>
                            30 {t('player.min')}
                          </button>
                          <button type="button" onClick={() => applySleep('minutes', 45)}>
                            45 {t('player.min')}
                          </button>
                          <button type="button" onClick={() => applySleep('minutes', 60)}>
                            60 {t('player.min')}
                          </button>
                          <button type="button" onClick={() => applySleep('endOfTrack')}>
                            {t('player.sleepTrack')}
                          </button>
                          <button type="button" onClick={() => applySleep('endOfAlbum')}>
                            {t('player.sleepAlbum')}
                          </button>
                          {sleepActive ? (
                            <button
                              type="button"
                              onClick={() => {
                                clearSleepTimer();
                                setSleepOpen(false);
                                setSleepMenuPos(null);
                              }}
                            >
                              {t('player.sleepReset')}
                            </button>
                          ) : null}
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
              </>
            ) : null}
          </div>

          {player.showProgress ? (
            <PlayerProgress
              currentTime={currentTime}
              duration={duration}
              disabled={Boolean(
                preview
                  ? duration <= 0
                  : !currentSong || duration <= 0 || state.playbackError,
              )}
              showTime={player.showTime}
              showRemainingTime={player.showRemainingTime}
              showSeconds={player.showSeconds}
              onSeek={seekFromClientX}
            />
          ) : null}
        </div>

        <div className="player-right">
          {player.showVolume ? (
            <div
              className="player-volume"
              onWheel={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const step = 0.05;
                const delta = e.deltaY < 0 ? step : -step;
                applyVolumeLocal(state.settings.globalVolume + delta);
                void persistVolume();
              }}
            >
              <button
                type="button"
                className="player-btn"
                onClick={() => void toggleMute()}
                aria-label={state.muted ? t('player.unmute') : t('player.mute')}
                title={state.muted ? t('player.unmute') : t('player.mute')}
              >
                <Icon name={state.muted || displayVolume === 0 ? 'volumeMute' : 'volume'} size={18} />
              </button>
              <div
                className="volume-bar"
                ref={volumeRef}
                onPointerDown={(e) => {
                  draggingVolume.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  if (!volumeRef.current) return;
                  const rect = volumeRef.current.getBoundingClientRect();
                  applyVolumeLocal((e.clientX - rect.left) / rect.width);
                }}
                onPointerMove={(e) => {
                  if (!draggingVolume.current || !volumeRef.current) return;
                  const rect = volumeRef.current.getBoundingClientRect();
                  applyVolumeLocal((e.clientX - rect.left) / rect.width);
                }}
                onPointerUp={(e) => {
                  if (!draggingVolume.current) return;
                  draggingVolume.current = false;
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  void persistVolume();
                }}
                onPointerCancel={() => {
                  draggingVolume.current = false;
                }}
              >
                <div className="volume-fill" style={{ width: `${displayVolume * 100}%` }} />
                <div className="volume-thumb" style={{ left: `${displayVolume * 100}%` }} />
              </div>
            </div>
          ) : null}

          {showQueue ? (
            <button
              type="button"
              className={`player-btn queue-toggle ${queueOpen ? 'active' : ''}`}
              onClick={() => setQueueOpen((v) => !v)}
              aria-label={t('player.queue')}
              title={t('player.queue')}
            >
              <Icon name="queue" size={18} />
              {state.playbackQueue.length > 0 && (
                <span className="queue-badge">{state.playbackQueue.length}</span>
              )}
            </button>
          ) : null}
          <button
            type="button"
            className={`player-btn ${lyricsOpen ? 'active' : ''}`}
            onClick={() => setLyricsOpen((v) => !v)}
            aria-label={t('lyrics.title')}
            title={t('lyrics.title')}
            disabled={Boolean(preview) || !currentSong}
          >
            <Icon name="music" size={18} />
          </button>
          <button
            type="button"
            className="player-btn"
            onClick={() => {
              void window.imeMusic.toggleMiniPlayer?.().then((r) => {
                if (r?.open) showToast(t('player.miniOpened'), 'success');
              });
            }}
            aria-label={t('player.mini')}
            title={t('player.mini')}
          >
            <Icon name="pictureInPicture" size={18} />
          </button>
        </div>
      </div>

      {appearance.layout.showQueue ? (
        <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
      ) : null}
      <LyricsPanel open={lyricsOpen} onClose={() => setLyricsOpen(false)} />
    </div>
  );
}
