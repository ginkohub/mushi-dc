/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 *
 * Credits: siputzx.my.id - unofficial YouTube search API
 */

import { AudioPlayerStatus } from '@discordjs/voice';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Browser, pen, Role } from '#mushi';
import {
  connect,
  formatDuration,
  getGuildPlaylists,
  getState,
  getTrackKey,
  getYT,
  isDuplicateTrack,
  playSong,
  resolveSong,
  saveGuildPlaylists,
  sendPlayerUI,
} from './_player.js';

async function exec(c) {
  const query = c.event.options.getString('query') || '';
  if (!query) return await c.react('❌');

  const voiceChannel = c.event.member?.voice?.channel;
  if (!voiceChannel) {
    await c.event.reply({ content: 'You must be in a voice channel.', flags: MessageFlags.Ephemeral });
    return;
  }

  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  await c.event.deferReply();

  try {
    const yt = await getYT();
    const state = getState(guild.id);

    if (!state.textChannel) state.textChannel = c.event.channel;

    const playlists = getGuildPlaylists(guild.id);
    if (!state.activePlaylist) {
      state.activePlaylist = 'default';
    }
    if (!playlists[state.activePlaylist]) {
      playlists[state.activePlaylist] = [];
      saveGuildPlaylists(guild.id, playlists);
    }
    if (state.tracks.length === 0 && playlists[state.activePlaylist].length > 0) {
      state.tracks = [...playlists[state.activePlaylist]];
    }

    const isUrl = /^https?:\/\//.test(query);
    const isPlaylist =
      /youtube\.com\/playlist\?list=/.test(query) ||
      /(?:youtube\.com|youtu\.be)\/.*[?&]list=([a-zA-Z0-9_-]+)/.test(query);

    if (isUrl && isPlaylist) {
      const entries = await yt.getPlaylistInfo(query);
      const limit = 50;
      const items = entries.slice(0, limit);
      const existingKeys = new Set([
        ...state.tracks.map(getTrackKey),
        ...(playlists[state.activePlaylist] || []).map(getTrackKey),
      ]);
      const newTracks = [];
      for (const e of items) {
        const track = {
          url: `https://youtube.com/watch?v=${e.id}`,
          title: e.title || 'Unknown',
          duration: e.duration || 0,
          thumbnail: e.thumbnail || null,
          requester: c.senderId,
        };
        const key = getTrackKey(track);
        if (key && !existingKeys.has(key)) {
          existingKeys.add(key);
          newTracks.push(track);
        }
      }

      if (newTracks.length === 0) {
        await c.event.editReply('All songs from this playlist are already in the queue.');
        return;
      }

      state.tracks.push(...newTracks);
      playlists[state.activePlaylist].push(...newTracks);
      saveGuildPlaylists(guild.id, playlists);

      const isPlaying = state.current !== null && state.player.state.status !== AudioPlayerStatus.Idle;
      if (!isPlaying) {
        if (state.currentIndex === -1 || state.currentIndex >= state.tracks.length) {
          state.currentIndex = state.tracks.length - newTracks.length;
        }
        await connect(guild, voiceChannel);
        playSong(guild);
      } else {
        await sendPlayerUI(state);
      }
      const skippedCount = items.length - newTracks.length;
      const skippedText = skippedCount > 0 ? ` (${skippedCount} duplicate(s) skipped)` : '';
      const limitText = items.length < entries.length ? ` (showing first ${limit})` : '';
      const msg = `Added **${newTracks.length}** songs to playlist **${state.activePlaylist}**${skippedText}${limitText}.`;
      await c.event.editReply(msg);
    } else {
      const song = await resolveSong(query);
      if (!song) {
        await c.event.editReply('No results found.');
        return;
      }
      song.requester = c.senderId;

      const isPlaying = state.current !== null && state.player.state.status !== AudioPlayerStatus.Idle;
      const activeQueue = isPlaying && state.currentIndex >= 0 ? state.tracks.slice(state.currentIndex) : [];
      if (activeQueue.length > 0 && isDuplicateTrack(song, activeQueue)) {
        await c.event.editReply(`**${song.title}** is already in the queue.`);
        return;
      }

      const isNamedPlaylist = state.activePlaylist && state.activePlaylist !== 'default';
      if (isNamedPlaylist && isDuplicateTrack(song, playlists[state.activePlaylist])) {
        await c.event.editReply(`**${song.title}** is already in playlist **${state.activePlaylist}**.`);
        return;
      }

      state.tracks.push(song);
      playlists[state.activePlaylist].push(song);
      saveGuildPlaylists(guild.id, playlists);

      if (!isPlaying) {
        if (state.currentIndex === -1 || state.currentIndex >= state.tracks.length) {
          state.currentIndex = state.tracks.length - 1;
        }
        await connect(guild, voiceChannel);
        playSong(guild);
      } else {
        await sendPlayerUI(state);
      }

      const msg = isPlaying
        ? `Added to playlist **${state.activePlaylist}**: **${song.title}** (${formatDuration(song.duration)})`
        : `Now playing: **${song.title}** (${formatDuration(song.duration)})`;

      await c.event.editReply(msg);
    }
  } catch (err) {
    pen.Error('Music-Play', err);
    try {
      await c.event.editReply('❌');
      await c.event.followUp({ content: `Error: ${err.message}`, flags: MessageFlags.Ephemeral });
    } catch {
      /* ignore */
    }
  }
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

const SIPUT_API = 'https://api.siputzx.my.id/api/s/youtube';

async function autocomplete(event, signal) {
  const query = event.options.getFocused();
  if (!query || query.length < 3) return [];

  const siput = Browser.json(`${SIPUT_API}?query=${encodeURIComponent(query)}`, { signal }).then((d) => {
    if (!d?.status || !d.data?.length) throw new Error('no siput results');
    return d.data.slice(0, 5).map((r) => ({ name: (r.title || r.name || '').substring(0, 100), value: r.url }));
  });

  const ytdlp = getYT()
    .then((yt) => Promise.race([yt.search(query, 5), timeout(2000)]))
    .then((r) => {
      if (!r?.length) throw new Error('no ytdlp results');
      return r
        .filter((r) => r.title)
        .map((r) => ({ name: r.title.substring(0, 100), value: r.url || `https://youtube.com/watch?v=${r.id}` }));
    });

  try {
    return await Promise.any([siput, ytdlp]);
  } catch {
    return [];
  }
}

const playSlash = {
  roles: [Role.GUEST],
  autocomplete,
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from YouTube (URL or search)')
    .addStringOption((o) =>
      o.setName('query').setDescription('URL or search query').setRequired(true).setAutocomplete(true),
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [playSlash];
