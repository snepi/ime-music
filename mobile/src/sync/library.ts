import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { trackFingerprint } from './protocol';

export type MobileTrack = {
  id: string;
  fingerprint: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileSize: number;
  format: string | null;
  liked: boolean;
  /** Capacitor URI or blob URL for playback */
  fileUri: string;
  coverUri?: string | null;
  addedAt: number;
};

const LIBRARY_KEY = 'ime.mobile.library.v1';
const MUSIC_DIR = 'IMeMusic';

async function readLibrary(): Promise<MobileTrack[]> {
  const { value } = await Preferences.get({ key: LIBRARY_KEY });
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLibrary(tracks: MobileTrack[]) {
  await Preferences.set({ key: LIBRARY_KEY, value: JSON.stringify(tracks) });
}

export async function getMobileLibrary(): Promise<MobileTrack[]> {
  return readLibrary();
}

export async function getFingerprints(): Promise<string[]> {
  const tracks = await readLibrary();
  return tracks.map((t) => t.fingerprint);
}

function extFromFormat(format: string | null | undefined, fallback = 'mp3') {
  const f = String(format || fallback).toLowerCase().replace(/^\./, '');
  return f || fallback;
}

export async function saveSyncedTrack(opts: {
  meta: {
    id: string;
    fingerprint: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    fileSize: number;
    format: string | null;
    liked?: boolean;
  };
  data: ArrayBuffer;
  coverData?: ArrayBuffer | null;
  coverType?: string | null;
}): Promise<MobileTrack> {
  const { meta, data, coverData, coverType } = opts;
  const ext = extFromFormat(meta.format);
  const fileName = `${meta.id}.${ext}`;
  const path = `${MUSIC_DIR}/${fileName}`;

  const base64 = arrayBufferToBase64(data);
  await Filesystem.mkdir({ path: MUSIC_DIR, directory: Directory.Data, recursive: true }).catch(
    () => undefined,
  );
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Data,
  });

  let coverUri: string | null = null;
  if (coverData && coverData.byteLength > 0) {
    const coverExt = coverType?.includes('png') ? 'png' : 'jpg';
    const coverPath = `${MUSIC_DIR}/${meta.id}.${coverExt}`;
    await Filesystem.writeFile({
      path: coverPath,
      data: arrayBufferToBase64(coverData),
      directory: Directory.Data,
    });
    const coverUrl = await Filesystem.getUri({ path: coverPath, directory: Directory.Data });
    coverUri = Capacitor.convertFileSrc(coverUrl.uri);
  }

  const fileUrl = await Filesystem.getUri({ path, directory: Directory.Data });
  const fileUri = Capacitor.convertFileSrc(fileUrl.uri);

  const track: MobileTrack = {
    id: meta.id,
    fingerprint: meta.fingerprint || trackFingerprint(meta),
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    duration: meta.duration,
    fileSize: meta.fileSize || data.byteLength,
    format: meta.format,
    liked: Boolean(meta.liked),
    fileUri,
    coverUri,
    addedAt: Date.now(),
  };

  const library = await readLibrary();
  const next = [track, ...library.filter((t) => t.fingerprint !== track.fingerprint && t.id !== track.id)];
  await writeLibrary(next);
  return track;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export type MissingRemoteTrack = {
  id: string;
  fingerprint: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileSize: number;
  format: string | null;
  liked?: boolean;
};

export async function pullFromPc(opts: {
  baseUrl: string;
  token: string;
  deviceName?: string;
  onProgress?: (p: { done: number; total: number; title: string }) => void;
}): Promise<{ received: number; skipped: number }> {
  const fingerprints = await getFingerprints();
  const offerRes = await fetch(`${opts.baseUrl}/sync/offer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({
      token: opts.token,
      fingerprints,
      deviceName: opts.deviceName || 'Android',
    }),
  });
  if (!offerRes.ok) {
    const err = await offerRes.json().catch(() => ({}));
    throw new Error(err.error || `offer HTTP ${offerRes.status}`);
  }
  const offer = (await offerRes.json()) as {
    ok: boolean;
    missing: MissingRemoteTrack[];
  };
  const missing = offer.missing || [];
  let received = 0;
  for (let i = 0; i < missing.length; i += 1) {
    const item = missing[i];
    opts.onProgress?.({ done: i, total: missing.length, title: item.title });
    const fileRes = await fetch(`${opts.baseUrl}/sync/file/${encodeURIComponent(item.id)}?t=${opts.token}`);
    if (!fileRes.ok) continue;
    const data = await fileRes.arrayBuffer();
    let coverData: ArrayBuffer | null = null;
    let coverType: string | null = null;
    try {
      const coverRes = await fetch(
        `${opts.baseUrl}/sync/cover/${encodeURIComponent(item.id)}?t=${opts.token}`,
      );
      if (coverRes.ok) {
        coverType = coverRes.headers.get('Content-Type');
        coverData = await coverRes.arrayBuffer();
      }
    } catch {
      /* optional */
    }
    await saveSyncedTrack({
      meta: item,
      data,
      coverData,
      coverType,
    });
    received += 1;
    opts.onProgress?.({ done: i + 1, total: missing.length, title: item.title });
  }

  await fetch(`${opts.baseUrl}/sync/done`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ token: opts.token, received }),
  }).catch(() => undefined);

  return { received, skipped: missing.length - received };
}
