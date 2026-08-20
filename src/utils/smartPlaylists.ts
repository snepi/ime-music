/** Smart (auto) playlist ids — shown on Home as album cards, hidden from sidebar. */

const FIXED_SMART_IDS = new Set([
  'auto:frequent',
  'auto:neglected',
  'auto:liked-90s',
  'auto:liked',
  'auto:fresh',
  'auto:top-rated',
]);

export function isSmartPlaylistId(id: string | null | undefined): boolean {
  const s = String(id || '');
  return FIXED_SMART_IDS.has(s) || s.startsWith('auto:genre:');
}
