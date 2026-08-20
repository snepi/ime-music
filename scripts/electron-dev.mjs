#!/usr/bin/env node
/**
 * Launch Electron with a branded Windows exe (taskbar icon) when available.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = require('electron');
const branded = path.join(path.dirname(electronPath), 'ime-music.exe');
const bin = process.platform === 'win32' && fs.existsSync(branded) ? branded : electronPath;
const args = process.argv.slice(2);

const child = spawn(bin, args, {
  stdio: 'inherit',
  cwd: project,
  env: process.env,
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
