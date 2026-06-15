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

const t = translate({
  en: {
    help: 'Use `/pinterest <query>` to get Pinterest images.',
    not_found: 'No results found for "{query}".',
    header: 'Pinterest results for "{query}"',
  },
  id: {
    help: 'Gunakan `/pinterest <query>` untuk gambar Pinterest.',
    not_found: 'Tidak ada hasil untuk "{query}".',
    header: 'Hasil Pinterest untuk "{query}"',
  },
});

async function pinterest(c) {
  const args = c.event.options.getString('query') || '';
  if (!args || args === '?') return await c.reply(t('help', {}, c));
  const limit = 5;
  await c.react('⏳');
  try {
    const data = await Browser.json(
      `https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(args)}&type=image`,
    );
    if (!data?.status || !data.data?.length) return await c.reply(t('not_found', { query: args }, c));
    const items = data.data.slice(0, limit);
    await c.reply({
      content: `${data.data.length} results found for "${args}"`,
      files: items.map((i) => i.image_url),
    });
  } catch {
    await c.react('❌');
  }
}

export default [
  {
    roles: [Role.GUEST],
    data: new SlashCommandBuilder()
      .setName('pinterest')
      .setDescription('Search Pinterest images')
      .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true))
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: pinterest,
  },
];
