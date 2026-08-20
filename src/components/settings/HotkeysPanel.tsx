import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { SectionReset } from './appearance/SectionReset';
import {
  DEFAULT_HOTKEYS,
  type HotkeyAction,
  type HotkeyMap,
} from '../../appearance/schema';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/messages';

interface Props {
  hotkeys: HotkeyMap;
  onChange: (next: HotkeyMap) => Promise<unknown>;
}

const HOTKEY_LABEL_KEYS: Record<HotkeyAction, MessageKey> = {
  playPause: 'settings.hotkeys.playPause',
  next: 'settings.hotkeys.next',
  previous: 'settings.hotkeys.previous',
  volumeUp: 'settings.hotkeys.volumeUp',
  volumeDown: 'settings.hotkeys.volumeDown',
  mute: 'settings.hotkeys.mute',
  like: 'settings.hotkeys.like',
  addToQueue: 'settings.hotkeys.addToQueue',
  search: 'settings.hotkeys.search',
  settings: 'settings.hotkeys.settings',
  queue: 'settings.hotkeys.queue',
  toggleTheme: 'settings.hotkeys.toggleTheme',
  editMetadata: 'settings.hotkeys.editMetadata',
};

export function HotkeysPanel({ hotkeys, onChange }: Props) {
  const { t } = useI18n();
  const [listening, setListening] = useState<HotkeyAction | null>(null);

  const formatHotkey = (code: string) => {
    if (!code) return t('settings.hotkeys.unassigned');
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');
  };

  const conflicts = useMemo(() => {
    const map = new Map<string, HotkeyAction[]>();
    for (const [action, key] of Object.entries(hotkeys) as [HotkeyAction, string][]) {
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(action);
      map.set(key, list);
    }
    const bad = new Set<HotkeyAction>();
    for (const list of map.values()) {
      if (list.length > 1) list.forEach((a) => bad.add(a));
    }
    return bad;
  }, [hotkeys]);

  const capture = (action: HotkeyAction) => {
    setListening(action);
  };

  const onKeyDown = async (e: React.KeyboardEvent, action: HotkeyAction) => {
    if (listening !== action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setListening(null);
      return;
    }
    const code = e.code || e.key;
    await onChange({ ...hotkeys, [action]: code });
    setListening(null);
  };

  return (
    <div className="settings-panel">
      <SectionReset
        label={t('settings.hotkeys.resetAll')}
        onReset={() => void onChange({ ...DEFAULT_HOTKEYS })}
      />
      <ul className="hotkey-list">
        {(Object.keys(HOTKEY_LABEL_KEYS) as HotkeyAction[]).map((action) => (
          <li key={action} className={`hotkey-row${conflicts.has(action) ? ' conflict' : ''}`}>
            <span>{t(HOTKEY_LABEL_KEYS[action])}</span>
            <div className="hotkey-actions">
              <button
                type="button"
                className="hotkey-bind"
                onClick={() => capture(action)}
                onKeyDown={(e) => void onKeyDown(e, action)}
              >
                {listening === action ? t('settings.hotkeys.pressKey') : formatHotkey(hotkeys[action])}
              </button>
              <Button
                variant="ghost"
                onClick={() => void onChange({ ...hotkeys, [action]: DEFAULT_HOTKEYS[action] })}
              >
                {t('settings.hotkeys.default')}
              </Button>
            </div>
            {conflicts.has(action) ? (
              <span className="hotkey-conflict">{t('settings.hotkeys.conflict')}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
