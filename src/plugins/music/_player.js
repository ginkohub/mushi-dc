/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 *
 * Credits:
 *   yt-dlp - https://github.com/yt-dlp/yt-dlp
 *   ffmpeg - https://ffmpeg.org
 */

import { spawn } from 'node:child_process';
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getYT, read, sourceLabel, write } from '#mushi';
import pen from '#mushi/pen.js';
import { spawnStream } from '#mushi/sources.js';

export { resolveSong } from '#mushi/sources.js';

let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = (await import('ffmpeg-static')).default;
} catch {}

getYT().catch(() => {});

function getTrackKey(track) {
  if (!track) return '';
  const url = typeof track === 'string' ? track : track.url;
  if (url) {
    const ytMatch = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/shorts\/)([\w-]{11})/);
    if (ytMatch) return `yt:${ytMatch[1]}`;
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`;
    } catch {
      return url.trim().toLowerCase();
    }
  }
  const title = typeof track === 'object' ? track.title : null;
  return title ? `title:${title.trim().toLowerCase()}` : '';
}

function isDuplicateTrack(track, list) {
  if (!track || !list?.length) return false;
  const key = getTrackKey(track);
  if (!key) return false;
  return list.some((t) => getTrackKey(t) === key);
}

function dedupeTracks(tracks) {
  if (!tracks?.length) return [];
  const seen = new Set();
  return tracks.filter((t) => {
    const key = getTrackKey(t);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getGuildPlaylists(guildId) {
  const data = read();
  if (!data.guildPlaylists) data.guildPlaylists = {};
  if (!data.guildPlaylists[guildId]) {
    data.guildPlaylists[guildId] = {};
  }
  return data.guildPlaylists[guildId];
}

function saveGuildPlaylists(guildId, playlists) {
  const data = read();
  if (!data.guildPlaylists) data.guildPlaylists = {};
  data.guildPlaylists[guildId] = playlists;
  write(data);
}

/** Stay preferences: { stay: { [guildId]: { channelId } } } — persists across restarts. */
export function getStay(guildId) {
  return read().stay?.[guildId] ?? null;
}

export function setStay(guildId, channelId) {
  const data = read();
  if (!data.stay) data.stay = {};
  if (channelId) {
    data.stay[guildId] = { channelId };
  } else {
    delete data.stay[guildId];
  }
  write(data);
  const state = states.get(guildId);
  if (state) state.stayChannelId = channelId ?? null;
  return channelId ? data.stay[guildId] : null;
}

/** Arm auto-leave in 60s, unless stay is on for this guild. */
function scheduleAutoLeave(guildId) {
  const state = getState(guildId);
  if (state.nextDc) {
    clearTimeout(state.nextDc);
    state.nextDc = null;
  }
  if (!state.connection) return;
  if (getStay(guildId) || state.stayChannelId) return;
  state.nextDc = setTimeout(() => {
    if (state.currentIndex === -1 && !getStay(guildId) && !state.stayChannelId) {
      const tc = state.textChannel;
      cleanup(guildId);
      if (tc) tc.send('Queue ended, leaving voice channel.').catch(() => {});
    }
  }, 60_000);
}

function loopLabel(mode) {
  return ['Off', 'Single', 'All'][mode] ?? 'Off';
}

function nowPlayingEmbed(state) {
  const s = state.current;
  if (!s) return null;

  const title = s.url ? `[**${s.title}**](${s.url})` : `**${s.title}**`;
  const lines = [title];

  if (s.duration) lines.push(`-# ⏱ ${formatDuration(s.duration)}`);
  if (s.artist) lines.push(`-# 🎤 ${s.artist}`);
  if (s.requester) lines.push(`-# 👤 Requested by <@${s.requester}>`);
  lines.push(
    `-# 🎶 ${state.songs.length} song(s) in queue • 🔊 Volume: ${Math.round(state.volume * 100)}% • 🔁 Loop: ${loopLabel(state.loopMode)}${s.source ? ` • via ${sourceLabel(s.source)}` : ''}`,
  );

  const upNext = state.songs;
  if (upNext.length > 0) {
    lines.push('', `**Up next (${upNext.length}):**`);
    for (const t of upNext.slice(0, 5)) {
      lines.push(`\`${state.tracks.indexOf(t) + 1}.\` ${t.title}`);
    }
    if (upNext.length > 5) lines.push(`*+${upNext.length - 5} more*`);
  }

  return {
    color: 0x00ff00,
    author: { name: '🎵 Now Playing' },
    description: lines.join('\n'),
    thumbnail: s.thumbnail ? { url: s.thumbnail } : undefined,
  };
}

function playerUI(state) {
  const s = state.current;
  if (!s && state.radioPick) {
    /* Radio mid-pick: keep the player message visible and honest about the gap */
    return {
      embeds: [
        {
          color: 0xffa500,
          author: { name: '🔎 Autoplay' },
          description: '*Picking the next song from the mix…*',
        },
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mp_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        ),
      ],
      allowedMentions: { repliedUser: false },
    };
  }
  if (!s) return null;

  const paused = state.player.state.status === 'paused';

  const embed = nowPlayingEmbed(state);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mp_pause')
      .setEmoji(paused ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_skip').setEmoji('⏭️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('mp_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('mp_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
  );

  const loopStyle = state.loopMode === 0 ? ButtonStyle.Secondary : ButtonStyle.Primary;
  const loopEmojiBtn = state.loopMode === 1 ? '🔂' : '🔁';

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_loop').setEmoji(loopEmojiBtn).setStyle(loopStyle),
    new ButtonBuilder().setCustomId('mp_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2], allowedMentions: { repliedUser: false } };
}

/** Serialize player-UI refreshes: concurrent callers re-check after the previous one lands,
 *  so racing path (playSong + prefetch) can't both see a null pointer and double-send. */
function sendPlayerUI(state) {
  state.uiChain = (state.uiChain ?? Promise.resolve()).then(() => _sendPlayerUI(state)).catch(() => {});
  return state.uiChain;
}

async function _sendPlayerUI(state) {
  const ui = playerUI(state);
  if (!ui) {
    /* nothing to show in the current gap state; drop an existing message */
    removePlayerUI(state);
    return;
  }
  if (state.playerMsg) {
    try {
      await state.playerMsg.edit(ui);
      pen.Debug('PlayerUI', 'edited', `msg=${state.playerMsg?.id ?? null}`);
      return;
    } catch {
      pen.Debug('PlayerUI', 'edit failed, resending');
      state.playerMsg = null; /* stale/deleted player message */
    }
  }
  if (!state.textChannel) return;
  try {
    const msg = await state.textChannel.send(ui);
    state.playerMsg = msg;
    pen.Debug('PlayerUI', 'sent', `msg=${msg.id}`);
  } catch {
    state.playerMsg = null;
  }
}

function removePlayerUI(state) {
  if (state.playerMsg) {
    try {
      state.playerMsg.delete().catch(() => {});
    } catch {}
    state.playerMsg = null;
  }
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return 'Live';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stopProgressTimer(state) {
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = null;
  }
}

// No periodic UI edits: the player message is only updated on state changes
// (play/pause/skip/etc). Kept as a no-op for existing callers.
function startProgressTimer(state) {
  stopProgressTimer(state);
}

class GuildState {
  constructor(guildId) {
    this.guildId = guildId;
    this.tracks = [];
    this.currentIndex = -1;
    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.textChannel = null;
    this.volume = 1;
    this.loopMode = 0;
    this.autoplay = false;
    this.radioPick = false;
    this.stayChannelId = null;
    this.startedAt = null;
    this.pausedAt = null;
    this.pausedTotal = 0;
    this.progressInterval = null;
    this.nextDc = null;
    this.ffmpeg = null;
    this.ytproc = null;
    this.playerMsg = null;
    this.skipRequested = false;
    this.nextPick = null;
  }

  get current() {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      return this.tracks[this.currentIndex];
    }
    return null;
  }

  get songs() {
    if (this.currentIndex < 0) return this.tracks;
    return this.tracks.slice(this.currentIndex + 1);
  }
}

const states = new Map();
const guilds = new Map();

function getState(guildId) {
  if (!states.has(guildId)) {
    const state = new GuildState(guildId);
    states.set(guildId, state);

    const data = read();
    if (data.guildVolume?.[guildId] != null) {
      state.volume = data.guildVolume[guildId];
    }
    if (data.stay?.[guildId]?.channelId) {
      state.stayChannelId = data.stay[guildId].channelId;
    }

    state.player.on(AudioPlayerStatus.Idle, async () => {
      stopProgressTimer(state);
      state.pausedAt = null;
      state.pausedTotal = 0;
      killProcs(state);

      const g = guilds.get(guildId);

      if (state.skipRequested) {
        state.skipRequested = false;
        if (state.loopMode === 2 && state.tracks.length > 0) {
          state.currentIndex = (state.currentIndex + 1) % state.tracks.length;
        } else {
          state.currentIndex++;
        }
        if (state.currentIndex < state.tracks.length) {
          if (g) playSong(g);
        } else if (!(await fillAutoplay(g, state))) {
          clearEndedQueue(guildId, state);
        }
        return;
      }

      if (state.loopMode === 1 && state.current) {
        if (g) playSong(g);
        return;
      }

      if (state.loopMode === 2 && state.tracks.length > 0) {
        state.currentIndex = (state.currentIndex + 1) % state.tracks.length;
        if (g) playSong(g);
        return;
      }

      state.currentIndex++;
      if (state.currentIndex < state.tracks.length) {
        if (g) playSong(g);
      } else if (!(await fillAutoplay(g, state))) {
        clearEndedQueue(guildId, state);
      }
    });

    state.player.on('error', async (err) => {
      pen.Error('AudioPlayer error', err);
      stopProgressTimer(state);
      killProcs(state);
      const g = guilds.get(guildId);
      state.currentIndex++;
      if (state.currentIndex < state.tracks.length) {
        if (g) playSong(g);
      } else if (!(await fillAutoplay(g, state))) {
        state.currentIndex = -1;
        state.tracks = [];
        removePlayerUI(state);
      }
    });
  }
  return states.get(guildId);
}

async function connect(guild, voiceChannel) {
  const state = getState(guild.id);
  guilds.set(guild.id, guild);

  if (state.connection) {
    const oldChannelId = state.connection.joinConfig.channelId;
    if (oldChannelId === voiceChannel.id) return state.connection;
    // Stay follows the bot: moved by /play from another channel.
    if (getStay(guild.id) || state.stayChannelId) setStay(guild.id, voiceChannel.id);
    state.connection.destroy();
    state.connection = null;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    connection.destroy();
    throw new Error('Failed to join voice channel (timeout)');
  }

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
    } catch {
      const stay = getStay(guild.id) ?? (state.stayChannelId ? { channelId: state.stayChannelId } : null);
      cleanup(guild.id);
      // Stay mode: attempt one rejoin; give up quietly if the channel is gone.
      if (stay?.channelId && guilds.get(guild.id)) {
        try {
          const ch = await guild.channels.fetch(stay.channelId).catch(() => null);
          if (ch?.isVoiceBased?.()) {
            const g = guilds.get(guild.id);
            if (g) await connect(g, ch).catch(() => {});
          }
        } catch {
          /* stay rejoin failed, remain disconnected */
        }
      }
    }
  });

  state.connection = connection;
  connection.subscribe(state.player);
  return connection;
}

function killProcs(state) {
  if (state.ytproc) {
    state.ytproc.kill();
    state.ytproc = null;
  }
  if (state.ffmpeg) {
    state.ffmpeg.kill();
    state.ffmpeg = null;
  }
}

function disconnect(guildId) {
  const state = getState(guildId);
  stopProgressTimer(state);
  state.currentIndex = -1;
  state.tracks = [];
  state.loopMode = 0;
  state.autoplay = false;
  state.startedAt = null;
  state.pausedAt = null;
  state.pausedTotal = 0;
  state.skipRequested = false;
  state.player.stop();
  killProcs(state);
  if (state.connection) {
    state.connection.destroy();
    state.connection = null;
  }
  if (state.nextDc) {
    clearTimeout(state.nextDc);
    state.nextDc = null;
  }
  removePlayerUI(state);
}

function cleanup(guildId) {
  const state = getState(guildId);
  stopProgressTimer(state);
  state.currentIndex = -1;
  state.tracks = [];
  state.loopMode = 0;
  state.autoplay = false;
  state.startedAt = null;
  state.pausedAt = null;
  state.pausedTotal = 0;
  state.skipRequested = false;
  state.player.stop();
  killProcs(state);
  if (state.connection) {
    state.connection.destroy();
    state.connection = null;
  }
  if (state.nextDc) {
    clearTimeout(state.nextDc);
    state.nextDc = null;
  }
  removePlayerUI(state);
  state.textChannel = null;
}

/**
 * Called when a voice channel is deleted (e.g. temp-channel bots that
 * remove empty channels while mushi is staying/playing in them).
 * Releases the dead connection, stops playback, and drops the stay
 * preference pointing at the now-gone channel.
 * @returns {boolean} true when this guild was affected
 */
export function handleVoiceChannelDelete(guildId, channelId) {
  const state = states.get(guildId);
  if (!state) return false;
  const connId = state.connection?.joinConfig?.channelId ?? null;
  const stay = getStay(guildId) ?? (state.stayChannelId ? { channelId: state.stayChannelId } : null);
  if (connId !== channelId && stay?.channelId !== channelId) return false;
  const tc = state.textChannel;
  if (stay?.channelId === channelId) setStay(guildId, null);
  cleanup(guildId);
  if (tc) tc.send('Voice channel was deleted, stopped playback.').catch(() => {});
  return true;
}

const AUTOPLAY_SEEDS = [
  'top music hits this week',
  'popular songs right now',
  'trending music playlist',
  'best pop songs of all time mix',
  'viral hits playlist',
];

const toTrack = (r, requester) => {
  const url = r?.url || (r?.id ? `https://youtube.com/watch?v=${r.id}` : null);
  if (!url || !r.title) return null;
  return {
    url,
    title: r.title,
    artist: r.artist ?? r.uploader ?? r.channel ?? null,
    duration: r.duration || 0,
    thumbnail: r.thumbnail ?? null,
    source: 'youtube',
    requester: requester ?? null,
  };
};

/** Bulk-load a seed's YouTube Mix into the queue (deduped). Returns count added. */
async function loadMixTracks(state, seed) {
  const key = getTrackKey(seed);
  const seedId = key.startsWith('yt:') ? key.slice(3) : null;
  if (!seedId) return 0;

  try {
    const mix = await (await getYT()).getPlaylistInfo(
      `https://youtube.com/watch?v=${seedId}&list=RD${seedId}`,
      50 /* one page of the mix — full flat-page is ~400 entries and takes 15s+ */,
    );
    const existingKeys = new Set(state.tracks.map(getTrackKey));
    const toAdd = [];
    for (const r of mix ?? []) {
      const track = toTrack(r, seed.requester);
      if (!track) continue;
      const k = getTrackKey(track);
      if (!k || existingKeys.has(k)) continue;
      existingKeys.add(k);
      toAdd.push(track);
    }
    if (toAdd.length === 0) return 0;
    state.tracks.push(...toAdd);
    return toAdd.length;
  } catch {
    return 0;
  }
}

/** Next autoplay pick: bulk-load the last track's YouTube Mix into the queue,
 *  else fall back to a single-track search. The returned track is already in state.tracks. */
async function pickAutoplayTrack(state) {
  const seed = state.tracks[state.tracks.length - 1] ?? null;
  if (!seed) return null;

  /* Bulk-load the last song's YouTube Mix so the radio drains a queue,
   * not re-queries one track at a time. */
  const added = await loadMixTracks(state, seed);
  if (added > 0) {
    return state.tracks[state.tracks.length - added]; /* first newly added track */
  }

  /* Mix failed or non-YouTube seed: fall back to single-track search */
  const query = [seed.artist, seed.title].filter(Boolean).join(' ') || seed.title;
  const yt = await getYT();
  const results = (await yt.search(query, 10).catch(() => null)) ?? [];
  for (const r of results) {
    const track = toTrack(r, seed.requester);
    if (!track || isDuplicateTrack(track, state.tracks)) continue;
    state.tracks.push(track);
    return track;
  }
  return null;
}

/** Returns the next radio track, appending it to the queue. Awaited pick dedupes via state.nextPick. */
async function radioNext(guild, state) {
  if (!state.autoplay || !guild) return null;
  if (state.songs[0]) return state.songs[0]; /* already prefetched */
  if (state.nextPick) {
    /* Pick already in flight (prefetch racing the gap): wait for it */
    const track = await state.nextPick;
    return track ?? null;
  }

  state.radioPick = true;
  sendPlayerUI(state); /* orange picking view shows only in a gap (no current track) */
  state.nextPick = (async () => {
    try {
      return await pickAutoplayTrack(state);
    } finally {
      /* flags only — the UI refresh must happen AFTER the track is pushed,
         otherwise a gap-cycle flips the player view to null and deletes it */
      state.radioPick = false;
      state.nextPick = null;
    }
  })();

  const track = await state.nextPick;
  if (track) {
    /* track already in state.tracks via bulk-load in pickAutoplayTrack */
    sendPlayerUI(state); /* edits the same message: picking view → Up next / Now playing */
    return track;
  }
  if (!state.current) {
    sendPlayerUI(state); /* gap failure: drops the picking view (message removed) */
    if (state.textChannel) {
      state.textChannel.send('🔎 Radio could not find a next song — playback stopped.').catch(() => {});
    }
  }
  return null;
}

/** Queue ran dry with autoplay on: pick and play the next related track. */
async function fillAutoplay(guild, state) {
  if (!state.autoplay || !guild) return false;
  const track = await radioNext(guild, state);
  if (!track) return false;

  /* The caller already advanced currentIndex past the old queue end; the pick lands there */
  await playSong(guild); /* sendPlayerUI inside shows the picked track */
  return true;
}

/** Start autoplay radio: join the channel and play the seed (or a fresh pick) right away. */
async function startAutoplay(guild, voiceChannel, seed = null) {
  const state = getState(guild.id);
  await connect(guild, voiceChannel);
  state.autoplay = true;

  const isPlaying = state.current !== null && state.player.state.status !== AudioPlayerStatus.Idle;
  if (isPlaying) return null;

  if (seed) {
    /* Bulk-load the seed's YouTube Mix so the queue isn't just one song */
    const added = await loadMixTracks(state, seed);
    if (added === 0) {
      state.tracks.push(seed);
      state.currentIndex = state.tracks.length - 1;
    } else {
      state.currentIndex = state.tracks.length - added;
    }
    await playSong(guild);
    return seed;
  }

  /* No seed: random search, then bulk-load its mix */
  const query = AUTOPLAY_SEEDS[Math.floor(Math.random() * AUTOPLAY_SEEDS.length)];
  const yt = await getYT();
  const results = (await yt.search(query, 25).catch(() => null)) ?? [];
  const picks = [];
  for (const r of results) {
    const track = toTrack(r, null);
    if (!track || isDuplicateTrack(track, state.tracks)) continue;
    picks.push(track);
  }
  if (!picks.length) {
    state.autoplay = false;
    throw new Error('No song found for autoplay');
  }
  const seedTrack = picks[Math.floor(Math.random() * picks.length)];
  const added = await loadMixTracks(state, seedTrack);
  if (added === 0) {
    state.tracks.push(seedTrack);
    state.currentIndex = state.tracks.length - 1;
  } else {
    state.currentIndex = state.tracks.length - added;
  }
  await playSong(guild);
  return seedTrack;
}

function clearEndedQueue(guildId, state) {
  state.currentIndex = -1;
  state.tracks = [];
  removePlayerUI(state);
  scheduleAutoLeave(guildId);
}

async function playSong(guild) {
  const state = getState(guild.id);

  if (state.nextDc) {
    clearTimeout(state.nextDc);
    state.nextDc = null;
  }

  if (state.currentIndex < 0 || state.currentIndex >= state.tracks.length) {
    state.currentIndex = -1;
    return;
  }

  const song = state.tracks[state.currentIndex];
  state.startedAt = Date.now();
  state.pausedAt = null;
  state.pausedTotal = 0;

  try {
    const ytproc = await spawnStream(song);
    state.ytproc = ytproc;

    const ffmpeg = spawn(
      ffmpegPath || 'ffmpeg',
      ['-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    state.ffmpeg = ffmpeg;
    ytproc.stdout.pipe(ffmpeg.stdin);

    ytproc.stdout.on('error', () => {});
    ffmpeg.stdin.on('error', () => {});
    ffmpeg.stdout.on('error', () => {});

    let ytError = '';
    ytproc.stderr.on('data', (d) => {
      ytError += d.toString();
    });
    ytproc.on('error', () => {});
    ytproc.on('close', (code, signal) => {
      if (code !== 0 && code !== null && !signal && state.current === song) {
        pen.Error('yt-dlp exited with code', code, ytError);
      }
    });

    let ffmpegErr = '';
    ffmpeg.stderr.on('data', (d) => {
      ffmpegErr += d.toString();
    });
    ffmpeg.on('error', () => {});
    ffmpeg.on('close', (code, signal) => {
      if (code !== 0 && code !== null && !signal && state.current === song) {
        pen.Error('ffmpeg exited with code', code, ffmpegErr);
      }
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });

    resource.volume.setVolume(state.volume);

    state.player.play(resource);

    sendPlayerUI(state);
    startProgressTimer(state);

    /* Radio: pick ahead in the background so the queue never runs dry */
    radioNext(guild, state).catch((err) => pen.Error('Music-Prefill', err));
  } catch (err) {
    pen.Error('playSong', err);
    if (state.textChannel) {
      state.textChannel.send(`Failed to play **${song.title}**. Please try again later.`).catch(() => {});
    }
    state.currentIndex++;
    playSong(guild);
  }
}

async function seekTo(guild, position) {
  const state = getState(guild.id);
  if (!state.current?.duration) return false;

  position = Math.max(0, Math.min(position, state.current.duration));

  stopProgressTimer(state);
  killProcs(state);

  const song = state.current;
  state.startedAt = Date.now() - position * 1000;
  state.pausedAt = null;
  state.pausedTotal = 0;

  try {
    const ytproc = await spawnStream(song, { position });
    state.ytproc = ytproc;

    const ffmpeg = spawn(
      ffmpegPath || 'ffmpeg',
      ['-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    state.ffmpeg = ffmpeg;
    ytproc.stdout.pipe(ffmpeg.stdin);

    ytproc.stdout.on('error', () => {});
    ffmpeg.stdin.on('error', () => {});
    ffmpeg.stdout.on('error', () => {});

    let ytError = '';
    ytproc.stderr.on('data', (d) => {
      ytError += d.toString();
    });
    ytproc.on('error', () => {});
    ytproc.on('close', (code, signal) => {
      if (code !== 0 && code !== null && !signal && state.current === song) {
        pen.Error('yt-dlp exited with code', code, ytError);
      }
    });

    let ffmpegErr = '';
    ffmpeg.stderr.on('data', (d) => {
      ffmpegErr += d.toString();
    });
    ffmpeg.on('error', () => {});
    ffmpeg.on('close', (code, signal) => {
      if (code !== 0 && code !== null && !signal && state.current === song) {
        pen.Error('ffmpeg exited with code', code, ffmpegErr);
      }
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });

    resource.volume.setVolume(state.volume);
    state.player.play(resource);
    sendPlayerUI(state);
    startProgressTimer(state);
    return true;
  } catch (err) {
    pen.Error('seekTo', err);
    return false;
  }
}

function shuffleQueue(guildId) {
  const state = getState(guildId);
  if (state.tracks.length < 2) return;
  const currentSong = state.current;

  for (let i = state.tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]];
  }

  if (currentSong) {
    state.currentIndex = state.tracks.indexOf(currentSong);
  }
}

function removeFromQueue(guildId, index) {
  const state = getState(guildId);
  if (index < 1 || index > state.tracks.length) return null;
  const trackIdx = index - 1;
  const [removed] = state.tracks.splice(trackIdx, 1);

  if (trackIdx < state.currentIndex) {
    state.currentIndex--;
  } else if (trackIdx === state.currentIndex) {
    if (state.currentIndex >= state.tracks.length) {
      if (state.loopMode === 2 && state.tracks.length > 0) {
        state.currentIndex = 0;
      } else {
        state.currentIndex = -1;
      }
    }
    const g = guilds.get(guildId);
    if (g && state.currentIndex >= 0) {
      playSong(g);
    } else {
      state.player.stop();
      killProcs(state);
      removePlayerUI(state);
    }
  }
  return removed;
}

function clearQueue(guildId) {
  const state = getState(guildId);
  state.tracks = [];
  state.currentIndex = -1;
  stopProgressTimer(state);
  state.player.stop();
  killProcs(state);
  removePlayerUI(state);
}

function moveInQueue(guildId, from, to) {
  const state = getState(guildId);
  if (from < 1 || from > state.tracks.length || to < 1 || to > state.tracks.length) return false;
  const currentSong = state.current;
  const [item] = state.tracks.splice(from - 1, 1);
  state.tracks.splice(to - 1, 0, item);

  if (currentSong) {
    state.currentIndex = state.tracks.indexOf(currentSong);
  }
  return true;
}

function setLoop(guildId, mode) {
  const state = getState(guildId);
  state.loopMode = mode;
}

function saveQueue(guildId, name, uid) {
  const state = getState(guildId);
  const playlists = getGuildPlaylists(guildId);
  playlists[name] = dedupeTracks(state.tracks).map((s) => ({
    url: s.url,
    title: s.title,
    duration: s.duration,
    thumbnail: s.thumbnail,
    source: s.source,
    requester: s.requester || uid,
  }));
  saveGuildPlaylists(guildId, playlists);
}

function previousTrack(guildId) {
  const state = getState(guildId);
  if (state.tracks.length === 0) return false;

  killProcs(state);
  if (state.currentIndex > 0) {
    state.currentIndex--;
  } else if (state.loopMode === 2) {
    state.currentIndex = state.tracks.length - 1;
  } else {
    state.currentIndex = 0;
  }
  const g = guilds.get(guildId);
  if (g) playSong(g);
  return true;
}

function skip(guildId) {
  const state = getState(guildId);
  killProcs(state);
  state.skipRequested = true;
  state.player.stop();
}

function setVolume(guildId, vol) {
  const state = getState(guildId);
  state.volume = Math.max(0, Math.min(2, vol));
  const resource = state.player.state.resource;
  if (resource?.volume) {
    resource.volume.setVolume(state.volume);
  }
  const data = read();
  if (!data.guildVolume) data.guildVolume = {};
  data.guildVolume[guildId] = state.volume;
  write(data);
  return state.volume;
}

function stop(guildId) {
  const state = getState(guildId);
  // Stay mode: halt playback and clear the queue, but keep the voice connection.
  if (getStay(guildId) || state.stayChannelId) {
    state.autoplay = false; /* otherwise the radio re-picks on the next Idle */
    clearQueue(guildId);
    state.skipRequested = false;
    return;
  }
  disconnect(guildId);
}

export {
  cleanup,
  clearQueue,
  connect,
  dedupeTracks,
  disconnect,
  formatDuration,
  getGuildPlaylists,
  getState,
  getTrackKey,
  getYT,
  guilds,
  isDuplicateTrack,
  moveInQueue,
  nowPlayingEmbed,
  playSong,
  previousTrack,
  removeFromQueue,
  removePlayerUI,
  saveGuildPlaylists,
  saveQueue,
  seekTo,
  sendPlayerUI,
  setLoop,
  setVolume,
  shuffleQueue,
  skip,
  startAutoplay,
  startProgressTimer,
  states,
  stop,
  stopProgressTimer,
};
