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
import { Role } from '#mushi';

async function evalCmd(c) {
  const src = c.event.options.getString('code') || '';
  if (!src) return;

  try {
    /* biome-ignore lint/security/noGlobalEval: intentional eval feature */
    let res = await eval(`(async () => { ${src} })()`);
    if (res === undefined) return;
    if (typeof res === 'object') res = JSON.stringify(res, null, 2);
    await c.reply(`${res}`);
  } catch (e) {
    await c.reply(`${e}`);
  }
}

export default [
  {
    roles: [Role.OWNER],
    data: new SlashCommandBuilder()
      .setName('eval')
      .setDescription('Evaluate JavaScript code')
      .addStringOption((o) => o.setName('code').setDescription('JavaScript code to evaluate').setRequired(true))
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: evalCmd,
  },
];
