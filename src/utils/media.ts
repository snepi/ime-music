/** Convert a local filesystem path to a file:// URL for <img>/<audio>. */
export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return `file://${encodeURI(normalized)}`;
  return `file:///${encodeURI(normalized)}`;
}

export function getCoverSrc(song: { coverPath?: string | null; coverArt?: string; icon?: string }): string | null {
  if (song.coverPath) return toFileUrl(song.coverPath);
  if (song.coverArt) return song.coverArt;
  return null;
}
