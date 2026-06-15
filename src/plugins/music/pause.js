import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { getState, sendPlayerUI, startProgressTimer, stopProgressTimer } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const state = getState(guild.id);
  if (!state.current) return await c.reply('Nothing is currently playing.');

  const paused = state.player.state.status === 'paused';
  if (paused) {
    state.player.unpause();
    if (state.pausedAt) {
      state.pausedTotal += Date.now() - state.pausedAt;
      state.pausedAt = null;
    }
    startProgressTimer(state);
    await c.reply('▶️ Resumed');
  } else {
    state.player.pause();
    state.pausedAt = Date.now();
    stopProgressTimer(state);
    await c.reply('⏸️ Paused');
  }
  await sendPlayerUI(state);
}

const pauseSlash = {
  roles: [Role.USER],
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause/resume the current song')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [pauseSlash];
