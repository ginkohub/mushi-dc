/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { execSync } from 'node:child_process';
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role } from '#mushi';

const run = (cmd) => execSync(cmd, { encoding: 'utf-8' });

export default {
 cmd: ['update', 'up'],
 cat: 'system',
 desc: 'Git pull and restart',
 roles: [Role.OWNER],
 data: new SlashCommandBuilder()
  .setName('update')
  .setDescription('Git pull and restart')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
 exec: async (c) => {
  try {
   const parts = [];
   try {
    parts.push(run('git stash push --include-untracked -m auto-stash'));
   } catch {
    parts.push('(nothing to stash)');
   }

   const pullOut = run('git pull');
   parts.push(pullOut);

   if (pullOut.includes('Already up to date')) {
    try {
     parts.push(run('git stash pop'));
    } catch {
     parts.push('(nothing to restore)');
    }
    return await c.reply(parts.join('\n').trim());
   }

   parts.push(run('bun install'));
   try {
    parts.push(run('git stash pop'));
   } catch {
    parts.push('(nothing to restore)');
   }

   await c.reply(parts.join('\n').trim());
   process.exit(0);
  } catch (e) {
   await c.reply(`Update failed: ${e.message}`);
  }
 },
};
