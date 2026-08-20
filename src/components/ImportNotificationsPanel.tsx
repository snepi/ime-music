import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImportProgress } from '../types';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';

export interface ImportSession {
  id: string;
  startedAt: number;
  finishedAt?: number;
  progress: ImportProgress;
}

interface Props {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  sessions: ImportSession[];
  activeProgress: ImportProgress | null;
  onShowProgressPanel: () => void;
  onCancelImport: () => void;
}

function importKindLabel(kind: ImportProgress['kind'], t: (key: MessageKey) => string) {
  switch (kind) {
    case 'wishlist':
      return t('import.kind.wishlist');
    case 'search':
      return t('import.kind.search');
    case 'url':
      return t('import.kind.url');
    case 'files':
      return t('import.kind.files');
    default:
      return t('import.kind.default');
  }
}

function sessionTitle(session: ImportSession, t: (key: MessageKey) => string) {
  const { progress } = session;
  if (progress.statusMessage) return progress.statusMessage;
  return importKindLabel(progress.kind, t);
}

function sessionState(session: ImportSession, t: (key: MessageKey) => string) {
  const { progress } = session;
  if (progress.cancelled) return t('import.state.cancelled');
  if (!progress.done) return t('import.state.running');
  if (progress.failed > 0) return t('import.state.failed');
  return t('import.state.done');
}

export function ImportNotificationsPanel({
  open,
  anchorRef,
  onClose,
  sessions,
  activeProgress,
  onShowProgressPanel,
  onCancelImport,
}: Props) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 48, right: 16 });

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    let removeListener: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onDocClick = (e: MouseEvent) => {
        const target = e.target as Node;
        if (panelRef.current?.contains(target)) return;
        if (anchorRef.current?.contains(target)) return;
        onClose();
      };
      document.addEventListener('mousedown', onDocClick);
      removeListener = () => document.removeEventListener('mousedown', onDocClick);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      removeListener?.();
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const running = activeProgress && !activeProgress.done;

  return createPortal(
    <div
      className="import-notifications import-notifications-portal"
      ref={panelRef}
      style={{ top: pos.top, right: pos.right }}
    >
      <div className="import-notifications-header">
        <strong>{t('import.notifications')}</strong>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.hide')}>
          <Icon name="close" size={14} />
        </button>
      </div>

      {running ? (
        <div className="import-notifications-active">
          <div className="import-notifications-active-title">
            <Icon name="import" size={16} />
            <span>{activeProgress.statusMessage || importKindLabel(activeProgress.kind, t)}</span>
          </div>
          <div className="import-notifications-stats">
            <span>
              {activeProgress.processed}/{activeProgress.total}
            </span>
            {activeProgress.downloadPercent != null ? (
              <span>{Math.round(activeProgress.downloadPercent)}%</span>
            ) : null}
          </div>
          <div className="import-notifications-actions">
            <Button variant="secondary" onClick={onShowProgressPanel}>
              {t('import.showPanel')}
            </Button>
            <Button variant="ghost" onClick={() => void onCancelImport()}>
              {t('import.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="import-notifications-empty">{t('import.noActive')}</p>
      )}

      {sessions.length > 0 ? (
        <ul className="import-notifications-list">
          {sessions.map((session) => (
            <li key={session.id} className="import-notifications-item">
              <div className="import-notifications-item-main">
                <span className="import-notifications-item-title">{sessionTitle(session, t)}</span>
                <span className={`import-notifications-item-state${session.progress.cancelled ? ' is-cancelled' : ''}`}>
                  {sessionState(session, t)}
                </span>
              </div>
              <div className="import-notifications-item-meta">
                <span>
                  {t('import.summaryShort', {
                    added: session.progress.added,
                    skipped: session.progress.skipped,
                    failed: session.progress.failed,
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>,
    document.body,
  );
}
