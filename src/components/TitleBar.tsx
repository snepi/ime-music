import type { ImportProgress } from '../types';
import { useI18n } from '../i18n';
import { Icon } from './ui/Icon';
import { ImportNotificationsPanel, type ImportSession } from './ImportNotificationsPanel';
import { useRef } from 'react';

export function TitleBar({
  onSettings,
  notificationsOpen,
  onToggleNotifications,
  onCloseNotifications,
  notificationBadge,
  importSessions,
  importProgress,
  onShowImportPanel,
  onCancelImport,
}: {
  onSettings: () => void;
  notificationsOpen: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  notificationBadge: boolean;
  importSessions: ImportSession[];
  importProgress: ImportProgress | null;
  onShowImportPanel: () => void;
  onCancelImport: () => void;
}) {
  const { t } = useI18n();
  const notificationsAnchorRef = useRef<HTMLDivElement>(null);
  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <img
          className="titlebar-app-icon"
          src="/brand/icon.png"
          alt=""
          width={22}
          height={22}
          draggable={false}
        />
        <img
          className="titlebar-wordmark"
          src="/brand/wordmark.png"
          alt="IMe Music"
          draggable={false}
        />
      </div>
      <div className="titlebar-controls">
        <div className="titlebar-notifications-wrap" ref={notificationsAnchorRef}>
          <button
            type="button"
            className={`titlebar-btn${notificationBadge ? ' has-badge' : ''}`}
            onClick={onToggleNotifications}
            aria-label={t('import.notifications')}
            title={t('import.notificationsHint')}
            aria-expanded={notificationsOpen}
          >
            <Icon name="bell" size={14} />
            {notificationBadge ? <span className="titlebar-badge" aria-hidden /> : null}
          </button>
          <ImportNotificationsPanel
            open={notificationsOpen}
            anchorRef={notificationsAnchorRef}
            onClose={onCloseNotifications}
            sessions={importSessions}
            activeProgress={importProgress}
            onShowProgressPanel={() => {
              onShowImportPanel();
              onCloseNotifications();
            }}
            onCancelImport={onCancelImport}
          />
        </div>
        <button
          type="button"
          className="titlebar-btn"
          onClick={onSettings}
          aria-label={t('window.settings')}
          title={t('window.settings')}
        >
          <Icon name="settings" size={14} />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => window.imeMusic.minimize()}
          aria-label={t('window.minimize')}
          title={t('window.minimize')}
        >
          <Icon name="minimize" size={14} />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => window.imeMusic.maximize()}
          aria-label={t('window.maximize')}
          title={t('window.maximize')}
        >
          <Icon name="maximize" size={14} />
        </button>
        <button
          type="button"
          className="titlebar-btn close"
          onClick={() => window.imeMusic.close()}
          aria-label={t('window.close')}
          title={t('window.close')}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
