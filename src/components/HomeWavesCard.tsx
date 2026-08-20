import { useState } from 'react';
import { usePlayer } from '../store/playerStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { getDiscovery, getWavesSettings } from '../utils/discovery';
import { useI18n } from '../i18n';
import type {
  WavesDiversity,
  WavesGenre,
  WavesLanguage,
  WavesMood,
  WavesSeed,
  WavesSettings,
} from '../types';

const GENRES: WavesGenre[] = [
  'all',
  'rock',
  'pop',
  'rap',
  'ruRap',
  'electronic',
  'rnb',
  'indie',
  'metal',
  'dance',
  'jazz',
];

const LANGUAGES: WavesLanguage[] = ['any', 'ru', 'en'];
const MOODS: WavesMood[] = ['any', 'energetic', 'chill', 'dark', 'happy'];
const SEEDS: WavesSeed[] = ['taste', 'chart', 'liked', 'wishlist'];
const DIVERSITY: WavesDiversity[] = ['normal', 'high'];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`waves-chip${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function HomeWavesCard() {
  const { state, dispatch, startImeWaves, stopImeWaves, togglePlayPause } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const discovery = getDiscovery(state.settings);
  const waves = getWavesSettings(state.settings);
  const active = state.wavesActive;
  const playing = active && state.previewPlaying;
  const now = active ? state.previewItem : null;

  const patchWaves = async (partial: Partial<WavesSettings>) => {
    const nextWaves = { ...waves, ...partial };
    const settings = await window.imeMusic.updateSettings({
      discovery: { ...discovery, waves: nextWaves },
    });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  };

  const start = async () => {
    if (active && playing) {
      togglePlayPause();
      return;
    }
    if (active && !playing && state.previewItem) {
      togglePlayPause();
      return;
    }
    setBusy(true);
    try {
      const n = await startImeWaves({ force: true });
      if (!n) showToast(t('waves.empty'), 'info');
      else showToast(t('waves.started', { count: n }), 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('waves.failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    stopImeWaves();
    showToast(t('waves.stopped'), 'info');
  };

  return (
    <section className={`home-waves${active ? ' is-active' : ''}${playing ? ' is-playing' : ''}`}>
      <div className="home-waves-card">
        <button
          type="button"
          className="home-waves-main"
          disabled={busy}
          onClick={() => void start()}
          aria-label={playing ? t('waves.pause') : t('waves.play')}
        >
          <div className="home-waves-visual" aria-hidden>
            <span className="home-waves-bar" />
            <span className="home-waves-bar" />
            <span className="home-waves-bar" />
            <span className="home-waves-bar" />
            <span className="home-waves-bar" />
          </div>
          <div className="home-waves-text">
            <div className="home-waves-brand">IMe Waves</div>
            <div className="home-waves-title">
              {playing
                ? now?.title || t('waves.playing')
                : active
                  ? t('waves.paused')
                  : t('waves.headline')}
            </div>
            <div className="home-waves-meta">
              {playing && now ? (
                <>
                  {now.artist}
                  <span> · {t('waves.demoHint')}</span>
                </>
              ) : (
                t('waves.subtitle')
              )}
            </div>
          </div>
          <span className="home-waves-play" aria-hidden>
            <Icon name={busy ? 'refresh' : playing ? 'pause' : 'play'} size={22} />
          </span>
        </button>

        <div className="home-waves-actions">
          <Button
            variant="ghost"
            title={t('waves.settings')}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Icon name="settings" size={16} />
          </Button>
          {active ? (
            <Button variant="ghost" title={t('waves.stop')} onClick={stop}>
              <Icon name="close" size={16} />
            </Button>
          ) : null}
        </div>
      </div>

      {settingsOpen ? (
        <div className="home-waves-settings">
          <div className="home-waves-settings-block">
            <div className="home-waves-settings-label">{t('waves.genre')}</div>
            <div className="waves-chip-row">
              {GENRES.map((genre) => (
                <Chip
                  key={genre}
                  active={waves.genre === genre}
                  label={t(`waves.genre.${genre}`)}
                  onClick={() => void patchWaves({ genre })}
                />
              ))}
            </div>
          </div>

          <div className="home-waves-settings-block">
            <div className="home-waves-settings-label">{t('waves.language')}</div>
            <div className="waves-chip-row">
              {LANGUAGES.map((language) => (
                <Chip
                  key={language}
                  active={waves.language === language}
                  label={t(`waves.language.${language}`)}
                  onClick={() => void patchWaves({ language })}
                />
              ))}
            </div>
          </div>

          <div className="home-waves-settings-block">
            <div className="home-waves-settings-label">{t('waves.mood')}</div>
            <div className="waves-chip-row">
              {MOODS.map((mood) => (
                <Chip
                  key={mood}
                  active={waves.mood === mood}
                  label={t(`waves.mood.${mood}`)}
                  onClick={() => void patchWaves({ mood })}
                />
              ))}
            </div>
          </div>

          <div className="home-waves-settings-block">
            <div className="home-waves-settings-label">{t('waves.seed')}</div>
            <div className="waves-chip-row">
              {SEEDS.map((seed) => (
                <Chip
                  key={seed}
                  active={waves.seed === seed}
                  label={t(`waves.seed.${seed}`)}
                  onClick={() => void patchWaves({ seed })}
                />
              ))}
            </div>
          </div>

          <div className="home-waves-settings-block">
            <div className="home-waves-settings-label">{t('waves.diversity')}</div>
            <div className="waves-chip-row">
              {DIVERSITY.map((diversity) => (
                <Chip
                  key={diversity}
                  active={waves.diversity === diversity}
                  label={t(`waves.diversity.${diversity}`)}
                  onClick={() => void patchWaves({ diversity })}
                />
              ))}
            </div>
          </div>

          <label className="home-waves-toggle">
            <input
              type="checkbox"
              checked={waves.skipKnown}
              onChange={(e) => void patchWaves({ skipKnown: e.target.checked })}
            />
            <span>{t('waves.skipKnown')}</span>
          </label>

          <p className="home-waves-settings-hint">{t('waves.settingsHint')}</p>
        </div>
      ) : null}
    </section>
  );
}
