import pen from '../../pen.js';

/** @param {import('discord.js').InteractionResponse} m */
export const on = async (m) => {
  if (m.author.bot) return;
  try {

    const logs = [];

    logs.push(m.author.tag);

    if (m.reference) {
      const reply = await m.channel.messages.fetch(m.reference.messageId);
      logs.push('>', reply.author.username);
    }

    if (m.content) {
      logs.push(':', m.content);
    }

    pen.Log(...logs);
  } catch (e) {
    pen.Error(e);
  }
}
