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

const ago = (ms) => {
 const s = Math.floor(ms / 1000);
 if (s < 60) return `${s}s`;
 const m = Math.floor(s / 60);
 if (m < 60) return `${m}m`;
 const h = Math.floor(m / 60);
 return `${h}h`;
};

export default [
 {
  cmd: ['afk'],
  cat: 'tools',
  desc: 'Set yourself as AFK with optional reason',
  roles: [Role.USER],
  exec: async (c) => {
   const reason = c.args?.trim() || 'AFK';
   c.handler().userManager.updateUser(c.senderId, {
    afk: { reason, since: Date.now() },
   });
   await c.reply(`You are now AFK: ${reason}`);
  },
 },
 {
  cmd: ['back'],
  cat: 'tools',
  desc: 'Remove AFK status',
  roles: [Role.USER],
  exec: async (c) => {
   c.handler().userManager.updateUser(c.senderId, { afk: null });
   await c.reply('Welcome back!');
  },
 },
 {
  exec: async (c) => {
   const msg = c.event;
   if (!msg?.author) return;
   const um = c.handler().userManager;
   const botId = c.client()?.user?.id;

   if (msg.author.id === botId) {
    const user = um.getUser(botId);
    if (user?.afk) {
     um.updateUser(botId, { afk: null });
    }
    return;
   }

   if (msg.mentions?.has?.(botId)) {
    const botData = um.getUser(botId);
    if (botData?.afk) {
     await msg.reply(`AFK: ${botData.afk.reason} (${ago(Date.now() - botData.afk.since)} ago)`);
    }
   }
  },
 },
 {
  data: new SlashCommandBuilder()
   .setName('afk')
   .setDescription('Set or remove AFK status')
   .addSubcommand((s) =>
    s
     .setName('set')
     .setDescription('Set yourself as AFK')
     .addStringOption((o) => o.setName('reason').setDescription('Reason for being AFK')),
   )
   .addSubcommand((s) => s.setName('back').setDescription('Remove AFK status'))
   .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
   .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: async (c) => {
   const sub = c.event.options.getSubcommand();
   if (sub === 'set') {
    const reason = c.event.options.getString('reason') || 'AFK';
    c.handler().userManager.updateUser(c.senderId, {
     afk: { reason, since: Date.now() },
    });
    await c.reply(`You are now AFK: ${reason}`);
   } else if (sub === 'back') {
    c.handler().userManager.updateUser(c.senderId, { afk: null });
    await c.reply('Welcome back!');
   }
  },
 },
];
