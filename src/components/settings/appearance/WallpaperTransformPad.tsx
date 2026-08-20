import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { useI18n } from '../../../i18n';

interface Props {
  src: string | null;
  enabled: boolean;
  fitBlur: boolean;
  layout: string;
  positionX: number;
  positionY: number;
  scale: number;
  blur: number;
  onTransform: (next: { positionX: number; positionY: number; scale: number }) => void;
  footer?: ReactNode;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Drag to pan, wheel/buttons to zoom. Scale 1 = cover the frame. */
export function WallpaperTransformPad({
  src,
  enabled,
  fitBlur,
  layout,
  positionX,
  positionY,
  scale,
  blur,
  onTransform,
  footer,
}: Props) {
  const { t } = useI18n();
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const transformRef = useRef({ positionX, positionY, scale });
  transformRef.current = { positionX, positionY, scale };

  const setScale = (nextScale: number) => {
    const { positionX: x, positionY: y } = transformRef.current;
    onTransform({
      positionX: x,
      positionY: y,
      scale: clamp(Number(nextScale.toFixed(2)), 0.25, 4),
    });
  };

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!enabled || !src || e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: transformRef.current.positionX,
        posY: transformRef.current.positionY,
      };
    },
    [enabled, src],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const el = windowRef.current;
      if (!drag || !el) return;
      const rect = el.getBoundingClientRect();
      const dx = ((e.clientX - drag.x) / Math.max(rect.width, 1)) * 100;
      const dy = ((e.clientY - drag.y) / Math.max(rect.height, 1)) * 100;
      onTransform({
        positionX: clamp(drag.posX + dx, 0, 100),
        positionY: clamp(drag.posY + dy, 0, 100),
        scale: transformRef.current.scale,
      });
    },
    [onTransform],
  );

  const endDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const el = windowRef.current;
    if (!el || !enabled || !src) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const current = transformRef.current;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      onTransform({
        positionX: current.positionX,
        positionY: current.positionY,
        scale: clamp(Number((current.scale + delta).toFixed(2)), 0.25, 4),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, src, onTransform]);

  const stretch = layout === 'stretch';
  const blurPx = Math.max(0, Number(blur) || 0);

  return (
    <div className={`wp-stage${enabled ? '' : ' is-off'}`}>
      <div className="wp-stage-canvas">
        {src && enabled ? (
          <div
            ref={windowRef}
            className={`wp-stage-window layout-${layout}${fitBlur ? ' has-fill' : ''} is-interactive`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title={t('settings.wallpaper.dragZoomHint')}
          >
            {fitBlur && blurPx === 0 ? (
              <img className="wp-photo-fill" src={src} alt="" draggable={false} />
            ) : null}
            <div
              className="wp-photo-wrap"
              style={
                blurPx > 0
                  ? {
                      filter: `blur(${blurPx}px)`,
                      WebkitFilter: `blur(${blurPx}px)`,
                      transform: `scale(${1 + Math.min(blurPx, 80) / 220})`,
                    }
                  : undefined
              }
            >
              <img
                className={`wp-photo${stretch ? ' is-stretch' : ''}`}
                src={src}
                alt=""
                draggable={false}
                style={
                  stretch
                    ? { objectFit: 'fill' }
                    : {
                        objectFit: 'cover',
                        objectPosition: `${positionX}% ${positionY}%`,
                        transform: `scale(${scale})`,
                        transformOrigin: `${positionX}% ${positionY}%`,
                      }
                }
              />
            </div>
            <div className="wp-stage-chrome" onPointerDown={(e) => e.stopPropagation()}>
              <span className="wp-stage-dot" />
              <span className="wp-stage-dot" />
              <span className="wp-stage-dot" />
              <span className="wp-stage-hint">{t('settings.wallpaper.dragPhoto')}</span>
              <div className="wp-zoom-btns">
                <button type="button" onClick={() => setScale(scale - 0.1)} aria-label={t('settings.wallpaper.zoomOut')}>
                  −
                </button>
                <button
                  type="button"
                  onClick={() => onTransform({ positionX: 50, positionY: 50, scale: 1 })}
                  aria-label={t('settings.wallpaper.fit')}
                >
                  {Math.round(scale * 100)}%
                </button>
                <button type="button" onClick={() => setScale(scale + 0.1)} aria-label={t('settings.wallpaper.zoomIn')}>
                  +
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="wp-stage-empty">{t('settings.wallpaper.noImage')}</div>
        )}
      </div>
      {footer}
    </div>
  );
}
