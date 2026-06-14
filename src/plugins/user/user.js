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
import { Role, RoleMoji, translate } from '#mushi';

const t = translate({
	en: {
		header: '--- User Information ---',
		username: 'Username',
		display_name: 'Display Name',
		id: 'ID',
		roles: 'Roles',
		level: 'Level',
		xp: 'XP',
		status: 'Status',
		banned: 'Banned (at {val})',
		active: 'Active',
		added: 'Added',
		no_user: 'No user specified. Mention someone.',
		invalid_role: 'Invalid role. Available: {val}',
		added_role: 'Added role {role} to {count} user(s).',
		removed_role: 'Removed role {role} from {count} user(s).',
		bio: 'Bio',
	},
	id: {
		header: '--- Informasi User ---',
		username: 'Username',
		display_name: 'Nama Tampilan',
		id: 'ID',
		roles: 'Peran',
		level: 'Level',
		xp: 'XP',
		status: 'Status',
		banned: 'Diblokir (pada {val})',
		active: 'Aktif',
		added: 'Ditambahkan',
		no_user: 'Tidak ada user yang ditentukan. Tag seseorang.',
		invalid_role: 'Peran tidak valid. Tersedia: {val}',
		added_role: 'Menambahkan peran {role} ke {count} user.',
		removed_role: 'Menghapus peran {role} dari {count} user.',
		bio: 'Bio',
	},
});

const roleChoices = Object.keys(Role).map((k) => ({ name: k, value: k }));

function applyRole(c, fn) {
	const mentions = c.event.mentions?.users;
	if (!mentions || mentions.size === 0) return { ok: false, msg: t('no_user', {}, c) };
	let count = 0;
	mentions.forEach((u) => {
		const user = c.handler().userManager.updateUser(u.id, {});
		if (fn(user)) {
			count++;
			c.handler().userManager.updateUser(u.id, { roles: user.roles });
		}
	});
	return { ok: true, count };
}

async function userInfo(c) {
	if (c.isSlash) {
		const targetId = c.event.options.getUser('user')?.id || c.senderId;
		return await showUserInfo(c, targetId);
	}
	const mentions = c.event.mentions?.users;
	const targets = mentions?.size > 0 ? mentions.map((u) => u.id) : [c.senderId];
	for (const id of targets) await showUserInfo(c, id);
}

async function showUserInfo(c, id) {
	const discordUser = await c
		.client()
		.users.fetch(id)
		.catch(() => null);
	const updateData = {};
	if (discordUser) {
		updateData.username = discordUser.username;
		updateData.displayName = discordUser.globalName || discordUser.username;
	}
	const user = c.handler().userManager.updateUser(id, updateData);
	if (!user) return;
	const roles = user.roles.map((r) => `${RoleMoji[r] || ''} ${Object.keys(Role).find((k) => Role[k] === r)}`).join(', ');
	const added = new Date(user.addedAt).toLocaleString();
	const lines = [
		t('header', {}, c),
		'',
		`${t('display_name', {}, c)}: ${user.displayName || 'N/A'}`,
		`${t('username', {}, c)}: ${user.username || 'N/A'}`,
		`${t('id', {}, c)}: ${id}`,
		`${t('roles', {}, c)}: ${roles}`,
		`${t('level', {}, c)}: ${user.level}`,
		`${t('xp', {}, c)}: ${user.xp}`,
		`${t('status', {}, c)}: ${user.banned ? t('banned', { val: new Date(user.bannedAt).toLocaleString() }, c) : t('active', {}, c)}`,
		`${t('added', {}, c)}: ${added}`,
	];
	if (user.stats && Object.keys(user.stats).length > 0) {
		lines.push('', '--- Stats ---');
		for (const [type, count] of Object.entries(user.stats)) {
			lines.push(`- ${type.replace('Message', '')}: ${count}`);
		}
	}
	await c.reply(lines.join('\n'));
}

async function addRole(c) {
	if (c.isSlash) {
		const userOpt = c.event.options.getUser('user').id;
		const roleName = c.event.options.getString('role').toUpperCase();
		const role = Role[roleName];
		if (role === undefined) return await c.reply(t('invalid_role', { val: Object.keys(Role).join(', ') }, c));
		const u = c.handler().userManager.updateUser(userOpt, {});
		if (u && !u.roles.includes(role)) {
			u.roles.push(role);
			c.handler().userManager.updateUser(userOpt, { roles: u.roles });
		}
		return await c.reply(t('added_role', { role: roleName, count: 1 }, c));
	}
	const roleName = (c.args || '').split(' ')[0]?.toUpperCase();
	const role = Role[roleName];
	if (role === undefined) return await c.reply(t('invalid_role', { val: Object.keys(Role).join(', ') }, c));
	const res = applyRole(c, (u) => {
		if (u && !u.roles.includes(role)) {
			u.roles.push(role);
			return true;
		}
		return false;
	});
	if (!res.ok) return await c.reply(res.msg);
	await c.reply(t('added_role', { role: roleName, count: res.count }, c));
}

async function removeRole(c) {
	if (c.isSlash) {
		const userOpt = c.event.options.getUser('user').id;
		const roleName = c.event.options.getString('role').toUpperCase();
		const role = Role[roleName];
		if (role === undefined) return await c.reply(t('invalid_role', { val: Object.keys(Role).join(', ') }, c));
		const u = c.handler().userManager.updateUser(userOpt, {});
		if (u?.roles.includes(role)) {
			u.roles = u.roles.filter((r) => r !== role);
			if (u.roles.length === 0) u.roles.push(Role.GUEST);
			c.handler().userManager.updateUser(userOpt, { roles: u.roles });
		}
		return await c.reply(t('removed_role', { role: roleName, count: 1 }, c));
	}
	const roleName = (c.args || '').split(' ')[0]?.toUpperCase();
	const role = Role[roleName];
	if (role === undefined) return await c.reply(t('invalid_role', { val: Object.keys(Role).join(', ') }, c));
	const res = applyRole(c, (u) => {
		if (u?.roles.includes(role)) {
			u.roles = u.roles.filter((r) => r !== role);
			if (u.roles.length === 0) u.roles.push(Role.GUEST);
			return true;
		}
		return false;
	});
	if (!res.ok) return await c.reply(res.msg);
	await c.reply(t('removed_role', { role: roleName, count: res.count }, c));
}

async function addUser(c) {
	if (c.isSlash) {
		c.handler().userManager.updateUser(c.event.options.getUser('user').id, {});
		return await c.reply('Added/verified user.');
	}
	const mentions = c.event.mentions?.users;
	const targets = mentions?.size > 0 ? mentions.map((u) => u.id) : c.args.trim() ? [c.args.trim()] : [];
	if (targets.length === 0) return await c.reply('Usage: .user+ <id> or @mention');
	for (const id of targets) c.handler().userManager.updateUser(id, {});
	await c.reply(`Added/verified ${targets.length} user(s).`);
}

async function removeUser(c) {
	if (c.isSlash) {
		delete c.handler().userManager.data[c.event.options.getUser('user').id];
		c.handler().userManager.save();
		return await c.reply('Removed user from database.');
	}
	const mentions = c.event.mentions?.users;
	const targets = mentions?.size > 0 ? mentions.map((u) => u.id) : c.args.trim() ? [c.args.trim()] : [];
	if (targets.length === 0) return await c.reply('Usage: .user- <id> or @mention');
	for (const id of targets) delete c.handler().userManager.data[id];
	c.handler().userManager.save();
	await c.reply(`Removed ${targets.length} user(s) from database.`);
}

const baseCtx = (name) =>
	new SlashCommandBuilder()
		.setName(name)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

export default [
	{ cmd: ['user'], cat: 'user', desc: 'Get user info', roles: [Role.USER], exec: userInfo },
	{ cmd: ['role+'], cat: 'admin', desc: 'Add role to user', roles: [Role.ADMIN], exec: addRole },
	{ cmd: ['role-'], cat: 'admin', desc: 'Remove role from user', roles: [Role.ADMIN], exec: removeRole },
	{ cmd: ['user+'], cat: 'admin', desc: 'Add/verify user to database', roles: [Role.ADMIN], exec: addUser },
	{ cmd: ['user-'], cat: 'admin', desc: 'Remove user from database', roles: [Role.ADMIN], exec: removeUser },
	{
		roles: [Role.ADMIN],
		data: baseCtx('user')
			.setDescription('User management')
			.addSubcommand((s) =>
				s
					.setName('info')
					.setDescription('Get user info')
					.addUserOption((o) => o.setName('user').setDescription('User (defaults to yourself)')),
			)
			.addSubcommand((s) =>
				s
					.setName('add')
					.setDescription('Add/verify user in database')
					.addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName('remove')
					.setDescription('Remove user from database')
					.addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
			),
		exec: async (c) => {
			const sub = c.event.options.getSubcommand();
			if (sub === 'info') await userInfo(c);
			else if (sub === 'add') await addUser(c);
			else if (sub === 'remove') await removeUser(c);
		},
	},
	{
		roles: [Role.ADMIN],
		data: baseCtx('role')
			.setDescription('Role management')
			.addSubcommand((s) =>
				s
					.setName('add')
					.setDescription('Add role to user')
					.addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
					.addStringOption((o) =>
						o
							.setName('role')
							.setDescription('Role name')
							.setRequired(true)
							.addChoices(...roleChoices),
					),
			)
			.addSubcommand((s) =>
				s
					.setName('remove')
					.setDescription('Remove role from user')
					.addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
					.addStringOption((o) =>
						o
							.setName('role')
							.setDescription('Role name')
							.setRequired(true)
							.addChoices(...roleChoices),
					),
			),
		exec: async (c) => {
			const sub = c.event.options.getSubcommand();
			if (sub === 'add') await addRole(c);
			else if (sub === 'remove') await removeRole(c);
		},
	},
];
