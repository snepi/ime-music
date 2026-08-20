import { Button } from '../../ui/Button';
import { useI18n } from '../../../i18n';

interface Props {
  onReset: () => void;
  label?: string;
}

/** Shared reset control for settings panels */
export function SectionReset({ onReset, label }: Props) {
  const { t } = useI18n();
  return (
    <div className="settings-section settings-actions-row settings-section-reset">
      <Button variant="secondary" onClick={onReset}>
        {label ?? t('settings.resetSection')}
      </Button>
    </div>
  );
}
