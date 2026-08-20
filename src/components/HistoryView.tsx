import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlayer, formatTime } from '../store/playerStore';
import { getCoverSrc } from '../utils/media';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Spinner } from './ui/Spinner';
import { ArtistLink } from './ArtistLink';
import type { HistoryResult } from '../types';
import { useI18n } from '../i18n';

function formatPlayedAt(
  ts: number,
  t: (key: 'history.today' | 'history.yesterday', vars?: Record<string, string | number>) => string,
  locale: string,
): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return t('history.today', { time });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return t('history.yesterday', { time });
  return d.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryView() {
  const { playSong } = usePlayer();
  const { t, bcp47 } = useI18n();
  const [data, setData] = useState<HistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!window.imeMusic?.getHistory) {
      setError(t('history.unavailable'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.imeMusic.getHistory(80);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = data?.stats;
  const items = useMemo(() => data?.items || [], [data]);

  return (
    <div className="history-view">
      <div className="view-header">
        <div className="view-info">
          <h1>{t('history.title')}</h1>
          <p>{t('history.subtitle')}</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} title={t('common.refresh')}>
          <Icon name="refresh" size={16} />
          {t('common.refresh')}
        </Button>
      </div>

      {loading ? <Spinner label={t('history.loading')} /> : null}

      {!loading && error ? (
        <EmptyState title={t('rec.loadFailed')} description={error} />
      ) : null}

      {!loading && !error ? (
        <>
          {stats ? (
            <div className="history-stats">
              <div className="history-stat">
                <div className="history-stat-value">{stats.weekCount}</div>
                <div className="history-stat-label">{t('history.week')}</div>
              </div>
              <div className="history-stat">
                <div className="history-stat-value">{stats.monthCount}</div>
                <div className="history-stat-label">{t('history.month')}</div>
              </div>
              <div className="history-stat">
                <div className="history-stat-value">{stats.totalCount}</div>
                <div className="history-stat-label">{t('history.total')}</div>
              </div>
            </div>
          ) : null}

          {stats && stats.topArtists.length > 0 ? (
            <section className="history-section">
              <h2 className="history-section-title">{t('history.topArtists')}</h2>
              <ul className="history-tops">
                {stats.topArtists.map((a) => (
                  <li key={a.artist} className="history-top-row">
                    <ArtistLink artist={a.artist} />
                    <span className="history-top-count">{a.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {stats && stats.topTracks.length > 0 ? (
            <section className="history-section">
              <h2 className="history-section-title">{t('history.topTracks')}</h2>
              <ul className="history-tops">
                {stats.topTracks.map((tr) => (
                  <li key={tr.trackId} className="history-top-row">
                    <button
                      type="button"
                      className="history-top-play"
                      onClick={() => playSong(tr.trackId)}
                    >
                      {tr.title} — {tr.artist}
                    </button>
                    <span className="history-top-count">{tr.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="history-section">
            <h2 className="history-section-title">{t('history.recent')}</h2>
            {items.length === 0 ? (
              <EmptyState title={t('history.empty')} description={t('history.emptyHint')} />
            ) : (
              <ul className="history-list">
                {items.map((item) => {
                  const song = item.song;
                  if (!song) return null;
                  const cover = getCoverSrc(song);
                  return (
                    <li key={item.id} className="history-row">
                      <button
                        type="button"
                        className="history-row-main"
                        onClick={() => playSong(song.id)}
                      >
                        <div className="history-cover">
                          {cover ? <img src={cover} alt="" /> : <Icon name="music" size={18} />}
                        </div>
                        <div className="history-row-text">
                          <div className="history-row-title">{song.title}</div>
                          <ArtistLink artist={song.artist} className="history-row-artist" />
                        </div>
                        <div className="history-row-meta">
                          <span>{formatPlayedAt(item.playedAt, t, bcp47)}</span>
                          {song.duration ? <span>{formatTime(song.duration)}</span> : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
