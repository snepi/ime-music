import type { RecommendationItem } from '../types';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { ArtistLink } from './ArtistLink';
import { usePlayer } from '../store/playerStore';
import { useToast } from './ui/Toast';
import { getDiscovery, toWishlistItem } from '../utils/discovery';
import { useI18n } from '../i18n';

interface Props {
  items: RecommendationItem[];
  showArtist?: boolean;
  showRank?: boolean;
}

export function DemoTracksGrid({ items, showArtist = true, showRank = false }: Props) {
  const { state, dispatch, togglePreview, pause } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const discovery = getDiscovery(state.settings);

  const addWishlist = async (item: RecommendationItem) => {
    if (discovery.wishlist.some((w) => w.id === item.id)) {
      showToast(t('rec.alreadyWish'), 'info');
      return;
    }
    const settings = await window.imeMusic.updateSettings({
      discovery: {
        ...discovery,
        wishlist: [toWishlistItem(item), ...discovery.wishlist],
      },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    showToast(t('rec.addedWish'), 'success');
  };

  if (!items.length) return null;

  return (
    <ul className="demo-tracks-grid">
      {items.map((item, index) => {
        const active = state.previewItem?.id === item.id;
        const playing = active && state.previewPlaying;
        const inWish = discovery.wishlist.some((w) => w.id === item.id);
        const rankPosition = item.trackNumber != null ? item.trackNumber : index + 1;
        return (
          <li key={item.id} className={`demo-track-card${active ? ' is-active' : ''}`}>
            {showRank ? (
              <span className="demo-track-rank" aria-hidden>
                {rankPosition}
              </span>
            ) : null}
            <button
              type="button"
              className="demo-track-play"
              onClick={() => {
                if (state.isPlaying) pause();
                void togglePreview(item);
              }}
              aria-label={playing ? t('player.pause') : t('rec.listenDemo')}
            >
              {item.coverUrl ? (
                <img src={item.coverUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <Icon name="disc" size={24} />
              )}
              <span className="demo-track-play-icon">
                <Icon name={playing ? 'pause' : 'play'} size={18} />
              </span>
            </button>
            <div className="demo-track-meta">
              <div className="demo-track-title">{item.title}</div>
              {showArtist ? <ArtistLink artist={item.artist} className="demo-track-artist" /> : null}
              {item.album ? <div className="demo-track-album">{item.album}</div> : null}
            </div>
            <div className="demo-track-actions">
              <Button
                variant="ghost"
                title={inWish ? t('rec.inList') : t('rec.addWish')}
                disabled={inWish}
                onClick={() => void addWishlist(item)}
              >
                <Icon name={inWish ? 'check' : 'add'} size={16} />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
