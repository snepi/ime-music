/** Smart library search: fields + light fuzzy match */

import { splitArtists } from './artists';

function normalize(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance capped for short tokens */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenFuzzyMatch(haystack: string, token: string): boolean {
  if (!token) return true;
  if (haystack.includes(token)) return true;
  if (token.length < 3) return false;
  const parts = haystack.split(' ').filter(Boolean);
  for (const part of parts) {
    if (part.startsWith(token)) return true;
    const maxDist = token.length <= 4 ? 1 : 2;
    if (editDistance(part, token) <= maxDist) return true;
  }
  return false;
}

export interface SearchableSong {
  title: string;
  artist: string;
  album: string;
  albumArtist?: string | null;
  genre?: string | null;
  year?: number | null;
  composer?: string | null;
  comment?: string | null;
}

/**
 * Match query against song. Supports:
 * - plain text across title/artist/album/genre/year/composer
 * - prefixes: artist:, album:, year:, genre:
 * - multi-word fuzzy tokens
 * - multi-artist credits split by comma / feat / &
 */
export function songMatchesQuery(song: SearchableSong, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;

  const fieldMatch = raw.match(/^(artist|album|year|genre|title)\s*:\s*(.+)$/i);
  if (fieldMatch) {
    const field = fieldMatch[1].toLowerCase();
    const value = normalize(fieldMatch[2]);
    if (!value) return true;
    if (field === 'artist') {
      const names = [...splitArtists(song.artist), ...splitArtists(song.albumArtist || '')].map(
        (n) => normalize(n),
      );
      if (names.some((n) => n === value || n.includes(value) || tokenFuzzyMatch(n, value))) {
        return true;
      }
      const artists = normalize(names.join(' '));
      return tokenFuzzyMatch(artists, value) || artists.includes(value);
    }
    if (field === 'album') {
      return normalize(song.album).includes(value) || tokenFuzzyMatch(normalize(song.album), value);
    }
    if (field === 'title') {
      return normalize(song.title).includes(value) || tokenFuzzyMatch(normalize(song.title), value);
    }
    if (field === 'genre') return normalize(song.genre || '').includes(value);
    if (field === 'year') return String(song.year ?? '').includes(value.replace(/\s/g, ''));
  }

  const q = normalize(raw);
  if (!q) return true;

  if (/^\d{4}$/.test(q) && song.year != null) {
    return String(song.year) === q;
  }

  const artistNames = [...splitArtists(song.artist), ...splitArtists(song.albumArtist || '')]
    .map((n) => normalize(n))
    .filter(Boolean);

  if (artistNames.some((n) => n === q || n.includes(q) || tokenFuzzyMatch(n, q))) {
    return true;
  }

  const blob = normalize(
    [
      song.title,
      artistNames.join(' '),
      song.album,
      song.genre || '',
      song.year != null ? String(song.year) : '',
      song.composer || '',
      song.comment || '',
    ].join(' '),
  );

  if (blob.includes(q)) return true;

  const tokens = q.split(' ').filter((t) => t.length >= 2);
  if (!tokens.length) return blob.includes(q);
  return tokens.every((token) => tokenFuzzyMatch(blob, token));
}

export function filterSongsByQuery<T extends SearchableSong>(songs: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return songs;
  return songs.filter((s) => songMatchesQuery(s, q));
}
