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
import { Browser, matchSource, pen, Role, resolvePlaylist } from '#mushi';
import {
  connect,
  formatDuration,
  getState,
  getTrackKey,
  getYT,
  isDuplicateTrack,
  playSong,
  resolveSong,
  sendPlayerUI,
} from './_player.js';

/** Queue-only: state.tracks is ephemeral memory, never synced to saved playlists. */
function ensureActive(guild, channel) {
  const state = getState(guild.id);
  if (!state.textChannel && channel) state.textChannel = channel;
  return state;
}

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
    const state = ensureActive(guild, c.event.channel);

    const isUrl = /^https?:\/\//.test(query);
    const matched = isUrl ? matchSource(query) : null;
    const isPlaylist =
      /youtube\.com\/playlist\?list=/.test(query) ||
      /(?:youtube\.com|youtu\.be)\/.*[?&]list=([a-zA-Z0-9_-]+)/.test(query) ||
      (matched?.id === 'spotify' && /\/(playlist|album)\//.test(query));

    if (isUrl && isPlaylist) {
      const entries = await resolvePlaylist(query);
      if (!entries.length) {
        await c.event.editReply('No results found.');
        return;
      }
      const limit = 50;
      const items = entries.slice(0, limit);
      const existingKeys = new Set(state.tracks.map(getTrackKey));
      const newTracks = [];
      for (const e of items) {
        const track = {
          url: e.url,
          title: e.title || 'Unknown',
          duration: e.duration || 0,
          thumbnail: e.thumbnail || null,
          source: e.source,
          requester: c.senderId,
        };
        const key = getTrackKey(track);
        if (key && !existingKeys.has(key)) {
          existingKeys.add(key);
          newTracks.push(track);
        }
      }

      if (newTracks.length === 0) {
        await c.event.editReply('All songs from this URL are already in the queue.');
        return;
      }

      state.tracks.push(...newTracks);

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
      const msg = `Added **${newTracks.length}** songs to the queue${skippedText}${limitText}.`;
      await c.event.editReply(msg);
    } else {
      const song = await resolveSong(query);
      if (!song) {
        await c.event.editReply('No results found.');
        return;
      }
      song.requester = c.senderId;

      const isPlaying = state.current !== null && state.player.state.status !== AudioPlayerStatus.Idle;
      if (isDuplicateTrack(song, state.tracks)) {
        await c.event.editReply(`**${song.title}** is already in the queue.`);
        return;
      }

      state.tracks.push(song);

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
        ? `Added to queue: **${song.title}** (${formatDuration(song.duration)})`
        : `Now playing: **${song.title}** (${formatDuration(song.duration)})`;

      await c.event.editReply(msg);
    }
  } catch (err) {
    pen.Error('Music-Play', err);
    try {
      await c.event.editReply('❌');
      await c.event.followUp({
        content: 'Failed to process your request. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
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

const playOption = (o) =>
  o.setName('query').setDescription('URL or search query').setRequired(true).setAutocomplete(true);

const playContexts = (b) =>
  b
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

const playSlash = {
  roles: [Role.GUEST],
  autocomplete,
  data: playContexts(
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song from YouTube (URL or search)')
      .addStringOption(playOption),
  ),
  exec,
};

export default [playSlash];
