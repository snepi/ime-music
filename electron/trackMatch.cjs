/**
 * Shared title+artist key for owned-library matching (Deezer + iTunes + Waves).
 * Keep in sync with src/utils/trackMatch.ts
 */

function translitRu(s) {
  return String(s || '')
    .replace(/ё/g, 'е')
    .replace(/а/g, 'a')
    .replace(/б/g, 'b')
    .replace(/в/g, 'v')
    .replace(/г/g, 'g')
    .replace(/д/g, 'd')
    .replace(/е/g, 'e')
    .replace(/ж/g, 'zh')
    .replace(/з/g, 'z')
    .replace(/и/g, 'i')
    .replace(/й/g, 'y')
    .replace(/к/g, 'k')
    .replace(/л/g, 'l')
    .replace(/м/g, 'm')
    .replace(/н/g, 'n')
    .replace(/о/g, 'o')
    .replace(/п/g, 'p')
    .replace(/р/g, 'r')
    .replace(/с/g, 's')
    .replace(/т/g, 't')
    .replace(/у/g, 'u')
    .replace(/ф/g, 'f')
    .replace(/х/g, 'h')
    .replace(/ц/g, 'ts')
    .replace(/ч/g, 'ch')
    .replace(/ш/g, 'sh')
    .replace(/щ/g, 'sch')
    .replace(/ъ/g, '')
    .replace(/ы/g, 'y')
    .replace(/ь/g, '')
    .replace(/э/g, 'e')
    .replace(/ю/g, 'yu')
    .replace(/я/g, 'ya');
}

function normalizePart(s) {
  return translitRu(String(s || ''))
    .toLowerCase()
    .replace(/\([^)]*(feat|ft|with)[^)]*\)/gi, ' ')
    .replace(
      /\b(remix|live|radio edit|radio|extended|acoustic|instrumental|remaster|edit|version)\b/gi,
      ' ',
    )
    .replace(/\b(feat|ft|with)\b.*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '');
}

function normalizeKey(artist, title) {
  return `${normalizePart(artist)}::${normalizePart(title)}`;
}

function ownedKeys(songs) {
  const set = new Set();
  for (const song of songs || []) {
    set.add(normalizeKey(song.artist, song.title));
  }
  return set;
}

module.exports = { normalizeKey, ownedKeys, normalizePart };
