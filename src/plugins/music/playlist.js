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
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Browser, Role } from '#mushi';
import {
  clearQueue,
  connect,
  dedupeTracks,
  formatDuration,
  getGuildPlaylists,
  getState,
  getTrackKey,
  getYT,
  isDuplicateTrack,
  playSong,
  removeFromQueue,
  resolveSong,
  saveGuildPlaylists,
  sendPlayerUI,
} from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  await c.event.deferReply();

  const uid = c.senderId;
  const playlists = getGuildPlaylists(guild.id);

  {
    const sub = c.event.options.getSubcommand();
    const name = c.event.options.getString('name')?.toLowerCase().trim();
    const query = c.event.options.getString('query');
    const index = c.event.options.getInteger('index');

    switch (sub) {
      case 'create': {
        if (!name) return await c.event.editReply('Name is required.');
        if (playlists[name]) return await c.event.editReply(`Playlist **${name}** already exists.`);
        playlists[name] = [];
        saveGuildPlaylists(guild.id, playlists);
        await c.event.editReply(`Created playlist **${name}**.`);
        break;
      }
      case 'delete': {
        if (!name || !playlists[name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const state = getState(guild.id);
        if (state.activePlaylist === name) {
          state.activePlaylist = null;
          clearQueue(guild.id);
        }
        delete playlists[name];
        saveGuildPlaylists(guild.id, playlists);
        await c.event.editReply(`Deleted playlist **${name}**.`);
        break;
      }
      case 'list': {
        const names = Object.keys(playlists);
        if (names.length === 0) return await c.event.editReply('There are no server playlists.');
        const state = getState(guild.id);
        const lines = names.map(
          (n) => `**${n}** (${playlists[n].length} songs)${state.activePlaylist === n ? ' *(active)*' : ''}`,
        );
        await c.event.editReply(`**Server playlists:**\n${lines.join('\n')}`);
        break;
      }
      case 'show': {
        if (!name || !playlists[name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const pl = playlists[name];
        if (pl.length === 0) return await c.event.editReply(`Playlist **${name}** is empty.`);
        const state = getState(guild.id);
        const lines = pl.map((s, i) => {
          const isCurrent = state.activePlaylist === name && state.currentIndex === i;
          const marker = isCurrent ? '▶️ ' : '';
          return `**${marker}${i + 1}.** ${s.title} (${formatDuration(s.duration)})`;
        });
        await c.event.editReply(`**${name}** (${pl.length} songs):\n${lines.join('\n')}`);
        break;
      }
      case 'add': {
        if (!name || !query) return await c.event.editReply('Name and query are required.');
        if (!playlists[name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const song = await resolveSong(query);
        if (!song) return await c.event.editReply('No results found.');
        if (isDuplicateTrack(song, playlists[name])) {
          return await c.event.editReply(`**${song.title}** is already in playlist **${name}**.`);
        }
        song.requester = uid;
        playlists[name].push(song);
        saveGuildPlaylists(guild.id, playlists);

        const state = getState(guild.id);
        if (state.activePlaylist === name) {
          state.tracks.push(song);
          const isPlaying = state.current !== null && state.player.state.status !== AudioPlayerStatus.Idle;
          if (!isPlaying) {
            const voiceChannel = c.event.member?.voice?.channel;
            if (voiceChannel) {
              if (state.currentIndex === -1 || state.currentIndex >= state.tracks.length) {
                state.currentIndex = state.tracks.length - 1;
              }
              if (!state.textChannel) state.textChannel = c.event.channel;
              await connect(guild, voiceChannel);
              playSong(guild);
            }
          } else {
            await sendPlayerUI(state);
          }
        }

        await c.event.editReply(`Added **${song.title}** to **${name}**.`);
        break;
      }
      case 'dedupe': {
        if (!name || !playlists[name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const pl = playlists[name];
        if (pl.length === 0) return await c.event.editReply(`Playlist **${name}** is empty.`);
        const originalCount = pl.length;
        const deduped = dedupeTracks(pl);
        const removedCount = originalCount - deduped.length;
        if (removedCount === 0) {
          return await c.event.editReply(`Playlist **${name}** has no duplicates.`);
        }
        playlists[name] = deduped;
        saveGuildPlaylists(guild.id, playlists);

        const state = getState(guild.id);
        if (state.activePlaylist === name) {
          const currentSong = state.current;
          state.tracks = [...deduped];
          if (currentSong) {
            const newIdx = state.tracks.findIndex((t) => getTrackKey(t) === getTrackKey(currentSong));
            state.currentIndex = newIdx !== -1 ? newIdx : Math.min(state.currentIndex, state.tracks.length - 1);
          }
          await sendPlayerUI(state);
        }

        await c.event.editReply(`Removed **${removedCount}** duplicate(s) from playlist **${name}**.`);
        break;
      }
      case 'remove': {
        if (!name || index == null) return await c.event.editReply('Name and index are required.');
        if (!playlists[name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        if (index < 1 || index > playlists[name].length)
          return await c.event.editReply(`Index must be between 1 and ${playlists[name].length}.`);

        const state = getState(guild.id);
        let removed;
        if (state.activePlaylist === name) {
          removed = removeFromQueue(guild.id, index);
        } else {
          removed = playlists[name].splice(index - 1, 1)[0];
          saveGuildPlaylists(guild.id, playlists);
        }

        await c.event.editReply(`Removed **${removed?.title || `#${index}`}** from **${name}**.`);
        break;
      }
      case 'play': {
        if (!name || !playlists[name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const pl = playlists[name];
        if (pl.length === 0) return await c.event.editReply(`Playlist **${name}** is empty.`);

        const voiceChannel = c.event.member?.voice?.channel;
        if (!voiceChannel) return await c.event.editReply('You must be in a voice channel.');

        const state = getState(guild.id);
        if (!state.textChannel) state.textChannel = c.event.channel;

        state.activePlaylist = name;
        state.tracks = pl.map((s) => ({ ...s, requester: s.requester || uid }));
        state.currentIndex = 0;

        await connect(guild, voiceChannel);
        playSong(guild);

        await c.event.editReply(`Playing playlist **${name}** (${pl.length} songs).`);
        break;
      }
    }
  }
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

const SIPUT_API = 'https://api.siputzx.my.id/api/s/youtube';

async function autocomplete(m, signal) {
  const focused = m.options.getFocused(true);

  if (focused.name === 'query') {
    if (!focused.value || focused.value.length < 3) return [];
    const q = focused.value;
    const siput = Browser.json(`${SIPUT_API}?query=${encodeURIComponent(q)}`, { signal }).then((d) => {
      if (!d?.status || !d.data?.length) throw new Error('no siput results');
      return d.data.slice(0, 5).map((r) => ({ name: (r.title || r.name || '').substring(0, 100), value: r.url }));
    });

    const ytdlp = getYT()
      .then((yt) => Promise.race([yt.search(q, 5), timeout(2000)]))
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

  const playlists = getGuildPlaylists(m.guildId);
  const names = Object.keys(playlists);
  const filtered = focused.value ? names.filter((n) => n.includes(focused.value.toLowerCase())) : names;
  return filtered.slice(0, 10).map((n) => ({ name: n.slice(0, 100), value: n }));
}

const plSlash = {
  roles: [Role.GUEST],
  autocomplete,
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Manage saved playlists')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a new playlist')
        .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a playlist')
        .addStringOption((o) =>
          o.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List your playlists'))
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Show songs in a playlist')
        .addStringOption((o) =>
          o.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a song to a playlist')
        .addStringOption((o) =>
          o.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((o) =>
          o.setName('query').setDescription('URL or search query').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a song from a playlist')
        .addStringOption((o) =>
          o.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true),
        )
        .addIntegerOption((o) => o.setName('index').setDescription('Song index to remove').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('dedupe')
        .setDescription('Remove duplicate songs from a playlist')
        .addStringOption((o) =>
          o.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setDescription('Queue all songs from a playlist')
        .addStringOption((o) =>
          o.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true),
        ),
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [plSlash];
