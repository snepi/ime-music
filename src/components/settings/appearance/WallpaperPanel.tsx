import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { SectionReset } from './SectionReset';
import { WallpaperTransformPad } from './WallpaperTransformPad';
import { useToast } from '../../ui/Toast';
import {
  DEFAULT_LAYERS,
  DEFAULT_WALLPAPER,
  WALLPAPER_GLASS_LAYERS,
  type AppearanceSettings,
  type LayerSettings,
  type WallpaperAsset,
  type WallpaperLayout,
  type WallpaperSettings,
} from '../../../appearance/schema';
import { applyAppearance, getEffectiveAppearance } from '../../../utils/applyAppearance';
import { toFileUrl } from '../../../utils/media';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  wallpapers: WallpaperAsset[];
  onChange: (patch: Partial<AppearanceSettings>) => void;
  onWallpapersChange: (wallpapers: WallpaperAsset[]) => void;
}

const LAYOUTS: WallpaperLayout[] = [
  'full',
  'stretch',
  'crop',
  'window',
  'content',
];

function cloneWp(wp: WallpaperSettings): WallpaperSettings {
  return { ...wp };
}

function cloneLayers(layers: LayerSettings): LayerSettings {
  return { ...layers };
}

export function WallpaperPanel({ appearance, wallpapers, onChange, onWallpapersChange }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [list, setList] = useState(wallpapers);

  const [wp, setWpState] = useState(() => cloneWp(appearance.wallpaper));
  const [layers, setLayersState] = useState(() => cloneLayers(appearance.layers));
  const wpRef = useRef(wp);
  const layersRef = useRef(layers);
  const fullRef = useRef(appearance);
  const persistTimer = useRef<number | null>(null);
  const pendingRef = useRef(false);

  wpRef.current = wp;
  layersRef.current = layers;

  useEffect(() => setList(wallpapers), [wallpapers]);

  // Adopt parent only after save finished, and only if we are not dragging sliders
  useEffect(() => {
    if (pendingRef.current) return;
    fullRef.current = appearance;
    setWpState(cloneWp(appearance.wallpaper));
    setLayersState(cloneLayers(appearance.layers));
  }, [appearance.wallpaper.activeId]);

  const persist = (nextWp: WallpaperSettings, nextLayers: LayerSettings) => {
    pendingRef.current = true;
    const next = getEffectiveAppearance({
      ...fullRef.current,
      wallpaper: nextWp,
      layers: nextLayers,
    });
    fullRef.current = next;
    applyAppearance(next);
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      onChange({ wallpaper: next.wallpaper, layers: next.layers });
      window.setTimeout(() => {
        pendingRef.current = false;
      }, 400);
    }, 200);
  };

  const setWp = (partial: Partial<WallpaperSettings>, nextLayers?: LayerSettings) => {
    const wallpaper = { ...wpRef.current, ...partial };
    const layerNext = nextLayers ? { ...nextLayers } : { ...layersRef.current };
    wpRef.current = wallpaper;
    layersRef.current = layerNext;
    setWpState(wallpaper);
    if (nextLayers) setLayersState(layerNext);
    persist(wallpaper, layerNext);
  };

  const setLayer = (key: keyof LayerSettings, value: number) => {
    const nextLayers = { ...layersRef.current, [key]: value };
    layersRef.current = nextLayers;
    setLayersState(nextLayers);
    persist(wpRef.current, nextLayers);
  };

  const enableWallpaper = (next: Partial<WallpaperSettings>) => {
    const turningOn = wpRef.current.mode === 'none';
    setWp(
      {
        mode: 'fitBlur',
        fitBlur: true,
        layout: next.layout || wpRef.current.layout || 'crop',
        opacity: 1,
        blur: wpRef.current.blur > 0 ? wpRef.current.blur : 28,
        ...next,
      },
      turningOn ? { ...WALLPAPER_GLASS_LAYERS } : undefined,
    );
  };

  const setModeNone = () => {
    setWp({ mode: 'none' }, { ...DEFAULT_LAYERS });
  };

  const setModeFitBlur = () => {
    enableWallpaper({ mode: 'fitBlur', fitBlur: true });
  };

  const choose = async () => {
    const result = await window.imeMusic.chooseWallpaper();
    if (!result.ok) {
      if (result.error) showToast(result.error, 'error');
      return;
    }
    if (result.wallpapers) {
      setList(result.wallpapers);
      onWallpapersChange(result.wallpapers);
    }
    if (result.asset) {
      enableWallpaper({ activeId: result.asset.id });
      showToast(t('settings.wallpaper.set'), 'success');
    }
  };

  const clearActive = async () => {
    if (wpRef.current.activeId) {
      const result = await window.imeMusic.deleteWallpaper(wpRef.current.activeId);
      if (result.wallpapers) {
        setList(result.wallpapers);
        onWallpapersChange(result.wallpapers);
      }
    }
    setModeNone();
    showToast(t('settings.wallpaper.reset'), 'info');
  };

  const onTransform = (next: { positionX: number; positionY: number; scale: number }) => {
    setWp({
      positionX: next.positionX,
      positionY: next.positionY,
      scale: next.scale,
    });
  };

  const active = useMemo(
    () => list.find((w) => w.id === wp.activeId) || null,
    [list, wp.activeId],
  );
  const previewSrc = active?.filePath
    ? toFileUrl(active.filePath)
    : active?.previewPath
      ? toFileUrl(active.previewPath)
      : null;
  const enabled = wp.mode !== 'none';
  const fitBlur = enabled && (wp.fitBlur || wp.mode === 'fitBlur');
  const layout = wp.layout || 'crop';
  const layoutLabel = (value: WallpaperLayout) =>
    `${fitBlur ? `${t('settings.wallpaper.fitBlur')} · ` : ''}${t(`settings.wallpaper.layout.${value}`)}`;

  return (
    <div className="settings-panel wallpaper-mei">
      <SectionReset
        label={t('settings.wallpaper.resetWallpaper')}
        onReset={() => {
          pendingRef.current = false;
          setWpState(cloneWp(DEFAULT_WALLPAPER));
          setLayersState(cloneLayers(DEFAULT_LAYERS));
          wpRef.current = cloneWp(DEFAULT_WALLPAPER);
          layersRef.current = cloneLayers(DEFAULT_LAYERS);
          onChange({
            wallpaper: { ...DEFAULT_WALLPAPER },
            layers: { ...DEFAULT_LAYERS },
          });
        }}
      />

      <div className="wp-mode-row">
        <span className="field-label">{t('settings.wallpaper.mode')}</span>
        <div className="wp-segment">
          <button
            type="button"
            className={`wp-segment-btn${!enabled ? ' active' : ''}`}
            onClick={setModeNone}
          >
            {t('settings.wallpaper.none')}
          </button>
          <button
            type="button"
            className={`wp-segment-btn${enabled && fitBlur ? ' active' : ''}`}
            onClick={setModeFitBlur}
          >
            {t('settings.wallpaper.fitBlur')}
          </button>
        </div>
      </div>

      {enabled ? (
        <div className="wp-layout-row" role="group" aria-label={t('settings.wallpaper.layout')}>
          {LAYOUTS.map((item) => (
            <button
              key={item}
              type="button"
              className={`wp-layout-btn${layout === item ? ' active' : ''}`}
              onClick={() =>
                setWp({
                  layout: item,
                  mode: fitBlur ? 'fitBlur' : item,
                })
              }
            >
              {t(`settings.wallpaper.layout.${item}`)}
            </button>
          ))}
        </div>
      ) : null}

      <WallpaperTransformPad
        src={previewSrc}
        enabled={enabled}
        fitBlur={fitBlur}
        layout={layout}
        positionX={wp.positionX}
        positionY={wp.positionY}
        scale={wp.scale}
        blur={wp.blur}
        onTransform={onTransform}
        footer={
          <div className="wp-stage-footer">
            <div className="wp-stage-meta">
              <strong>{active?.name || t('settings.wallpaper.noneSelected')}</strong>
              <span>{enabled ? layoutLabel(layout) : `${t('settings.wallpaper.mode')}: ${t('settings.wallpaper.none')}`}</span>
            </div>
            <div className="wp-stage-actions">
              <Button variant="primary" onClick={() => void choose()}>
                {t('settings.wallpaper.chooseImage')}
              </Button>
              <Button
                variant="danger"
                aria-label={t('settings.wallpaper.delete')}
                title={t('settings.wallpaper.deleteReset')}
                onClick={() => void clearActive()}
              >
                ⌫
              </Button>
            </div>
          </div>
        }
      />

      {list.length > 1 ? (
        <div className="wallpaper-grid">
          {list.map((asset) => {
            const src = asset.previewPath || asset.filePath;
            return (
              <button
                key={asset.id}
                type="button"
                className={`wallpaper-card${wp.activeId === asset.id ? ' active' : ''}`}
                onClick={() => enableWallpaper({ activeId: asset.id })}
              >
                <div
                  className="wallpaper-thumb"
                  style={
                    src ? { backgroundImage: `url("${toFileUrl(src).replace(/"/g, '')}")` } : undefined
                  }
                />
                <span>{asset.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {enabled ? (
        <>
          <p className="field-hint">
            {t('settings.wallpaper.transformHint')}
          </p>
          <div className="settings-actions-row">
            <Button
              variant="secondary"
              onClick={() => onTransform({ positionX: 50, positionY: 50, scale: 1 })}
            >
              {t('settings.wallpaper.resetFrame')}
            </Button>
          </div>
          <Slider
            id="wp-scale"
            label={t('settings.wallpaper.photoScale')}
            value={Math.round(wp.scale * 100)}
            min={25}
            max={400}
            unit="%"
            onChange={(v) => onTransform({ positionX: wp.positionX, positionY: wp.positionY, scale: v / 100 })}
          />
          <Slider
            id="wp-x"
            label={t('settings.wallpaper.positionX')}
            value={Math.round(wp.positionX)}
            min={0}
            max={100}
            unit="%"
            onChange={(positionX) =>
              onTransform({ positionX, positionY: wp.positionY, scale: wp.scale })
            }
          />
          <Slider
            id="wp-y"
            label={t('settings.wallpaper.positionY')}
            value={Math.round(wp.positionY)}
            min={0}
            max={100}
            unit="%"
            onChange={(positionY) =>
              onTransform({ positionX: wp.positionX, positionY, scale: wp.scale })
            }
          />
          <Toggle
            checked={wp.useTrackCover}
            onChange={(useTrackCover) => setWp({ useTrackCover })}
            label={t('settings.wallpaper.useTrackCover')}
          />
          <Slider
            id="wp-blur"
            label={t('settings.wallpaper.photoBlur')}
            value={wp.blur}
            min={0}
            max={80}
            unit="px"
            onChange={(blur) => setWp({ blur })}
          />
          <Slider
            id="wp-dim"
            label={t('settings.wallpaper.dim')}
            value={Math.round(wp.dim * 100)}
            min={0}
            max={95}
            unit="%"
            onChange={(v) => setWp({ dim: v / 100 })}
          />
          <Slider
            id="wp-glass-blur"
            label={t('settings.wallpaper.glassBlur')}
            value={layers.backdropBlur}
            min={0}
            max={60}
            unit="px"
            onChange={(backdropBlur) => setLayer('backdropBlur', backdropBlur)}
          />
          <Slider
            id="layer-sidebar"
            label={t('settings.wallpaper.sidebarDensity')}
            value={Math.round(layers.sidebarOpacity * 100)}
            min={5}
            max={100}
            unit="%"
            onChange={(v) => setLayer('sidebarOpacity', v / 100)}
          />
          <Slider
            id="layer-main"
            label={t('settings.wallpaper.mainDensity')}
            value={Math.round(layers.windowOpacity * 100)}
            min={5}
            max={100}
            unit="%"
            onChange={(v) => setLayer('windowOpacity', v / 100)}
          />
          <Slider
            id="layer-player"
            label={t('settings.wallpaper.playerDensity')}
            value={Math.round(layers.playerOpacity * 100)}
            min={5}
            max={100}
            unit="%"
            onChange={(v) => setLayer('playerOpacity', v / 100)}
          />
        </>
      ) : null}
    </div>
  );
}
