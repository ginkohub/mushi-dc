/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { formatDuration, getState } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const state = getState(guild.id);
  if (state.songs.length === 0 && !state.current) return await c.reply('Queue is empty.');

  const lines = [];

  if (state.current) {
    lines.push(`**Now Playing:** ${state.current.title} (${formatDuration(state.current.duration)})`);
  }

  if (state.songs.length > 0) {
    const list = state.songs.map((s, i) => `**${i + 1}.** ${s.title} (${formatDuration(s.duration)})`).join('\n');
    lines.push(`**Queue (${state.songs.length}):**\n${list}`);
  }

  await c.reply(lines.join('\n\n'));
}

const queueSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current song queue')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [queueSlash];
