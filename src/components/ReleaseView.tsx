import { useEffect, useMemo, useState } from 'react';
import type { ArtistReleaseProfile, RecommendationItem, ViewType } from '../types';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { Spinner } from './ui/Spinner';
import { EmptyState } from './ui/EmptyState';
import { Button } from './ui/Button';
import { DemoTracksGrid } from './DemoTracksGrid';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { getDiscovery, toWishlistItem } from '../utils/discovery';
import { useI18n } from '../i18n';

export function ReleaseView({ view }: { view: Extract<ViewType, { kind: 'release' }> }) {
  const { state, dispatch } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ArtistReleaseProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false);
  const discovery = getDiscovery(state.settings);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void window.imeMusic
      .getArtistReleaseProfile?.({
        artistName: view.artistName,
        artistDeezerId: view.artistDeezerId ?? null,
        release: view.release,
      })
      .then((res) => {
        if (!res?.ok || !res.profile) {
          setProfile(null);
          setError(res?.error || t('artist.notFound'));
          return;
        }
        setProfile(res.profile);
      })
      .catch(() => {
        setProfile(null);
        setError(t('artist.notFound'));
      })
      .finally(() => setLoading(false));
  }, [t, view]);

  const demoTracks = useMemo(() => {
    const base = (profile?.tracks || []).filter(
      (track) => typeof track.previewUrl === 'string' && track.previewUrl && track.previewUrl.startsWith('http'),
    ) as RecommendationItem[];

    // Deezer/iTunes may provide disc/track numbers; use them for stable album-like ordering.
    return base
      .slice()
      .sort((a, b) => {
        const da = a.discNumber ?? 1;
        const db = b.discNumber ?? 1;
        if (da !== db) return da - db;
        const ta = a.trackNumber ?? Number.POSITIVE_INFINITY;
        const tb = b.trackNumber ?? Number.POSITIVE_INFINITY;
        if (ta !== tb) return ta - tb;
        return String(a.title).localeCompare(String(b.title));
      });
  }, [profile?.tracks]);

  const discGroups = useMemo(() => {
    const map = new Map<number, RecommendationItem[]>();
    for (const track of demoTracks) {
      const disc = track.discNumber ?? 1;
      const list = map.get(disc) || [];
      list.push(track);
      map.set(disc, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [demoTracks]);

  const hasRealDiscNumbers = useMemo(() => demoTracks.some((t) => t.discNumber != null), [demoTracks]);

  const backToArtist = () => {
    dispatch({
      type: 'SET_VIEW',
      view: {
        kind: 'artist',
        name: view.artistName,
        deezerId: view.artistDeezerId ?? null,
      },
    });
  };

  const addAllToWishlist = async () => {
    if (!demoTracks.length) return;
    const existing = new Set(discovery.wishlist.map((w) => w.id));
    const toAdd = demoTracks.filter((t) => !existing.has(t.id)).map(toWishlistItem);
    if (!toAdd.length) {
      showToast(t('rec.inList') || 'В списке', 'info');
      return;
    }
    const settings = await window.imeMusic.updateSettings({
      discovery: { ...discovery, wishlist: [...toAdd, ...discovery.wishlist] },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    showToast('Добавлено в «Хочу послушать»', 'success');
  };

  const downloadAll = async () => {
    if (!demoTracks.length) return;
    const wishlistItems = demoTracks.map(toWishlistItem);
    const res = await window.imeMusic.importWishlist(wishlistItems);
    if (!res?.started) {
      showToast(res?.error || 'Не удалось запустить загрузку', 'error');
      return;
    }
    setDownloadConfirmOpen(false);
    showToast('Загрузка запущена', 'success');
  };

  if (loading) return <Spinner label={t('artist.loading')} />;

  if (error || !profile) {
    return (
      <EmptyState
        icon="disc"
        title={t('artist.notFound')}
        description={error || view.release.title}
        actions={
          <Button variant="secondary" onClick={backToArtist}>
            {t('common.back')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="artist-view">
      <div className="artist-view-header">
        <button type="button" className="artist-view-back" onClick={backToArtist}>
          <span className="artist-view-back-icon" aria-hidden>
            <Icon name="chevronRight" size={16} />
          </span>
          {t('common.back')}
        </button>
        <div className="artist-view-hero artist-release-hero">
          <div className="artist-release-cover-large">
            {view.release.coverUrl ? (
              <img src={view.release.coverUrl} alt="" loading="lazy" decoding="async" />
            ) : (
              <Icon name="disc" size={52} />
            )}
          </div>
          <div className="artist-view-info">
            <h1>{view.release.title}</h1>
            <p className="artist-view-stats">{view.artistName}</p>
          </div>
        </div>
      </div>

      <section className="artist-view-section">
        <h2>{t('artist.demoTracks')}</h2>
        <p className="artist-view-section-hint">{t('artist.demoHint')}</p>
        <div className="artist-release-actions">
          <Button variant="secondary" onClick={() => void addAllToWishlist()}>
            Добавить весь релиз в «Хочу послушать»
          </Button>
          <Button variant="primary" onClick={() => setDownloadConfirmOpen(true)}>
            Скачать все
          </Button>
        </div>
        {demoTracks.length > 0 ? (
          <div className="artist-release-discs">
            {discGroups.map(([disc, tracks]) => (
              <div key={disc} className="artist-release-disc">
                {hasRealDiscNumbers ? (
                  <div className="artist-release-disc-title">Диск {disc}</div>
                ) : null}
                <DemoTracksGrid items={tracks} showArtist showRank />
              </div>
            ))}
          </div>
        ) : (
          <p className="artist-view-empty">{t('artist.noDemos')}</p>
        )}
      </section>

      <ConfirmDialog
        open={downloadConfirmOpen}
        title="Скачать всё"
        message="Будет запущен импорт треков в библиотеку. Продолжить?"
        confirmLabel="Скачать"
        cancelLabel="Отмена"
        onConfirm={() => void downloadAll()}
        onCancel={() => setDownloadConfirmOpen(false)}
      />
    </div>
  );
}
