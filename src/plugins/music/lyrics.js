import * as cheerio from 'cheerio';
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';
import { getState } from './_player.js';

async function exec(c) {
  const guild = c.event.guild;
  if (!guild) return await c.react('❌');

  const query = c.event.options.getString('query');
  let title;

  if (query) {
    title = query;
  } else {
    const state = getState(guild.id);
    if (!state.current) return await c.reply('Nothing is currently playing. Provide a song name to search.');
    title = state.current.title;
  }

  await c.event.deferReply();

  try {
    const searchRes = await fetch(`https://genius.com/api/search/song?q=${encodeURIComponent(title)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0' },
    });
    const searchData = await searchRes.json();

    const hits = searchData?.response?.hits;
    if (!hits || hits.length === 0) {
      await c.event.editReply('No lyrics found for this song.');
      return;
    }

    const hit = hits[0].result;
    const pageRes = await fetch(hit.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0' },
    });
    const html = await pageRes.text();
    const $ = cheerio.load(html);

    let lyrics = '';
    $('[data-lyrics-container="true"]').each((_, el) => {
      $(el).find('br').replaceWith('\n');
      $(el)
        .find('a')
        .each((_, a) => {
          $(a).replaceWith($(a).text());
        });
      lyrics += `${$(el).text().trim()}\n\n`;
    });

    lyrics = lyrics.trim();
    if (!lyrics) {
      await c.event.editReply('No lyrics found for this song.');
      return;
    }

    const header = `**${hit.full_title || hit.title || title}**\n\n`;
    const maxLen = 4000;
    let content = header + lyrics;
    if (content.length > maxLen) {
      content = `${content.substring(0, maxLen)}\n\n*Lyrics truncated.*`;
    }

    await c.event.editReply(content);
  } catch (err) {
    const msg = `Failed to fetch lyrics: ${err.message}`;
    try {
      await c.event.editReply(msg);
    } catch {
      await c.event.followUp(msg).catch(() => {});
    }
  }
}

async function autocomplete(m) {
  const query = m.options.getFocused();
  if (!query || query.length < 2) return await m.respond([]);
  try {
    const res = await fetch(`https://genius.com/api/search/song?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0' },
    });
    const data = await res.json();
    const choices = (data.response?.hits || []).slice(0, 10).map((h) => ({
      name: h.result.title.slice(0, 100),
      value: h.result.title,
    }));
    await m.respond(choices);
  } catch {
    await m.respond([]);
  }
}

const lyricsSlash = {
  roles: [Role.USER],
  autocomplete,
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Show lyrics for a song')
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Song name (optional, defaults to current playing)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
  exec,
};

export default [lyricsSlash];
