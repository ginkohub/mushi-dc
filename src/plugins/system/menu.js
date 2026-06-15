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
import { translate } from '#mushi';

const t = translate({
  en: {
    header: '--- MUSHI MENU ---',
    category: 'Category',
    total: 'Total Commands',
  },
  id: {
    header: '--- MENU MUSHI ---',
    category: 'Kategori',
    total: 'Total Perintah',
  },
});

async function showMenu(c) {
  const handler = c.handler();
  const categories = {};

  for (const [_id, plugin] of handler.plugins) {
    if (!plugin.data || plugin.hidden) continue;
    const cat = plugin.cat || 'uncategorized';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(`/${plugin.data.name}`);
  }

  const menu = [t('header', {}, c), ''];
  for (const [cat, cmds] of Object.entries(categories)) {
    menu.push(`[ ${cat.toUpperCase()} ]`);
    menu.push(`> ${cmds.join(', ')}`);
    menu.push('');
  }

  menu.push(`${t('total', {}, c)}: ${handler.plugins.size}`);
  await c.reply(menu.join('\n').trim());
}

export default [
  {
    data: new SlashCommandBuilder()
      .setName('menu')
      .setDescription('Show all available commands')
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: showMenu,
  },
];
