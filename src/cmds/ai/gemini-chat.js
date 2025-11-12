import { SlashCommandBuilder } from 'discord.js';
import pen from '../../pen.js';
import { gemini } from './gemini.js';

const CHAT_ID = 'DUMMY';

pen.Debug('Gemini model name:', gemini.modelName);

/** 
 * @param {import('discord.js').Message | import('discord.js').ChatInputCommandInteraction} m
 * @returns {string}
 */
function getName(m) {
  let senderName = m.user?.username ?? m.author?.username;

  if (m.user) {
    if (m.user?.globalName) senderName = m.user.globalName;
    if (m.user?.nickname) senderName = m.user.nickname;
  }

  if (m.author) {
    if (m.author?.globalName) senderName = m.author.globalName;
    if (m.author?.nickname) senderName = m.author.nickname;
  }
  return senderName;
}

/** 
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  if (!text) return '';
  text = text?.replace(/<@\d+>/g, '');
  while (text.includes('  ')) {
    text = text.replace('  ', ' ');
  }
  return text.trim();
}

/**
  * @param {import('discord.js').ChatInputCommandInteraction} m
  * @param {string} text
  */
async function chat(m, text) {
  // pen.Debug(m);

  if (m.deferReply) {
    await m.deferReply();
  } else {
    m.channel.sendTyping();
  }

  text = text?.trim();
  if (!text | text?.length === 0) return;

  pen.Debug(text);

  try {
    const resp = await gemini.chat(CHAT_ID, {
      message: [
        { text: text }
      ]
    });

    const content = { content: resp.text?.trim() };
    if (m.deferReply) {
      await m.editReply(content)
    } else {
      await m.reply(content)
    }
  } catch (e) {
    pen.Error(e);
    pen.Debug(text);
  }
}

export const cmd = {
  data: new SlashCommandBuilder().setName('gm')
    .setDescription('Ask everything to Gemini')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Your text')
        .setRequired(true)
    )
  ,
  /** @param {import('discord.js').InteractionResponse} m */
  async execute(m) {
    let text = m.options.getString('text')?.trim();
    if (!text | text?.length === 0) return;
    text = `${getName(m)}: ${cleanText(text)}`
    await chat(m, text);
  }
}

/** 
 * @param {import('discord.js').Message} m
 * @param {import('discord.js').Client} client
 */
export const on = async (m, client) => {
  let texts = [];
  let stat = m.mentions?.has(client.user) || false;

  if (m.reference) {
    const quoted = await m.channel.messages.fetch(m.reference.messageId);
    if (quoted.author.id === client.user.id) stat = true;
    if (stat) {
      const text = cleanText(quoted.content);
      if (text.length > 0) texts.push(`<${getName(quoted)}>: ${text}`);
    }
  }
  if (stat) {
    const text = cleanText(m.content);
    if (text.length > 0) texts.push(`<${getName(m)}>: ${text}`);
  }

  if (texts.length > 0) {
    let text = texts.join('\n');
    await chat(m, text);
  }
}


