/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { Role } from '#mushi';

export default {
 roles: [Role.USER],
 exec: async (c) => {
  const message = c.event;
  if (!message?.author) return;
  const userManager = c.handler().userManager;
  const user = userManager.getUser(message.author.id);
  if (!user) return;
  const stats = user.stats || {};
  const type = message.guild ? 'GuildMessage' : 'DirectMessage';
  stats[type] = (stats[type] || 0) + 1;
  userManager.updateUser(message.author.id, { stats });
 },
};
