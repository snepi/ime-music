import type { ImportProgress } from '../types';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { useI18n } from '../i18n';

interface Props {
  progress: ImportProgress | null;
  visible: boolean;
  onClose: () => void;
  onCancel: () => void;
  showErrors: boolean;
  onToggleErrors: () => void;
}

export function ImportProgressModal({
  progress,
  visible,
  onClose,
  onCancel,
  showErrors,
  onToggleErrors,
}: Props) {
  const { t } = useI18n();
  if (!visible || !progress) return null;

  const downloading = progress.phase === 'download' && !progress.done;
  const canCancel = !progress.done && !progress.cancelled;
  const pct =
    progress.downloadPercent != null
      ? Math.round(progress.downloadPercent)
      : progress.total > 0
        ? Math.round((progress.processed / progress.total) * 100)
        : progress.done
          ? 100
          : 0;

  const title = progress.cancelled
    ? t('import.cancelled')
    : progress.done
      ? t('import.done')
      : downloading
        ? t('import.downloading')
        : t('import.running');

  return (
    <div className="import-panel" role="status" aria-live="polite">
      <div className="import-panel-header">
        <div className="import-panel-title">
          <Icon name={progress.cancelled ? 'warning' : progress.done ? 'check' : 'import'} size={18} />
          <strong>{title}</strong>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label={t('import.hide')}
          title={t('import.hideHint')}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className={`import-bar${downloading && progress.downloadPercent == null ? ' import-bar-indeterminate' : ''}`}>
        <div className="import-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="import-stats">
        {!downloading ? (
          <span>
            {progress.processed}/{progress.total}
          </span>
        ) : null}
        {progress.statusMessage ? (
          <span className="import-status">{progress.statusMessage}</span>
        ) : null}
        <span>{t('import.added', { count: progress.added })}</span>
        <span>{t('import.skipped', { count: progress.skipped })}</span>
        <span>{t('import.failed', { count: progress.failed })}</span>
      </div>
      {canCancel ? (
        <Button variant="ghost" className="import-cancel-btn" onClick={() => void onCancel()}>
          {t('import.cancel')}
        </Button>
      ) : null}
      {progress.failed > 0 && (
        <Button variant="secondary" className="import-errors-toggle" onClick={onToggleErrors}>
          {showErrors ? t('import.hideErrors') : t('import.showErrors')}
        </Button>
      )}
      {showErrors && progress.errors.length > 0 && (
        <ul className="import-errors">
          {progress.errors.map((err) => (
            <li key={err.filePath + err.message}>
              <div className="import-error-path">{err.filePath}</div>
              <div className="import-error-msg">{err.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
