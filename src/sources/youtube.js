/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * YouTube music source provider. Thin wrapper over the existing YtDlp
 * client; behavior is identical to the pre-registry player.
 */

import { getYT } from '../ytdlp.js';

getYT().catch(() => {});

function toTrack(e, confidence = 1) {
  if (!e) return null;
  const url = e.url || (e.id ? `https://youtube.com/watch?v=${e.id}` : null);
  if (!url) return null;
  return {
    url,
    title: e.title || 'Unknown',
    duration: e.duration || 0,
    thumbnail: e.thumbnail || null,
    source: 'youtube',
    confidence,
  };
}

export const youtubeSource = {
  id: 'youtube',
  label: 'YouTube',

  match: (q) => /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(String(q ?? '').trim()),

  async resolveURL(url) {
    const yt = await getYT();
    const info = await yt.getVideoInfo(url);
    return {
      url,
      title: info.title || 'Unknown',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || null,
      source: 'youtube',
      confidence: 1,
    };
  },

  async search(query, count = 1) {
    const yt = await getYT();
    const results = await yt.search(query, count);
    return (results ?? []).map((r, i) => toTrack(r, Math.max(0.5, 1 - i * 0.1))).filter((t) => t?.url);
  },

  async resolvePlaylist(url) {
    const yt = await getYT();
    const entries = await yt.getPlaylistInfo(url);
    return (entries ?? []).map((e) => toTrack({ url: `https://youtube.com/watch?v=${e.id}`, ...e }, 1)).filter(Boolean);
  },

  streamArgs(track, { position = 0 } = {}) {
    const args = ['-f', 'bestaudio/best'];
    if (position > 0) args.push('--download-sections', `*${position}-`);
    args.push('-o', '-', track.url);
    return args;
  },

  async spawn(args) {
    const yt = await getYT();
    return yt.exec(args);
  },
};
