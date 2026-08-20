interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  disabled?: boolean;
  id?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit,
  disabled,
  id,
}: SliderProps) {
  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

  return (
    <div className={`ui-slider${disabled ? ' disabled' : ''}`}>
      {(label || unit) && (
        <div className="ui-slider-head">
          {label ? (
            <label className="field-label" htmlFor={id}>
              {label}
            </label>
          ) : (
            <span />
          )}
          <span className="ui-slider-value">
            {safe}
            {unit || ''}
          </span>
        </div>
      )}
      <input
        id={id}
        type="range"
        className="ui-slider-input"
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}
