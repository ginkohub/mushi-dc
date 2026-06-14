/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { pen, Role, RoleMoji } from '#mushi';

/** @type {import('#mushi/plugin.js').Plugin } */
export default {
 roles: [Role.USER],
 exec: async (c) => {
  const m = c.event;

  try {
   const logs = [];

   logs.push(c.sender, RoleMoji[c.roles]);

   if (m.reference) {
    const reply = await m.channel.messages.fetch(m.reference.messageId);
    logs.push('>', reply.author.username);
   }

   if (c.text) {
    logs.push(':', c.text);
   }

   pen.Log(...logs);
  } catch (e) {
   pen.Error(e);
  }
 },
};
