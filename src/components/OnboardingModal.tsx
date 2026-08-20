import { useState } from 'react';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { useI18n } from '../i18n';

const STEPS = ['onboard.step1', 'onboard.step2', 'onboard.step3', 'onboard.step4'] as const;

export function OnboardingModal({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);

  if (!open) return null;

  const isLast = step >= STEPS.length - 1;

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-label={t('onboard.title')}>
      <div className="onboard-card">
        <div className="onboard-brand">IMe Music</div>
        <h2 className="onboard-title">{t('onboard.title')}</h2>
        <p className="onboard-step">{t(STEPS[step])}</p>
        <div className="onboard-dots" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={STEPS[i]} className={`onboard-dot${i === step ? ' is-active' : ''}`} />
          ))}
        </div>
        <div className="onboard-actions">
          {step === 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                void window.imeMusic.importFolders?.();
              }}
            >
              <Icon name="import" size={16} />
              {t('home.importFolder')}
            </Button>
          ) : null}
          {!isLast ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              {t('onboard.next')}
            </Button>
          ) : (
            <Button variant="primary" onClick={onDone}>
              {t('onboard.done')}
            </Button>
          )}
          <Button variant="ghost" onClick={onDone}>
            {t('onboard.skip')}
          </Button>
        </div>
      </div>
    </div>
  );
}
