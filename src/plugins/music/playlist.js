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

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role, read, write } from '#mushi';
import { connect, formatDuration, getState, getYT, playSong, resolveSong } from './_player.js';

function getPlaylists() {
  return read().playlists || {};
}

function savePlaylists(playlists) {
  const data = read();
  data.playlists = playlists;
  write(data);
}

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  await c.event.deferReply();

  const uid = c.senderId;
  const playlists = getPlaylists();
  if (!playlists[uid]) playlists[uid] = {};

  {
    const sub = c.event.options.getSubcommand();
    const name = c.event.options.getString('name')?.toLowerCase().trim();
    const query = c.event.options.getString('query');
    const index = c.event.options.getInteger('index');

    switch (sub) {
      case 'create': {
        if (!name) return await c.event.editReply('Name is required.');
        if (playlists[uid][name]) return await c.event.editReply(`Playlist **${name}** already exists.`);
        playlists[uid][name] = [];
        savePlaylists(playlists);
        await c.event.editReply(`Created playlist **${name}**.`);
        break;
      }
      case 'delete': {
        if (!name || !playlists[uid][name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        delete playlists[uid][name];
        savePlaylists(playlists);
        await c.event.editReply(`Deleted playlist **${name}**.`);
        break;
      }
      case 'list': {
        const names = Object.keys(playlists[uid]);
        if (names.length === 0) return await c.event.editReply('You have no playlists.');
        const lines = names.map((n) => `**${n}** (${playlists[uid][n].length} songs)`);
        await c.event.editReply(`**Your playlists:**\n${lines.join('\n')}`);
        break;
      }
      case 'show': {
        if (!name || !playlists[uid][name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const pl = playlists[uid][name];
        if (pl.length === 0) return await c.event.editReply(`Playlist **${name}** is empty.`);
        const lines = pl.map((s, i) => `**${i + 1}.** ${s.title} (${formatDuration(s.duration)})`);
        await c.event.editReply(`**${name}** (${pl.length} songs):\n${lines.join('\n')}`);
        break;
      }
      case 'add': {
        if (!name || !query) return await c.event.editReply('Name and query are required.');
        if (!playlists[uid][name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const song = await resolveSong(query);
        if (!song) return await c.event.editReply('No results found.');
        playlists[uid][name].push(song);
        savePlaylists(playlists);
        await c.event.editReply(`Added **${song.title}** to **${name}**.`);
        break;
      }
      case 'remove': {
        if (!name || index == null) return await c.event.editReply('Name and index are required.');
        if (!playlists[uid][name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        if (index < 1 || index > playlists[uid][name].length)
          return await c.event.editReply(`Index must be between 1 and ${playlists[uid][name].length}.`);
        const removed = playlists[uid][name].splice(index - 1, 1)[0];
        savePlaylists(playlists);
        await c.event.editReply(`Removed **${removed.title}** from **${name}**.`);
        break;
      }
      case 'play': {
        if (!name || !playlists[uid][name]) return await c.event.editReply(`Playlist **${name}** not found.`);
        const pl = playlists[uid][name];
        if (pl.length === 0) return await c.event.editReply(`Playlist **${name}** is empty.`);

        const voiceChannel = c.event.member?.voice?.channel;
        if (!voiceChannel) return await c.event.editReply('You must be in a voice channel.');

        const state = getState(guild.id);
        const isPlaying = state.current !== null || state.songs.length > 0;

        if (!state.textChannel) state.textChannel = c.event.channel;

        for (const s of pl) {
          state.songs.push({ ...s, requester: uid });
        }

        if (!isPlaying) {
          await connect(guild, voiceChannel);
          playSong(guild);
        }

        await c.event.editReply(`Queued **${pl.length}** songs from **${name}**.`);
        break;
      }
    }
  }
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

const SIPUT_API = 'https://api.siputzx.my.id/api/s/youtube';

async function autocomplete(m) {
  const focused = m.options.getFocused(true);

  if (focused.name === 'query') {
    if (!focused.value || focused.value.length < 2) return await m.respond([]);
    const q = focused.value;
    const siput = fetch(`${SIPUT_API}?query=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0' },
    })
      .then((r) => r.json())
      .then((d) => {
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
      const result = await Promise.race([siput, ytdlp, timeout(2500)]);
      await m.respond(result).catch(() => {});
    } catch {
      m.respond([]).catch(() => {});
    }
    return;
  }

  const uid = m.user.id;
  const playlists = read().playlists?.[uid] || {};
  const names = Object.keys(playlists);
  const filtered = focused.value ? names.filter((n) => n.includes(focused.value.toLowerCase())) : names;
  const choices = filtered.slice(0, 10).map((n) => ({ name: n.slice(0, 100), value: n }));
  await m.respond(choices).catch(() => {});
}

const plSlash = {
  roles: [Role.USER],
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
