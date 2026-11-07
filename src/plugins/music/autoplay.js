/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 *
 * /autoplay — hands-off music: starts playing without a query and keeps
 * picking related tracks after each one ends. Stops when the voice
 * channel is empty (seen via VoiceStateUpdate dispatched by handle()).
 */

import { AudioPlayerStatus } from '@discordjs/voice';
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { resolveSong } from '#mushi/sources.js';
import { clearQueue, disconnect, formatDuration, getState, getStay, sendPlayerUI, startAutoplay } from './_player.js';
import { playAutocomplete } from './play.js';

async function execSlash(c) {
  const guild = c.event.guild;
  if (!guild) return await c.reply('Autoplay works in servers only.');

  const voiceChannel = c.event.member?.voice?.channel;
  if (!voiceChannel) return await c.reply('You must be in a voice channel.');

  const state = getState(guild.id);
  if (!state.textChannel) state.textChannel = c.event.channel; /* player UI lives where /autoplay was called */
  if (state.autoplay) return await c.reply('Autoplay is already **on**.');

  const wasConnected = !!state.connection;
  await c.event.deferReply();

  try {
    let seed = null;
    const query = (c.event.options.getString('query') || '').trim();
    if (query) {
      seed = await resolveSong(query);
      if (!seed) return await c.event.editReply('No results found.');
      seed.requester = c.senderId;
    }

    const isPlaying = state.current !== null && state.player.state.status !== AudioPlayerStatus.Idle;
    if (isPlaying) {
      state.autoplay = true;
      if (seed) {
        /* Playing something else: seed goes into the queue, mix picks up after it */
        state.tracks.push(seed);
        await sendPlayerUI(state);
        await c.event.editReply(
          `Autoplay is **on** — seed queued: **${seed.title}**. I keep going after every song ends.`,
        );
      } else {
        await c.event.editReply('Autoplay is **on**: after the queue ends, I keep picking related songs.');
      }
      return;
    }

    /* Idle (or nothing joined): join/reuse the channel and play the seed (or a fresh pick) */
    const track = await startAutoplay(guild, voiceChannel, seed);
    await c.event.editReply(
      `Autoplay is **on** in <#${voiceChannel.id}> — ${seed ? 'seeded' : 'now playing'} **${track.title}** (${formatDuration(track.duration)}). ` +
        'I keep going until the channel is empty.',
    );
  } catch {
    state.autoplay = false;
    if (!wasConnected) disconnect(guild.id);
    await c.event.editReply('Could not find a song to start. Try again later.');
  }
}

/** Listener branch: radio stops when nobody is left in the bot's voice channel. */
async function execListener(c) {
  if (c.eventType !== 'voiceStateUpdate') return;
  const newState = c.event;
  const guild = newState?.guild;
  if (!guild) return;

  const state = getState(guild.id);
  if (!state.autoplay) return;

  const channelId = state.connection?.joinConfig?.channelId;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isVoiceBased?.()) return;
  if (channel.members.filter((m) => !m.user.bot).size > 0) return;

  /* Channel empty: radio off. Stay mode keeps the connection, otherwise leave. */
  state.autoplay = false;
  if (getStay(guild.id) || state.stayChannelId) {
    clearQueue(guild.id);
  } else {
    disconnect(guild.id);
  }
}

const autoplaySlash = {
  roles: [Role.GUEST],
  autocomplete: playAutocomplete,
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Start playing music without a query and keep going')
    .addStringOption((o) =>
      o.setName('query').setDescription('Seed song (URL or search query)').setRequired(false).setAutocomplete(true),
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),
  exec: execSlash,
};

const autoplayListener = {
  roles: [Role.GUEST],
  exec: execListener,
};

export default [autoplaySlash, autoplayListener];
