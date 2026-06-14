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

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

async function autoQuery(m) {
  const query = m.options.getFocused();
  if (!query || query.length < 2) return await m.respond([]);
  try {
    const res = await fetch(
      `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=10`,
    );
    const data = await res.json();
    const choices = (data.query?.search || []).map((p) => ({ name: p.title.slice(0, 100), value: p.title }));
    await m.respond(choices);
  } catch {
    await m.respond([]);
  }
}

async function wiki(c) {
  const query = c.isSlash ? c.event.options.getString('query') || '' : (c.args || '').trim();
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
    cmd: ['wiki', 'wikipedia'],
    cat: 'tools',
    desc: 'Search Wikipedia for a topic',
    roles: [Role.USER],
    exec: wiki,
  },
  {
    roles: [Role.USER],
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
