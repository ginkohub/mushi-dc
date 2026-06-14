/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { writeFileSync } from 'node:fs';
import { Role } from '#mushi';

export default {
	cmd: 'save',
	roles: [Role.USER],
	exec: async (c) => {
		const m = c.event;

		if (m.author.id !== '457813137682235392') return;

		try {
			const logs = c.handler().pen.logs;
			const data = JSON.stringify(logs, null, 2);
			const filename = `logs-${Date.now()}.json`;
			writeFileSync(filename, data);
			await m.reply(`Logs saved to ${filename}`);
		} catch (e) {
			c.handler().pen.Error('save-logs', e);
			await m.reply(`Failed to save logs: ${e.message}`);
		}
	},
};
