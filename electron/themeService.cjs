/**
 * Themes / wallpapers / image palette analysis (Electron main).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, dialog, nativeImage } = require('electron');
const appearanceMod = require('./appearance.cjs');

const MAX_WALLPAPER_BYTES = 12 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const paletteCache = new Map();

function wallpapersDir() {
  const dir = path.join(app.getPath('userData'), 'wallpapers');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isPathInside(parent, child) {
  const rel = path.relative(parent, child);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function resolveWallpaperPath(fileName) {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }
  const full = path.join(wallpapersDir(), fileName);
  if (!isPathInside(wallpapersDir(), full)) return null;
  return full;
}

function listWallpaperFiles() {
  try {
    return fs.readdirSync(wallpapersDir());
  } catch {
    return [];
  }
}

function enrichWallpaperMeta(metaList) {
  const dir = wallpapersDir();
  return (metaList || []).map((item) => {
    const filePath = path.join(dir, item.fileName);
    const previewPath = path.join(dir, item.previewFileName || item.fileName);
    return {
      ...item,
      filePath: fs.existsSync(filePath) ? filePath : null,
      previewPath: fs.existsSync(previewPath) ? previewPath : null,
    };
  });
}

function mimeFromExt(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function chooseAndSaveWallpaper(browserWindow, currentMeta) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: 'Выбрать обои',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, error: 'Отменено' };
  }
  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return { ok: false, error: 'Неподдерживаемый формат' };

  let stat;
  try {
    stat = fs.statSync(src);
  } catch {
    return { ok: false, error: 'Не удалось прочитать файл' };
  }
  if (stat.size > MAX_WALLPAPER_BYTES) {
    return { ok: false, error: 'Файл больше 12 МБ' };
  }

  const id = crypto.randomUUID();
  const fileName = `${id}${ext}`;
  const previewFileName = `${id}.preview.jpg`;
  const dest = path.join(wallpapersDir(), fileName);
  const previewDest = path.join(wallpapersDir(), previewFileName);

  try {
    fs.copyFileSync(src, dest);
  } catch (err) {
    return { ok: false, error: err?.message || 'Не удалось сохранить' };
  }

  try {
    const img = nativeImage.createFromPath(dest);
    if (img.isEmpty()) throw new Error('empty');
    const resized = img.resize({ width: 480, quality: 'better' });
    fs.writeFileSync(previewDest, resized.toJPEG(82));
  } catch {
    try {
      fs.copyFileSync(dest, previewDest);
    } catch {
      // preview optional
    }
  }

  const asset = {
    id,
    name: path.basename(src, ext).slice(0, 80),
    fileName,
    previewFileName: fs.existsSync(previewDest) ? previewFileName : fileName,
    mime: mimeFromExt(ext),
    createdAt: Date.now(),
  };

  const nextMeta = appearanceMod.normalizeWallpapersMeta([...(currentMeta || []), asset]);
  return { ok: true, asset: enrichWallpaperMeta([asset])[0], wallpapers: enrichWallpaperMeta(nextMeta) };
}

function deleteWallpaper(id, currentMeta) {
  const list = appearanceMod.normalizeWallpapersMeta(currentMeta || []);
  const item = list.find((w) => w.id === id);
  if (!item) return { ok: false, error: 'Не найдено', wallpapers: enrichWallpaperMeta(list) };

  for (const name of [item.fileName, item.previewFileName]) {
    const full = resolveWallpaperPath(name);
    if (full && fs.existsSync(full)) {
      try {
        fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  }

  const next = list.filter((w) => w.id !== id);
  // GC orphan files not referenced
  const referenced = new Set(next.flatMap((w) => [w.fileName, w.previewFileName]));
  for (const file of listWallpaperFiles()) {
    if (!referenced.has(file)) {
      const full = resolveWallpaperPath(file);
      if (full) {
        try {
          fs.unlinkSync(full);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { ok: true, wallpapers: enrichWallpaperMeta(next) };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function analyzeBitmap(bitmap, width, height) {
  const buckets = new Map();
  const step = Math.max(1, Math.floor((width * height) / 900));
  for (let i = 0; i < width * height; i += step) {
    const o = i * 4;
    const b = bitmap[o];
    const g = bitmap[o + 1];
    const r = bitmap[o + 2];
    const a = bitmap[o + 3];
    if (a < 200) continue;
    // quantize
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const prev = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    prev.r += r;
    prev.g += g;
    prev.b += b;
    prev.n += 1;
    buckets.set(key, prev);
  }
  const ranked = [...buckets.values()]
    .map((v) => ({
      r: v.r / v.n,
      g: v.g / v.n,
      b: v.b / v.n,
      n: v.n,
      lum: (0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b) / (v.n * 255),
    }))
    .sort((a, b) => b.n - a.n);

  const vibrant = ranked.find((c) => c.lum > 0.18 && c.lum < 0.78) || ranked[0];
  const dark = ranked.find((c) => c.lum < 0.35) || ranked[ranked.length - 1] || vibrant;
  const light = ranked.find((c) => c.lum > 0.55) || ranked[0] || vibrant;
  if (!vibrant) return null;

  const accent = rgbToHex(vibrant.r, vibrant.g, vibrant.b);
  const accentHover = rgbToHex(vibrant.r * 1.08, vibrant.g * 1.08, vibrant.b * 1.08);
  const bgMain = rgbToHex(dark.r * 0.35, dark.g * 0.35, dark.b * 0.35);
  const bgSidebar = rgbToHex(dark.r * 0.45, dark.g * 0.45, dark.b * 0.45);
  const bgPanel = rgbToHex(dark.r * 0.55 + 20, dark.g * 0.55 + 20, dark.b * 0.55 + 20);
  return {
    accent,
    accentHover,
    button: accent,
    progress: accent,
    selection: `${accent}38`,
    accentSoft: `${accent}22`,
    bgMain,
    bgSidebar,
    bgPanel,
    bgElevated: bgPanel,
    like: accent,
    sample: rgbToHex(light.r, light.g, light.b),
  };
}

function hashFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(buf).digest('hex');
  } catch {
    return null;
  }
}

function analyzeImagePalette(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath) {
    return { ok: false, error: 'Нет изображения' };
  }
  // Allow wallpapers dir or cover paths under userData
  const userData = app.getPath('userData');
  const normalized = path.normalize(imagePath);
  if (!normalized.startsWith(userData) && !isPathInside(wallpapersDir(), normalized)) {
    // still allow if file exists and is image under a media covers folder
    if (!fs.existsSync(normalized)) return { ok: false, error: 'Файл не найден' };
  }
  if (!fs.existsSync(normalized)) return { ok: false, error: 'Файл не найден' };

  const cacheKey = hashFile(normalized);
  if (cacheKey && paletteCache.has(cacheKey)) {
    return { ok: true, cacheKey, palette: paletteCache.get(cacheKey), cached: true };
  }

  let img = nativeImage.createFromPath(normalized);
  if (img.isEmpty()) return { ok: false, error: 'Не удалось прочитать изображение' };
  img = img.resize({ width: 64, height: 64, quality: 'better' });
  const size = img.getSize();
  const bitmap = img.toBitmap();
  const palette = analyzeBitmap(bitmap, size.width, size.height);
  if (!palette) return { ok: false, error: 'Не удалось извлечь палитру' };
  if (cacheKey) {
    if (paletteCache.size > 40) {
      const first = paletteCache.keys().next().value;
      paletteCache.delete(first);
    }
    paletteCache.set(cacheKey, palette);
  }
  return { ok: true, cacheKey, palette, cached: false };
}

function getBuiltinThemes() {
  // Lightweight builtins; full colors come from DEFAULT + accents applied in renderer presets.
  // Main only needs structure for listing when DB empty — renderer merges BUILTIN.
  return [];
}

module.exports = {
  wallpapersDir,
  enrichWallpaperMeta,
  chooseAndSaveWallpaper,
  deleteWallpaper,
  analyzeImagePalette,
  resolveWallpaperPath,
  getBuiltinThemes,
  MAX_WALLPAPER_BYTES,
};
