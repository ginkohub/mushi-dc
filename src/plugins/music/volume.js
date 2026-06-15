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
import { getState, setVolume } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const state = getState(guild.id);

  const raw = c.event.options.getInteger('level');

  if (raw === null || Number.isNaN(raw)) {
    return await c.reply(`Current volume: **${Math.round(state.volume * 100)}%**`);
  }

  const vol = Math.max(0, Math.min(200, raw)) / 100;
  const actual = setVolume(guild.id, vol);

  await c.reply(`Volume set to **${Math.round(actual * 100)}%**`);
}

const volSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set or show playback volume (0-200)')
    .addIntegerOption((o) =>
      o.setName('level').setDescription('Volume level 0-200').setRequired(false).setMinValue(0).setMaxValue(200),
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [volSlash];
