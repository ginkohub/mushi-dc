/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { writeFileSync } from 'node:fs';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import { handler } from './handler.js';
import pen from './pen.js';
import { Role } from './plugin.js';

try {
  pen.Info('Loading.env file');
  dotenv.config();
} catch {
  pen.Warn('No .env file found');
  pen.Warn('Please check and edit .env file');
  writeFileSync(
    '.env',
    'DISCORD_TOKEN=<your_token>\nDISCORD_CLIENT_ID=<your_client_id>\n# DISCORD_GUILD_ID=<your_guild_id>',
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

handler.attach(client);

const ownerIds = (process.env.OWNER_IDS || '').split(/[,; ]+/).filter(Boolean);
for (const id of ownerIds) {
  const user = handler.userManager.updateUser(id, {});
  if (!user.roles.includes(Role.OWNER)) {
    user.roles.push(Role.OWNER);
    handler.userManager.updateUser(id, { roles: user.roles });
  }
}
if (ownerIds.length > 0) pen.Info(`Auto-added ${ownerIds.length} owner(s) from OWNER_IDS`);

client.login(process.env.DISCORD_TOKEN);
