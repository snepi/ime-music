import { useCallback } from 'react';
import { usePlayer } from '../store/playerStore';

export function useOpenArtist() {
  const { dispatch } = usePlayer();

  return useCallback(
    (name: string, deezerId?: number | string | null) => {
      const cleaned = String(name || '').trim();
      if (!cleaned) return;
      dispatch({
        type: 'SET_VIEW',
        view: { kind: 'artist', name: cleaned, deezerId: deezerId ?? null },
      });
    },
    [dispatch],
  );
}
