import { usePlayer } from '../store/playerStore';
import { ContextMenu } from './ui/ContextMenu';
import { useToast } from './ui/Toast';
import { useI18n } from '../i18n';

interface Props {
  songId: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onAddToPlaylist: () => void;
  onEditMetadata: () => void;
  onDelete?: () => void;
}

export function SongContextMenu({
  songId,
  anchorEl,
  onClose,
  onAddToPlaylist,
  onEditMetadata,
  onDelete,
}: Props) {
  const { state, playNow, addToQueue, addToQueueNext, toggleLike } = usePlayer();
  const { showToast } = useToast();
  const { t } = useI18n();
  const song = state.songs.find((s) => s.id === songId);

  const items = [
    {
      id: 'play-now',
      label: t('menu.playNow'),
      onClick: () => playNow(songId),
    },
    {
      id: 'add-next',
      label: t('menu.addNext'),
      onClick: () => {
        void addToQueueNext(songId);
        showToast(t('menu.nextToast'), 'info');
      },
    },
    {
      id: 'add-queue',
      label: t('menu.addQueue'),
      onClick: () => {
        void addToQueue(songId);
        showToast(t('menu.queueToast'), 'info');
      },
    },
    {
      id: 'add-playlist',
      label: t('menu.addPlaylist'),
      onClick: () => onAddToPlaylist(),
    },
    {
      id: 'edit-meta',
      label: t('menu.editMeta'),
      onClick: () => onEditMetadata(),
    },
    {
      id: 'like',
      label: song?.liked ? t('player.unlike') : t('player.like'),
      onClick: () => {
        void toggleLike(songId);
      },
    },
    {
      id: 'reveal',
      label: t('player.showInFolder'),
      onClick: () => {
        if (song?.filePath) void window.imeMusic.showItemInFolder(song.filePath);
      },
    },
    ...(onDelete
      ? [
          {
            id: 'delete',
            label: t('menu.deleteLib'),
            danger: true,
            onClick: () => onDelete(),
          },
        ]
      : []),
  ];

  return <ContextMenu anchorEl={anchorEl} items={items} onClose={onClose} />;
}
