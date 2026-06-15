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

import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Browser, pen, Role } from '#mushi';
import { connect, formatDuration, getState, getYT, playSong, resolveSong } from './_player.js';

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
    const isPlaying = state.current !== null || state.songs.length > 0;

    if (!state.textChannel) state.textChannel = c.event.channel;

    const isUrl = /^https?:\/\//.test(query);
    const isPlaylist = /youtube\.com\/playlist\?list=/.test(query);

    if (isUrl && isPlaylist) {
      const entries = await yt.getPlaylistInfo(query);
      const limit = 50;
      const items = entries.slice(0, limit);
      for (const e of items) {
        state.songs.push({
          url: `https://youtube.com/watch?v=${e.id}`,
          title: e.title || 'Unknown',
          duration: e.duration || 0,
          thumbnail: e.thumbnail || null,
          requester: c.senderId,
        });
      }
      if (!isPlaying) {
        await connect(guild, voiceChannel);
        playSong(guild);
      }
      const msg = `Added **${items.length}** songs from playlist${items.length < entries.length ? ` (showing first ${limit})` : ''}.`;
      await c.event.editReply(msg);
    } else {
      const song = await resolveSong(query);
      if (!song) {
        await c.event.editReply('No results found.');
        return;
      }
      song.requester = c.senderId;

      state.songs.push(song);

      if (!isPlaying) {
        await connect(guild, voiceChannel);
        playSong(guild);
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
  roles: [Role.USER],
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
