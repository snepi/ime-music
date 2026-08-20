interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ checked, onChange, label, disabled, id }: ToggleProps) {
  return (
    <label className={`ui-toggle${disabled ? ' disabled' : ''}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="ui-toggle-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ui-toggle-track" aria-hidden>
        <span className="ui-toggle-thumb" />
      </span>
      {label ? <span className="ui-toggle-label">{label}</span> : null}
    </label>
  );
}
