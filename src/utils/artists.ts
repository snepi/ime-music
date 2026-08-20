/** Split multi-artist credit strings into separate names */

/**
 * Split on common multi-artist separators.
 * Requires spaces around short tokens (&, x, и, /) so "AC/DC" stays whole.
 */
const SEP_RE =
  /\s*,\s*|\s*;\s*|\s+\/\s+|\s+&\s+|\s+\+\s+|\s+×\s+|\s+x\s+|\s+vs\.?\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+и\s+/i;

/**
 * "Artist A, Artist B feat. C" → ["Artist A", "Artist B", "C"]
 */
export function splitArtists(raw: string | null | undefined): string[] {
  const text = String(raw || '').trim();
  if (!text) return [];

  const parts = text
    .split(SEP_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.length ? out : [text];
}
