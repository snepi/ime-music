import { useEffect, useRef, useState } from 'react';
import { PlayerProvider, usePlayer } from './store/playerStore';
import { ToastProvider } from './components/ui/Toast';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { LibraryView } from './components/SongList';
import { PlayerBar } from './components/PlayerBar';
import { SettingsModal } from './components/SettingsModal';
import { ImportProgressModal } from './components/ImportProgressModal';
import type { ImportSession } from './components/ImportNotificationsPanel';
import { applyAppearance } from './utils/applyAppearance';
import { DEFAULT_APPEARANCE } from './appearance/schema';
import type { ImportProgress } from './types';
import { useHotkeys } from './hooks/useHotkeys';
import { EditMetadataModal } from './components/modals/EditMetadataModal';
import { WallpaperLayer } from './components/WallpaperLayer';
import { getEffectiveAppearance } from './utils/applyAppearance';
import { MiniPlayerApp } from './components/MiniPlayerApp';
import { PhoneSyncModal } from './components/PhoneSyncModal';
import { I18nProvider, useI18n } from './i18n';
import { useToast } from './components/ui/Toast';

function isMiniRoute() {
  return typeof window !== 'undefined' && window.location.hash === '#mini';
}

function AppContent() {
  const { refreshLibrary, state, dispatch } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phoneSyncOpen, setPhoneSyncOpen] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const importSessionRef = useRef<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const ready = typeof window !== 'undefined' && !!window.imeMusic;

  useHotkeys({
    onSettings: () => setSettingsOpen(true),
    onSearch: () => {
      const el = document.querySelector<HTMLInputElement>('.search-input');
      el?.focus();
    },
    onQueue: () => {
      const btn = document.querySelector<HTMLButtonElement>('.queue-toggle');
      btn?.click();
    },
    onEditMetadata: () => {
      if (state.currentSongId) setEditMetaOpen(true);
    },
  });

  useEffect(() => {
    const appearance = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE);
    applyAppearance(appearance);

    if (appearance.theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyAppearance(appearance);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [state.settings.appearance]);

  // Quiet update check a few seconds after start
  useEffect(() => {
    if (!ready || !window.imeMusic?.checkForUpdates) return undefined;
    const timer = window.setTimeout(() => {
      void window.imeMusic.checkForUpdates().then((res) => {
        if (res?.ok && res.updateAvailable && res.latestVersion) {
          showToast(t('tools.updateAvailable', { version: res.latestVersion }), 'info');
        }
      });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [ready, showToast, t]);

  // Dynamic color auto-update when track cover changes
  useEffect(() => {
    const appearance = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE);
    const dc = appearance.dynamicColors;
    if (!dc.enabled || !dc.autoUpdate || dc.level === 'off') return;
    const song = state.songs.find((s) => s.id === state.currentSongId);
    const coverPath = song?.coverPath;
    if (!coverPath || !window.imeMusic?.analyzeImagePalette) return;
    let cancelled = false;
    void window.imeMusic.analyzeImagePalette(coverPath).then(async (result) => {
      if (cancelled || !result.ok || !result.palette) return;
      if (result.cacheKey && result.cacheKey === dc.cacheKey) return;
      const next = {
        ...appearance,
        dynamicColors: {
          ...dc,
          cachedPalette: result.palette,
          cacheKey: result.cacheKey || null,
        },
      };
      applyAppearance(next);
      const settings = await window.imeMusic.updateSettings({ appearance: next });
      dispatch({ type: 'UPDATE_SETTINGS', settings });
    });
    return () => {
      cancelled = true;
    };
  }, [state.currentSongId, state.songs, state.settings.appearance?.dynamicColors?.enabled, state.settings.appearance?.dynamicColors?.autoUpdate, state.settings.appearance?.dynamicColors?.level, dispatch]);

  useEffect(() => {
    if (!window.imeMusic?.onImportProgress) return;
    const unsubscribe = window.imeMusic.onImportProgress((progress) => {
      setImportProgress(progress);
      setImportVisible(true);

      setImportSessions((prev) => {
        let sessionId = importSessionRef.current;
        if (!sessionId && !progress.done) {
          sessionId = crypto.randomUUID();
          importSessionRef.current = sessionId;
          return [{ id: sessionId, startedAt: Date.now(), progress }, ...prev].slice(0, 12);
        }
        if (!sessionId) return prev;
        return prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                progress,
                finishedAt: progress.done ? Date.now() : session.finishedAt,
              }
            : session,
        );
      });

      if (progress.done) {
        importSessionRef.current = null;
        if (progress.failed > 0) setShowErrors(true);
        void refreshLibrary();
      }
    });
    return unsubscribe;
  }, [refreshLibrary]);

  const cancelImport = async () => {
    await window.imeMusic.cancelImport?.();
  };

  const importRunning = Boolean(importProgress && !importProgress.done);
  const notificationBadge = importRunning && !importVisible;

  if (!ready) {
    return (
      <div className="app app-fallback">
        <div className="fallback-card">
          <img className="fallback-logo" src="/brand/icon.png" alt="IMe Music" width={64} height={64} />
          <img className="fallback-wordmark" src="/brand/wordmark.png" alt="IMe Music" />
          <p>Приложение работает внутри Electron. Запустите через ярлык.</p>
          <p className="muted">Локальный браузер не откроет библиотеку.</p>
        </div>
      </div>
    );
  }

  const appearance = getEffectiveAppearance(state.settings.appearance || DEFAULT_APPEARANCE);
  const showSidebar = appearance.layout.showSidebar;
  const sidebarRight = appearance.layout.sidebarPosition === 'right';

  return (
    <div
      className={`app${sidebarRight ? ' app-sidebar-right' : ''}${!showSidebar ? ' app-no-sidebar' : ''}`}
    >
      <WallpaperLayer />
      <TitleBar
        onSettings={() => setSettingsOpen(true)}
        notificationsOpen={notificationsOpen}
        onToggleNotifications={() => setNotificationsOpen((v) => !v)}
        onCloseNotifications={() => setNotificationsOpen(false)}
        notificationBadge={notificationBadge}
        importSessions={importSessions}
        importProgress={importProgress}
        onShowImportPanel={() => setImportVisible(true)}
        onCancelImport={() => void cancelImport()}
      />
      <div className="app-body">
        {showSidebar && !sidebarRight ? <Sidebar /> : null}
        <main className="main-content">
          <LibraryView />
        </main>
        {showSidebar && sidebarRight ? <Sidebar /> : null}
      </div>
      <PlayerBar />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenPhoneSync={() => {
          setSettingsOpen(false);
          setPhoneSyncOpen(true);
        }}
      />
      <PhoneSyncModal open={phoneSyncOpen} onClose={() => setPhoneSyncOpen(false)} />
      <EditMetadataModal
        open={editMetaOpen}
        songId={state.currentSongId}
        onClose={() => setEditMetaOpen(false)}
        onSaved={(song) => dispatch({ type: 'UPDATE_SONG', song })}
      />
      <ImportProgressModal
        progress={importProgress}
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        onCancel={() => void cancelImport()}
        showErrors={showErrors}
        onToggleErrors={() => setShowErrors((v) => !v)}
      />
    </div>
  );
}

export default function App() {
  if (isMiniRoute()) {
    return <MiniPlayerWithI18n />;
  }

  return (
    <PlayerProvider>
      <ToastProvider>
        <AppWithI18n />
      </ToastProvider>
    </PlayerProvider>
  );
}

function MiniPlayerWithI18n() {
  const [locale, setLocale] = useState('ru');
  useEffect(() => {
    void window.imeMusic.getLibrary?.().then((data) => {
      if (data?.settings?.locale) setLocale(data.settings.locale);
    });
  }, []);
  return (
    <I18nProvider locale={locale}>
      <MiniPlayerApp />
    </I18nProvider>
  );
}

function AppWithI18n() {
  const { state } = usePlayer();
  return (
    <I18nProvider locale={state.settings.locale}>
      <AppContent />
    </I18nProvider>
  );
}
