import type { ArtistRelease } from '../types';
import { Icon } from './ui/Icon';
import { useI18n } from '../i18n';

interface Props {
  items: ArtistRelease[];
  onOpenRelease?: (release: ArtistRelease) => void;
}

function releaseYear(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const year = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

export function ArtistReleasesGrid({ items, onOpenRelease }: Props) {
  const { t } = useI18n();

  if (!items.length) return null;

  return (
    <ul className="artist-releases-grid">
      {items.map((item) => {
        const year = releaseYear(item.releaseDate);
        const openRelease = () => {
          if (onOpenRelease) {
            onOpenRelease(item);
            return;
          }
          const url = item.deezerUrl || item.itunesUrl;
          if (url) void window.imeMusic.openExternal?.(url);
        };
        return (
          <li key={String(item.id)}>
            <button type="button" className="artist-release-card" onClick={openRelease}>
              <div className="artist-release-cover">
                {item.coverUrl ? (
                  <img src={item.coverUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <Icon name="disc" size={28} />
                )}
              </div>
              <div className="artist-release-meta">
                <div className="artist-release-title">{item.title}</div>
                <div className="artist-release-sub">
                  {year ? t('artist.releaseYear', { year }) : null}
                  {year && item.nbTracks > 0 ? ' · ' : null}
                  {item.nbTracks > 0 ? t('artist.releaseTracks', { count: item.nbTracks }) : null}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
