import { useEffect, useState } from 'react';
import type { ArtistSummary, RecommendationItem } from '../types';
import { Icon } from './ui/Icon';
import { Spinner } from './ui/Spinner';
import { DemoTracksGrid } from './DemoTracksGrid';
import { useOpenArtist } from '../hooks/useOpenArtist';
import { useI18n } from '../i18n';

interface Props {
  compact?: boolean;
}

export function HomeDiscoverySearch({ compact = false }: Props) {
  const { t } = useI18n();
  const openArtist = useOpenArtist();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [tracks, setTracks] = useState<RecommendationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setArtists([]);
      setTracks([]);
      setError(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const timer = window.setTimeout(() => {
      void window.imeMusic
        .searchDiscovery?.(q)
        .then((res) => {
          if (!res?.ok) {
            setError(res?.error || t('home.searchFail'));
            setArtists([]);
            setTracks([]);
            return;
          }
          setError(null);
          setArtists(res.artists || []);
          setTracks(res.tracks || []);
        })
        .catch(() => {
          setError(t('home.searchFail'));
          setArtists([]);
          setTracks([]);
        })
        .finally(() => setLoading(false));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, t]);

  const hasQuery = query.trim().length >= 2;

  return (
    <section className={`home-discovery-search${compact ? ' is-compact' : ''}`}>
      <div className="search-field home-discovery-search-field">
        <Icon name="search" size={16} className="search-icon" />
        <input
          type="search"
          className="search-input"
          placeholder={t('home.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('home.searchLabel')}
        />
      </div>
      <p className="home-discovery-search-hint">{t('home.searchHint')}</p>

      {loading ? <Spinner label={t('home.searchLoading')} /> : null}

      {!loading && error ? <p className="home-discovery-search-error">{error}</p> : null}

      {!loading && hasQuery && !error && artists.length === 0 && tracks.length === 0 ? (
        <p className="home-discovery-search-empty">{t('home.searchEmpty')}</p>
      ) : null}

      {!loading && artists.length > 0 ? (
        <div className="home-discovery-section">
          <h3 className="home-discovery-section-title">{t('home.searchArtists')}</h3>
          <ul className="artist-chip-grid">
            {artists.map((artist) => (
              <li key={String(artist.id)}>
                <button
                  type="button"
                  className="artist-chip"
                  onClick={() => openArtist(artist.name, artist.id)}
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
        </div>
      ) : null}

      {!loading && tracks.length > 0 ? (
        <div className="home-discovery-section">
          <h3 className="home-discovery-section-title">{t('home.searchTracks')}</h3>
          <DemoTracksGrid items={tracks} />
        </div>
      ) : null}
    </section>
  );
}
