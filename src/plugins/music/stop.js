import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { getState, stop } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const state = getState(guild.id);
  if (!state.connection) return await c.reply('Not connected to a voice channel.');

  stop(guild.id);

  await c.reply('Stopped playing and left the voice channel.');
}

const stopSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing and leave the voice channel')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [stopSlash];
