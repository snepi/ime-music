import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import type { Playlist } from '../../types';
import { useI18n } from '../../i18n';
import { playlistDisplayName } from '../../i18n/messages';

interface Props {
  open: boolean;
  songTitle?: string;
  playlists: Playlist[];
  onClose: () => void;
  onSelect: (playlistId: string) => Promise<void>;
}

export function AddToPlaylistModal({ open, songTitle, playlists, onClose, onSelect }: Props) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      title={t('playlist.addTitle')}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('settings.close')}
        </Button>
      }
    >
      {songTitle && <p className="modal-message">{t('playlist.track', { title: songTitle })}</p>}
      {playlists.length === 0 ? (
        <p className="modal-message muted">{t('playlist.needFirst')}</p>
      ) : (
        <ul className="playlist-pick-list">
          {playlists.map((pl) => (
            <li key={pl.id}>
              <button
                type="button"
                className="playlist-pick-item"
                onClick={() => void onSelect(pl.id)}
              >
                <Icon name="playlist" size={16} />
                <span>{playlistDisplayName(pl, t)}</span>
                <span className="playlist-pick-count">{pl.songIds.length}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
