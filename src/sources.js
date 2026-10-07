/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * Music source registry. New sources (Spotify, SoundCloud, ...) are added
 * as one provider module + one registerSource() line, without touching
 * the player pipeline.
 *
 * Provider contract:
 * {
 *   id: 'youtube',
 *   label: 'YouTube',
 *   match: (query) => boolean,          // deterministic URL detection
 *   resolveURL: (url) => Track | null,  // single URL -> track
 *   search: (query, count) => Track[],  // keyword -> tracks (best first)
 *   resolvePlaylist: (url) => Track[],  // playlist URL -> tracks
 *   streamArgs: (track, { position }) => string[], // yt-dlp-style args
 *   spawn: (args) => ChildProcess,      // spawn the audio fetcher
 * }
 *
 * Track contract:
 * { url, title, artist, duration, thumbnail, source, confidence, requester? }
 */

import { spotifySource } from './sources/spotify.js';
import { youtubeSource } from './sources/youtube.js';

const providers = [youtubeSource, spotifySource];

/** Register (or replace by id) a music source provider. */
export function registerSource(provider) {
  const i = providers.findIndex((p) => p.id === provider.id);
  if (i >= 0) providers[i] = provider;
  else providers.push(provider);
  return provider;
}

export function listSources() {
  return providers.map((p) => ({ id: p.id, label: p.label }));
}

export function getSource(id) {
  return providers.find((p) => p.id === id) ?? youtubeSource;
}

export function sourceLabel(id) {
  if (!id) return 'Unknown';
  return providers.find((p) => p.id === id)?.label ?? id;
}

/** First provider whose match() claims this query (usually a URL), or null. */
export function matchSource(query) {
  const q = String(query ?? '');
  for (const p of providers) {
    try {
      if (p.match(q)) return p;
    } catch {}
  }
  return null;
}

const isUrl = (q) => /^https?:\/\//i.test(String(q ?? '').trim());

/** Resolve one query/URL to a single track. Falls back across providers. */
export async function resolveSong(query) {
  const q = String(query ?? '').trim();
  if (!q) return null;

  if (isUrl(q)) {
    const p = matchSource(q) ?? youtubeSource;
    try {
      const t = await p.resolveURL(q);
      if (t) return t;
    } catch {}
    if (p !== youtubeSource) {
      try {
        return await youtubeSource.resolveURL(q);
      } catch {
        return null;
      }
    }
    return null;
  }

  for (const p of providers) {
    try {
      const r = await p.search(q, 1);
      if (r?.length) return r[0];
    } catch {}
  }
  return null;
}

/** Resolve a playlist URL to tracks (empty array on failure). */
export async function resolvePlaylist(url) {
  const p = matchSource(url) ?? youtubeSource;
  try {
    const r = await p.resolvePlaylist(url);
    if (r?.length) return r;
  } catch {}
  if (p !== youtubeSource) {
    try {
      return (await youtubeSource.resolvePlaylist(url)) ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Spawn the audio fetcher for a track (old tracks w/o source -> youtube). */
export async function spawnStream(track, opts = {}) {
  const p = getSource(track?.source);
  return p.spawn(p.streamArgs(track, opts));
}
