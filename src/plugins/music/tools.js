import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import {
  clearQueue,
  getState,
  moveInQueue,
  removeFromQueue,
  saveQueue,
  sendPlayerUI,
  setLoop,
  shuffleQueue,
} from './_player.js';

async function execShuffle(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');
  const state = getState(guild.id);
  if (state.songs.length < 2) return await c.reply('Not enough songs in queue to shuffle.');
  shuffleQueue(guild.id);
  await sendPlayerUI(state);
  await c.reply('🔀 Queue shuffled.');
}

async function execLoop(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const mode = c.event.options.getString('mode');

  const val = mode === 'off' ? 0 : mode === 'one' ? 1 : 2;
  setLoop(guild.id, val);
  const state = getState(guild.id);
  await sendPlayerUI(state);
  const labels = ['Off', 'Single', 'All'];
  await c.reply(`🔁 Loop set to **${labels[val]}**.`);
}

async function execRemove(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const index = c.event.options.getInteger('index');

  if (!index || Number.isNaN(index)) return await c.reply('Please provide a valid index.');

  const removed = removeFromQueue(guild.id, index);
  if (!removed) {
    const state = getState(guild.id);
    return await c.reply(`Invalid index. Queue has ${state.songs.length} song(s).`);
  }

  const state = getState(guild.id);
  await sendPlayerUI(state);
  await c.reply(`Removed **${removed.title}** from queue.`);
}

async function execClear(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');
  const state = getState(guild.id);
  if (state.songs.length === 0) return await c.reply('Queue is already empty.');
  clearQueue(guild.id);
  await sendPlayerUI(state);
  await c.reply('🗑️ Queue cleared.');
}

async function execMove(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const from = c.event.options.getInteger('from');
  const to = c.event.options.getInteger('to');

  if (!from || !to || Number.isNaN(from) || Number.isNaN(to)) {
    return await c.reply('Please provide valid from and to positions.');
  }

  const ok = moveInQueue(guild.id, from, to);
  if (!ok) {
    const state = getState(guild.id);
    return await c.reply(`Invalid indices. Queue has ${state.songs.length} song(s).`);
  }

  const state = getState(guild.id);
  await sendPlayerUI(state);
  await c.reply(`Moved song from position **${from}** to **${to}**.`);
}

async function execSave(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const name = c.event.options.getString('name')?.toLowerCase().trim();

  if (!name) return await c.reply('Please provide a playlist name.');

  const state = getState(guild.id);
  if (state.songs.length === 0) return await c.reply('Queue is empty.');

  saveQueue(guild.id, name, c.senderId);
  await c.reply(`💾 Saved **${state.songs.length}** songs as playlist **${name}**.`);
}

const shuffleSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the current queue')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: execShuffle,
};

const clearSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the entire queue')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: execClear,
};

const loopSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices({ name: 'Off', value: 'off' }, { name: 'Single', value: 'one' }, { name: 'All', value: 'all' }),
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: execLoop,
};

const removeSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a song from queue by index')
    .addIntegerOption((o) => o.setName('index').setDescription('Song index').setRequired(true).setMinValue(1))
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: execRemove,
};

const moveSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a song in the queue')
    .addIntegerOption((o) => o.setName('from').setDescription('Current position').setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName('to').setDescription('New position').setRequired(true).setMinValue(1))
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: execMove,
};

const saveSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('save')
    .setDescription('Save current queue as a playlist')
    .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true))
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec: execSave,
};

export default [shuffleSlash, clearSlash, loopSlash, removeSlash, moveSlash, saveSlash];
