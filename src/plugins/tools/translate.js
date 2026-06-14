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
import { Role, read, translate, translateText, write } from '#mushi';

const t = translate({
  en: {
    usage:
      "Usage: {prefix}tr [lang] [-e google|libre] <text>\n       {prefix}tr? — show this help\n       {prefix}tra <lang> <user> — auto-translate user's messages",
  },
  id: {
    usage:
      'Penggunaan: {prefix}tr [lang] [-e google|libre] <teks>\n       {prefix}tr? — bantuan ini\n       {prefix}tra <lang> <user> — auto-translate pesan user',
  },
});

const LANGUAGES = [
  { name: 'Afrikaans', value: 'af' },
  { name: 'Albanian', value: 'sq' },
  { name: 'Arabic', value: 'ar' },
  { name: 'Armenian', value: 'hy' },
  { name: 'Azerbaijani', value: 'az' },
  { name: 'Basque', value: 'eu' },
  { name: 'Belarusian', value: 'be' },
  { name: 'Bengali', value: 'bn' },
  { name: 'Bosnian', value: 'bs' },
  { name: 'Bulgarian', value: 'bg' },
  { name: 'Catalan', value: 'ca' },
  { name: 'Cebuano', value: 'ceb' },
  { name: 'Chinese (Simplified)', value: 'zh-CN' },
  { name: 'Chinese (Traditional)', value: 'zh-TW' },
  { name: 'Croatian', value: 'hr' },
  { name: 'Czech', value: 'cs' },
  { name: 'Danish', value: 'da' },
  { name: 'Dutch', value: 'nl' },
  { name: 'English', value: 'en' },
  { name: 'Esperanto', value: 'eo' },
  { name: 'Estonian', value: 'et' },
  { name: 'Finnish', value: 'fi' },
  { name: 'French', value: 'fr' },
  { name: 'Galician', value: 'gl' },
  { name: 'Georgian', value: 'ka' },
  { name: 'German', value: 'de' },
  { name: 'Greek', value: 'el' },
  { name: 'Gujarati', value: 'gu' },
  { name: 'Haitian Creole', value: 'ht' },
  { name: 'Hebrew', value: 'iw' },
  { name: 'Hindi', value: 'hi' },
  { name: 'Hungarian', value: 'hu' },
  { name: 'Icelandic', value: 'is' },
  { name: 'Indonesian', value: 'id' },
  { name: 'Irish', value: 'ga' },
  { name: 'Italian', value: 'it' },
  { name: 'Japanese', value: 'ja' },
  { name: 'Kannada', value: 'kn' },
  { name: 'Kazakh', value: 'kk' },
  { name: 'Korean', value: 'ko' },
  { name: 'Kurdish', value: 'ku' },
  { name: 'Lao', value: 'lo' },
  { name: 'Latin', value: 'la' },
  { name: 'Latvian', value: 'lv' },
  { name: 'Lithuanian', value: 'lt' },
  { name: 'Macedonian', value: 'mk' },
  { name: 'Malay', value: 'ms' },
  { name: 'Malayalam', value: 'ml' },
  { name: 'Maltese', value: 'mt' },
  { name: 'Marathi', value: 'mr' },
  { name: 'Mongolian', value: 'mn' },
  { name: 'Nepali', value: 'ne' },
  { name: 'Norwegian', value: 'no' },
  { name: 'Persian', value: 'fa' },
  { name: 'Polish', value: 'pl' },
  { name: 'Portuguese', value: 'pt' },
  { name: 'Punjabi', value: 'pa' },
  { name: 'Romanian', value: 'ro' },
  { name: 'Russian', value: 'ru' },
  { name: 'Serbian', value: 'sr' },
  { name: 'Sinhala', value: 'si' },
  { name: 'Slovak', value: 'sk' },
  { name: 'Slovenian', value: 'sl' },
  { name: 'Spanish', value: 'es' },
  { name: 'Sundanese', value: 'su' },
  { name: 'Swahili', value: 'sw' },
  { name: 'Swedish', value: 'sv' },
  { name: 'Tamil', value: 'ta' },
  { name: 'Telugu', value: 'te' },
  { name: 'Thai', value: 'th' },
  { name: 'Turkish', value: 'tr' },
  { name: 'Ukrainian', value: 'uk' },
  { name: 'Urdu', value: 'ur' },
  { name: 'Vietnamese', value: 'vi' },
  { name: 'Welsh', value: 'cy' },
  { name: 'Yiddish', value: 'yi' },
];

async function autoLang(m) {
  const query = m.options.getFocused().toLowerCase();
  if (!query) return await m.respond(LANGUAGES.slice(0, 25));
  const filtered = LANGUAGES.filter(
    (l) => l.name.toLowerCase().includes(query) || l.value.toLowerCase().includes(query),
  ).slice(0, 25);
  await m.respond(filtered);
}

export default [
  {
    cmd: ['tr', 'translate'],
    cat: 'tools',
    desc: 'Translate text (Google/LibreTranslate)',
    roles: [Role.USER],
    exec: async (c) => {
      if (c.cmd === 'tr?') return await c.reply(t('usage', { prefix: c.prefix }, c));

      const raw = c.args?.trim() || '';
      let target = 'en';
      let engine = 'google';
      let langSet = false;
      const textParts = [];

      const tokens = raw.split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const p = tokens[i];
        if (p === '-e' && i + 1 < tokens.length) {
          engine = tokens[++i];
        } else if (!langSet && /^[a-z]{2}$/.test(p)) {
          target = p;
          langSet = true;
        } else {
          textParts.push(p);
        }
      }

      let text = textParts.join(' ');
      if (!text) {
        const ref = c.event.reference;
        if (ref?.messageId) {
          const replied = await c.event.channel.messages.fetch(ref.messageId);
          text = replied.content;
        }
      }
      if (!text) return await c.react('❌');

      try {
        const translated = await translateText(text, target, { engine });
        await c.reply(translated);
      } catch {
        await c.react('❌');
      }
    },
  },
  {
    cmd: ['tra'],
    cat: 'tools',
    desc: "Auto-translate a user's messages to this channel",
    roles: [Role.USER],
    exec: async (c) => {
      const parts = c.args?.trim().split(/\s+/) || [];
      if (parts.length < 2) return await c.react('❌');
      const lang = parts[0];
      if (!/^[a-z]{2}$/.test(lang)) return await c.react('❌');
      const data = read();
      data.translate = data.translate || {};
      data.translate.storeChannel = c.event.channel.id;
      data.translate.autoList = data.translate.autoList || [];
      const name = parts.slice(1).join(' ');
      if (!data.translate.autoList.some((e) => e.username === name)) {
        data.translate.autoList.push({ lang, username: name });
      }
      write(data);
      return await c.react('✅');
    },
  },
  {
    exec: async (c) => {
      const msg = c.event;
      if (msg.author?.bot) return;
      if (!msg.content) return;
      const store = read().translate;
      if (!store?.storeChannel || !store?.autoList?.length) return;
      const entry = store.autoList.find((e) => e.username?.toLowerCase() === msg.author.username.toLowerCase());
      if (!entry) return;
      try {
        const translated = await translateText(msg.content, entry.lang);
        const channel = await c.client().channels.fetch(store.storeChannel);
        if (channel) {
          await channel.send(`**${msg.author.username}**: ${translated}`);
        }
      } catch { }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('translate')
      .setDescription('Translate text or set up auto-translation')
      .addSubcommand((s) =>
        s
          .setName('text')
          .setDescription('Translate text')
          .addStringOption((o) => o.setName('text').setDescription('Text to translate').setRequired(true))
          .addStringOption((o) =>
            o.setName('target').setDescription('Target language code (e.g. en, id)').setAutocomplete(true),
          )
          .addStringOption((o) =>
            o
              .setName('engine')
              .setDescription('Translation engine')
              .addChoices({ name: 'Google', value: 'google' }, { name: 'LibreTranslate', value: 'libre' }),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('auto')
          .setDescription("Auto-translate a user's messages")
          .addStringOption((o) =>
            o.setName('target').setDescription('Target language code').setRequired(true).setAutocomplete(true),
          )
          .addStringOption((o) => o.setName('user').setDescription('Username to auto-translate').setRequired(true)),
      )
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    autocomplete: autoLang,
    exec: async (c) => {
      const sub = c.event.options.getSubcommand();
      if (sub === 'text') {
        const text = c.event.options.getString('text');
        const target = c.event.options.getString('target') || 'en';
        const engine = c.event.options.getString('engine') || 'google';
        try {
          const translated = await translateText(text, target, { engine });
          await c.reply(translated);
        } catch {
          await c.react('❌');
        }
      } else if (sub === 'auto') {
        const lang = c.event.options.getString('target');
        const data = read();
        data.translate = data.translate || {};
        data.translate.storeChannel = c.event.channel.id;
        data.translate.autoList = data.translate.autoList || [];
        const name = c.event.options.getString('user');
        if (!data.translate.autoList.some((e) => e.username === name)) {
          data.translate.autoList.push({ lang, username: name });
        }
        write(data);
        await c.react('✅');
      }
    },
  },
];
