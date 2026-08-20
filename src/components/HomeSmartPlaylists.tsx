import { useMemo } from 'react';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { playlistDisplayName } from '../i18n/messages';
import { useI18n } from '../i18n';
import { isSmartPlaylistId } from '../utils/smartPlaylists';
import { getCoverSrc } from '../utils/media';
import type { Song } from '../types';

function SmartCover({ songs }: { songs: Song[] }) {
  const covers = songs.map((s) => getCoverSrc(s)).filter(Boolean).slice(0, 4) as string[];
  if (!covers.length) {
    return (
      <div className="home-card-cover home-smart-cover home-smart-cover-empty">
        <Icon name="playlist" size={28} />
        <span className="home-card-play" aria-hidden>
          <Icon name="play" size={14} />
        </span>
      </div>
    );
  }
  if (covers.length === 1) {
    return (
      <div className="home-card-cover home-smart-cover">
        <img src={covers[0]} alt="" loading="lazy" decoding="async" />
        <span className="home-card-play" aria-hidden>
          <Icon name="play" size={14} />
        </span>
      </div>
    );
  }
  return (
    <div className={`home-card-cover home-smart-cover home-smart-mosaic mosaic-${Math.min(covers.length, 4)}`}>
      {covers.map((src) => (
        <img key={src} src={src} alt="" loading="lazy" decoding="async" />
      ))}
      <span className="home-card-play" aria-hidden>
        <Icon name="play" size={14} />
      </span>
    </div>
  );
}

export function HomeSmartPlaylists() {
  const { state, playSong } = usePlayer();
  const { t } = useI18n();

  const byId = useMemo(() => new Map(state.songs.map((s) => [s.id, s])), [state.songs]);

  const smart = useMemo(() => {
    const fixedOrder = [
      'auto:frequent',
      'auto:fresh',
      'auto:liked',
      'auto:neglected',
      'auto:top-rated',
      'auto:liked-90s',
    ];
    const list = state.playlists.filter((p) => isSmartPlaylistId(p.id) && p.songIds.length > 0);
    const fixed = fixedOrder
      .map((id) => list.find((p) => p.id === id))
      .filter(Boolean) as typeof list;
    const genres = list
      .filter((p) => String(p.id).startsWith('auto:genre:'))
      .sort((a, b) => b.songIds.length - a.songIds.length);
    return [...fixed, ...genres];
  }, [state.playlists]);

  if (!smart.length) return null;

  const playMix = async (songIds: string[]) => {
    if (!songIds[0]) return;
    await window.imeMusic.clearQueue?.();
    for (const id of songIds.slice(1, 40)) {
      await window.imeMusic.addToQueue?.(id);
    }
    playSong(songIds[0]);
  };

  return (
    <section className="home-section">
      <h2 className="home-section-title">{t('home.smartPlaylists')}</h2>
      <p className="home-section-hint">{t('home.smartPlaylistsHint')}</p>
      <ul className="home-rail">
        {smart.map((pl) => {
          const songs = pl.songIds.map((id) => byId.get(id)).filter(Boolean) as Song[];
          return (
            <li key={pl.id}>
              <button
                type="button"
                className="home-card home-card-smart"
                onClick={() => void playMix(pl.songIds)}
                aria-label={`${t('player.play')}: ${playlistDisplayName(pl, t)}`}
              >
                <SmartCover songs={songs} />
                <div className="home-card-title">{playlistDisplayName(pl, t)}</div>
                <div className="home-card-artist">
                  {t('lib.trackMany', { count: pl.songIds.length })}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
