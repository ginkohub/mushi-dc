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

async function showPrefix(c) {
	await c.reply(`Current prefixes: ${c.handler().prefix.join(', ')}`);
}

async function addPrefix(c) {
	if (c.isSlash) {
		const p = c.event.options.getString('prefix');
		const handler = c.handler();
		if (handler.prefix.includes(p)) return await c.reply(`"${p}" is already a prefix.`);
		handler.setPrefix([...handler.prefix, p]);
		return await c.reply(`Added "${p}". Current: ${handler.prefix.join(', ')}`);
	}
	const p = c.args?.trim();
	if (!p) return await c.reply('Usage: prefix+ <prefix>');
	const handler = c.handler();
	if (handler.prefix.includes(p)) return await c.reply(`"${p}" is already a prefix.`);
	handler.setPrefix([...handler.prefix, p]);
	await c.reply(`Added "${p}". Current: ${handler.prefix.join(', ')}`);
}

async function removePrefix(c) {
	if (c.isSlash) {
		const p = c.event.options.getString('prefix');
		const handler = c.handler();
		if (!handler.prefix.includes(p)) return await c.reply(`"${p}" is not a prefix.`);
		handler.setPrefix(handler.prefix.filter((x) => x !== p));
		return await c.reply(`Removed "${p}". Current: ${handler.prefix.join(', ')}`);
	}
	const p = c.args?.trim();
	if (!p) return await c.reply('Usage: prefix- <prefix>');
	const handler = c.handler();
	if (!handler.prefix.includes(p)) return await c.reply(`"${p}" is not a prefix.`);
	handler.setPrefix(handler.prefix.filter((x) => x !== p));
	await c.reply(`Removed "${p}". Current: ${handler.prefix.join(', ')}`);
}

const base = (name) =>
	new SlashCommandBuilder()
		.setName(name)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

export default [
	{ cmd: ['prefix'], cat: 'admin', desc: 'Show current prefixes', roles: [Role.OWNER], exec: showPrefix },
	{ cmd: ['prefix+'], cat: 'admin', desc: 'Add a prefix', roles: [Role.OWNER], exec: addPrefix },
	{ cmd: ['prefix-'], cat: 'admin', desc: 'Remove a prefix', roles: [Role.OWNER], exec: removePrefix },
	{
		roles: [Role.OWNER],
		data: base('prefix')
			.setDescription('Manage prefixes')
			.addSubcommand((s) => s.setName('list').setDescription('Show current prefixes'))
			.addSubcommand((s) =>
				s
					.setName('add')
					.setDescription('Add a prefix')
					.addStringOption((o) => o.setName('prefix').setDescription('Prefix to add').setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName('remove')
					.setDescription('Remove a prefix')
					.addStringOption((o) => o.setName('prefix').setDescription('Prefix to remove').setRequired(true)),
			),
		exec: async (c) => {
			const sub = c.event.options.getSubcommand();
			if (sub === 'list') await showPrefix(c);
			else if (sub === 'add') await addPrefix(c);
			else if (sub === 'remove') await removePrefix(c);
		},
	},
];
