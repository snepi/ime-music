/**
 * Writes build/icon.ico from brand PNG and stamps a branded electron copy for Windows taskbar in dev.
 * Run: node scripts/apply-app-icon.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import pngToIco from 'png-to-ico';
import { Jimp } from 'jimp';

const require = createRequire(import.meta.url);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(project, 'build');
const sourcePng = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

async function main() {
  if (!fs.existsSync(sourcePng)) {
    console.error('Missing', sourcePng);
    process.exit(1);
  }

  const src = await Jimp.read(sourcePng);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = [];
  for (const size of sizes) {
    buffers.push(await src.clone().resize({ w: size, h: size }).getBuffer('image/png'));
  }
  const ico = await pngToIco(buffers);
  fs.writeFileSync(icoPath, ico);
  fs.mkdirSync(path.join(project, 'public', 'brand'), { recursive: true });
  fs.copyFileSync(icoPath, path.join(project, 'public', 'brand', 'icon.ico'));
  fs.copyFileSync(path.join(project, 'public', 'brand', 'icon.png'), path.join(project, 'public', 'favicon.png'));
  console.log('Wrote', icoPath);

  if (process.platform !== 'win32') return;

  try {
    const { rcedit } = require('rcedit');
    const electronPath = require('electron');
    const branded = path.join(path.dirname(electronPath), 'ime-music.exe');
    fs.copyFileSync(electronPath, branded);
    await rcedit(branded, { icon: icoPath });
    console.log('Patched', branded);
  } catch (err) {
    console.warn('Could not patch branded electron.exe:', err?.message || err);
  }
}

main();
