/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 *
 * Credits:
 *   TikWM - https://www.tikwm.com
 *   siputzx.my.id - unofficial API aggregator
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import YtDlpWrap from 'yt-dlp-wrap';
import { Browser, pen, Role } from '#mushi';

const BIN_DIR = resolve('./bin');
const YTDLP_PATHS = [
  join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
  resolve('./node_modules/.bin/yt-dlp'),
  resolve('bin/yt-dlp'),
];

let ytDlpPromise = null;

async function resolveYT() {
  for (const p of YTDLP_PATHS) {
    if (existsSync(p)) return p;
  }
  if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });
  return await YtDlpWrap.downloadBinary(BIN_DIR);
}

async function getYT() {
  if (!ytDlpPromise) {
    ytDlpPromise = resolveYT().then((bin) => new YtDlpWrap(bin));
  }
  return ytDlpPromise;
}

getYT().catch(() => {});

const YTDLP_SITES = /youtube\.com|youtu\.be|soundcloud\.com|twitter\.com|x\.com|reddit\.com/;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function downloadTikTok(url) {
  const data = await Browser.json(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
  if (data.code !== 0) throw new Error(data.msg || 'TikTok API error');
  const video = data.data;
  const images = video.images || video.image_post_info?.images || [];
  if (images.length > 0) {
    return {
      platform: 'TikTok',
      title: video.title || 'TikTok',
      media: { url: images[0], type: 'image', isMulti: true, urls: images },
    };
  }
  return {
    platform: 'TikTok',
    title: video.title || 'TikTok',
    media: { url: video.hdplay || video.play || video.wmplay, type: 'video' },
  };
}

async function downloadInstagram(url) {
  const shortcodeMatch = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!shortcodeMatch) throw new Error('Invalid Instagram URL');
  const json = await Browser.json(`https://api.siputzx.my.id/api/d/fastdl?url=${encodeURIComponent(url)}`);
  if (!json?.status || !json.data) throw new Error('Instagram: no media found');

  const data = json.data;
  const meta = data.meta || {};
  let mediaUrl = '';
  let type = 'video';

  if (Array.isArray(data.url) && data.url.length > 0) {
    mediaUrl = data.url[0].url;
    type = data.url[0].type === 'mp4' ? 'video' : 'image';
  } else {
    mediaUrl = data.hd || data.sd || data.url || data.thumb;
  }

  if (typeof mediaUrl !== 'string') {
    throw new Error(`Instagram: could not find valid media URL (found ${typeof mediaUrl})`);
  }

  return {
    platform: 'Instagram',
    title: meta.title || 'Instagram',
    media: { url: mediaUrl, type },
  };
}

async function download(c) {
  const raw = c.event.options.getString('url') || '';
  const allowLarge = /(?:^|\s)(?:-f|--force)(?:\s|$)/.test(raw);
  const clean = raw.replace(/(?:^|\s)(?:-f|--force)(?:\s|$)/, ' ').trim();
  let urls = clean.match(/https?:\/\/[^\s]+/g) || [];
  if (urls.length === 0) {
    const ref = c.event.reference;
    if (ref?.messageId) {
      try {
        const replied = await c.event.channel.messages.fetch(ref.messageId);
        urls = replied.content?.match(/https?:\/\/[^\s]+/g) || [];
      } catch {}
    }
  }

  if (urls.length === 0) {
    return await c.reply({ content: '❌ No URLs found.', flags: MessageFlags.Ephemeral });
  }

  await c.event.deferReply();

  for (const url of urls) {
    if (YTDLP_SITES.test(url)) {
      try {
        const yt = await getYT();
        const info = await yt.getVideoInfo(url);
        const lines = [
          `**${info.title}**`,
          info.uploader && `Uploader: ${info.uploader}`,
          info.duration_string && `Duration: ${info.duration_string}`,
          info.view_count && `Views: ${info.view_count.toLocaleString()}`,
        ]
          .filter(Boolean)
          .join('\n');

        if (info.duration && info.duration > 600) {
          await c.reply(lines);
          continue;
        }

        const buffer = await yt.getBuffer(url, ['-f', 'best[ext=mp4]/best']);
        if (buffer?.length) {
          if (!allowLarge && buffer.length > MAX_FILE_SIZE) {
            await c.reply(`${lines}\n*(file too large, not uploaded)*`);
          } else {
            await c.reply({ content: lines, files: [{ attachment: buffer, name: `${info.title}.mp4` }] });
          }
        } else {
          await c.reply(lines);
        }
      } catch (e) {
        pen.Error('Download-YTDLP', e);
        await c.reply({ content: `❌ Failed to download from ${url}`, flags: MessageFlags.Ephemeral });
      }
      continue;
    }

    try {
      let result;
      if (/tiktok\.com/.test(url)) {
        result = await downloadTikTok(url);
      } else if (/instagram\.com/.test(url)) {
        result = await downloadInstagram(url);
      } else {
        const data = await Browser.json(`https://api.siputzx.my.id/api/s/facebook?url=${encodeURIComponent(url)}`);
        if (data?.status && data.data?.length) {
          const item = data.data[0];
          result = { platform: 'Unknown', title: item.title || 'Media', media: { url: item.url, type: 'video' } };
        } else {
          throw new Error('Unsupported URL');
        }
      }

      const lines = [`**${result.platform}**`, result.title && `Title: ${result.title}`].filter(Boolean).join('\n');
      const mediaUrl = result.media?.url;
      if (mediaUrl && typeof mediaUrl === 'string') {
        const res = await Browser.get(mediaUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (!allowLarge && buf.length > MAX_FILE_SIZE) {
            await c.reply(`${lines}\nURL: ${mediaUrl} *(file too large)*`);
          } else {
            const ext = result.media.type === 'image' ? 'jpg' : 'mp4';
            const name = `${result.title || 'media'}.${ext}`;
            await c.reply({ content: lines, files: [{ attachment: buf, name }] });
          }
        } else {
          await c.reply(`${lines}\nURL: ${mediaUrl}`);
        }
      } else if (mediaUrl) {
        throw new Error(`Invalid media URL type: ${typeof mediaUrl}`);
      } else {
        await c.reply(lines);
      }
    } catch (e) {
      pen.Error('Download-Direct', e);
      await c.reply({ content: `❌ Error downloading ${url}: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  }
}

export default [
  {
    roles: [Role.GUEST],
    data: new SlashCommandBuilder()
      .setName('download')
      .setDescription('Download media from TikTok, Instagram, YouTube, etc.')
      .addStringOption((o) => o.setName('url').setDescription('URL to download').setRequired(true))
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: download,
  },
];
