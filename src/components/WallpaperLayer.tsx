import { useMemo } from 'react';
import { usePlayer } from '../store/playerStore';
import { getEffectiveAppearance } from '../utils/applyAppearance';
import { getCoverSrc, toFileUrl } from '../utils/media';
import { DEFAULT_APPEARANCE } from '../appearance/schema';

/** Full-window wallpaper. Blur lives on a wrapper so the photo itself is actually blurred. */
export function WallpaperLayer() {
  const { state } = usePlayer();
  const appearance = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE);
  const wp = appearance.wallpaper;
  const wallpapers = state.settings.wallpapers || [];

  const src = useMemo(() => {
    if (wp.mode === 'none') return null;
    if (wp.useTrackCover) {
      const song = state.songs.find((s) => s.id === state.currentSongId);
      return song ? getCoverSrc(song) : null;
    }
    if (!wp.activeId) return null;
    const asset = wallpapers.find((w) => w.id === wp.activeId);
    if (!asset) return null;
    const path = asset.filePath || asset.previewPath;
    return path ? toFileUrl(path) : null;
  }, [wp, wallpapers, state.songs, state.currentSongId]);

  if (!src || wp.mode === 'none') return null;

  const layout = wp.layout || 'crop';
  const stretch = layout === 'stretch';
  const blurPx = Math.max(0, Number(wp.blur) || 0);
  const scale = Math.max(0.25, Number(wp.scale) || 1);
  const posX = Number.isFinite(wp.positionX) ? wp.positionX : 50;
  const posY = Number.isFinite(wp.positionY) ? wp.positionY : 50;
  const grow = blurPx > 0 ? 0.18 : 0;

  return (
    <div
      className={['app-wallpaper', `app-wallpaper-layout-${layout}`, blurPx > 0 ? 'has-wp-blur' : '']
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <div
        className="app-wallpaper-visual"
        style={{
          inset: `-${Math.round(grow * 100)}%`,
          width: `${100 + grow * 200}%`,
          height: `${100 + grow * 200}%`,
          filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
          WebkitFilter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
        }}
      >
        <img
          className={`app-wallpaper-photo${stretch ? ' is-stretch' : ''}`}
          src={src}
          alt=""
          draggable={false}
          style={
            stretch
              ? { objectFit: 'fill' }
              : {
                  objectFit: 'cover',
                  objectPosition: `${posX}% ${posY}%`,
                  transform: `scale(${scale})`,
                  transformOrigin: `${posX}% ${posY}%`,
                }
          }
        />
      </div>
      <div className="app-wallpaper-dim" />
    </div>
  );
}
