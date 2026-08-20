import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useI18n } from '../../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportUrlModal({ open, onClose }: Props) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setUrl('');
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      showToast(t('yt.needUrl'), 'error');
      return;
    }

    setBusy(true);
    try {
      if (!window.imeMusic?.importUrl) {
        showToast(t('yt.unavailable'), 'error');
        return;
      }

      const result = await window.imeMusic.importUrl(trimmed);
      if (!result.started) {
        showToast(result.error || t('yt.startFail'), 'error');
        return;
      }
      showToast(t('yt.started'), 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('yt.error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('yt.title')}
      onClose={onClose}
      className="import-url-modal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={busy || !url.trim()}>
            {busy ? t('sync.starting') : t('yt.download')}
          </Button>
        </>
      }
    >
      <div className="import-url-body">
        <label className="field-label" htmlFor="youtube-url">
          {t('yt.link')}
        </label>
        <div className="import-url-field">
          <Icon name="link" size={16} className="import-url-icon" aria-hidden />
          <input
            id="youtube-url"
            className="field-input import-url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            autoFocus
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
          />
        </div>
        <p className="field-hint">{t('yt.hint')}</p>
        <div className="import-url-notice" role="note">
          <Icon name="info" size={16} />
          <div>
            <p>{t('yt.notice')}</p>
            <p className="import-url-legal">{t('yt.legal')}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
