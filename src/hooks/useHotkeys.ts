import { useEffect, useRef } from 'react';
import { usePlayer } from '../store/playerStore';
import { DEFAULT_APPEARANCE, DEFAULT_HOTKEYS, type HotkeyAction } from '../appearance/schema';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

interface HotkeyHandlers {
  onSearch?: () => void;
  onSettings?: () => void;
  onQueue?: () => void;
  onEditMetadata?: () => void;
}

export function useHotkeys(handlers: HotkeyHandlers = {}) {
  const {
    state,
    togglePlayPause,
    nextTrack,
    prevTrack,
    toggleMute,
    toggleLike,
    addToQueue,
    dispatch,
  } = usePlayer();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const hotkeys = state.settings.hotkeys || DEFAULT_HOTKEYS;
    const appearance = state.settings.appearance || DEFAULT_APPEARANCE;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const code = e.code;
      const entries = Object.entries(hotkeys) as [HotkeyAction, string][];
      const action = entries.find(([, bind]) => bind && bind === code)?.[0];
      if (!action) return;

      if (action === 'playPause' && !appearance.behavior.spaceTogglesPlayback && code === 'Space') {
        return;
      }

      e.preventDefault();
      const h = handlersRef.current;

      switch (action) {
        case 'playPause':
          togglePlayPause();
          break;
        case 'next':
          nextTrack();
          break;
        case 'previous':
          prevTrack();
          break;
        case 'volumeUp': {
          const next = Math.min(1, state.settings.globalVolume + 0.05);
          void window.imeMusic.updateSettings({ globalVolume: next, muted: false }).then((settings) => {
            dispatch({ type: 'UPDATE_SETTINGS', settings });
          });
          break;
        }
        case 'volumeDown': {
          const next = Math.max(0, state.settings.globalVolume - 0.05);
          void window.imeMusic.updateSettings({ globalVolume: next }).then((settings) => {
            dispatch({ type: 'UPDATE_SETTINGS', settings });
          });
          break;
        }
        case 'mute':
          void toggleMute();
          break;
        case 'like':
          if (state.currentSongId) void toggleLike(state.currentSongId);
          break;
        case 'addToQueue':
          if (state.currentSongId) void addToQueue(state.currentSongId);
          break;
        case 'search':
          h.onSearch?.();
          break;
        case 'settings':
          h.onSettings?.();
          break;
        case 'queue':
          h.onQueue?.();
          break;
        case 'toggleTheme': {
          const current = appearance.theme;
          const nextTheme = current === 'light' ? 'dark' : 'light';
          void window.imeMusic
            .updateSettings({
              appearance: { ...appearance, theme: nextTheme },
              theme: nextTheme,
            })
            .then((settings) => dispatch({ type: 'UPDATE_SETTINGS', settings }));
          break;
        }
        case 'editMetadata':
          h.onEditMetadata?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    state.settings.hotkeys,
    state.settings.appearance,
    state.settings.globalVolume,
    state.currentSongId,
    togglePlayPause,
    nextTrack,
    prevTrack,
    toggleMute,
    toggleLike,
    addToQueue,
    dispatch,
  ]);
}
