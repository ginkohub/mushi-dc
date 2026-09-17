/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const BIN_DIR = resolve('./bin');

export function getCookiePath() {
  const candidates = [
    process.env.YOUTUBE_COOKIES_PATH,
    resolve('./cookies-youtube-com.txt'),
    resolve('./cookies.txt'),
    resolve('./bin/cookies.txt'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function downloadBinary(destDir = BIN_DIR) {
  const isWin = process.platform === 'win32';
  const fileName = isWin ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp';
  const fullPath = join(destDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;

  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to download yt-dlp: ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(fullPath));
  if (!isWin) chmodSync(fullPath, 0o755);
  return fullPath;
}

export async function resolveYT() {
  if (process.env.YTDLP_PATH && existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }

  const paths = [
    join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
    resolve('./node_modules/.bin/yt-dlp'),
    resolve('bin/yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  try {
    execFileSync('yt-dlp', ['--version'], { stdio: 'ignore' });
    return 'yt-dlp';
  } catch {}

  return await downloadBinary(BIN_DIR);
}

export class YtDlp {
  constructor(binaryPath) {
    this.binaryPath = binaryPath;
  }

  exec(args = []) {
    const finalArgs = [...args];
    const cookiePath = getCookiePath();
    if (cookiePath && !finalArgs.includes('--cookies')) {
      finalArgs.unshift('--cookies', cookiePath);
    }
    return spawn(this.binaryPath, finalArgs);
  }

  async getVideoInfo(url) {
    return new Promise((resolve, reject) => {
      const proc = this.exec(['--dump-json', '--no-playlist', url]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error('Failed to parse yt-dlp output'));
          }
        } else {
          reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  async getPlaylistInfo(url) {
    return new Promise((resolve, reject) => {
      const proc = this.exec(['--flat-playlist', '--dump-json', url]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const results = stdout
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line));
            resolve(results);
          } catch {
            reject(new Error('Failed to parse playlist results'));
          }
        } else {
          reject(new Error(stderr.trim() || `Playlist extraction failed with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  async search(query, count = 1) {
    return new Promise((resolve, reject) => {
      const proc = this.exec([`ytsearch${count}:${query}`, '--dump-json', '--flat-playlist']);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const results = stdout
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line));
            resolve(results);
          } catch {
            reject(new Error('Failed to parse search results'));
          }
        } else {
          reject(new Error(stderr.trim() || `Search failed with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  async getBuffer(url, args = []) {
    return new Promise((resolve, reject) => {
      const proc = this.exec([url, '-o', '-', ...args]);
      const chunks = [];
      let stderr = '';

      proc.stdout.on('data', (chunk) => chunks.push(chunk));
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }
}

let ytInit = null;
let ytInstance = null;

export async function getYT() {
  if (!ytInstance) {
    if (!ytInit) {
      ytInit = resolveYT().then((bin) => {
        ytInstance = new YtDlp(bin);
        return ytInstance;
      });
    }
    ytInstance = await ytInit;
  }
  return ytInstance;
}
