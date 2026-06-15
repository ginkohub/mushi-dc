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
 *   siputzx.my.id - unofficial API aggregator
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Browser, Role, translate } from '#mushi';

const API = 'https://api.siputzx.my.id/api/s';

const t = translate({
  en: {
    help: 'Use `/search web <query>` to search web.\n`/search yt <query>` for YouTube.\n`/search gsm <query>` for GSMArena.',
    not_found: 'No results.',
    yt_result: '[{title}]({url})',
    gsm_result: '**{name}**\n{description}',
  },
  id: {
    help: 'Gunakan `/search web <query>` untuk cari web.\n`/search yt <query>` untuk YouTube.\n`/search gsm <query>` untuk GSMArena.',
    not_found: 'Tidak ada hasil.',
    yt_result: '[{title}]({url})',
    gsm_result: '**{name}**\n{description}',
  },
});

async function search(c) {
  if (c.isSlash) {
    const sub = c.event.options.getSubcommand();
    const query = c.event.options.getString('query');
    c.args = `${sub} ${query}`;
  }
  let args = (c.args || '').trim();
  if (!args || args === '?') return await c.reply(t('help', {}, c));

  const maxMatch = args.match(/(?:^|\s)-n\s+(\d+)(?:\s|$)/);
  const limit = Math.min(Math.max(parseInt(maxMatch?.[1], 10) || 5, 1), 10);
  args = args.replace(/(?:^|\s)-n\s+\d+(?:\s|$)/, ' ').trim();

  await c.react('⏳');

  try {
    const parts = args.split(/\s+/);
    const engine = parts[0].toLowerCase();
    const query = parts.slice(1).join(' ');

    if (engine === 'yt' && query) {
      const data = await Browser.json(`${API}/youtube?query=${encodeURIComponent(query)}`);
      if (!data?.status || !data.data?.length) return await c.reply(t('not_found', {}, c));
      const items = data.data.slice(0, limit);
      const lines = items.map((i) => t('yt_result', { title: i.title || i.name, url: i.url }, c));
      return await c.reply(lines.join('\n\n'));
    }

    if (engine === 'gsm' && query) {
      const data = await Browser.json(`${API}/gsmarena?query=${encodeURIComponent(query)}`);
      if (!data?.status || !data.data?.length) return await c.reply(t('not_found', {}, c));
      const items = data.data.slice(0, limit);
      const lines = items.map((i) =>
        t('gsm_result', { name: i.name, description: (i.description || '').slice(0, 200) }, c),
      );
      return await c.reply(lines.join('\n\n'));
    }

    const data = await Browser.json(`${API}/duckduckgo?query=${encodeURIComponent(args)}`);
    if (!data?.status || !data.data?.results?.length) return await c.reply(t('not_found', {}, c));
    const items = data.data.results.slice(0, limit);
    const lines = items.map((i) => `[${i.title}](${i.url})\n${i.snippet}`);
    return await c.reply(`${data.data.results.length} results found\n\n${lines.join('\n\n').slice(0, 1900)}`);
  } catch {
    await c.react('❌');
  }
}

export default [
  {
    roles: [Role.GUEST],
    data: new SlashCommandBuilder()
      .setName('search')
      .setDescription('Search web, YouTube, or GSMArena')
      .addSubcommand((s) =>
        s
          .setName('web')
          .setDescription('Search the web')
          .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('yt')
          .setDescription('Search YouTube')
          .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('gsm')
          .setDescription('Search GSMArena')
          .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true)),
      )
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: search,
  },
];
