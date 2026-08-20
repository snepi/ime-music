import { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { formatTime } from '../store/playerStore';
import { useI18n } from '../i18n';

type NowPlaying = {
  title: string | null;
  artist: string | null;
  coverUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
};

const EMPTY: NowPlaying = {
  title: null,
  artist: null,
  coverUrl: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};

/** Standalone mini window UI — no second Audio element */
export function MiniPlayerApp() {
  const { t } = useI18n();
  const [np, setNp] = useState<NowPlaying>(EMPTY);

  useEffect(() => {
    document.documentElement.classList.add('mini-player-root');
    document.body.classList.add('mini-player-body');
    return () => {
      document.documentElement.classList.remove('mini-player-root');
      document.body.classList.remove('mini-player-body');
    };
  }, []);

  useEffect(() => {
    if (!window.imeMusic?.onNowPlaying) return undefined;
    return window.imeMusic.onNowPlaying((payload) => setNp(payload));
  }, []);

  const progress =
    np.duration > 0 ? Math.min(100, (np.currentTime / np.duration) * 100) : 0;

  return (
    <div className="mini-player">
      <div className="mini-player-drag" />
      <div className="mini-player-art">
        {np.coverUrl ? (
          <img src={np.coverUrl} alt="" draggable={false} />
        ) : (
          <div className="mini-player-art-fallback">
            <Icon name="disc" size={28} />
          </div>
        )}
      </div>
      <div className="mini-player-meta">
        <div className="mini-player-title">{np.title || t('player.nothing')}</div>
        <div className="mini-player-artist">{np.artist || '—'}</div>
        <div className="mini-player-progress">
          <div className="mini-player-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="mini-player-times">
          <span>{formatTime(np.currentTime)}</span>
          <span>{formatTime(np.duration || 0)}</span>
        </div>
      </div>
      <div className="mini-player-controls">
        <button
          type="button"
          className="player-btn"
          onClick={() => window.imeMusic.relayPlaybackCommand?.('previous')}
          aria-label={t('player.prev')}
        >
          <Icon name="previous" size={18} />
        </button>
        <button
          type="button"
          className="player-btn play-pause"
          onClick={() => window.imeMusic.relayPlaybackCommand?.('playPause')}
          aria-label={np.isPlaying ? t('player.pause') : t('player.play')}
        >
          <Icon name={np.isPlaying ? 'pause' : 'play'} size={20} />
        </button>
        <button
          type="button"
          className="player-btn"
          onClick={() => window.imeMusic.relayPlaybackCommand?.('next')}
          aria-label={t('player.next')}
        >
          <Icon name="next" size={18} />
        </button>
        <button
          type="button"
          className="player-btn"
          onClick={() => {
            window.imeMusic.relayPlaybackCommand?.('show');
            void window.imeMusic.closeMiniPlayer?.();
          }}
          aria-label={t('mini.openMain')}
          title={t('mini.mainWindow')}
        >
          <Icon name="maximize" size={16} />
        </button>
        <button
          type="button"
          className="player-btn"
          onClick={() => void window.imeMusic.closeMiniPlayer?.()}
          aria-label={t('window.close')}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
