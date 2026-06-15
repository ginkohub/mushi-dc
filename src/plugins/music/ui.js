/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import {
  getState,
  previousTrack,
  sendPlayerUI,
  setLoop,
  setVolume,
  shuffleQueue,
  skip,
  startProgressTimer,
  stop,
  stopProgressTimer,
} from './_player.js';

async function exec(c) {
  if (!c.event.isButton?.()) return;

  const id = c.event.customId;
  if (!id.startsWith('mp_')) return;

  await c.event.deferUpdate().catch(() => {});

  const guild = c.event.guild;
  if (!guild) return;

  const state = getState(guild.id);

  switch (id) {
    case 'mp_pause': {
      if (!state.current) break;
      const paused = state.player.state.status === 'paused';
      if (paused) {
        state.player.unpause();
        if (state.pausedAt) {
          state.pausedTotal += Date.now() - state.pausedAt;
          state.pausedAt = null;
        }
        startProgressTimer(state);
      } else {
        state.player.pause();
        state.pausedAt = Date.now();
        stopProgressTimer(state);
      }
      await sendPlayerUI(state);
      break;
    }
    case 'mp_skip': {
      if (!state.current) break;
      skip(guild.id);
      break;
    }
    case 'mp_stop': {
      if (!state.connection) break;
      stop(guild.id);
      break;
    }
    case 'mp_prev': {
      previousTrack(guild.id);
      break;
    }
    case 'mp_shuffle': {
      if (state.songs.length < 2) break;
      shuffleQueue(guild.id);
      await sendPlayerUI(state);
      break;
    }
    case 'mp_loop': {
      if (!state.current) break;
      setLoop(guild.id, (state.loopMode + 1) % 3);
      await sendPlayerUI(state);
      break;
    }
    case 'mp_voldown': {
      const cur = state.volume;
      setVolume(guild.id, Math.max(0, cur - 0.1));
      await sendPlayerUI(state);
      break;
    }
    case 'mp_volup': {
      const cur = state.volume;
      setVolume(guild.id, Math.min(2, cur + 0.1));
      await sendPlayerUI(state);
      break;
    }
  }
}

export default {
  exec,
};
