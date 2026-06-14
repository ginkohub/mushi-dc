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
import { Role, translate } from '#mushi';

const t = translate({
 en: {
  header: '--- MUSHI MENU ---',
  footer: 'Use {prefix}command for details',
  category: 'Category',
  total: 'Total Commands',
 },
 id: {
  header: '--- MENU MUSHI ---',
  footer: 'Gunakan {prefix}command untuk detail',
  category: 'Kategori',
  total: 'Total Perintah',
 },
});

async function showMenu(c) {
 const handler = c.handler();
 const categories = {};
 const prefix = c.prefix;

 for (const [_id, plugin] of handler.plugins) {
  if (!plugin.cmd || plugin.hidden) continue;
  const cat = plugin.cat || 'uncategorized';
  if (!categories[cat]) categories[cat] = [];
  categories[cat].push(plugin.cmd[0]);
 }

 const menu = [t('header', {}, c), ''];
 for (const [cat, cmds] of Object.entries(categories)) {
  menu.push(`[ ${cat.toUpperCase()} ]`);
  menu.push(`> ${cmds.map((cmd) => `\`${cmd}\``).join(', ')}`);
  menu.push('');
 }

 menu.push(`${t('total', {}, c)}: ${handler.plugins.size}`);
 menu.push(t('footer', { prefix }, c));
 await c.reply(menu.join('\n').trim());
}

export default [
 {
  cmd: ['menu', 'help', 'h'],
  cat: 'system',
  desc: 'Show all available commands',
  roles: [Role.USER],
  exec: showMenu,
 },
 {
  data: new SlashCommandBuilder()
   .setName('menu')
   .setDescription('Show all available commands')
   .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
   .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: showMenu,
 },
];
