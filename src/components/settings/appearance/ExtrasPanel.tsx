import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { DEFAULT_APPEARANCE, DEFAULT_HOTKEYS } from '../../../appearance/schema';
import { useState } from 'react';
import { useI18n } from '../../../i18n';

interface Props {
  onResetAll: () => Promise<void>;
}

export function ExtrasPanel({ onResetAll }: Props) {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <p className="field-hint">
          {t('settings.extras.resetHint', {
            theme: DEFAULT_APPEARANCE.theme,
            count: Object.keys(DEFAULT_HOTKEYS).length,
          })}
        </p>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          {t('settings.extras.resetAll')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('settings.extras.confirmTitle')}
        message={t('settings.extras.confirmMessage')}
        confirmLabel={t('common.reset')}
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setBusy(true);
          void onResetAll().finally(() => {
            setBusy(false);
            setConfirm(false);
          });
        }}
      />
      {busy ? <p className="field-hint">{t('settings.extras.resetting')}</p> : null}
    </div>
  );
}
