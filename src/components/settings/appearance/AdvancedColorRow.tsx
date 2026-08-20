import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { parseColor } from '../../../appearance/colorParse';
import { useI18n } from '../../../i18n';

interface Props {
  label: string;
  techKey: string;
  description?: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  onRestore: () => void;
}

export function AdvancedColorRow({
  label,
  techKey,
  description,
  value,
  defaultValue,
  onChange,
  onRestore,
}: Props) {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseColor(value);
  const dirty = value !== defaultValue;
  const swatch = parsed.ok ? parsed.hex.slice(0, 7) : '#888888';

  useEffect(() => {
    setText(value);
    setError(null);
  }, [value]);

  const commit = (raw: string) => {
    const result = parseColor(raw);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    const next = result.rgba.a < 0.999 ? result.css : result.hex;
    setText(next);
    onChange(next);
  };

  return (
    <div className={`theme-color-row${dirty ? ' is-dirty' : ''}${error ? ' has-error' : ''}`}>
      <div className="theme-color-meta">
        <div className="theme-color-title">
          {label}
          {dirty ? <span className="theme-dirty-dot" title={t('settings.theme.changed')} /> : null}
        </div>
        <code className="theme-color-key">{techKey}</code>
        {description ? <p className="theme-color-desc">{description}</p> : null}
      </div>
      <div className="theme-color-controls">
        <span className="theme-color-preview" style={{ background: parsed.ok ? parsed.css : 'transparent' }} />
        <input
          type="color"
          className="ui-color-swatch"
          value={swatch}
          aria-label={label}
          onChange={(e) => commit(e.target.value)}
        />
        <input
          className="field-input theme-color-hex"
          value={text}
          spellCheck={false}
          aria-invalid={Boolean(error)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(text);
          }}
        />
        <Button variant="ghost" onClick={onRestore} title={t('settings.theme.restore')}>
          ↺
        </Button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
