/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { execSync } from 'node:child_process';
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';

export default {
	cmd: ['shell', 'sh'],
	cat: 'system',
	desc: 'Execute shell commands',
	roles: [Role.OWNER],
	data: new SlashCommandBuilder()
		.setName('shell')
		.setDescription('Execute shell commands')
		.addStringOption((o) => o.setName('command').setDescription('Shell command to execute').setRequired(true))
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
	exec: async (c) => {
		const cmd = c.isSlash ? c.event.options.getString('command') || '' : c.args?.trim() || '';
		if (!cmd) return await c.react('❌');

		try {
			const out = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
			const reply = `$ ${cmd}\n${out}`.trim();
			if (reply.length > 2000) {
				await c.event.channel.send({
					files: [{ attachment: Buffer.from(reply), name: 'output.txt' }],
				});
			} else {
				await c.reply(reply || '(empty output)');
			}
		} catch {
			await c.react('❌');
		}
	},
};
