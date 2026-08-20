import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useI18n } from '../../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreatePlaylistModal({ open, onClose, onCreate }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setName('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('playlist.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={busy || !name.trim()}>
            {t('playlist.create')}
          </Button>
        </>
      }
    >
      <label className="field-label" htmlFor="playlist-name">
        {t('playlist.name')}
      </label>
      <input
        id="playlist-name"
        className="field-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('playlist.placeholder')}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit();
        }}
      />
    </Modal>
  );
}
