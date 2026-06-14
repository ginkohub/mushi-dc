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
			} catch {}
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
					.addStringOption((o) => o.setName('target').setDescription('Target language code (e.g. en, id)'))
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
					.addStringOption((o) => o.setName('target').setDescription('Target language code').setRequired(true))
					.addStringOption((o) => o.setName('user').setDescription('Username to auto-translate').setRequired(true)),
			)
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
			.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
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
