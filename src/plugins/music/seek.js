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
import { formatDuration, getState, seekTo } from './_player.js';

function parsePosition(str) {
  str = str.trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  const secs = Number(str);
  return Number.isNaN(secs) ? null : secs;
}

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const position = parsePosition(c.event.options.getString('position') || '');
  if (position == null || position < 0) {
    return await c.reply('Please provide a valid position (e.g. `90` or `1:30`).');
  }

  const state = getState(guild.id);
  if (!state.current) return await c.reply('Nothing is currently playing.');
  if (!state.current.duration) return await c.reply('Cannot seek on a live stream.');

  const clamped = Math.min(position, state.current.duration);
  const ok = await seekTo(guild, clamped);
  if (!ok) return await c.reply('Failed to seek.');

  await c.reply(`Seeked to **${formatDuration(clamped)}** of **${state.current.title}**`);
}

const seekSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a position in the current song')
    .addStringOption((o) => o.setName('position').setDescription('Position (e.g. 90 or 1:30)').setRequired(true))
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [seekSlash];
