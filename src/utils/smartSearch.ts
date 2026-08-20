/** Smart library search: fields + light fuzzy match + RU↔Latin translit */

import { splitArtists } from './artists';

const RU_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function translitRuToLat(s: string): string {
  return String(s || '')
    .split('')
    .map((ch) => RU_TO_LAT[ch] ?? ch)
    .join('');
}

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

/** Expand haystack with latin transliteration of cyrillic parts for cross-script search */
function searchBlob(parts: string[]): string {
  const joined = parts.filter(Boolean).join(' ');
  const base = normalize(joined);
  const lat = normalize(translitRuToLat(joined));
  return base === lat ? base : `${base} ${lat}`;
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
  const tokenLat = normalize(translitRuToLat(token));
  if (tokenLat !== token && haystack.includes(tokenLat)) return true;
  if (token.length < 3) return false;
  const parts = haystack.split(' ').filter(Boolean);
  for (const part of parts) {
    if (part.startsWith(token) || (tokenLat && part.startsWith(tokenLat))) return true;
    const maxDist = token.length <= 4 ? 1 : 2;
    if (editDistance(part, token) <= maxDist) return true;
    if (tokenLat && tokenLat !== token && editDistance(part, tokenLat) <= maxDist) return true;
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
  format?: string | null;
}

/**
 * Match query against song. Supports:
 * - plain text across title/artist/album/genre/year/composer
 * - prefixes: artist:, album:, year:, genre:, format:
 * - multi-word fuzzy tokens
 * - RU↔Latin transliteration (эминем ↔ eminem)
 * - multi-artist credits split by comma / feat / &
 */
export function songMatchesQuery(song: SearchableSong, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;

  const fieldMatch = raw.match(/^(artist|album|year|genre|title|format)\s*:\s*(.+)$/i);
  if (fieldMatch) {
    const field = fieldMatch[1].toLowerCase();
    const value = normalize(fieldMatch[2]);
    const valueLat = normalize(translitRuToLat(fieldMatch[2]));
    if (!value) return true;
    if (field === 'artist') {
      const names = [...splitArtists(song.artist), ...splitArtists(song.albumArtist || '')].map(
        (n) => searchBlob([n]),
      );
      if (
        names.some(
          (n) =>
            n.includes(value) ||
            n.includes(valueLat) ||
            tokenFuzzyMatch(n, value) ||
            tokenFuzzyMatch(n, valueLat),
        )
      ) {
        return true;
      }
      return false;
    }
    if (field === 'album') {
      const album = searchBlob([song.album]);
      return album.includes(value) || album.includes(valueLat) || tokenFuzzyMatch(album, value);
    }
    if (field === 'title') {
      const title = searchBlob([song.title]);
      return title.includes(value) || title.includes(valueLat) || tokenFuzzyMatch(title, value);
    }
    if (field === 'genre') {
      const g = searchBlob([song.genre || '']);
      return g.includes(value) || g.includes(valueLat);
    }
    if (field === 'format') {
      return normalize(song.format || '').includes(value);
    }
    if (field === 'year') return String(song.year ?? '').includes(value.replace(/\s/g, ''));
  }

  const q = normalize(raw);
  const qLat = normalize(translitRuToLat(raw));
  if (!q) return true;

  if (/^\d{4}$/.test(q) && song.year != null) {
    return String(song.year) === q;
  }

  const artistNames = [...splitArtists(song.artist), ...splitArtists(song.albumArtist || '')]
    .map((n) => searchBlob([n]))
    .filter(Boolean);

  if (
    artistNames.some(
      (n) =>
        n.includes(q) ||
        n.includes(qLat) ||
        tokenFuzzyMatch(n, q) ||
        (qLat !== q && tokenFuzzyMatch(n, qLat)),
    )
  ) {
    return true;
  }

  const blob = searchBlob([
    song.title,
    artistNames.join(' '),
    song.album,
    song.genre || '',
    song.year != null ? String(song.year) : '',
    song.composer || '',
    song.comment || '',
    song.format || '',
  ]);

  if (blob.includes(q) || (qLat && blob.includes(qLat))) return true;

  const tokens = q.split(' ').filter((t) => t.length >= 2);
  if (!tokens.length) return blob.includes(q);
  return tokens.every((token) => tokenFuzzyMatch(blob, token));
}

export function filterSongsByQuery<T extends SearchableSong>(songs: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return songs;
  return songs.filter((s) => songMatchesQuery(s, q));
}
