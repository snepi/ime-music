import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  anchorEl: HTMLElement | null;
  items: ContextMenuItem[];
  onClose: () => void;
  header?: ReactNode;
}

const MENU_WIDTH = 240;
const VIEWPORT_PAD = 8;

function readPlayerHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--player-height').trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 96;
}

export function ContextMenu({ anchorEl, items, onClose, header }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    if (!anchorEl || !menuRef.current) return;

    const place = () => {
      const menu = menuRef.current;
      if (!menu || !anchorEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const playerH = readPlayerHeight();
      const maxBottom = window.innerHeight - playerH - VIEWPORT_PAD;
      const spaceBelow = maxBottom - (rect.bottom + 4);
      const spaceAbove = rect.top - VIEWPORT_PAD;

      let top = rect.bottom + 4;
      if (spaceBelow < menuRect.height && spaceAbove > spaceBelow) {
        top = Math.max(VIEWPORT_PAD, rect.top - menuRect.height - 4);
      } else if (top + menuRect.height > maxBottom) {
        top = Math.max(VIEWPORT_PAD, maxBottom - menuRect.height);
      }

      let left = rect.right - MENU_WIDTH;
      left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_PAD);
      left = Math.max(VIEWPORT_PAD, left);

      setPos({ top, left, ready: true });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorEl, items.length, header]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!anchorEl) return null;

  return (
    <div
      className="context-menu"
      ref={menuRef}
      style={{
        top: pos.top,
        left: pos.left,
        visibility: pos.ready ? 'visible' : 'hidden',
      }}
      role="menu"
    >
      {header && <div className="context-menu-header">{header}</div>}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
