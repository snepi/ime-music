import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { useI18n } from '../i18n';

interface LyricLine {
  time: number;
  text: string;
}

export function LyricsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = usePlayer();
  const { t } = useI18n();
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [synced, setSynced] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);

  const trackId = state.previewItem ? null : state.currentSongId;
  const currentTime = state.previewItem ? state.previewTime : state.currentTime;

  useEffect(() => {
    if (!open) return;
    if (!trackId || !window.imeMusic?.getLyrics) {
      setLines([]);
      setEmpty(true);
      setSource(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void window.imeMusic.getLyrics(trackId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      setLines(res?.lines || []);
      setSynced(Boolean(res?.synced));
      setSource(res?.source || null);
      setEmpty(Boolean(res?.empty) || !(res?.lines?.length));
    });
    return () => {
      cancelled = true;
    };
  }, [open, trackId]);

  const activeIndex = useMemo(() => {
    if (!synced || !lines.length) return -1;
    let idx = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].time <= currentTime + 0.05) idx = i;
      else break;
    }
    return idx;
  }, [currentTime, lines, synced]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, open]);

  if (!open) return null;

  return createPortal(
    <div className="lyrics-panel lyrics-panel-fixed" role="dialog" aria-label={t('lyrics.title')}>
      <div className="lyrics-panel-head">
        <div>
          <h3 className="lyrics-panel-title">{t('lyrics.title')}</h3>
          {source ? <p className="lyrics-panel-source">{t('lyrics.source', { source })}</p> : null}
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={t('common.hide')}>
          <Icon name="close" size={16} />
        </Button>
      </div>
      <div className="lyrics-panel-body">
        {state.previewItem ? (
          <p className="lyrics-panel-empty">{t('lyrics.previewOnly')}</p>
        ) : loading ? (
          <p className="lyrics-panel-empty">{t('common.loading')}</p>
        ) : empty ? (
          <p className="lyrics-panel-empty">{t('lyrics.empty')}</p>
        ) : (
          lines.map((line, i) => (
            <div
              key={`${line.time}-${i}`}
              ref={i === activeIndex ? activeRef : undefined}
              className={`lyrics-line${i === activeIndex ? ' is-active' : ''}`}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
