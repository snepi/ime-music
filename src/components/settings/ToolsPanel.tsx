import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { usePlayer } from '../../store/playerStore';
import { useToast } from '../ui/Toast';
import type {
  LibraryRepairProgress,
  MetaSyncProgress,
  ScrobbleSettings,
  UpdateCheckResult,
  UpdateProgress,
} from '../../types';
import { useI18n } from '../../i18n';

const DEFAULT_SCROBBLE: ScrobbleSettings = {
  listenBrainzEnabled: false,
  listenBrainzToken: '',
  lastFmEnabled: false,
  lastFmApiKey: '',
  lastFmApiSecret: '',
  lastFmSessionKey: '',
  lastFmUsername: '',
};

export function ToolsPanel({ onOpenPhoneSync }: { onOpenPhoneSync?: () => void }) {
  const { state, dispatch, refreshLibrary } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [ffmpegPath, setFfmpegPath] = useState(state.settings.ffmpegPath);
  const [ytdlpPath, setYtdlpPath] = useState(state.settings.ytdlpPath || '');
  const [ytdlpProxy, setYtdlpProxy] = useState(state.settings.ytdlpProxy || '');
  const [scrobble, setScrobble] = useState<ScrobbleSettings>({
    ...DEFAULT_SCROBBLE,
    ...(state.settings.scrobble || {}),
  });
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaProgress, setMetaProgress] = useState<MetaSyncProgress | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairProgress, setRepairProgress] = useState<LibraryRepairProgress | null>(null);
  const [dupPreview, setDupPreview] = useState<number | null>(null);
  const [appVersion, setAppVersion] = useState('…');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [missingBusy, setMissingBusy] = useState(false);
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [playlistImportBusy, setPlaylistImportBusy] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');

  useEffect(() => {
    setFfmpegPath(state.settings.ffmpegPath);
    setYtdlpPath(state.settings.ytdlpPath || '');
    setYtdlpProxy(state.settings.ytdlpProxy || '');
    setScrobble({ ...DEFAULT_SCROBBLE, ...(state.settings.scrobble || {}) });
  }, [
    state.settings.ffmpegPath,
    state.settings.ytdlpPath,
    state.settings.ytdlpProxy,
    state.settings.scrobble,
  ]);

  useEffect(() => {
    void window.imeMusic.getAppVersion?.().then((res) => {
      if (res?.version) setAppVersion(res.version);
    });
  }, []);

  useEffect(() => {
    if (!window.imeMusic?.onUpdateProgress) return undefined;
    return window.imeMusic.onUpdateProgress((p) => {
      setUpdateProgress(p);
      if (p.done && p.phase === 'error') {
        setUpdateBusy(false);
        showToast(p.error || t('tools.updateFailed'), 'error');
      }
    });
  }, [showToast, t]);

  useEffect(() => {
    if (!window.imeMusic?.onMetaSyncProgress) return undefined;
    return window.imeMusic.onMetaSyncProgress((p) => {
      setMetaProgress(p);
      if (p.done) {
        setMetaBusy(false);
        void refreshLibrary();
        showToast(
          t('tools.metaResult', {
            updated: p.updated,
            skipped: p.skipped,
            failed: p.failed,
          }),
          p.failed ? 'info' : 'success',
        );
      }
    });
  }, [refreshLibrary, showToast, t]);

  useEffect(() => {
    if (!window.imeMusic?.onLibraryRepairProgress) return undefined;
    return window.imeMusic.onLibraryRepairProgress((p) => {
      setRepairProgress(p);
      if (p.done) {
        setRepairBusy(false);
        void refreshLibrary();
        if (p.totalGroups === 0) {
          showToast(t('tools.repairNone'), 'info');
        } else {
          showToast(
            t('tools.repairMerged', { merged: p.merged, removed: p.removed }),
            p.failed ? 'info' : 'success',
          );
        }
      }
    });
  }, [refreshLibrary, showToast, t]);

  const saveTools = async () => {
    const settings = await window.imeMusic.updateSettings({ ffmpegPath, ytdlpPath, ytdlpProxy });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    showToast(t('tools.saved'), 'success');
  };

  const saveScrobble = async () => {
    const settings = await window.imeMusic.updateSettings({ scrobble });
    dispatch({ type: 'UPDATE_SETTINGS', settings });
    showToast(t('tools.scrobbleSaved'), 'success');
  };

  const startMeta = async () => {
    setMetaBusy(true);
    setMetaProgress(null);
    const res = await window.imeMusic.startMetaSync();
    if (!res.started) {
      setMetaBusy(false);
      showToast(t('tools.metaAlready'), 'info');
    }
  };

  const findDuplicates = async () => {
    const res = await window.imeMusic.findLibraryDuplicates?.();
    if (!res?.ok) {
      showToast(t('common.error'), 'error');
      return;
    }
    setDupPreview(res.totalGroups);
    showToast(
      res.totalGroups === 0
        ? t('tools.repairNone')
        : t('tools.repairFound', { groups: res.totalGroups }),
      res.totalGroups ? 'info' : 'success',
    );
  };

  const startRepair = async () => {
    setRepairBusy(true);
    setRepairProgress(null);
    const res = await window.imeMusic.repairLibraryDuplicates?.();
    if (!res?.started) {
      setRepairBusy(false);
      showToast(t('tools.repairAlready'), 'info');
    }
  };

  const rebuildAutos = async () => {
    const res = await window.imeMusic.rebuildAutoPlaylists();
    await refreshLibrary();
    showToast(t('tools.autosUpdated', { count: res.playlists?.length || 0 }), 'success');
  };

  const exportBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await window.imeMusic.exportLibraryBackup();
      if (res?.cancelled) {
        showToast(t('tools.backupCancelled'), 'info');
      } else if (!res?.ok) {
        showToast(res?.error || t('tools.backupFailed'), 'error');
      } else {
        showToast(
          t('tools.backupExported', {
            liked: res.liked || 0,
            playlists: res.playlists || 0,
            wishlist: res.wishlist || 0,
          }),
          'success',
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('tools.backupFailed'), 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const importBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await window.imeMusic.importLibraryBackup();
      if (res?.cancelled) {
        showToast(t('tools.backupCancelled'), 'info');
      } else if (!res?.ok) {
        showToast(res?.error || t('tools.backupFailed'), 'error');
      } else {
        await refreshLibrary();
        showToast(
          t('tools.backupImported', {
            liked: res.likedApplied || 0,
            playlists: res.playlistsCreated || 0,
            wishlist: res.wishlist || 0,
          }),
          'success',
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('tools.backupFailed'), 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const findMissing = async () => {
    setMissingBusy(true);
    try {
      const res = await window.imeMusic.findMissingTracks?.();
      if (!res?.ok) {
        showToast(res?.error || t('common.error'), 'error');
        return;
      }
      setMissingCount(res.missingCount);
      showToast(
        res.missingCount === 0
          ? t('tools.missingNone')
          : t('tools.missingFound', { count: res.missingCount }),
        res.missingCount ? 'info' : 'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setMissingBusy(false);
    }
  };

  const relocateMissingFolder = async () => {
    setMissingBusy(true);
    try {
      const res = await window.imeMusic.relocateMissingByFolder?.();
      if (res?.cancelled) {
        showToast(t('tools.backupCancelled'), 'info');
        return;
      }
      if (!res?.ok) {
        showToast(res?.error || t('common.error'), 'error');
        return;
      }
      await refreshLibrary();
      setMissingCount(res.stillMissing);
      showToast(
        t('tools.missingRelocated', {
          relocated: res.relocated,
          still: res.stillMissing,
        }),
        res.stillMissing ? 'info' : 'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setMissingBusy(false);
    }
  };

  const importPlaylistFile = async () => {
    setPlaylistImportBusy(true);
    try {
      const res = await window.imeMusic.importPlaylistFile?.();
      if (res?.cancelled) {
        showToast(t('tools.backupCancelled'), 'info');
        return;
      }
      if (!res?.ok) {
        showToast(res?.error || t('tools.playlistImportFailed'), 'error');
        return;
      }
      await refreshLibrary();
      showToast(
        t('tools.playlistImportOk', {
          matched: res.matched,
          unmatched: res.unmatched,
          wishlist: res.wishlistAdded || 0,
        }),
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('tools.playlistImportFailed'), 'error');
    } finally {
      setPlaylistImportBusy(false);
    }
  };

  const importPlaylistUrl = async () => {
    const url = playlistUrl.trim();
    if (!url) {
      showToast(t('tools.playlistUrlRequired'), 'info');
      return;
    }
    setPlaylistImportBusy(true);
    try {
      const res = await window.imeMusic.importPlaylistUrl?.(url);
      if (!res?.ok) {
        showToast(res?.error || t('tools.playlistImportFailed'), 'error');
        return;
      }
      await refreshLibrary();
      showToast(
        t('tools.playlistUrlOk', {
          name: res.name || '',
          matched: res.matched,
          unmatched: res.unmatched,
          wishlist: res.wishlistAdded || 0,
        }),
        'success',
      );
      setPlaylistUrl('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('tools.playlistImportFailed'), 'error');
    } finally {
      setPlaylistImportBusy(false);
    }
  };

  const checkUpdates = async () => {
    setUpdateBusy(true);
    setUpdateProgress(null);
    try {
      const res = await window.imeMusic.checkForUpdates?.();
      setUpdateInfo(res || null);
      if (!res?.ok) {
        showToast(res?.error || t('tools.updateFailed'), 'error');
      } else if (res.updateAvailable) {
        showToast(t('tools.updateAvailable', { version: res.latestVersion || '' }), 'info');
      } else {
        showToast(t('tools.updateLatest'), 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('tools.updateFailed'), 'error');
    } finally {
      setUpdateBusy(false);
    }
  };

  const installUpdate = async () => {
    if (!updateInfo?.downloadUrl) {
      showToast(t('tools.updateNoFile'), 'info');
      return;
    }
    setUpdateBusy(true);
    setUpdateProgress(null);
    showToast(t('tools.updateDownloading'), 'info');
    const res = await window.imeMusic.downloadAndInstallUpdate?.({
      downloadUrl: updateInfo.downloadUrl,
      fileName: updateInfo.downloadName || undefined,
    });
    if (!res?.ok) {
      setUpdateBusy(false);
      showToast(res?.error || t('tools.updateFailed'), 'error');
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.updates')}</h3>
        <p className="field-hint" style={{ marginBottom: 8 }}>
          {t('tools.updatesHint')}
        </p>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.currentVersion', { version: appVersion })}
          {updateInfo?.latestVersion
            ? ` · ${t('tools.latestVersion', { version: updateInfo.latestVersion })}`
            : ''}
        </p>
        <div className="settings-inline-actions">
          <Button variant="secondary" disabled={updateBusy} onClick={() => void checkUpdates()}>
            {updateBusy && !updateProgress ? t('tools.updateChecking') : t('tools.updateCheck')}
          </Button>
          {updateInfo?.updateAvailable && updateInfo.downloadUrl ? (
            <Button variant="primary" disabled={updateBusy} onClick={() => void installUpdate()}>
              {t('tools.updateInstall', { version: updateInfo.latestVersion || '' })}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => void window.imeMusic.openReleasePage?.(updateInfo?.releaseUrl || undefined)}
          >
            {t('tools.updateOpenPage')}
          </Button>
        </div>
        {updateProgress && !updateProgress.done ? (
          <p className="field-hint" style={{ marginTop: 8 }}>
            {updateProgress.phase === 'launch'
              ? t('tools.updateLaunching')
              : t('tools.updateProgress', { percent: updateProgress.percent })}
          </p>
        ) : null}
        {updateInfo?.updateAvailable && updateInfo.releaseNotes ? (
          <pre className="tools-update-notes">{updateInfo.releaseNotes.slice(0, 1200)}</pre>
        ) : null}
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.backup')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.backupHint')}
        </p>
        <div className="settings-inline-actions">
          <Button
            variant="secondary"
            disabled={backupBusy}
            onClick={() => void exportBackup()}
          >
            {t('tools.backupExport')}
          </Button>
          <Button
            variant="primary"
            disabled={backupBusy}
            onClick={() => void importBackup()}
          >
            {t('tools.backupImport')}
          </Button>
        </div>
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.playlistImport')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.playlistImportHint')}
        </p>
        <label className="field-label" htmlFor="playlist-url">
          {t('tools.playlistUrlLabel')}
        </label>
        <input
          id="playlist-url"
          className="field-input"
          type="url"
          value={playlistUrl}
          onChange={(e) => setPlaylistUrl(e.target.value)}
          placeholder={t('tools.playlistUrlPh')}
          disabled={playlistImportBusy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void importPlaylistUrl();
          }}
        />
        <div className="settings-inline-actions" style={{ marginTop: 10 }}>
          <Button
            variant="primary"
            disabled={playlistImportBusy}
            onClick={() => void importPlaylistUrl()}
          >
            {playlistImportBusy ? t('common.loading') : t('tools.playlistUrlBtn')}
          </Button>
          <Button
            variant="ghost"
            disabled={playlistImportBusy}
            onClick={() => void importPlaylistFile()}
          >
            {t('tools.playlistImportBtn')}
          </Button>
        </div>
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.phone')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.phoneHint')}
        </p>
        <Button variant="primary" onClick={() => onOpenPhoneSync?.()}>
          {t('tools.phoneSync')}
        </Button>
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.meta')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.metaHint')}
        </p>
        <Button variant="secondary" disabled={metaBusy} onClick={() => void startMeta()}>
          {metaBusy ? t('tools.metaBusy') : t('tools.metaSync')}
        </Button>
        {metaProgress ? (
          <p className="field-hint" style={{ marginTop: 8 }}>
            {metaProgress.processed}/{metaProgress.total}
            {metaProgress.done ? ` · ${t('tools.metaDone')}` : ''}
          </p>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <Button variant="ghost" onClick={() => void rebuildAutos()}>
            {t('tools.rebuildAutos')}
          </Button>
        </div>
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.repair')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.repairHint')}
        </p>
        <div className="settings-inline-actions">
          <Button variant="secondary" disabled={repairBusy} onClick={() => void findDuplicates()}>
            {t('tools.repairFind')}
          </Button>
          <Button variant="primary" disabled={repairBusy} onClick={() => void startRepair()}>
            {repairBusy ? t('tools.repairBusy') : t('tools.repairMerge')}
          </Button>
        </div>
        {dupPreview != null ? (
          <p className="field-hint" style={{ marginTop: 8 }}>
            {dupPreview === 0
              ? t('tools.repairNone')
              : t('tools.repairFound', { groups: dupPreview })}
          </p>
        ) : null}
        {repairProgress ? (
          <p className="field-hint" style={{ marginTop: 8 }}>
            {repairProgress.processed}/{repairProgress.totalGroups}
            {repairProgress.done
              ? ` · ${t('tools.repairMerged', {
                  merged: repairProgress.merged,
                  removed: repairProgress.removed,
                })}`
              : ''}
          </p>
        ) : null}
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.missing')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.missingHint')}
        </p>
        <div className="settings-inline-actions">
          <Button variant="secondary" disabled={missingBusy} onClick={() => void findMissing()}>
            {t('tools.missingFind')}
          </Button>
          <Button variant="primary" disabled={missingBusy} onClick={() => void relocateMissingFolder()}>
            {t('tools.missingRelocate')}
          </Button>
        </div>
        {missingCount != null ? (
          <p className="field-hint" style={{ marginTop: 8 }}>
            {missingCount === 0
              ? t('tools.missingNone')
              : t('tools.missingFound', { count: missingCount })}
          </p>
        ) : null}
      </div>

      <div className="settings-section">
        <h3 style={{ marginBottom: 8 }}>{t('tools.scrobble')}</h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {t('tools.scrobbleHint')}
        </p>
        <Toggle
          checked={scrobble.listenBrainzEnabled}
          onChange={(v) => setScrobble((s) => ({ ...s, listenBrainzEnabled: v }))}
          label="ListenBrainz"
        />
        <label className="field-label" htmlFor="lb-token" style={{ marginTop: 8 }}>
          ListenBrainz user token
        </label>
        <input
          id="lb-token"
          className="field-input"
          type="password"
          value={scrobble.listenBrainzToken}
          onChange={(e) => setScrobble((s) => ({ ...s, listenBrainzToken: e.target.value }))}
          placeholder={t('tools.lbTokenPh')}
        />
        <Toggle
          checked={scrobble.lastFmEnabled}
          onChange={(v) => setScrobble((s) => ({ ...s, lastFmEnabled: v }))}
          label="Last.fm"
        />
        <label className="field-label" htmlFor="lfm-key" style={{ marginTop: 8 }}>
          Last.fm API key
        </label>
        <input
          id="lfm-key"
          className="field-input"
          value={scrobble.lastFmApiKey}
          onChange={(e) => setScrobble((s) => ({ ...s, lastFmApiKey: e.target.value }))}
        />
        <label className="field-label" htmlFor="lfm-secret">
          Last.fm shared secret
        </label>
        <input
          id="lfm-secret"
          className="field-input"
          type="password"
          value={scrobble.lastFmApiSecret}
          onChange={(e) => setScrobble((s) => ({ ...s, lastFmApiSecret: e.target.value }))}
        />
        <label className="field-label" htmlFor="lfm-sk">
          Last.fm session key
        </label>
        <input
          id="lfm-sk"
          className="field-input"
          type="password"
          value={scrobble.lastFmSessionKey}
          onChange={(e) => setScrobble((s) => ({ ...s, lastFmSessionKey: e.target.value }))}
        />
        <label className="field-label" htmlFor="lfm-user">
          {t('tools.lfmUserOptional')}
        </label>
        <input
          id="lfm-user"
          className="field-input"
          value={scrobble.lastFmUsername}
          onChange={(e) => setScrobble((s) => ({ ...s, lastFmUsername: e.target.value }))}
        />
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={() => void saveScrobble()}>
            {t('tools.saveScrobble')}
          </Button>
        </div>
      </div>

      <div className="settings-section">
        <label className="field-label" htmlFor="ffmpeg-path">
          {t('tools.ffmpegPath')}
        </label>
        <div className="field-row">
          <input
            id="ffmpeg-path"
            className="field-input"
            value={ffmpegPath}
            onChange={(e) => setFfmpegPath(e.target.value)}
            placeholder="C:\ffmpeg\bin\ffmpeg.exe"
          />
          <Button
            variant="secondary"
            onClick={() => void window.imeMusic.browseFFmpeg().then((p) => p && setFfmpegPath(p))}
          >
            {t('tools.browse')}
          </Button>
        </div>
      </div>
      <div className="settings-section">
        <label className="field-label" htmlFor="ytdlp-path">
          {t('tools.ytdlpPath')}
        </label>
        <div className="field-row">
          <input
            id="ytdlp-path"
            className="field-input"
            value={ytdlpPath}
            onChange={(e) => setYtdlpPath(e.target.value)}
            placeholder="D:\yt-dlp\yt-dlp.exe"
          />
          <Button
            variant="secondary"
            onClick={() => void window.imeMusic.browseYtDlp().then((p) => p && setYtdlpPath(p))}
          >
            {t('tools.browse')}
          </Button>
        </div>
      </div>
      <div className="settings-section">
        <label className="field-label" htmlFor="ytdlp-proxy">
          {t('tools.ytdlpProxy')}
        </label>
        <input
          id="ytdlp-proxy"
          className="field-input"
          value={ytdlpProxy}
          onChange={(e) => setYtdlpProxy(e.target.value)}
          placeholder="socks5://127.0.0.1:1080"
        />
        <p className="field-hint">{t('tools.ytdlpProxyHint')}</p>
      </div>
      <div className="settings-section">
        <Button variant="primary" onClick={() => void saveTools()}>
          {t('tools.saveTools')}
        </Button>
      </div>
    </div>
  );
}
