/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * Spotify music source provider. Spotify URLs carry no audio (DRM), so
 * tracks are resolved to metadata via the Spotify Web API (needs
 * SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET) and then matched to a
 * YouTube equivalent which is what actually streams. Without credentials
 * every method safely resolves to nothing.
 */

import pen from '#mushi/pen.js';
import { youtubeSource } from './youtube.js';

const API = 'https://api.spotify.com/v1';
const MAX_ITEMS = 50;
const SEARCH_CONCURRENCY = 4;

/** @type {{ token: string, expiresAt: number } | null} */
let tokenCache = null;

function creds() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

async function getToken() {
  const c = creds();
  if (!c) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function api(path) {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Spotify API failed: ${res.status}`);
  return res.json();
}

function parse(url) {
  const m = String(url).match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album|episode)\/([A-Za-z0-9]+)/);
  return m ? { type: m[1], id: m[2] } : null;
}

const artistNames = (sp) =>
  (sp?.artists ?? [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ');
const coverOf = (sp, fallback) => sp?.album?.images?.[0]?.url ?? sp?.images?.[0]?.url ?? fallback ?? null;

/** Map one Spotify track/episode object to a playable (YouTube-backed) track. */
async function toTrack(sp) {
  if (!sp?.name) return null;
  const artists = artistNames(sp);
  const q = `${artists ? `${artists} - ` : ''}${sp.name}`.trim();
  let yt = [];
  try {
    yt = await youtubeSource.search(q, 1);
  } catch (e) {
    pen.Error('Spotify-YouTube-Fallback', e?.message ?? e);
  }
  if (!yt.length) return null;
  const y = yt[0];
  return {
    url: y.url,
    title: artists ? `${artists} - ${sp.name}` : sp.name,
    duration: y.duration || Math.round((sp.duration_ms ?? 0) / 1000),
    thumbnail: coverOf(sp, y.thumbnail),
    source: 'spotify',
    confidence: 0.8,
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out.filter(Boolean);
}

async function playlistItems(type, id) {
  const items = [];
  let path = type === 'playlist' ? `/playlists/${id}/tracks?limit=100` : `/albums/${id}/tracks?limit=50`;
  while (path && items.length < MAX_ITEMS) {
    const data = await api(path);
    if (!data) return items;
    for (const it of data.items ?? []) {
      const sp = it.track ?? it;
      if (!sp || sp.is_local) continue;
      items.push(sp);
      if (items.length >= MAX_ITEMS) break;
    }
    path = data.next ? data.next.replace(API, '') : null;
  }
  return items;
}

export const spotifySource = {
  id: 'spotify',
  label: 'Spotify',

  match: (q) => /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album|episode)\//i.test(String(q ?? '')),

  async resolveURL(url) {
    const parsed = parse(url);
    if (!parsed || (parsed.type !== 'track' && parsed.type !== 'episode')) return null;
    const data = await api(`/${parsed.type}s/${parsed.id}`);
    if (!data) return null;
    return toTrack(data);
  },

  // Keyword search stays on YouTube; Spotify is URL-driven only.
  async search() {
    return [];
  },

  async resolvePlaylist(url) {
    const parsed = parse(url);
    if (!parsed) return [];
    if (parsed.type === 'track' || parsed.type === 'episode') {
      const t = await this.resolveURL(url);
      return t ? [t] : [];
    }
    const items = await playlistItems(parsed.type, parsed.id);
    return mapLimit(items, SEARCH_CONCURRENCY, toTrack);
  },

  streamArgs: (track, opts) => youtubeSource.streamArgs(track, opts),

  async spawn(args) {
    return youtubeSource.spawn(args);
  },
};
