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
    usage: 'Usage: {prefix}lang [en|id]',
    current: 'Current language: *{lang}*',
    success: 'Language set to: *{lang}*',
    invalid: 'Invalid language. Available: en, id',
  },
  id: {
    usage: 'Penggunaan: {prefix}lang [en|id]',
    current: 'Bahasa saat ini: *{lang}*',
    success: 'Bahasa diatur ke: *{lang}*',
    invalid: 'Bahasa tidak valid. Tersedia: en, id',
  },
});

async function setLang(c) {
  const lang = c.event.options.getString('lang');
  const available = ['en', 'id'];

  if (!lang) {
    return await c.reply(`${t('current', { lang: c.lang }, c)}\n${t('usage', { prefix: c.prefix }, c)}`);
  }

  if (!available.includes(lang)) {
    return await c.reply(t('invalid', {}, c));
  }

  c.handler().userManager.updateUser(c.senderId, { lang });
  await c.reply(t('success', { lang }, c));
}

export default [
  {
    data: new SlashCommandBuilder()
      .setName('lang')
      .setDescription('Set your preferred language')
      .addStringOption((o) =>
        o
          .setName('lang')
          .setDescription('Language code (en/id)')
          .setRequired(true)
          .addChoices({ name: 'English', value: 'en' }, { name: 'Bahasa Indonesia', value: 'id' }),
      )
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: setLang,
  },
];
