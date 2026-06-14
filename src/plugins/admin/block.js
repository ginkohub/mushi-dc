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

async function blockUser(c) {
 const target = c.isSlash
  ? await c
     .client()
     .users.fetch(c.argv.user)
     .catch(() => null)
  : c.event.mentions?.users?.first();
 if (!target) return await c.reply('Specify a user to block.');
 await c.handler().updateBlock(target.id, 'block');
 c.handler().userManager.updateUser(target.id, { banned: true, bannedAt: new Date().toISOString() });
 await c.reply(`Blocked ${target.username}.`);
}

async function unblockUser(c) {
 const target = c.isSlash
  ? await c
     .client()
     .users.fetch(c.argv.user)
     .catch(() => null)
  : c.event.mentions?.users?.first();
 if (!target) return await c.reply('Specify a user to unblock.');
 await c.handler().updateBlock(target.id, 'unblock');
 c.handler().userManager.updateUser(target.id, { banned: false, bannedAt: null });
 await c.reply(`Unblocked ${target.username}.`);
}

export default [
 {
  cmd: ['block', 'b'],
  cat: 'admin',
  desc: 'Block a user',
  roles: [Role.ADMIN],
  exec: blockUser,
 },
 {
  cmd: ['unblock', 'ub'],
  cat: 'admin',
  desc: 'Unblock a user',
  roles: [Role.ADMIN],
  exec: unblockUser,
 },
 {
  roles: [Role.ADMIN],
  data: new SlashCommandBuilder()
   .setName('block')
   .setDescription('Block a user')
   .addUserOption((o) => o.setName('user').setDescription('User to block').setRequired(true))
   .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
   .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: blockUser,
 },
 {
  roles: [Role.ADMIN],
  data: new SlashCommandBuilder()
   .setName('unblock')
   .setDescription('Unblock a user')
   .addUserOption((o) => o.setName('user').setDescription('User to unblock').setRequired(true))
   .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
   .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: unblockUser,
 },
];
