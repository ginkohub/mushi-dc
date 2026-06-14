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

async function listAliases(c) {
	const aliases = c.handler().getAliases();
	const entries = Object.entries(aliases);
	if (entries.length === 0) return await c.reply('No aliases configured.');
	const lines = ['**Command Aliases**', ''];
	for (const [alias, target] of entries) {
		lines.push(`- **${alias}** → ${target}`);
	}
	await c.reply(lines.join('\n'));
}

async function addAlias(c) {
	if (c.isSlash) {
		const name = c.event.options.getString('name').toLowerCase();
		const target = c.event.options.getString('target').toLowerCase();
		const handler = c.handler();
		const aliases = handler.getAliases();
		aliases[name] = target;
		handler.saveAliases(aliases);
		return await c.react('✅');
	}
	const parts = (c.args || '').split(/ +/);
	const name = parts.shift()?.toLowerCase();
	const target = parts.shift()?.toLowerCase();
	if (!name || !target) return await c.reply('Usage: `alias+ <name> <target_command>`');
	const handler = c.handler();
	const aliases = handler.getAliases();
	aliases[name] = target;
	handler.saveAliases(aliases);
	await c.react('✅');
}

async function removeAlias(c) {
	if (c.isSlash) {
		const name = c.event.options.getString('name').toLowerCase();
		const handler = c.handler();
		const aliases = handler.getAliases();
		if (!aliases[name]) return await c.reply(`Alias "${name}" not found.`);
		delete aliases[name];
		handler.saveAliases(aliases);
		return await c.react('✅');
	}
	const name = (c.args || '').trim().toLowerCase();
	if (!name) return await c.reply('Usage: `alias- <name>`');
	const handler = c.handler();
	const aliases = handler.getAliases();
	if (!aliases[name]) return await c.reply(`Alias "${name}" not found.`);
	delete aliases[name];
	handler.saveAliases(aliases);
	await c.react('✅');
}

const base = (name) =>
	new SlashCommandBuilder()
		.setName(name)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

export default [
	{ cmd: ['alias', 'aliases'], cat: 'admin', desc: 'List all command aliases', roles: [Role.USER], exec: listAliases },
	{ cmd: ['alias+'], cat: 'admin', desc: 'Add a command alias', roles: [Role.ADMIN], exec: addAlias },
	{ cmd: ['alias-'], cat: 'admin', desc: 'Remove a command alias', roles: [Role.ADMIN], exec: removeAlias },
	{
		roles: [Role.ADMIN],
		data: base('alias')
			.setDescription('Manage command aliases')
			.addSubcommand((s) => s.setName('list').setDescription('List all command aliases'))
			.addSubcommand((s) =>
				s
					.setName('add')
					.setDescription('Add a command alias')
					.addStringOption((o) => o.setName('name').setDescription('Alias name').setRequired(true))
					.addStringOption((o) => o.setName('target').setDescription('Target command').setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName('remove')
					.setDescription('Remove a command alias')
					.addStringOption((o) => o.setName('name').setDescription('Alias name').setRequired(true)),
			),
		exec: async (c) => {
			const sub = c.event.options.getSubcommand();
			if (sub === 'list') await listAliases(c);
			else if (sub === 'add') await addAlias(c);
			else if (sub === 'remove') await removeAlias(c);
		},
	},
];
