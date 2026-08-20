/** Resolve a fresh Deezer 30s preview URL (stored URLs expire). */

export interface PreviewSource {
  deezerId?: number | string | null;
  title?: string;
  artist?: string;
  previewUrl?: string | null;
}

function isPreviewUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('http');
}

async function deezerJson(path: string) {
  const res = await fetch(path, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function resolvePreviewUrl(item: PreviewSource): Promise<string | null> {
  if (isPreviewUrl(item.previewUrl)) return item.previewUrl;

  const deezerId = item.deezerId != null ? String(item.deezerId).trim() : '';
  if (deezerId) {
    try {
      const data = await deezerJson(`https://api.deezer.com/track/${encodeURIComponent(deezerId)}`);
      if (isPreviewUrl(data?.preview)) return data.preview;
    } catch {
      /* try search fallback */
    }
  }

  const title = String(item.title || '').trim();
  const artist = String(item.artist || '').trim();
  if (title || artist) {
    const queries = [];
    if (artist && title) queries.push(`${artist} ${title}`, `${title} ${artist}`);
    else queries.push(title || artist);

    for (const q of [...new Set(queries)]) {
      try {
        const data = await deezerJson(
          `https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=8`,
        );
        const rows: Array<{ preview?: unknown; title?: unknown; artist?: { name?: unknown } }> =
          Array.isArray(data?.data) ? data.data : [];
        const wantArtist = artist.toLowerCase();
        const wantTitle = title.toLowerCase();
        const best =
          rows.find(
            (row) =>
              isPreviewUrl(row?.preview) &&
              String(row?.artist?.name || '').toLowerCase().includes(wantArtist) &&
              String(row?.title || '').toLowerCase().includes(wantTitle),
          ) ||
          rows.find(
            (row) =>
              isPreviewUrl(row?.preview) &&
              String(row?.title || '').toLowerCase().includes(wantTitle),
          ) ||
          rows.find((row) => isPreviewUrl(row?.preview));
        if (best && isPreviewUrl(best.preview)) return best.preview;
      } catch {
        /* next query */
      }
    }
  }

  return isPreviewUrl(item.previewUrl) ? item.previewUrl : null;
}
