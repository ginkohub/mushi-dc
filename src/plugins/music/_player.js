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
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
import YtDlpWrap from 'yt-dlp-wrap';
import { read, write } from '#mushi';
import pen from '#mushi/pen.js';

let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = (await import('ffmpeg-static')).default;
} catch {}

const BIN_DIR = resolve('./bin');

function resolveYT() {
  const paths = [
    join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
    resolve('./node_modules/.bin/yt-dlp'),
    resolve('bin/yt-dlp'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });
  return YtDlpWrap.downloadBinary(BIN_DIR);
}

let ytInit = null;
let ytInstance = null;
async function getYT() {
  if (!ytInstance) {
    if (!ytInit)
      ytInit = Promise.resolve(resolveYT()).then((bin) => {
        ytInstance = new YtDlpWrap(bin);
        return ytInstance;
      });
    ytInstance = await ytInit;
  }
  return ytInstance;
}
getYT().catch(() => {});

async function resolveSong(query) {
  const yt = await getYT();
  const isUrl = /^https?:\/\//.test(query);
  if (isUrl) {
    const info = await yt.getVideoInfo(query);
    return {
      url: query,
      title: info.title || 'Unknown',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || null,
    };
  }
  const results = await yt.search(query, 1);
  if (!results?.length) return null;
  const r = results[0];
  return {
    url: r.url || `https://youtube.com/watch?v=${r.id}`,
    title: r.title || 'Unknown',
    duration: r.duration || 0,
    thumbnail: r.thumbnail || null,
  };
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

function playerUI(state) {
  const s = state.current;
  if (!s) return null;

  const paused = state.player.state.status === 'paused';

  const loopEmoji = state.loopMode === 1 ? '🔂' : state.loopMode === 2 ? '🔁' : '';
  const loopStr = loopEmoji ? `${loopEmoji} ` : '';

  const bar = progressBar(state);
  const plHeader = state.activePlaylist
    ? `Playlist: **${state.activePlaylist}** (${state.currentIndex + 1}/${state.tracks.length})\n`
    : '';
  let desc = `${plHeader}${bar}\n${loopStr}Volume: ${Math.round(state.volume * 100)}% | Requested by: <@${s.requester}>`;

  const upNext = state.songs;
  if (upNext.length > 0) {
    const next = upNext.slice(0, 5);
    const total = upNext.length;
    desc += `\n\n**Up next (${total}):**`;
    for (let i = 0; i < next.length; i++) {
      desc += `\n\`${state.currentIndex + 2 + i}.\` ${next[i].title}`;
    }
    if (total > 5) desc += `\n*+${total - 5} more*`;
  }

  const embed = {
    color: 0x00ff00,
    title: s.title,
    url: s.url,
    description: desc,
    thumbnail: s.thumbnail ? { url: s.thumbnail } : undefined,
  };

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

async function sendPlayerUI(state) {
  if (!state.playerMsg && state.textChannel) {
    const ui = playerUI(state);
    if (!ui) return;
    try {
      const msg = await state.textChannel.send(ui);
      state.playerMsg = msg;
    } catch {
      state.playerMsg = null;
    }
  } else if (state.playerMsg) {
    const ui = playerUI(state);
    if (!ui) {
      removePlayerUI(state);
      return;
    }
    try {
      await state.playerMsg.edit(ui);
    } catch {
      state.playerMsg = null;
    }
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

function getElapsed(state) {
  if (!state.startedAt) return 0;
  let paused = state.pausedTotal;
  if (state.pausedAt) paused += Date.now() - state.pausedAt;
  return Math.max(0, (Date.now() - state.startedAt - paused) / 1000);
}

function progressBar(state) {
  const s = state.current;
  if (!s?.duration) return '';
  const elapsed = getElapsed(state);
  const ratio = Math.min(1, elapsed / s.duration);
  const len = 16;
  const filled = Math.round(ratio * len);
  return `${'█'.repeat(filled)}${'░'.repeat(len - filled)} ${formatDuration(elapsed)} / ${formatDuration(s.duration)}`;
}

function stopProgressTimer(state) {
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = null;
  }
}

function startProgressTimer(state) {
  stopProgressTimer(state);
  state.progressInterval = setInterval(() => sendPlayerUI(state), 5000);
}

class GuildState {
  constructor(guildId) {
    this.guildId = guildId;
    this.activePlaylist = null;
    this.tracks = [];
    this.currentIndex = -1;
    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    this.textChannel = null;
    this.volume = 1;
    this.loopMode = 0;
    this.startedAt = null;
    this.pausedAt = null;
    this.pausedTotal = 0;
    this.progressInterval = null;
    this.nextDc = null;
    this.ffmpeg = null;
    this.ytproc = null;
    this.playerMsg = null;
    this.skipRequested = false;
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

    state.player.on(AudioPlayerStatus.Idle, () => {
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
        } else {
          state.currentIndex = -1;
          removePlayerUI(state);
          if (state.connection) {
            state.nextDc = setTimeout(() => {
              if (state.currentIndex === -1) {
                const tc = state.textChannel;
                cleanup(guildId);
                if (tc) tc.send('Playlist ended, leaving voice channel.').catch(() => {});
              }
            }, 60_000);
          }
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
      } else {
        state.currentIndex = -1;
        removePlayerUI(state);
        if (state.connection) {
          state.nextDc = setTimeout(() => {
            if (state.currentIndex === -1) {
              const tc = state.textChannel;
              cleanup(guildId);
              if (tc) tc.send('Playlist ended, leaving voice channel.').catch(() => {});
            }
          }, 60_000);
        }
      }
    });

    state.player.on('error', (err) => {
      pen.Error('AudioPlayer error', err);
      stopProgressTimer(state);
      killProcs(state);
      const g = guilds.get(guildId);
      state.currentIndex++;
      if (state.currentIndex < state.tracks.length) {
        if (g) playSong(g);
      } else {
        state.currentIndex = -1;
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
      cleanup(guild.id);
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
  state.loopMode = 0;
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
  state.loopMode = 0;
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
    const yt = await getYT();

    const ytproc = yt.exec(['-f', 'bestaudio/best', '-o', '-', song.url]);
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
    ytproc.on('close', (code) => {
      if (code !== 0 && state.current === song) {
        pen.Error('yt-dlp exited with code', code, ytError);
      }
    });

    let ffmpegErr = '';
    ffmpeg.stderr.on('data', (d) => {
      ffmpegErr += d.toString();
    });
    ffmpeg.on('error', () => {});
    ffmpeg.on('close', (code) => {
      if (code !== 0 && state.current === song) {
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
  } catch (err) {
    pen.Error('playSong', err);
    if (state.textChannel) {
      state.textChannel.send(`Failed to play **${song.title}**: ${err.message}`).catch(() => {});
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
    const yt = await getYT();

    const ytproc = yt.exec(['-f', 'bestaudio/best', '--download-sections', `*${position}-`, '-o', '-', song.url]);
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
    ytproc.on('close', (code) => {
      if (code !== 0 && state.current === song) {
        pen.Error('yt-dlp exited with code', code, ytError);
      }
    });

    let ffmpegErr = '';
    ffmpeg.stderr.on('data', (d) => {
      ffmpegErr += d.toString();
    });
    ffmpeg.on('error', () => {});
    ffmpeg.on('close', (code) => {
      if (code !== 0 && state.current === song) {
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

  if (state.activePlaylist) {
    const playlists = getGuildPlaylists(guildId);
    playlists[state.activePlaylist] = [...state.tracks];
    saveGuildPlaylists(guildId, playlists);
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

  if (state.activePlaylist) {
    const playlists = getGuildPlaylists(guildId);
    playlists[state.activePlaylist] = [...state.tracks];
    saveGuildPlaylists(guildId, playlists);
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
  if (state.activePlaylist) {
    const playlists = getGuildPlaylists(guildId);
    playlists[state.activePlaylist] = [];
    saveGuildPlaylists(guildId, playlists);
  }
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

  if (state.activePlaylist) {
    const playlists = getGuildPlaylists(guildId);
    playlists[state.activePlaylist] = [...state.tracks];
    saveGuildPlaylists(guildId, playlists);
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
  playlists[name] = state.tracks.map((s) => ({
    url: s.url,
    title: s.title,
    duration: s.duration,
    thumbnail: s.thumbnail,
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
  disconnect(guildId);
}

export {
  cleanup,
  clearQueue,
  connect,
  disconnect,
  formatDuration,
  getGuildPlaylists,
  getState,
  getYT,
  guilds,
  moveInQueue,
  playSong,
  previousTrack,
  removeFromQueue,
  removePlayerUI,
  resolveSong,
  saveGuildPlaylists,
  saveQueue,
  seekTo,
  sendPlayerUI,
  setLoop,
  setVolume,
  shuffleQueue,
  skip,
  startProgressTimer,
  states,
  stop,
  stopProgressTimer,
};
