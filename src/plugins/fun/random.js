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
import { pen, Role, translate } from '#mushi';

const TYPE_CHOICES = [
 ['animequote', 'Random anime quote'],
 ['bluearchive', 'Random Blue Archive image'],
 ['lahelu', 'Random Lahelu post'],
 ['cecanjapan', 'Random cecan Japan'],
 ['cecanindonesia', 'Random cecan Indonesia'],
 ['cecanvietnam', 'Random cecan Vietnam'],
 ['cecanchina', 'Random cecan China'],
 ['cecanthailand', 'Random cecan Thailand'],
 ['cecankorea', 'Random cecan Korea'],
];

const API_BASE = 'https://api.siputzx.my.id/api/r';

const IMAGE_ENDPOINTS = new Set([
 'bluearchive',
 'cecanjapan',
 'cecanindonesia',
 'cecanvietnam',
 'cecanchina',
 'cecanthailand',
 'cecankorea',
]);

const SUBCOMMANDS = {
 animequote: { endpoint: '/quotesanime', desc: 'Random anime quote' },
 bluearchive: { endpoint: '/blue-archive', desc: 'Random Blue Archive image' },
 lahelu: { endpoint: '/lahelu', desc: 'Random Lahelu post' },
 cecanjapan: { endpoint: '/cecan/japan', desc: 'Random cecan Japan' },
 cecanindonesia: { endpoint: '/cecan/indonesia', desc: 'Random cecan Indonesia' },
 cecanvietnam: { endpoint: '/cecan/vietnam', desc: 'Random cecan Vietnam' },
 cecanchina: { endpoint: '/cecan/china', desc: 'Random cecan China' },
 cecanthailand: { endpoint: '/cecan/thailand', desc: 'Random cecan Thailand' },
 cecankorea: { endpoint: '/cecan/korea', desc: 'Random cecan Korea' },
};

const t = translate({
 en: {
  help_title: 'RANDOM COMMANDS',
  help_usage: 'Use `{prefix}random <subcommand>`',
  help_list:
   'Available:\n• `animequote` / `aq` — Anime quote\n• `bluearchive` / `ba` — Blue Archive image\n• `lahelu` — Lahelu post\n• `cecan<japan|indonesia|vietnam|china|thailand|korea>` — Cecan by country',
  not_found: 'Unknown subcommand "{cmd}". Use `{prefix}random ?` for help.',
  api_error: 'API request failed.',
  quote: '_{quote}_\n— **{character}** ({anime})',
 },
 id: {
  help_title: 'RANDOM COMMANDS',
  help_usage: 'Gunakan `{prefix}random <subcommand>`',
  help_list:
   'Tersedia:\n• `animequote` / `aq` — Kutipan anime\n• `bluearchive` / `ba` — Gambar Blue Archive\n• `lahelu` — Postingan Lahelu\n• `cecan<japan|indonesia|vietnam|china|thailand|korea>` — Cecan by country',
  not_found: 'Subcommand "{cmd}" tidak dikenal. Gunakan `{prefix}random ?` untuk bantuan.',
  api_error: 'Gagal mengambil data.',
  quote: '_{quote}_\n— **{character}** ({anime})',
 },
});

const baseSlash = () =>
 new SlashCommandBuilder()
  .setName('random')
  .setDescription('Random content (anime quote, images, etc.)')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

const typeCommand = baseSlash();
typeCommand.addStringOption((o) =>
 o
  .setName('type')
  .setDescription('Type of random content')
  .setRequired(true)
  .addChoices(...TYPE_CHOICES.map(([v, d]) => ({ name: d, value: v }))),
);

async function random(c) {
 const args = c.isSlash ? c.event.options.getString('type') || '' : (c.args || '').trim().toLowerCase();
 if (!args || args === '?') {
  return await c.reply([t('help_title', {}, c), '', t('help_usage', {}, c), t('help_list', {}, c)].join('\n'));
 }

 let sub = args.split(/\s+/)[0];
 const aliasMap = { aq: 'animequote', ba: 'bluearchive' };
 sub = aliasMap[sub] || sub;

 const sc = SUBCOMMANDS[sub];
 if (!sc) return await c.reply(t('not_found', { cmd: args }, c));

 await c.react('⏳');

 try {
  const res = await fetch(`${API_BASE}${sc.endpoint}`, { headers: { 'User-Agent': 'MushiBot/1.0' } });
  if (!res.ok) {
   await c.react('❌');
   return;
  }

  if (IMAGE_ENDPOINTS.has(sub)) {
   return await c.reply({ files: [`${API_BASE}${sc.endpoint}`] });
  }

  const data = await res.json();
  if (!data?.status) {
   await c.react('❌');
   return;
  }

  const items = data.data;
  if (!Array.isArray(items) || items.length === 0) {
   await c.react('❌');
   return;
  }

  const item = items[Math.floor(Math.random() * items.length)];

  if (sub === 'animequote') {
   return await c.reply(t('quote', { quote: item.quotes, character: item.karakter, anime: item.anime }, c));
  }
  if (sub === 'lahelu') {
   const url = `https://lahelu.com/post/${item.postId}`;
   return await c.reply(`**${item.title}**\n👍 ${item.totalUpvotes}  💬 ${item.totalComments}\n${url}`);
  }

  await c.reply(JSON.stringify(item, null, 2).slice(0, 1900));
 } catch (e) {
  pen.Error(`random-error: ${e.message}`);
  await c.react('❌');
 }
}

export default [
 {
  cmd: ['random', 'rand'],
  cat: 'fun',
  desc: 'Random content (anime quote, images, etc.)',
  roles: [Role.USER],
  exec: random,
 },
 {
  roles: [Role.USER],
  data: typeCommand,
  exec: random,
 },
];
