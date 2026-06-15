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

import * as cheerio from 'cheerio';
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Browser, pen } from '#mushi';

const SEARCH_API = 'https://api.siputzx.my.id/api/s/duckduckgo';

function splitText(text, maxLen = 2000) {
  if (text.length <= maxLen) return [text];
  const splitLong = (s) => {
    const res = [];
    let i = 0;
    while (i < s.length) {
      let end = Math.min(i + maxLen, s.length);
      if (end < s.length) {
        const brk = s.lastIndexOf('\n', end);
        if (brk > i) end = brk;
      }
      res.push(s.slice(i, end).trim());
      i = end;
    }
    return res;
  };
  const parts = text.split(/\n\n+/);
  const chunks = [];
  let buf = '';
  for (const p of parts) {
    const next = buf ? `${buf}\n\n${p}` : p;
    if (next.length > maxLen) {
      if (buf) chunks.push(buf);
      if (p.length > maxLen) chunks.push(...splitLong(p));
      else buf = p;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function readArticle(c) {
  const url = (c.args || '').trim();
  if (!url) return await c.react('❌');
  await c.react('⏳');
  try {
    const html = await Browser.getText(url);
    const $ = cheerio.load(html);
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="title"]').attr('content') ||
      $('title').text() ||
      'Substack Article';
    const author = $('meta[name="author"]').attr('content') || 'Unknown';
    let content = '';
    const ldJson = $('script[type="application/ld+json"]').text();
    if (ldJson) {
      try {
        const parsed = JSON.parse(ldJson.trim());
        const body = parsed?.articleBody || '';
        if (body) content = body;
      } catch {}
    }
    if (!content) {
      const bodyEl = $('[class*="body-markup"]');
      if (bodyEl.length) content = bodyEl.html() || '';
    }
    if (!content) {
      const availEl = $('[class*="available-content"]');
      if (availEl.length) content = availEl.html() || '';
    }
    if (!content) {
      content = $('meta[property="og:description"]').attr('content') || 'Could not extract article content.';
    }
    if (content) {
      content = content
        .replace(/<\/?(?:p|br|div|h[1-6]|li|blockquote|tr|dt|dd|figcaption)\b[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    const header = [`**${title}**`, author ? `By *${author}*` : null].filter(Boolean).join('\n');
    const chunks = splitText(content, 1900);
    for (let i = 0; i < chunks.length; i++) {
      const msg = i === 0 ? `${header}\n\n${chunks[i]}` : chunks[i];
      if (i === 0) await c.reply(msg);
      else await c.send(msg);
    }
  } catch {
    await c.react('❌');
  }
}

async function searchPosts(c) {
  const query = (c.args || '').trim();
  if (!query) return await c.react('❌');
  await c.react('⏳');
  try {
    const data = await Browser.json(`${SEARCH_API}?query=${encodeURIComponent(`site:substack.com ${query}`)}`);
    if (!data?.status || !data.data?.results?.length) return await c.reply('No results found.');
    const items = data.data.results.slice(0, 5);
    const lines = items.map((r, i) => `**${i + 1}.** [${r.title}](${r.url})\n${r.snippet}`);
    await c.reply(`**Substack Search: ${query}**\n\n${lines.join('\n\n')}`.slice(0, 1900));
  } catch {
    await c.react('❌');
  }
}

async function autoStack(m, signal) {
  const sub = m.options.getSubcommand();
  if (sub !== 'search') return [];
  const query = m.options.getFocused();
  if (!query || query.length < 3) return [];
  try {
    const data = await Browser.json(`${SEARCH_API}?query=${encodeURIComponent(`site:substack.com ${query}`)}`, {
      signal,
    });
    return (data.data?.results || []).slice(0, 10).map((r) => ({
      name: r.title.slice(0, 100),
      value: r.title,
    }));
  } catch (e) {
    if (e.name !== 'AbortError') {
      pen.Error('stack-autocomplete', e);
    }
    return [];
  }
}

export default [
  {
    data: new SlashCommandBuilder()
      .setName('stack')
      .setDescription('Read or search Substack articles')
      .addSubcommand((s) =>
        s
          .setName('read')
          .setDescription('Read a Substack article')
          .addStringOption((o) => o.setName('url').setDescription('Article URL').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('search')
          .setDescription('Search Substack posts')
          .addStringOption((o) =>
            o.setName('query').setDescription('Search query').setRequired(true).setAutocomplete(true),
          ),
      )
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    autocomplete: autoStack,
    exec: async (c) => {
      const sub = c.event.options.getSubcommand();
      if (sub === 'read') {
        c.args = c.event.options.getString('url') || '';
        await readArticle(c);
      } else if (sub === 'search') {
        c.args = c.event.options.getString('query') || '';
        await searchPosts(c);
      }
    },
  },
];
