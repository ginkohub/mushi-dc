/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { Reason } from './reason.js';

/**
 * @readonly
 * @enum {number | string | any}
 */
export const Role = Object.freeze({
	BLOCKED: 0,
	GUEST: 1,
	USER: 10,
	PREMIUM: 100,
	ADMIN: 1000,
	OWNER: 10000,
});

export const RoleMoji = Object.freeze({
	[Role.BLOCKED]: '🚫',
	[Role.GUEST]: '👤',
	[Role.USER]: '🤵',
	[Role.PREMIUM]: '💼',
	[Role.ADMIN]: '🛡️',
	[Role.OWNER]: '👑',
});

/**
 * @typedef {Object} Plugin
 * @property {import('./handler.js').Handler} handler
 * @property {import('discord.js').Client} client
 * @property {string | string[]} cmd
 * @property {string} prefix
 * @property {string} desc
 * @property {string[]} tags
 * @property {string} cat
 * @property {boolean} disabled
 * @property {boolean} hidden
 * @property {Array<Role> | any} roles
 * @property {number} timeout
 * @property {boolean} noPrefix
 * @property {(ctx: import('./context.js').Ctx) => Promise<Reason> | Reason} midware
 * @property {(ctx: import('./context.js').Ctx) => Promise<void>} exec
 * @property {(ctx: import('./context.js').Ctx, reason: Reason) => Promise<void>} final
 * @property {string} location
 */

/**
 * Plugin class for handling event as listener or command
 */
export class Plugin {
	/** @param {Plugin} */
	constructor({
		data,
		cmd,
		prefix,
		desc,
		cat,
		tags,
		disabled,
		hidden,
		roles,
		timeout,
		noPrefix,
		midware,
		exec,
		final,
		location,
	}) {
		/** @type {import('./handler.js').Handler} */
		this.handler = null;

		/** @type {import('discord.js').Client} */
		this.client = null;

		/** @type {import('discord.js').SlashCommandBuilder} */
		this.data = data;

		/** @type {string | string[]}*/
		this.cmd = cmd;

		/** @type {string} */
		this.prefix = prefix;

		/** @type {boolean} */
		this.noPrefix = noPrefix;

		/** @type {string} */
		this.desc = desc;

		/** @type {string[]} */
		this.tags = tags;

		/** @type {string} */
		this.cat = cat && cat !== '' ? cat : 'uncategorized';

		/** @type {boolean} */
		this.disabled = disabled;

		/** @type {boolean} */
		this.hidden = hidden;

		/** @type {Array<Role> | any} */
		this.roles = roles;

		/**
		 * Timeout in second
		 *
		 * @type {number}
		 */
		this.timeout = timeout;

		/** @type {(c: import('./context.js').Ctx) => Promise<Reason> | Reason} */
		this.midware = midware;

		/** @type {(c: import('./context.js').Ctx) => Promise<void>} */
		this.exec = exec;

		/** @type {(c: import('./context.js').Ctx, reason: Reason) => Promise<void>} */
		this.final = final;

		/** @type {string} */
		this.location = location;
	}

	/**
	 * Checker before execution
	 *
	 * @param {import('./context.js').Ctx} ctx
	 * @return {Promise<Reason>}
	 */
	async check(ctx) {
		const res = new Reason({
			success: true,
			code: 'plugin-checker',
			author: this.location,
			message: 'This plugin is ready to execute',
		});

		if (this.roles && Array.isArray(this.roles)) {
			const permissed = ctx.roles?.some((role) => this.roles.includes(role));

			if (!permissed) {
				return res.setSuccess(false).setCode('plugin-role-insufficient').setMessage("User don't have the required role");
			}
		}

		if (this.disabled) {
			return res.setSuccess(false).setCode('plugin-disabled').setMessage('This plugin is disabled');
		}

		if (this.timeout > 0) {
			const diff = Date.now() - ctx.timestamp;
			if (diff > this.timeout * 1000) {
				return res.setSuccess(false).setCode('plugin-timeout').setMessage('This plugin is timed out');
			}
		}

		if (this.midware) {
			return new Reason(await this.midware(ctx));
		}
		return res;
	}
}
