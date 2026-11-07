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
import { getState, skip } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const state = getState(guild.id);
  if (!state.current) return await c.reply('Nothing is currently playing.');

  const song = state.current;
  const upNext = state.songs[0] ?? null;
  skip(guild.id);

  /* Radio gap: the player embed shows "picking next song…" until the mix lands */
  await c.reply(
    upNext && upNext !== song
      ? `Skipped **${song.title}** — next up **${upNext.title}**`
      : `Skipped **${song.title}**${state.autoplay ? '' : ' — queue empty'}`,
  );
}

const skipSlash = {
  roles: [Role.GUEST],
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing song')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [skipSlash];
