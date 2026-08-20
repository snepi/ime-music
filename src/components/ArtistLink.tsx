import { useState } from 'react';
import { ContextMenu } from './ui/ContextMenu';
import { splitArtists } from '../utils/artists';
import { useI18n } from '../i18n';
import { useOpenArtist } from '../hooks/useOpenArtist';
import type { MessageKey } from '../i18n/messages';

const PLATFORM_KEYS: { id: string; labelKey: MessageKey; url: (q: string) => string }[] = [
  {
    id: 'deezer',
    labelKey: 'artist.deezer',
    url: (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'youtube',
    labelKey: 'artist.youtube',
    url: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  },
  {
    id: 'spotify',
    labelKey: 'artist.spotify',
    url: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'yandex',
    labelKey: 'artist.yandex',
    url: (q) => `https://music.yandex.ru/search?text=${encodeURIComponent(q)}`,
  },
];

interface Props {
  artist: string | null | undefined;
  className?: string;
  title?: string;
  deezerId?: number | string | null;
}

function isPlaceholder(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    !n ||
    n === '—' ||
    n === '-' ||
    n === 'unknown artist' ||
    n === 'неизвестный исполнитель' ||
    n === 'unknown'
  );
}

function SingleArtistLink({
  name,
  className,
  title,
  deezerId,
}: {
  name: string;
  className?: string;
  title?: string;
  deezerId?: number | string | null;
}) {
  const { t } = useI18n();
  const openArtist = useOpenArtist();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (isPlaceholder(name)) {
    return <span className={className}>{name || '—'}</span>;
  }

  return (
    <>
      <button
        type="button"
        className={`artist-link ${className || ''}`.trim()}
        title={title || t('artist.openCard', { name })}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          openArtist(name, deezerId);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
      >
        {name}
      </button>
      {anchor ? (
        <ContextMenu
          anchorEl={anchor}
          header={<div className="artist-link-menu-header">{name}</div>}
          onClose={() => setAnchor(null)}
          items={[
            {
              id: 'card',
              label: t('artist.openCardMenu'),
              onClick: () => openArtist(name, deezerId),
            },
            ...PLATFORM_KEYS.map((p) => ({
              id: p.id,
              label: t(p.labelKey),
              onClick: () => {
                void window.imeMusic.openExternal?.(p.url(name));
              },
            })),
          ]}
        />
      ) : null}
    </>
  );
}

export function ArtistLink({ artist, className, title, deezerId }: Props) {
  const { t } = useI18n();
  const names = splitArtists(artist);

  if (!names.length || names.every(isPlaceholder)) {
    return <span className={className}>{artist || '—'}</span>;
  }

  if (names.length === 1) {
    return <SingleArtistLink name={names[0]} className={className} title={title} deezerId={deezerId} />;
  }

  return (
    <span className={`artist-link-group ${className || ''}`.trim()}>
      {names.map((name, i) => (
        <span key={`${name}-${i}`} className="artist-link-part">
          {i > 0 ? <span className="artist-link-sep">, </span> : null}
          <SingleArtistLink name={name} title={title || t('artist.platforms', { name })} />
        </span>
      ))}
    </span>
  );
}
