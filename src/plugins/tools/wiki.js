/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 *
 * Credits:
 *   Wikipedia - https://wikipedia.org
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Browser, pen, Role, searchWiki } from '#mushi';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

async function autoQuery(m) {
  const query = m.options.getFocused();
  if (!query || query.length < 2) return await m.respond([]);
  try {
    const data = await Browser.json(
      `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=10`,
    );
    const choices = (data.query?.search || []).map((p) => ({ name: p.title.slice(0, 100), value: p.title }));
    await m.respond(choices);
  } catch (e) {
    pen.Error('wiki-autocomplete', e);
    await m.respond([]);
  }
}

async function wiki(c) {
  const query = c.event.options.getString('query') || '';
  if (!query) return await c.react('❌');
  try {
    const result = await searchWiki(query);
    if (!result) return await c.reply('Not found.');
    const reply = `**${result.title}**\n${(result.text || '').slice(0, 1900)}\n${result.url}`;
    await c.reply(reply);
  } catch {
    await c.react('❌');
  }
}

export default [
  {
    roles: [Role.GUEST],
    autocomplete: autoQuery,
    data: new SlashCommandBuilder()
      .setName('wiki')
      .setDescription('Search Wikipedia for a topic')
      .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true).setAutocomplete(true))
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: wiki,
  },
];
