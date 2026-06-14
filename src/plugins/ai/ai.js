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
import { Role, read, translate, write } from '#mushi';

const BASE = 'https://api.siputzx.my.id/api/ai';

const MODELS = {
 gptoss120b: { promptKey: 'prompt', systemKey: 'system', tempKey: 'temperature' },
 deepseekr1: { promptKey: 'prompt', systemKey: 'system', tempKey: 'temperature' },
 qwq32b: { promptKey: 'prompt', systemKey: 'system', tempKey: 'temperature' },
 glm47flash: { promptKey: 'prompt', systemKey: 'system', tempKey: 'temperature' },
};

const MODEL_NAMES = Object.keys(MODELS);
const modelListStr = () => MODEL_NAMES.join(', ');

const t = translate({
 en: {
  usage: 'Usage: `{prefix}ai <message>` or reply to a message',
  model_set: '_Model set to {model}_',
  prompt_set: '_System prompt updated_',
  temp_set: '_Temperature set to {temp}_',
  temp_range: 'Temperature must be between 0 and 2',
  cleared: '_Conversation cleared_',
  models: '*Available models:* {models}',
  choose_model: 'Usage: `{prefix}ai model <name>`\nAvailable: {models}',
  no_msg: 'Please provide a message or reply to one',
 },
 id: {
  usage: 'Gunakan: `{prefix}ai <pesan>` atau balas pesan',
  model_set: '_Model diubah ke {model}_',
  prompt_set: '_System prompt diperbarui_',
  temp_set: '_Temperature diubah ke {temp}_',
  temp_range: 'Temperature harus antara 0 dan 2',
  cleared: '_Percakapan dihapus_',
  models: '*Model tersedia:* {models}',
  choose_model: 'Gunakan: `{prefix}ai model <nama>`\nTersedia: {models}',
  no_msg: 'Berikan pesan atau balas pesan',
 },
});

function loadSettings() {
 const data = read();
 return data.ai || {};
}

function saveSettings(s) {
 const data = read();
 data.ai = s;
 write(data);
}

const channels = new Map();
const aiMessages = new Set();

function getHistory(channelId) {
 if (!channels.has(channelId)) channels.set(channelId, []);
 return channels.get(channelId);
}

async function processQuery(query, channelId) {
 const settings = loadSettings();
 const settingsData = read().settings || {};
 const model = settings.model || 'gptoss120b';
 const system =
  settingsData.systemPrompt ||
  "Your name is Mushi, humble, always energetic and enthusiastic, love programming, calm. Speak in casual, everyday language using 'you' (kamu) and 'I' (aku). Keep sentences as short as possible, like a Discord chat. Respond without conversational formatting and keep it under 2000 characters.";
 const temperature = settings.temperature ?? 0.7;

 const history = getHistory(channelId);
 const context = [...history, { role: 'user', content: query }].map((h) => `${h.role}: ${h.content}`).join('\n\n');

 const result = await callApi(model, context, system, temperature);
 if (!result.status) return null;

 history.push({ role: 'user', content: query });
 history.push({ role: 'assistant', content: result.text });

 const maxHistory = 20;
 if (history.length > maxHistory) history.splice(0, history.length - maxHistory);

 return result.text;
}

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

async function replyOrEdit(c, text) {
 const chunks = splitText(text);
 for (const chunk of chunks) {
  const msg = await c.reply(chunk);
  if (msg?.id) aiMessages.add(msg.id);
 }
}

async function callApi(model, prompt, system, temperature) {
 const cfg = MODELS[model];
 if (!cfg) return { status: false, error: `Unknown model: ${model}` };
 const params = new URLSearchParams();
 params.set(cfg.promptKey, prompt);
 if (system && cfg.systemKey) params.set(cfg.systemKey, system);
 if (temperature != null && cfg.tempKey) params.set(cfg.tempKey, String(temperature));
 const url = `${BASE}/${model}?${params.toString()}`;
 const res = await fetch(url);
 if (!res.ok) return { status: false, error: `API error: ${res.status}` };
 const json = await res.json();
 if (!json.status) return { status: false, error: 'API returned error' };
 const data = json.data;
 let text = data.response || data.message || data.content || '';
 text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
 return { status: true, text };
}

export default [
 {
  cmd: ['ai'],
  cat: 'ai',
  desc: 'Chat with AI via free API',
  roles: [Role.USER],
  exec: async (c) => {
   const args = (c.args || '').trim();
   const [sub, ...rest] = args.split(/ +/);
   const settings = loadSettings();

   if (sub === 'model') {
    const model = rest.join(' ').trim();
    if (!model) return await c.reply(t('choose_model', { prefix: c.prefix, models: modelListStr() }, c));
    if (!MODELS[model]) return await c.reply(`Unknown model. Available: ${modelListStr()}`);
    settings.model = model;
    saveSettings(settings);
    channels.delete(c.event.channel?.id || c.event.author?.id);
    return await c.reply(t('model_set', { model }, c));
   }

   if (sub === 'prompt' || sub === 'system') {
    const prompt = rest.join(' ').trim();
    const data = read();
    if (!data.settings) data.settings = {};
    data.settings.systemPrompt = prompt;
    write(data);
    return await c.reply(t('prompt_set', {}, c));
   }

   if (sub === 'temp' || sub === 'temperature') {
    const val = parseFloat(rest.join(' '));
    if (Number.isNaN(val) || val < 0 || val > 2) return await c.reply(t('temp_range', {}, c));
    settings.temperature = val;
    saveSettings(settings);
    return await c.reply(t('temp_set', { temp: val }, c));
   }

   if (sub === 'clear') {
    const ch = c.event.channel?.id || c.event.author?.id;
    channels.delete(ch);
    return await c.reply(t('cleared', {}, c));
   }

   const channelId = c.event.channel?.id || c.event.author?.id;
   let query = args;
   const ref = c.event.reference;
   let replied = null;
   if (ref?.messageId) {
    try {
     replied = await c.event.channel.messages.fetch(ref.messageId);
    } catch {}
   }
   if (replied) {
    const repliedText = replied.content || '';
    query = query ? `${repliedText}\n\n${query}` : repliedText;
   }
   if (!query) return await c.reply(t('no_msg', {}, c));

   try {
    const text = await processQuery(query, channelId);
    if (!text) return await c.react('❌');
    await replyOrEdit(c, text);
   } catch {
    await c.react('❌');
   }
  },
 },
 {
  roles: [Role.USER],
  exec: async (c) => {
   const msg = c.event;
   if (!msg.author || msg.author.id === c.client()?.user?.id) return;
   const ref = msg.reference;
   if (!ref?.messageId) return;
   if (!aiMessages.has(ref.messageId)) return;
   const channelId = msg.channel?.id || msg.author?.id;
   const query = msg.content || '';
   try {
    const text = await processQuery(query, channelId);
    if (!text) return;
    const sent = await msg.reply(text);
    if (sent?.id) aiMessages.add(sent.id);
   } catch {}
  },
 },
 {
  data: new SlashCommandBuilder()
   .setName('ai')
   .setDescription('Chat with AI')
   .addSubcommand((s) =>
    s
     .setName('chat')
     .setDescription('Send a message to the AI')
     .addStringOption((o) => o.setName('text').setDescription('Your message').setRequired(true)),
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
     .addStringOption((o) => o.setName('text').setDescription('System prompt text').setRequired(true)),
   )
   .addSubcommand((s) =>
    s
     .setName('temp')
     .setDescription('Set temperature (0-2)')
     .addNumberOption((o) =>
      o.setName('value').setDescription('Temperature value').setRequired(true).setMinValue(0).setMaxValue(2),
     ),
   )
   .addSubcommand((s) => s.setName('clear').setDescription('Clear conversation history'))
   .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
   .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: async (c) => {
   const sub = c.event.options.getSubcommand();
   const settings = loadSettings();
   if (sub === 'chat') {
    const query = c.event.options.getString('text');
    const channelId = c.event.channel?.id || c.event.user?.id;
    await c.event.deferReply();
    try {
     const text = await processQuery(query, channelId);
     if (!text) {
      await c.event.editReply('❌');
      return;
     }
     const chunks = splitText(text);
     for (let i = 0; i < chunks.length; i++) {
      if (i === 0) await c.event.editReply(chunks[i]);
      else await c.event.followUp(chunks[i]);
     }
    } catch {
     await c.event.editReply('❌');
    }
   } else if (sub === 'model') {
    const model = c.event.options.getString('name');
    settings.model = model;
    saveSettings(settings);
    channels.delete(c.event.channel?.id || c.event.user?.id);
    await c.reply(t('model_set', { model }, c));
   } else if (sub === 'prompt') {
    const prompt = c.event.options.getString('text');
    const data = read();
    if (!data.settings) data.settings = {};
    data.settings.systemPrompt = prompt;
    write(data);
    await c.reply(t('prompt_set', {}, c));
   } else if (sub === 'temp') {
    const val = c.event.options.getNumber('value');
    settings.temperature = val;
    saveSettings(settings);
    await c.reply(t('temp_set', { temp: val }, c));
   } else if (sub === 'clear') {
    const ch = c.event.channel?.id || c.event.user?.id;
    channels.delete(ch);
    await c.reply(t('cleared', {}, c));
   }
  },
 },
];
