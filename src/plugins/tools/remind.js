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

const pending = new Map();

async function remind(c) {
 const args = c.isSlash
  ? `${c.event.options.getString('duration')} ${c.event.options.getString('text')}`
  : c.args?.trim() || '';
 if (!args) return await c.react('❌');

 const match = args.match(/^(\d+)(s|m|h|d)\s+(.+)/i);
 if (!match) return await c.react('❌');

 const amount = Number.parseInt(match[1], 10);
 const unit = match[2].toLowerCase();
 const text = match[3];
 const ms = amount * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
 const channel = c.event.channel;
 const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

 await c.reply(`Reminder set for ${amount}${unit}: ${text}`);

 const timer = setTimeout(async () => {
  try {
   await channel.send(`Reminder: ${text}`);
  } catch {}
  pending.delete(id);
 }, ms);

 pending.set(id, timer);
}

export default [
 {
  cmd: ['remind', 'rm'],
  cat: 'tools',
  desc: 'Set a reminder (e.g. 10s, 5m, 2h, 1d)',
  roles: [Role.USER],
  exec: remind,
 },
 {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
   .setName('remind')
   .setDescription('Set a reminder (e.g. 10s, 5m, 2h, 1d)')
   .addStringOption((o) => o.setName('duration').setDescription('Duration (e.g. 10s, 5m, 2h, 1d)').setRequired(true))
   .addStringOption((o) => o.setName('text').setDescription('Reminder text').setRequired(true))
   .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
   .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: remind,
 },
];
