import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { getState, skip } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const state = getState(guild.id);
  if (!state.current) return await c.reply('Nothing is currently playing.');

  const song = state.current;
  skip(guild.id);

  await c.reply(`Skipped **${song.title}**`);
}

const skipSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing song')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [skipSlash];
