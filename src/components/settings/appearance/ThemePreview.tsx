import type { CSSProperties } from 'react';
import type { AppearanceSettings } from '../../../appearance/schema';
import { resolveThemeMode } from '../../../utils/applyAppearance';
import { useI18n } from '../../../i18n';

interface Props {
  appearance: AppearanceSettings;
  mode: 'small' | 'standard' | 'wide';
  page: 'library' | 'playlist' | 'metadata';
}

export function ThemePreview({ appearance, mode, page }: Props) {
  const { t } = useI18n();
  const resolved = resolveThemeMode(appearance.theme);
  const colors = resolved === 'light' ? appearance.colors.light : appearance.colors.dark;

  return (
    <div
      className={`theme-preview theme-preview-${mode}`}
      style={
        {
          '--pv-bg': colors.bgMain,
          '--pv-sidebar': colors.bgSidebar,
          '--pv-panel': colors.bgPanel,
          '--pv-text': colors.textPrimary,
          '--pv-muted': colors.textSecondary,
          '--pv-accent': colors.accent,
          '--pv-border': colors.border,
          '--pv-hover': colors.bgHover,
          '--pv-active': colors.bgActive,
          '--pv-progress': colors.progress,
          '--pv-titlebar': colors.titlebarBg,
          '--pv-danger': colors.danger,
          '--pv-play-bg': colors.playBtnBg,
          '--pv-play-fg': colors.playBtnFg,
        } as CSSProperties
      }
    >
      <div className="tp-titlebar">IMe Music</div>
      <div className="tp-body">
        <aside className="tp-sidebar">
          <div className="tp-nav active">{t('settings.preview.library')}</div>
          <div className="tp-nav">{t('settings.preview.favorites')}</div>
          <div className="tp-nav">{t('settings.preview.playlist')}</div>
        </aside>
        <section className="tp-main">
          <h3>
            {page === 'library'
              ? t('settings.preview.allMusic')
              : page === 'playlist'
                ? t('settings.preview.playlist')
                : t('settings.preview.metadata')}
          </h3>
          {page === 'metadata' ? (
            <div className="tp-modal">
              <strong>{t('settings.preview.metadataEditor')}</strong>
              <div className="tp-field" />
              <div className="tp-field" />
              <button type="button" className="tp-btn">
                {t('settings.preview.save')}
              </button>
            </div>
          ) : (
            <ul className="tp-list">
              {['Track One', 'Track Two', 'Track Three'].map((title, i) => (
                <li key={title} className={i === 1 ? 'active' : ''}>
                  <span className="tp-cover" />
                  <span>
                    <strong>{title}</strong>
                    <small>Artist</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {page !== 'metadata' ? (
            <div className="tp-menu">
              <div>{t('settings.preview.addToQueue')}</div>
              <div>{t('settings.preview.edit')}</div>
              <div className="danger">{t('settings.preview.delete')}</div>
            </div>
          ) : null}
        </section>
      </div>
      <div className="tp-player">
        <span className="tp-cover sm" />
        <div className="tp-player-meta">
          <strong>Now Playing</strong>
          <small>Artist</small>
        </div>
        <button type="button" className="tp-play" aria-label="Play" />
        <div className="tp-progress">
          <div className="tp-progress-fill" />
        </div>
        <div className="tp-volume">
          <div className="tp-volume-fill" />
        </div>
      </div>
    </div>
  );
}
