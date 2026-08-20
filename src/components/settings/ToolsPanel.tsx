import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { usePlayer } from '../../store/playerStore';
import { useToast } from '../ui/Toast';
import type { LibraryRepairProgress, MetaSyncProgress, ScrobbleSettings } from '../../types';
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

  return (
    <div className="settings-panel">
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
