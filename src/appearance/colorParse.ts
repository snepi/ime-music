/** Safe color parsing / normalization for theme editor */

const DANGEROUS = /url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:|binding\s*:/i;

export type ParsedColor =
  | { ok: true; css: string; hex: string; rgba: { r: number; g: number; b: number; a: number } }
  | { ok: false; error: string };

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function toHex(r: number, g: number, b: number, a = 1): string {
  const hr = clampByte(r).toString(16).padStart(2, '0');
  const hg = clampByte(g).toString(16).padStart(2, '0');
  const hb = clampByte(b).toString(16).padStart(2, '0');
  if (a >= 0.999) return `#${hr}${hg}${hb}`;
  const ha = clampByte(a * 255).toString(16).padStart(2, '0');
  return `#${hr}${hg}${hb}${ha}`;
}

function toCss(r: number, g: number, b: number, a = 1): string {
  if (a >= 0.999) return `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`;
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${Number(clamp01(a).toFixed(3))})`;
}

function hslToRgb(h: number, s: number, l: number) {
  const sat = clamp01(s / 100);
  const light = clamp01(l / 100);
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function parseColor(input: string): ParsedColor {
  const raw = (input || '').trim();
  if (!raw) return { ok: false, error: 'Пустое значение' };
  if (DANGEROUS.test(raw) || raw.includes('<') || raw.includes('>')) {
    return { ok: false, error: 'Недопустимое значение' };
  }
  if (raw.length > 64) return { ok: false, error: 'Слишком длинное значение' };

  let m = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { ok: true, css: toCss(r, g, b, a), hex: toHex(r, g, b, a), rgba: { r, g, b, a } };
  }

  m = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const a = m[4] !== undefined ? Number(m[4]) : 1;
    if (![r, g, b, a].every((n) => Number.isFinite(n))) return { ok: false, error: 'Некорректный RGB' };
    return { ok: true, css: toCss(r, g, b, a), hex: toHex(r, g, b, a), rgba: { r, g, b, a: clamp01(a) } };
  }

  m = raw.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    const rgb = hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
    const a = m[4] !== undefined ? Number(m[4]) : 1;
    if (![rgb.r, rgb.g, rgb.b, a].every((n) => Number.isFinite(n))) {
      return { ok: false, error: 'Некорректный HSL' };
    }
    return {
      ok: true,
      css: toCss(rgb.r, rgb.g, rgb.b, a),
      hex: toHex(rgb.r, rgb.g, rgb.b, a),
      rgba: { r: rgb.r, g: rgb.g, b: rgb.b, a: clamp01(a) },
    };
  }

  return { ok: false, error: 'Поддерживаются HEX, RGB(A), HSL(A)' };
}

export function normalizeColorValue(input: string, fallback: string): string {
  const parsed = parseColor(input);
  if (parsed.ok) return parsed.hex.length === 9 || parsed.rgba.a < 0.999 ? parsed.css : parsed.hex;
  const fb = parseColor(fallback);
  return fb.ok ? (fb.rgba.a < 0.999 ? fb.css : fb.hex) : '#6ea8fe';
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Tone a color toward readable mid-range */
export function toneForTheme(
  hexOrCss: string,
  mode: 'dark' | 'light',
): string {
  const p = parseColor(hexOrCss);
  if (!p.ok) return hexOrCss;
  let { r, g, b } = p.rgba;
  const lum = relativeLuminance(r, g, b);
  if (mode === 'dark' && lum > 0.72) {
    r *= 0.55;
    g *= 0.55;
    b *= 0.55;
  } else if (mode === 'light' && lum < 0.25) {
    r = r + (255 - r) * 0.45;
    g = g + (255 - g) * 0.45;
    b = b + (255 - b) * 0.45;
  }
  return toHex(r, g, b);
}

export function mixColors(a: string, b: string, t: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa.ok || !pb.ok) return a;
  const k = clamp01(t);
  return toHex(
    pa.rgba.r + (pb.rgba.r - pa.rgba.r) * k,
    pa.rgba.g + (pb.rgba.g - pa.rgba.g) * k,
    pa.rgba.b + (pb.rgba.b - pa.rgba.b) * k,
    pa.rgba.a + (pb.rgba.a - pa.rgba.a) * k,
  );
}
