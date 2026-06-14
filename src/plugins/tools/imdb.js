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

const searchCache = new Map();

async function searchIMDb(c) {
  const query = (c.args || '').trim();
  if (!query) return await c.react('❌');
  try {
    const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`);
    if (!res.ok) return await c.reply('Search failed.');
    const data = await res.json();
    const results = data.d?.filter((r) => r.id?.startsWith('tt')) || [];
    if (results.length === 0) return await c.reply('No results.');
    const top = results.slice(0, 5);
    const lines = top.map((r, i) => {
      const year = r.y ? ` (${r.y})` : '';
      const type = r.q ? ` [${r.q}]` : '';
      return `**${i + 1}.** ${r.l}${year}${type}`;
    });
    lines.push('', 'Reply with a number to see details.');
    const sent = await c.reply(lines.join('\n'));
    searchCache.set(sent.id, top);
  } catch {
    await c.react('❌');
  }
}

export default [
  {
    cmd: ['imdb', 'movie', 'film'],
    cat: 'tools',
    desc: 'Search movies and TV shows on IMDb. Reply with a number for details.',
    roles: [Role.USER],
    exec: searchIMDb,
  },
  {
    exec: async (c) => {
      const msg = c.event;
      if (!msg.content || msg.author.id !== c.client()?.user?.id) return;
      const num = parseInt(msg.content, 10);
      if (Number.isNaN(num) || num < 1) return;
      const ref = msg.reference;
      if (!ref?.messageId) return;
      const results = searchCache.get(ref.messageId);
      if (!results || num > results.length) return;
      const item = results[num - 1];
      try {
        const page = await fetch(`https://www.imdb.com/title/${item.id}/`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const html = await page.text();
        const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        const ld = ldMatch ? JSON.parse(ldMatch[1]) : {};
        const rating = ld.aggregateRating?.ratingValue || 'N/A';
        const plot = ld.description || 'N/A';
        const genre = Array.isArray(ld.genre) ? ld.genre.join(', ') : ld.genre || 'N/A';
        const runtime = ld.duration || '';
        const year = item.y ? ` (${item.y})` : '';
        const cast = item.s ? `\n⭐ ${item.s}` : '';
        const lines = [
          `**${item.l}**${year}`,
          `🎬 ${genre}`,
          runtime ? `⏱ ${runtime.replace('PT', '').replace('H', 'h ').replace('M', 'm')}` : '',
          `⭐ **${rating}**/10`,
          '',
          plot.slice(0, 500),
          cast,
          '',
          `https://imdb.com/title/${item.id}`,
        ];
        await c.reply(lines.filter(Boolean).join('\n'));
        searchCache.delete(ref.messageId);
      } catch {
        await c.react('❌');
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('imdb')
      .setDescription('Search movies and TV shows on IMDb')
      .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true))
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: async (c) => {
      c.args = c.event.options.getString('query') || '';
      await searchIMDb(c);
    },
  },
];
