/** Shared EQ presets + default playback helpers */

import type { EqPreset, PlaybackSettings } from '../types';

export const EQ_PRESETS: Record<Exclude<EqPreset, 'custom'>, { bass: number; mid: number; treble: number; label: string }> = {
  flat: { bass: 0, mid: 0, treble: 0, label: 'Flat' },
  bassBoost: { bass: 7, mid: 1, treble: -1, label: 'Bass Boost' },
  vocal: { bass: -2, mid: 5, treble: 2, label: 'Vocal' },
};

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  shuffle: false,
  repeat: 'off',
  normalizeVolume: false,
  eqEnabled: false,
  eqBass: 0,
  eqMid: 0,
  eqTreble: 0,
  eqPreset: 'flat',
  closeToTray: true,
  crossfadeSeconds: 0,
  gaplessEnabled: false,
};

export function getPlayback(settings: { playback?: PlaybackSettings } | null | undefined): PlaybackSettings {
  return { ...DEFAULT_PLAYBACK, ...(settings?.playback || {}) };
}

export function sameAlbum(a: { album?: string; albumArtist?: string | null; artist?: string }, b: {
  album?: string;
  albumArtist?: string | null;
  artist?: string;
}): boolean {
  const albumA = String(a.album || '').trim().toLowerCase();
  const albumB = String(b.album || '').trim().toLowerCase();
  if (!albumA || !albumB || albumA === 'неизвестный альбом' || albumB === 'неизвестный альбом') {
    return false;
  }
  if (albumA !== albumB) return false;
  const artA = String(a.albumArtist || a.artist || '')
    .trim()
    .toLowerCase();
  const artB = String(b.albumArtist || b.artist || '')
    .trim()
    .toLowerCase();
  return artA === artB;
}
