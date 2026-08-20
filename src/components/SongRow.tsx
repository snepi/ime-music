import { memo } from 'react';
import { formatTime } from '../store/playerStore';
import { getCoverSrc } from '../utils/media';
import { copyTrackLabel } from '../utils/clipboard';
import { Icon } from './ui/Icon';
import { ArtistLink } from './ArtistLink';
import type { LibraryColumnId, Song } from '../types';
import { useI18n } from '../i18n';

interface Props {
  song: Song;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  columns: LibraryColumnId[];
  showSecondaryText: boolean;
  showHoverActions: boolean;
  showCovers: boolean;
  onPlayToggle: () => void;
  onDoubleClick: () => void;
  onMenu?: (anchor: HTMLElement) => void;
  onToggleLike: () => void;
}

function formatBytes(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size)) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '—';
  }
}

export const SongRow = memo(function SongRow({
  song,
  index,
  isCurrent,
  isPlaying,
  columns,
  showSecondaryText,
  showHoverActions,
  showCovers,
  onPlayToggle,
  onDoubleClick,
  onMenu,
  onToggleLike,
}: Props) {
  const { t } = useI18n();
  const coverSrc = getCoverSrc(song);

  const renderColumn = (id: LibraryColumnId) => {
    switch (id) {
      case 'index':
        return (
          <div
            key={id}
            className="song-index"
            onClick={(e) => {
              e.stopPropagation();
              onPlayToggle();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className="index-num">{index + 1}</span>
            <span className="index-play">
              <Icon name={isCurrent && isPlaying ? 'pause' : 'play'} size={14} />
            </span>
          </div>
        );
      case 'cover':
        if (!showCovers) return <div key={id} />;
        return (
          <div key={id} className="song-cover-cell">
            {coverSrc ? (
              <img className="song-cover" src={coverSrc} alt="" loading="lazy" />
            ) : (
              <div className="song-cover song-cover-fallback">
                <Icon name="disc" size={16} />
              </div>
            )}
          </div>
        );
      case 'title':
        return (
          <div key={id} className="song-title-cell">
            <div className="song-text">
              <button
                type="button"
                className="song-name copyable-label"
                title={t('rec.copyTitle')}
                onClick={(e) => {
                  e.stopPropagation();
                  void copyTrackLabel(song.title, song.artist);
                }}
              >
                {song.title || t('lib.untitled')}
              </button>
              {showSecondaryText ? (
                <ArtistLink
                  artist={song.artist || t('lib.unknownArtist')}
                  className="song-artist"
                />
              ) : null}
            </div>
            {showHoverActions && onMenu ? (
              <button
                type="button"
                className="song-menu-btn"
                aria-label={t('lib.trackMenu')}
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu(e.currentTarget);
                }}
              >
                <Icon name="more" size={16} />
              </button>
            ) : null}
          </div>
        );
      case 'artist':
        return (
          <div key={id} className="song-album">
            <ArtistLink artist={song.artist} className="song-album-artist-link" />
          </div>
        );
      case 'album':
        return (
          <div key={id} className="song-album" title={song.album}>
            {song.album || '—'}
          </div>
        );
      case 'genre':
        return (
          <div key={id} className="song-album">
            {song.genre || '—'}
          </div>
        );
      case 'year':
        return <div key={id} className="song-duration">{song.year ?? '—'}</div>;
      case 'duration':
        return <div key={id} className="song-duration">{formatTime(song.duration)}</div>;
      case 'format':
        return <div key={id} className="song-duration">{song.format || '—'}</div>;
      case 'bitrate':
        return (
          <div key={id} className="song-duration">
            {song.bitrate ? `${Math.round(song.bitrate / 1000)} kbps` : '—'}
          </div>
        );
      case 'fileSize':
        return <div key={id} className="song-duration">{formatBytes(song.fileSize)}</div>;
      case 'rating':
        return <div key={id} className="song-duration">{song.rating ?? '—'}</div>;
      case 'dateAdded':
        return <div key={id} className="song-duration">{formatDate(song.dateAdded)}</div>;
      case 'playCount':
        return <div key={id} className="song-duration">{song.playCount ?? 0}</div>;
      case 'lastPlayed':
        return <div key={id} className="song-duration">{formatDate(song.lastPlayedAt)}</div>;
      default:
        return null;
    }
  };

  return (
    <div
      className={`song-row ${isCurrent ? 'current' : ''}`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    >
      {columns.map((id) => renderColumn(id))}
      <button
        type="button"
        className={`like-btn ${song.liked ? 'liked' : ''}`}
        aria-label={song.liked ? t('player.unlike') : t('player.like')}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLike();
        }}
      >
        <Icon name={song.liked ? 'heart' : 'heartOutline'} size={16} />
      </button>
    </div>
  );
});
