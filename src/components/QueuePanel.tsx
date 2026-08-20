import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayer, formatTime } from '../store/playerStore';
import { getCoverSrc } from '../utils/media';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function QueuePanel({ open, onClose }: Props) {
  const { state, removeFromQueue, clearQueue, reorderQueue, playNow } = usePlayer();
  const { t } = useI18n();
  const [dragId, setDragId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = state.playbackQueue.map((q) => q.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    await reorderQueue(next);
    setDragId(null);
  };

  return createPortal(
    <div className="queue-overlay" role="presentation">
      <aside
        className="queue-panel"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('queue.title')}
      >
        <div className="queue-panel-header">
          <h3>{t('queue.title')}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('settings.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <p className="queue-hint">{t('queue.hint')}</p>

        {state.playbackQueue.length === 0 ? (
          <EmptyState icon="queue" title={t('queue.empty')} description={t('queue.emptyHint')} />
        ) : (
          <ul className="queue-list">
            {state.playbackQueue.map((item, index) => {
              const song = item.song ?? state.songs.find((s) => s.id === item.trackId);
              if (!song) return null;
              return (
                <li
                  key={item.id}
                  className={`queue-row ${dragId === item.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => void handleDrop(item.id)}
                  onDoubleClick={() => playNow(song.id)}
                >
                  <span className="queue-drag-handle" title={t('queue.drag')}>
                    <Icon name="grip" size={14} />
                  </span>
                  <span className="queue-index">{index + 1}</span>
                  {getCoverSrc(song) ? (
                    <img className="queue-cover" src={getCoverSrc(song)!} alt="" loading="lazy" />
                  ) : (
                    <div className="queue-cover queue-cover-placeholder">
                      <Icon name="disc" size={16} />
                    </div>
                  )}
                  <div className="queue-row-text">
                    <div className="queue-row-title">{song.title}</div>
                    <div className="queue-row-artist">{song.artist}</div>
                  </div>
                  <span className="queue-row-duration">{formatTime(song.duration)}</span>
                  <button
                    type="button"
                    className="icon-btn queue-remove"
                    title={t('queue.remove')}
                    aria-label={t('queue.remove')}
                    onClick={() => void removeFromQueue(item.id)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {state.playbackQueue.length > 0 && (
          <div className="queue-panel-footer">
            <Button variant="secondary" onClick={() => void clearQueue()}>
              {t('queue.clear')}
            </Button>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
