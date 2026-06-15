/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role, read, translate, write } from '#mushi';

const t = translate({
  en: { paused: '_Bot paused_', unpaused: '_Bot resumed_' },
  id: { paused: '_Bot dijeda_', unpaused: '_Bot dilanjutkan_' },
});

async function togglePause(c) {
  const h = c.handler();
  h.paused = !h.paused;
  const data = read();
  data.paused = h.paused;
  write(data);
  await c.reply(t(h.paused ? 'paused' : 'unpaused', {}, c));
}

export default [
  {
    cmd: ['pause'],
    cat: 'system',
    desc: 'Pause/resume all bot responses',
    roles: [Role.ADMIN],
    exec: togglePause,
  },
  {
    roles: [Role.ADMIN],
    data: new SlashCommandBuilder()
      .setName('pause')
      .setDescription('Pause/resume all bot responses')
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: togglePause,
  },
];
