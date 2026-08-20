import { Button } from './ui/Button';
import { useI18n } from '../i18n';

interface Props {
  hiddenCount: number;
  onShowAll: () => void;
}

export function ArtistShowAllButton({ hiddenCount, onShowAll }: Props) {
  const { t } = useI18n();
  if (hiddenCount <= 0) return null;
  return (
    <div className="artist-section-more">
      <Button variant="secondary" onClick={onShowAll}>
        {t('artist.showAll', { count: hiddenCount })}
      </Button>
    </div>
  );
}
