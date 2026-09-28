/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pen, Role, translate } from '#mushi';
import { tagIt } from './client.js';
import {
  addHistory,
  formatHistory,
  geminiMessages,
  getClient,
  getModel,
  getSystemPrompt,
  shouldCompact,
  summarizeHistory,
} from './history.js';

const t = translate({
  en: {
    usage: 'Usage: `/ai chat <message>`',
    no_cookies: 'Gemini cookies not set.\nUse `/aiset cookies text:__Secure-1PSID=xxx __Secure-1PSIDTS=yyy` first.',
    error: 'Error: {msg}',
    unexpected: 'Unexpected error: {msg}',
  },
  id: {
    usage: 'Gunakan: `/ai chat <pesan>`',
    no_cookies:
      'Cookie Gemini belum diatur.\nGunakan `/aiset cookies text:__Secure-1PSID=xxx __Secure-1PSIDTS=yyy` terlebih dahulu.',
    error: 'Kesalahan: {msg}',
    unexpected: 'Kesalahan tak terduga: {msg}',
  },
});

function splitText(text, maxLen = 2000) {
  if (text.length <= maxLen) return [text];
  const splitLong = (s) => {
    const res = [];
    let i = 0;
    while (i < s.length) {
      let end = Math.min(i + maxLen, s.length);
      if (end < s.length) {
        const brk = s.lastIndexOf('\n', end);
        if (brk > i) end = brk;
      }
      res.push(s.slice(i, end).trim());
      i = end;
    }
    return res;
  };
  const parts = text.split(/\n\n+/);
  const chunks = [];
  let buf = '';
  for (const p of parts) {
    const next = buf ? `${buf}\n\n${p}` : p;
    if (next.length > maxLen) {
      if (buf) chunks.push(buf);
      if (p.length > maxLen) chunks.push(...splitLong(p));
      else buf = p;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function askGemini(channelId, prompt, info) {
  const client = getClient();
  if (!client) return { status: false, error: 'no_cookies' };

  const historyText = formatHistory(channelId);
  const fullPrompt = historyText ? `${historyText}${prompt}` : prompt;

  try {
    const r = await client.ask(fullPrompt, {
      systemPrompt: getSystemPrompt(),
      model: getModel() || undefined,
      info,
    });
    if (!r.response?.trim()) return { status: false, error: 'Empty response' };
    return { status: true, text: r.response };
  } catch (e) {
    return { status: false, error: e.message };
  }
}

function remember(channelId, prompt, reply, userMsgId, botMsgId, userName, botName) {
  addHistory(channelId, [
    {
      role: 'user',
      name: userName,
      content: prompt,
      time: new Date().toISOString(),
      id: userMsgId,
    },
    {
      role: 'assistant',
      name: botName,
      content: reply,
      time: new Date().toISOString(),
      id: botMsgId,
    },
  ]);
  if (shouldCompact(channelId)) {
    const client = getClient();
    if (client) summarizeHistory(channelId, client);
  }
}

async function sendChunks(text, sender) {
  const chunks = splitText(text);
  const sent = await sender(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    await sent.channel.send(chunks[i]);
  }
  if (sent?.id) geminiMessages.add(sent.id);
  return sent;
}

const chatExec = async (c) => {
  const query = c.event.options.getString('text');
  const channelId = c.event.channel?.id || c.event.user?.id;
  await c.event.deferReply();
  try {
    const info = {
      user: { name: c.event.user?.globalName, username: c.event.user?.username },
      channel: c.event.channel?.name || null,
      server: c.event.guild?.name || null,
      bot: c.client()?.user?.username || null,
    };
    const res = await askGemini(channelId, query, info);
    if (!res.status) {
      pen.Error('AI', res.error);
      if (res.error === 'no_cookies') {
        await c.event.editReply(t('no_cookies', {}, c));
        return;
      }
      await c.event.editReply('❌');
      await c.event.followUp({ content: t('error', { msg: res.error }, c), flags: MessageFlags.Ephemeral });
      return;
    }
    const userName = c.event.user?.globalName || c.event.user?.username || 'User';
    const botName = c.client()?.user?.username || 'Gemini';
    const chunks = splitText(res.text);
    const sent = await c.event.editReply(chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      await c.event.followUp(chunks[i]);
    }
    if (sent?.id) geminiMessages.add(sent.id);
    remember(channelId, query, res.text, c.event.id, sent?.id, userName, botName);
  } catch (e) {
    pen.Error('AI', e);
    await c.event.editReply('❌').catch(() => {});
    await c.event
      .followUp({ content: t('unexpected', { msg: e.message }, c), flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }
};

const replyExec = async (c) => {
  const msg = c.event;
  const ref = msg.reference;
  if (!msg.author || !ref?.messageId) return;
  if (msg.mentionEveryone) return;
  if (!geminiMessages.has(ref.messageId)) return;

  let query = msg.content || '';
  try {
    const replied = await msg.channel.messages.fetch(ref.messageId);
    if (replied) {
      const name = replied.author?.displayName || 'Unknown';
      const username = replied.author?.username || 'unknown';
      const quoted = tagIt('quoted', replied.content || '', { name, username });
      query = query ? `${quoted}\n${query}` : quoted;
    }
  } catch {}
  if (!query) return;

  const channelId = msg.channel?.id || msg.author?.id;
  try {
    const info = {
      user: { name: msg.author?.globalName, username: msg.author?.username },
      channel: msg.channel?.name || null,
      server: msg.guild?.name || null,
      bot: c.client()?.user?.username || null,
    };
    const res = await askGemini(channelId, query, info);
    if (!res.status) {
      pen.Error('AI', res.error);
      if (res.error === 'no_cookies') return;
      await msg.react('❌').catch(() => {});
      return;
    }
    const userName = msg.author?.globalName || msg.author?.username || 'User';
    const botName = c.client()?.user?.username || 'Gemini';
    const sent = await sendChunks(res.text, (text) => msg.reply(text));
    remember(channelId, query, res.text, msg.id, sent?.id, userName, botName);
  } catch (e) {
    pen.Error('AI', e);
    await msg.react('❌').catch(() => {});
  }
};

const baseCtx = (name) =>
  new SlashCommandBuilder()
    .setName(name)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

export default [
  {
    roles: [Role.GUEST],
    exec: replyExec,
  },
  {
    roles: [Role.GUEST],
    data: baseCtx('ai')
      .setDescription('Chat with AI')
      .addStringOption((o) => o.setName('text').setDescription('Your message').setRequired(true)),
    exec: chatExec,
  },
];
