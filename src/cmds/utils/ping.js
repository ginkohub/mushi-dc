import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import pen from '../../pen.js';

export const cmd = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Ping the bot'),
  /** @param {import('discord.js').InteractionResponse} m */
  async execute(m) {
    const estimate = Date.now() - m.createdTimestamp;
    const reply = await m.reply({
      content: `${estimate}ms Pong!`,
      flags: MessageFlags.Ephemeral
    });

    setTimeout(async () => {
      try {
        await reply.delete();
      } catch (e) {
        pen.Error(e);
      }
    }, 5000);
  }
}


