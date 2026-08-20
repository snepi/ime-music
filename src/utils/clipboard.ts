/** Copy "Title — Artist" to clipboard. Returns true on success. */
export async function copyTrackLabel(title: string, artist?: string | null): Promise<boolean> {
  const t = String(title || '').trim();
  const a = String(artist || '').trim();
  const text = a ? `${t} — ${a}` : t;
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
