/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pen, Role } from '#mushi';

async function ping(c) {
	const m = c.event;

	const estimate = Date.now() - m.createdTimestamp;
	const reply = await m.reply({
		content: `${estimate}ms Pong!`,
		flags: MessageFlags.Ephemeral,
	});

	setTimeout(async () => {
		try {
			await reply.delete();
		} catch (e) {
			pen.Error(e);
		}
	}, 5000);
}

export default [
	/* prefixed command plugin */
	{
		cmd: ['ping', 'p'],
		roles: [Role.USER],
		exec: ping,
	},

	/* data field indicated that will registered as slash command */
	{
		roles: [Role.USER],
		data: new SlashCommandBuilder()
			.setName('ping')
			.setDescription('Ping the bot')
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
			.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
		exec: ping,
	},
];
