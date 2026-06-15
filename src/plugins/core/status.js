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

async function status(c) {
  const m = c.event ?? c;

  const uptime = process.uptime();
  const memory = process.memoryUsage().rss / 1024 / 1024;
  await m.reply(`Uptime: ${uptime.toFixed(2)}s\nMemory: ${memory.toFixed(2)}MB`);
}

export default [
  {
    roles: [Role.GUEST],
    data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('Get bot status')
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: status,
  },
];
