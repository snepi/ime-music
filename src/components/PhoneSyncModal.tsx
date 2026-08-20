import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import type { PhoneSyncStatus } from '../types';
import { useI18n } from '../i18n';

function formatBytes(n: number) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhoneSyncModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [status, setStatus] = useState<PhoneSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    void window.imeMusic.getPhoneSyncStatus?.().then((s) => setStatus(s));
    const unsub = window.imeMusic.onPhoneSyncEvent?.((evt) => {
      if (evt.session) setStatus({ ...evt.session, ok: evt.session.ok ?? true });
      if (evt.type === 'offer' && typeof evt.missingCount === 'number') {
        setHint(
          `${evt.missingCount}` +
            (evt.totalBytes ? ` · ${formatBytes(evt.totalBytes)}` : ''),
        );
      }
      if (evt.type === 'file') {
        setHint((h) => h || t('sync.transferring'));
      }
      if (evt.type === 'done') {
        setHint(t('sync.done'));
        showToast(t('sync.done'), 'success');
      }
    });
    return () => {
      unsub?.();
    };
  }, [open, showToast, t]);

  const start = async () => {
    setBusy(true);
    setHint(t('sync.waiting'));
    try {
      const next = await window.imeMusic.startPhoneSync();
      setStatus(next);
      if (!next.active) showToast(t('sync.startFailed'), 'error');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await window.imeMusic.stopPhoneSync();
      setStatus({ ok: true, active: false });
      setHint('');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <Modal
      open={open}
      onClose={onClose}
      title={t('sync.title')}
      width={560}
      className="phone-sync-modal"
      footer={
        <>
          {status?.active ? (
            <Button variant="danger" disabled={busy} onClick={() => void stop()}>
              {t('sync.stop')}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void start()}>
              {busy ? t('sync.starting') : t('sync.showQr')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('settings.close')}
          </Button>
        </>
      }
    >
      <p className="field-hint" style={{ marginBottom: 12 }}>
        {t('sync.hint')}
      </p>

      {status?.active && status.qrDataUrl ? (
        <div className="phone-sync-qr-wrap">
          <img className="phone-sync-qr" src={status.qrDataUrl} alt="QR" />
          <div className="phone-sync-meta">
            <div>
              <span className="field-label">{t('sync.link')}</span>
              <code className="phone-sync-url">{status.joinUrl}</code>
            </div>
            {status.lanAddresses?.length ? (
              <div>
                <span className="field-label">{t('sync.ips')}</span>
                <div className="phone-sync-ips">{status.lanAddresses.join(', ')}</div>
              </div>
            ) : null}
            <div className="phone-sync-stats">
              {t('sync.transferred', {
                files: status.transferredFiles || 0,
                bytes: formatBytes(status.transferredBytes || 0),
              })}
            </div>
            {hint ? <p className="field-hint">{hint}</p> : null}
          </div>
        </div>
      ) : (
        <p className="field-hint">{hint || t('sync.wait')}</p>
      )}
    </Modal>,
    document.body,
  );
}
