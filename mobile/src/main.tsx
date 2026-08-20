import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { getMobileLibrary, pullFromPc, type MobileTrack } from './sync/library';
import { parseJoinUrl } from './sync/protocol';
import './styles.css';

type Tab = 'library' | 'sync' | 'now';

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [tracks, setTracks] = useState<MobileTrack[]>([]);
  const [joinText, setJoinText] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = useCallback(async () => {
    setTracks(await getMobileLibrary());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      const list = tracks;
      const idx = list.findIndex((t) => t.id === currentId);
      if (idx >= 0 && idx < list.length - 1) {
        void playTrack(list[idx + 1]);
      }
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = useMemo(
    () => tracks.find((t) => t.id === currentId) || null,
    [tracks, currentId],
  );

  const playTrack = async (track: MobileTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentId(track.id);
    audio.src = track.fileUri;
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      if (tracks[0]) await playTrack(tracks[0]);
      return;
    }
    if (audio.paused) await audio.play().catch(() => undefined);
    else audio.pause();
  };

  const runSync = async (rawUrl: string) => {
    const parsed = parseJoinUrl(rawUrl);
    if (!parsed) {
      setSyncMsg('Не удалось разобрать ссылку/QR. Скопируйте URL с ПК.');
      return;
    }
    setSyncing(true);
    setSyncMsg('Подключение к ПК…');
    try {
      const result = await pullFromPc({
        baseUrl: parsed.baseUrl,
        token: parsed.token,
        deviceName: Capacitor.getPlatform(),
        onProgress: ({ done, total, title }) => {
          setSyncMsg(`${done}/${total}: ${title}`);
        },
      });
      await refresh();
      setSyncMsg(`Готово: новых ${result.received}`);
      setTab('library');
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const scanQr = async () => {
    // Capacitor Camera can read barcode on some devices via prompt; fallback: paste URL.
    // Full barcode plugin can be added later; for v1 we support paste + optional photo OCR-less URL field.
    try {
      await Camera.requestPermissions({ permissions: ['camera'] });
    } catch {
      /* web / denied */
    }
    setSyncMsg(
      'Наведите камеру сторонним сканером на QR и вставьте ссылку ниже, либо введите URL с экрана ПК.',
    );
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">IMe</div>
        <div className="top-sub">
          {tab === 'library' ? `${tracks.length} треков` : tab === 'sync' ? 'Синхронизация' : 'Сейчас'}
        </div>
      </header>

      <main className="main">
        {tab === 'library' ? (
          <ul className="track-list">
            {tracks.length === 0 ? (
              <li className="empty">Пока пусто. Откройте «Синк» и заберите музыку с ПК.</li>
            ) : (
              tracks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`track-row${currentId === t.id ? ' active' : ''}`}
                    onClick={() => void playTrack(t)}
                  >
                    {t.coverUri ? (
                      <img className="cover" src={t.coverUri} alt="" />
                    ) : (
                      <div className="cover fallback">♪</div>
                    )}
                    <div className="meta">
                      <div className="title">{t.title}</div>
                      <div className="artist">{t.artist}</div>
                    </div>
                    <div className="dur">{formatTime(t.duration)}</div>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {tab === 'sync' ? (
          <div className="sync-panel">
            <p className="hint">
              На ПК: Настройки → Инструменты → Синхронизация с телефоном → Показать QR. Вставьте
              ссылку сюда (одна Wi‑Fi).
            </p>
            <label className="label" htmlFor="join">
              Ссылка синка
            </label>
            <textarea
              id="join"
              className="input"
              rows={3}
              value={joinText}
              onChange={(e) => setJoinText(e.target.value)}
              placeholder="http://192.168.x.x:47832/sync/join?t=..."
            />
            <div className="row">
              <button type="button" className="btn" disabled={syncing} onClick={() => void scanQr()}>
                Подсказка по QR
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={syncing || !joinText.trim()}
                onClick={() => void runSync(joinText)}
              >
                {syncing ? 'Загрузка…' : 'Забрать новые треки'}
              </button>
            </div>
            {syncMsg ? <p className="hint">{syncMsg}</p> : null}
          </div>
        ) : null}

        {tab === 'now' ? (
          <div className="now-panel">
            {current ? (
              <>
                {current.coverUri ? (
                  <img className="now-cover" src={current.coverUri} alt="" />
                ) : (
                  <div className="now-cover fallback">♪</div>
                )}
                <div className="now-title">{current.title}</div>
                <div className="now-artist">{current.artist}</div>
                <div className="now-time">
                  {formatTime(currentTime)} / {formatTime(current.duration)}
                </div>
                <button type="button" className="btn primary" onClick={() => void togglePlay()}>
                  {playing ? 'Пауза' : 'Играть'}
                </button>
              </>
            ) : (
              <p className="hint">Выберите трек в библиотеке</p>
            )}
          </div>
        ) : null}
      </main>

      <nav className="tabs">
        <button type="button" className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          Библиотека
        </button>
        <button type="button" className={tab === 'sync' ? 'active' : ''} onClick={() => setTab('sync')}>
          Синк
        </button>
        <button type="button" className={tab === 'now' ? 'active' : ''} onClick={() => setTab('now')}>
          Плеер
        </button>
      </nav>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
