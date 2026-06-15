import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { formatDuration, getState } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const state = getState(guild.id);
  if (!state.current) return await c.reply('Nothing is currently playing.');

  const s = state.current;

  const embed = {
    color: 0x00ff00,
    title: s.title,
    url: s.url,
    description: `Duration: ${formatDuration(s.duration)} | Requested by: <@${s.requester}>`,
    thumbnail: s.thumbnail ? { url: s.thumbnail } : undefined,
  };

  await c.reply({ embeds: [embed] });
}

const npSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing song')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [npSlash];
