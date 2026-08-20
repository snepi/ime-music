interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

function toColorInputValue(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#6ea8fe';
}

export function ColorField({ label, value, onChange, id }: ColorFieldProps) {
  const hex = toColorInputValue(value);
  return (
    <div className="ui-color-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="ui-color-row">
        <input
          id={id}
          type="color"
          className="ui-color-swatch"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          className="field-input ui-color-text"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
