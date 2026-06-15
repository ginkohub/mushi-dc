/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { SpeedTestService } from '@ginkohub/speedtest-js';
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';

async function speedtest(c) {
  const msg = await c.reply('Running speedtest...');
  if (!msg) return;
  try {
    const service = new SpeedTestService();
    await service.fetchClientInfo();
    const server = await service.findBestServer();
    const { latency, jitter } = await service.testLatency(server);
    let lastEdit = 0;
    const onProgress = (label) => (s) => {
      const now = Date.now();
      if (now - lastEdit < 2000) return;
      lastEdit = now;
      msg.edit(`${label}... ${s.toFixed(2)} Mbps`).catch(() => { });
    };
    const dl = await service.testDownload(server, onProgress('Downloading'));
    const ul = await service.testUpload(server, onProgress('Uploading'));
    const result = [
      `**Speedtest Result**`,
      `Ping: ${latency}ms | Jitter: ${jitter.toFixed(2)}ms`,
      `Download: ${dl.toFixed(2)} Mbps`,
      `Upload: ${ul.toFixed(2)} Mbps`,
      `Server: ${server.name} (${server.sponsor}, ${server.country || 'Unknown'})`,
    ].join('\n');
    await msg.edit(result);
  } catch (e) {
    await msg.edit(`Speedtest failed: ${e.message}`);
  }
}

export default [
  {
    roles: [Role.USER],
    data: new SlashCommandBuilder()
      .setName('speedtest')
      .setDescription('Run a network speed test')
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: speedtest,
  },
];
