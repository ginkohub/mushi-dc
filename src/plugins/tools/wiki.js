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
import { Role, searchWiki } from '#mushi';

async function wiki(c) {
  let query;
  let lang;
  if (c.isSlash) {
    query = c.event.options.getString('query') || '';
    lang = c.event.options.getString('lang') || 'en';
  } else {
    const args = (c.args || '').trim();
    const langMatch = args.match(/(?:^|\s)(?:-l|--lang)\s+(\w+)(?:\s|$)/);
    lang = langMatch?.[1] || 'en';
    query = args.replace(/(?:^|\s)(?:-l|--lang)\s+\w+(?:\s|$)/, '').trim();
  }
  if (!query) return await c.react('❌');
  try {
    const result = await searchWiki(query, lang);
    if (!result) return await c.reply('Not found.');
    const reply = `**${result.title}**\n${(result.text || '').slice(0, 1900)}\n${result.url}`;
    await c.reply(reply);
  } catch {
    await c.react('❌');
  }
}

export default [
  {
    cmd: ['wiki', 'wikipedia'],
    cat: 'tools',
    desc: 'Search Wikipedia for a topic',
    roles: [Role.USER],
    exec: wiki,
  },
  {
    roles: [Role.USER],
    data: new SlashCommandBuilder()
      .setName('wiki')
      .setDescription('Search Wikipedia for a topic')
      .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true))
      .addStringOption((o) => o.setName('lang').setDescription('Language code (e.g. en, id, ja)'))
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: wiki,
  },
];
