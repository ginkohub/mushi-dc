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

async function serverInfo(c) {
  const guild = c.event.guild;
  if (!guild) return await c.reply('This command only works in a server.');

  const owner = await guild.fetchOwner().catch(() => null);
  const lines = [
    `Name: ${guild.name}`,
    `ID: ${guild.id}`,
    `Owner: ${owner?.user?.tag || 'Unknown'}`,
    `Members: ${guild.memberCount}`,
    `Channels: ${guild.channels.cache.size}`,
    `Roles: ${guild.roles.cache.size}`,
    `Created: ${guild.createdAt.toLocaleDateString()}`,
    `Boost Level: ${guild.premiumTier || 'None'}`,
  ];

  await c.reply(lines.join('\n'));
}

export default [
  {
    data: new SlashCommandBuilder()
      .setName('server')
      .setDescription('Show current guild/server info')
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: serverInfo,
  },
];
