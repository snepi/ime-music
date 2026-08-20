import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Themed custom select — avoids native OS dropdown chrome */
export function Select({
  value,
  options,
  onChange,
  label,
  id,
  disabled,
  className = '',
}: SelectProps) {
  const autoId = useId();
  const selectId = id || autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(
    null,
  );

  const selected = options.find((o) => o.value === value) || options[0];

  const placeMenu = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(280, openUp ? spaceAbove : spaceBelow));
    setPos({
      left: rect.left,
      width: Math.max(rect.width, 160),
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    placeMenu();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => placeMenu();
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`ui-select${disabled ? ' disabled' : ''}${open ? ' open' : ''} ${className}`.trim()}
    >
      {label ? (
        <label className="field-label" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <button
        ref={btnRef}
        id={selectId}
        type="button"
        className="field-input ui-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="ui-select-value">{selected?.label || '—'}</span>
        <Icon name="chevronDown" size={14} className="ui-select-chevron" />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              className="ui-select-menu"
              role="listbox"
              style={{
                left: pos.left,
                width: pos.width,
                top: pos.top,
                maxHeight: pos.maxHeight,
                transform: pos.top < (btnRef.current?.getBoundingClientRect().top || 0) ? 'translateY(-100%)' : undefined,
              }}
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={opt.disabled}
                    className={`ui-select-option${active ? ' active' : ''}`}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
