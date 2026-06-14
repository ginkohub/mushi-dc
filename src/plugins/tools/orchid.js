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

export default {
 cmd: ['orchid', 'ojf'],
 cat: 'tools',
 desc: 'Search academic journals and articles via CrossRef',
 roles: [Role.USER],
 data: new SlashCommandBuilder()
  .setName('orchid')
  .setDescription('Search academic journals and articles via CrossRef')
  .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true))
  .addIntegerOption((o) => o.setName('max').setDescription('Max results (1-10)').setMinValue(1).setMaxValue(10))
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
 exec: async (c) => {
  if (c.isSlash) {
   const query = c.event.options.getString('query') || '';
   const max = c.event.options.getInteger('max');
   c.args = max ? `-n ${max} ${query}` : query;
  }
  const args = (c.args || '').trim();
  const maxMatch = args.match(/(?:^|\s)(?:-n|--max)\s+(\d+)(?:\s|$)/);
  const maxRows = Math.min(Math.max(parseInt(maxMatch?.[1], 10) || 10, 1), 10);
  const query = args.replace(/(?:^|\s)(?:-n|--max)\s+\d+(?:\s|$)/, ' ').trim();
  if (!query) return await c.react('❌');
  try {
   const res = await fetch(
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${maxRows}&sort=relevance`,
    { headers: { 'User-Agent': 'MushiBot/1.0 (mailto:bot@example.com)' } },
   );
   if (!res.ok) return await c.reply('Search failed.');
   const data = await res.json();
   const items = data.message?.items;
   if (!items?.length) return await c.reply('No results.');
   const top = items.slice(0, maxRows);
   const total = data.message['total-results'] || items.length;
   const lines = [`**${total}** results found for "${query}"`];
   top.forEach((r, i) => {
    const author = r.author?.[0] ? `${r.author[0].family || ''}, ${r.author[0].given || ''}` : 'Unknown';
    const year =
     r['published-print']?.date?.parts?.[0] ||
     r['published-online']?.date?.parts?.[0] ||
     r.created?.date?.parts?.[0] ||
     'n.d.';
    const link = r.DOI ? `https://doi.org/${r.DOI}` : '';
    const linkStr = link ? (i === 0 ? `\n   ${link}` : `\n   <${link}>`) : '';
    lines.push(`**${i + 1}.** ${r.title?.[0] || 'Untitled'} — *${author}* (${year})${linkStr}`);
   });
   await c.reply(lines.join('\n'));
  } catch {
   await c.react('❌');
  }
 },
};
