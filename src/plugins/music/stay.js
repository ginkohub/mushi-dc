/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * /stay — keep the bot in a voice channel after the queue ends.
 * Per-guild, persisted in data.json (stay[guildId] = { channelId }).
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { connect, getState, getStay, setStay } from './_player.js';

async function execStatus(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');
  const stay =
    getStay(guild.id) ?? (getState(guild.id).stayChannelId ? { channelId: getState(guild.id).stayChannelId } : null);
  if (!stay?.channelId) return await c.reply('Stay is **off**. The bot leaves 60s after the queue ends.');
  const ch = await guild.channels.fetch(stay.channelId).catch(() => null);
  return await c.reply(`Stay is **on**${ch ? ` in <#${ch.id}>` : ''}. Use \`/stay off\` to disable.`);
}

async function execOn(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');
  const vc = c.event.member?.voice?.channel;
  if (!vc) return await c.reply('You must be in a voice channel.');

  const state = getState(guild.id);
  if (!state.textChannel) state.textChannel = c.event.channel;
  try {
    await connect(guild, vc);
  } catch {
    return await c.reply('Failed to join your voice channel.');
  }
  setStay(guild.id, vc.id);
  return await c.reply(`Stay is **on** in <#${vc.id}>. The bot will remain after the queue ends.`);
}

async function execOff(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');
  setStay(guild.id, null);
  const state = getState(guild.id);
  state.stayChannelId = null;
  if (state.nextDc) {
    clearTimeout(state.nextDc);
    state.nextDc = null;
  }
  return await c.reply('Stay is **off**. The bot will leave 60s after the queue ends.');
}

const exec = async (c) => {
  switch (c.event.options.getSubcommand()) {
    case 'on':
      return await execOn(c);
    case 'off':
      return await execOff(c);
    default:
      return await execStatus(c);
  }
};

const staySlash = {
  roles: [Role.GUEST],
  data: new SlashCommandBuilder()
    .setName('stay')
    .setDescription('Keep the bot in voice after the queue ends')
    .addSubcommand((s) => s.setName('status').setDescription('Show stay status'))
    .addSubcommand((s) => s.setName('on').setDescription('Stay in your current voice channel'))
    .addSubcommand((s) => s.setName('off').setDescription('Resume auto-leave after queue ends'))
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),
  exec,
};

export default [staySlash];
