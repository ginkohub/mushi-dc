/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role, read, translate, write } from '#mushi';
import { DEFAULT_MODEL, MODEL_LIMITS } from './client.js';
import {
  clearHistory,
  estHistoryTokens,
  getClient,
  getCompactBuffer,
  getCompactCeiling,
  getHistory,
  getSystemPrompt,
  getTimezone,
  loadCookies,
  saveCookies,
  shouldCompact,
  summarizeHistory,
} from './history.js';

const MODEL_NAMES = Object.keys(MODEL_LIMITS);

const t = translate({
  en: {
    need_admin: 'Only admin can change cookies.',
    set_usage: 'Send `name=value` pairs, a JSON array, or `clear`',
    set_done: 'Cookies saved.',
    set_cleared: 'Cookies cleared.',
    cookie_none: 'Cookies not set.',
    model_set: '_Model set to {model}_',
    sys_usage: 'Current prompt:',
    sys_set: '_System prompt updated_',
    sys_cleared: '_System prompt cleared_',
    tz_usage: 'Current timezone: {tz}',
    tz_set: 'Timezone set to {tz}.',
    tz_cleared: 'Timezone reset to default (Asia/Jakarta).',
    tz_invalid: 'Invalid timezone. Use IANA zone (e.g. Asia/Jakarta, UTC, America/New_York).',
    compact_need_value: 'Provide a `value` for this action.',
    compact_bad_value: 'Must be a positive number or 0 to disable.',
    cleared: '_Conversation cleared_',
  },
  id: {
    need_admin: 'Hanya admin yang dapat mengubah cookie.',
    set_usage: 'Kirim pasangan `nama=nilai`, array JSON, atau `clear`',
    set_done: 'Cookie tersimpan.',
    set_cleared: 'Cookie dihapus.',
    cookie_none: 'Cookie belum diatur.',
    model_set: '_Model diubah ke {model}_',
    sys_usage: 'Prompt saat ini:',
    sys_set: '_System prompt diperbarui_',
    sys_cleared: '_System prompt dihapus_',
    tz_usage: 'Timezone saat ini: {tz}',
    tz_set: 'Timezone diubah ke {tz}.',
    tz_cleared: 'Timezone direset ke default (Asia/Jakarta).',
    tz_invalid: 'Timezone tidak valid. Gunakan zona IANA (mis. Asia/Jakarta, UTC, America/New_York).',
    compact_need_value: 'Berikan `value` untuk aksi ini.',
    compact_bad_value: 'Harus angka positif atau 0 untuk menonaktifkan.',
    cleared: '_Percakapan dihapus_',
  },
});

function is_admin(c) {
  return Math.max(...(c.roles || [])) >= Role.ADMIN;
}

function parseCookies(raw) {
  if (raw.startsWith('{') || raw.startsWith('[')) {
    let map = JSON.parse(raw.replace(/'/g, '"'));
    if (Array.isArray(map)) {
      const arr = map;
      map = {};
      for (const item of arr) {
        if (item.name && item.value) map[item.name] = item.value;
      }
    }
    return map;
  }
  const map = {};
  for (const pair of raw.split(/ +/)) {
    const sep = pair.includes('=') ? '=' : ':';
    const idx = pair.indexOf(sep);
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (name && value) map[name] = value;
  }
  return map;
}

async function handleCookies(c) {
  if (!is_admin(c)) return await c.reply(t('need_admin', {}, c));

  const raw = (c.event.options.getString('text') || '').trim();

  if (!raw) {
    const stored = loadCookies();
    const keys = Object.keys(stored);
    if (keys.length === 0) return await c.reply(`not set\n${t('set_usage', {}, c)}`);
    const lines = keys.map((k) => `${k}=${stored[k]}`);
    return await c.reply(`${keys.length} cookie(s):\n${lines.join('\n')}`);
  }

  if (raw === 'clear') {
    const data = read();
    if (data.gemini) delete data.gemini.cookies;
    write(data);
    return await c.reply(t('set_cleared', {}, c));
  }

  let map;
  try {
    map = parseCookies(raw);
  } catch {
    return await c.react('❌');
  }

  if (Object.keys(map).length === 0) return await c.react('❌');
  saveCookies(map);
  return await c.reply(t('set_done', {}, c));
}

async function handleModel(c) {
  const model = c.event.options.getString('name');
  const data = read();
  data.gemini = data.gemini || {};
  data.gemini.model = model;
  write(data);
  await c.reply(t('model_set', { model }, c));
}

async function handlePrompt(c) {
  const text = c.event.options.getString('text');

  if (text == null) {
    return await c.reply(`${t('sys_usage', {}, c)}\n${getSystemPrompt() || '-'}`);
  }

  if (text === 'clear') {
    const data = read();
    if (data.gemini) delete data.gemini.systemPrompt;
    if (data.settings) delete data.settings.systemPrompt;
    write(data);
    return await c.reply(t('sys_cleared', {}, c));
  }

  const data = read();
  data.gemini = data.gemini || {};
  data.gemini.systemPrompt = text;
  write(data);
  return await c.reply(t('sys_set', {}, c));
}

async function handleTimezone(c) {
  const tz = c.event.options.getString('text');

  if (tz == null) {
    return await c.reply(t('tz_usage', { tz: getTimezone() || 'Asia/Jakarta (default)' }, c));
  }

  if (tz === 'clear') {
    const data = read();
    if (data.gemini) delete data.gemini.timezone;
    write(data);
    return await c.reply(t('tz_cleared', {}, c));
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    return await c.reply(t('tz_invalid', {}, c));
  }

  const data = read();
  data.gemini = data.gemini || {};
  data.gemini.timezone = tz;
  write(data);
  return await c.reply(t('tz_set', { tz }, c));
}

async function handleCompact(c) {
  const action = c.event.options.getString('action') || 'status';
  const value = c.event.options.getInteger('value');
  const data = read();

  if (action === 'status' || action === null) {
    const ceiling = getCompactCeiling();
    const buffer = getCompactBuffer();
    const triggerAt = ceiling > 0 ? ceiling - buffer : 0;
    const lines = [
      `ceiling: ${ceiling.toLocaleString()} tokens (model: ${MODEL_LIMITS[DEFAULT_MODEL].toLocaleString()})`,
      `buffer:  ${buffer.toLocaleString()} tokens`,
      `trigger: ${ceiling > 0 ? `~${(triggerAt * 4).toLocaleString()} chars / ${triggerAt.toLocaleString()} tokens` : 'disabled'}`,
      '',
      'Actions: status, now, ceiling, buffer, clear',
    ];
    return await c.reply(`\`\`\`\nCompact settings:\n${lines.join('\n')}\n\`\`\``);
  }

  if (action === 'now') {
    const historyKey = c.event.guild?.id || c.event.guildId || c.event.channel?.id || c.event.user?.id || 'dm';
    const h = getHistory(historyKey);
    const info = [
      `messages: ${h.length}`,
      `estimated: ${estHistoryTokens(historyKey).toLocaleString()} tokens`,
      `trigger:   ${shouldCompact(historyKey)}`,
    ];
    if (h.length < 4) {
      info.push('', 'Need at least 4 messages to compact.');
      return await c.reply(`\`\`\`\nCompact info:\n${info.join('\n')}\n\`\`\``);
    }
    const client = getClient();
    if (!client) return await c.reply('Gemini not configured.');
    info.push('', 'Compacting...');
    await c.reply(`\`\`\`\nCompact info:\n${info.join('\n')}\n\`\`\``);
    summarizeHistory(historyKey, client);
    return;
  }

  if (action === 'clear') {
    if (data.gemini) delete data.gemini.compactCeiling;
    if (data.gemini) delete data.gemini.compactBuffer;
    write(data);
    return await c.reply('Compact settings reset to defaults.');
  }

  if (value == null) return await c.reply(t('compact_need_value', {}, c));
  if (!Number.isFinite(value) || value < 0) return await c.reply(t('compact_bad_value', {}, c));

  data.gemini = data.gemini || {};
  if (action === 'ceiling') {
    data.gemini.compactCeiling = value;
    write(data);
    return await c.reply(`Compact ceiling set to ${value.toLocaleString()} tokens.`);
  }
  data.gemini.compactBuffer = value;
  write(data);
  return await c.reply(`Compact buffer set to ${value.toLocaleString()} tokens.`);
}

async function handleClear(c) {
  const key = c.event.guild?.id || c.event.guildId || c.event.channel?.id || c.event.user?.id || 'dm';
  clearHistory(key);
  await c.reply(t('cleared', {}, c));
}

const baseCtx = (name, desc) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(desc)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

const exec = async (c) => {
  switch (c.event.options.getSubcommand()) {
    case 'cookies':
      return await handleCookies(c);
    case 'model':
      return await handleModel(c);
    case 'prompt':
      return await handlePrompt(c);
    case 'timezone':
      return await handleTimezone(c);
    case 'compact':
      return await handleCompact(c);
    case 'clear':
      return await handleClear(c);
  }
};

export default [
  {
    roles: [Role.USER],
    data: baseCtx('aiset', 'Configure AI settings')
      .addSubcommand((s) =>
        s
          .setName('cookies')
          .setDescription('Set Gemini Web cookies')
          .addStringOption((o) => o.setName('text').setDescription('name=value ... , JSON, or clear')),
      )
      .addSubcommand((s) =>
        s
          .setName('model')
          .setDescription('Set the AI model')
          .addStringOption((o) =>
            o
              .setName('name')
              .setDescription('Model name')
              .setRequired(true)
              .addChoices(...MODEL_NAMES.map((m) => ({ name: m, value: m }))),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('prompt')
          .setDescription('Set custom system prompt')
          .addStringOption((o) => o.setName('text').setDescription('System prompt text or clear')),
      )
      .addSubcommand((s) =>
        s
          .setName('timezone')
          .setDescription('Set timezone used for timestamps')
          .addStringOption((o) => o.setName('text').setDescription('IANA zone (e.g. Asia/Jakarta) or clear')),
      )
      .addSubcommand((s) =>
        s
          .setName('compact')
          .setDescription('History compaction settings')
          .addStringOption((o) =>
            o
              .setName('action')
              .setDescription('Action')
              .addChoices(
                { name: 'status', value: 'status' },
                { name: 'now', value: 'now' },
                { name: 'ceiling', value: 'ceiling' },
                { name: 'buffer', value: 'buffer' },
                { name: 'clear', value: 'clear' },
              ),
          )
          .addIntegerOption((o) => o.setName('value').setDescription('Token count for ceiling/buffer').setMinValue(0)),
      )
      .addSubcommand((s) => s.setName('clear').setDescription('Clear conversation history')),
    exec,
  },
];
