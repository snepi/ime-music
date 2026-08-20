/** Must match electron/syncServer.cjs trackFingerprint */

export function trackFingerprint(input: {
  artist?: string;
  title?: string;
  duration?: number;
  fileSize?: number;
}): string {
  const artist = String(input.artist || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const title = String(input.title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const duration = Math.round(Number(input.duration) || 0);
  const fileSize = Number(input.fileSize) || 0;
  return `${artist}::${title}::${duration}::${fileSize}`;
}

export function parseJoinUrl(raw: string): { baseUrl: string; token: string } | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const token = url.searchParams.get('t') || url.searchParams.get('token') || '';
    if (!token) return null;
    return { baseUrl: `${url.protocol}//${url.host}`, token };
  } catch {
    return null;
  }
}
