/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { readdirSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import { pathToFileURL } from 'node:url';
import * as chokidar from 'chokidar';
import { Collection, Events, MessageFlags, REST, Routes } from 'discord.js';
import { Ctx } from './context.js';
import { Pen } from './pen.js';
import { Plugin } from './plugin.js';
import { Reason } from './reason.js';
import { read, write } from './store.js';
import { delay, hashCRC32, shouldUsePolling } from './tools.js';
import { UserManager } from './user_manager.js';

/** Redact option values whose names look like secrets (cookies, tokens, ...). */
export function sanitizeArgs(argv) {
  if (!argv || typeof argv !== 'object') return argv ?? null;
  const out = {};
  for (const [k, v] of Object.entries(argv)) {
    out[k] = /cookie|token|secret|password|key/i.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

/**
 * @typedef {Object} HandlerOptions
 * @property {string} pluginDir
 * @property {Function} filter
 * @property {import('./pen.js').Pen} pen
 * @property {Map<string, import('baileys').GroupMetadata>} groupCache
 * @property {Map<string, import('baileys').Contact>} contactCache
 * @property {Map<string, number>} timerCache
 */
/**
 * Handler class for handling plugins
 */
export class Handler {
  /**
   * @param {HandlerOptions}
   */
  constructor({ pluginDir, useSlash, filter, pen, prefixes }) {
    /** @type {number} */
    this.startAt = Date.now();

    this.pluginDir = pluginDir ?? `${import.meta.dirname}/plugins/`;

    /** @type {Function} */
    this.filter = filter;

    /** @type {boolean} */
    this.useSlash = useSlash ?? true;

    /** @type {string[]} command prefixes, e.g. ['!'] (persisted in data.json) */
    this.prefixes = prefixes?.length > 0 ? prefixes : (read().prefixes ?? ['!']);

    /** @type {import('discord.js').Client} */
    this.client = null;

    /** @type {import('./pen.js').Pen)} */
    this.pen = pen ?? new Pen({ prefix: 'hand' });

    /** @type {import('./pen.js').Pen} file-only activity log (logs/activity-YYYY-MM-DD.log) */
    this.activity = new Pen({ prefix: 'act', file: 'logs/activity', retainDays: 14 });

    /** @type {Map<number, import('./plugin.js').Plugin>} */
    this.plugins = new Map();

    /** @type {Map<number, number>} */
    this.listens = new Map();

    /* Slash command */
    this.slashs = new Map();

    /* Prefix commands: pattern (prefix+cmd, lowercase) -> plugin id */
    this.prefixCmds = new Map();

    /** @type {Map<string, Function>} */
    this.autoc = new Map();

    /** @type {Map<string, { timer: NodeJS.Timeout, controller: AbortController }>} */
    this.debounceAutoc = new Map();

    /** @type {Map<string, { results: any[], expires: number }>} */
    this.autocCache = new Map();

    /** @type {Array} */
    this.watchID = [];

    /** @type {boolean} */
    this.paused = read().paused ?? false;

    /** @type {Array} */
    this.blockList = [];

    /** @type {Object} */
    this.taskList = {};

    /** @type {Map<string, Array<import('./plugin.js').Role>>} */
    this.userRoles = new Map();

    /** @type {Map<string, { channelId: string, joinedAt: number, totalMs: number }>} voice session per guild:user */
    this.voiceSessions = new Map();

    /** @type {import('./user_manager.js').UserManager} */
    this.userManager = new UserManager();

    /* Scan plugins on start */
    this.scanPlugin(this.pluginDir);

    /* Watch changes in pluginDir */
    this.watcher = chokidar
      .watch(this.pluginDir, {
        ignoreInitial: true,
        usePolling: shouldUsePolling(),
        interval: 1000,
      })
      .on('change', (loc) => {
        if (!loc.endsWith('.js')) return;
        this.pen.Debug('Plugin changed:', loc);
        this.loadFile(loc);
      })
      .on('add', (loc) => {
        if (!loc.endsWith('.js')) return;
        this.pen.Debug('Plugin added:', loc);
        this.loadFile(loc);
      })
      .on('unlink', (loc) => {
        if (!loc.endsWith('.js')) return;
        this.pen.Debug('Plugin removed:', loc);
        const hash = hashCRC32(loc);
        this.removeOn(hash);
      });
  }

  /**
   * Get user roles
   *
   * @param { string } username
   * @returns { Array < import('./plugin.js').Role > }
   */
  getRoles(username) {
    return this.userRoles.get(username);
  }

  /**
   * Set user roles
   *
   * @param {string} username
   * @param {Array<import('./plugin.js').Role> | Any} roles
   */
  setRoles(username, ...roles) {
    if (this.userRoles.has(username)) {
      const old = this.userRoles.get(username);
      old.push(...roles);
      this.userRoles.set(username, old);
    } else {
      this.userRoles.set(username, roles);
    }
  }

  /**
   * @param {string} id
   * @param {() => Promise<any>} fn
   * @returns {Promise<any>}
   */
  async runTask(id, fn) {
    if (this.taskList[id]) {
      this.pen.Debug(`Task ${id} is already running`);
      return this.taskList[id];
    }

    this.pen.Debug(`Task ${id} started`);
    const task = (async () => {
      try {
        return await fn();
      } catch (e) {
        this.pen.Error('run-task', `Task ${id} failed`, e);
      } finally {
        delete this.taskList[id];
      }
    })();

    this.taskList[id] = task;
    return task;
  }

  /**
   * Check whether given jid is blocked or not
   * @param {string} jid
   * @returns {boolean}
   */
  isBlocked(jid) {
    return this.blockList.includes(jid);
  }

  /**
   * Block / unblock given jid
   * @param {string} jid
   * @returns {Promise<boolean | undefined>}
   */
  async updateBlock(jid, action) {
    try {
      switch (action) {
        case 'block': {
          this.blockList.push(jid);
          break;
        }
        case 'unblock': {
          this.blockList = this.blockList.filter((x) => x !== jid);
          break;
        }
      }
      return true;
    } catch (e) {
      this.pen.Error('update-block', e);
    }
  }

  /**
   * Get saved aliases
   * @returns {Object.<string, string>}
   */
  getAliases() {
    return read().aliases || {};
  }

  /**
   * Save aliases
   * @param {Object.<string, string>} aliases
   */
  saveAliases(aliases) {
    const data = read();
    data.aliases = aliases;
    write(data);
  }

  /**
   * Add plugin to handler
   * @param {string} location
   * @param {import('./plugin.js').Plugin} opts
   */
  async on(location, ...opts) {
    let i = 0;
    for (const opt of opts) {
      /* Check if plugin hasn't exec */
      if (!opt.exec) continue;

      const hash = hashCRC32(location);
      const plugin = new Plugin(opt);
      plugin.location = location;

      if (this.filter) {
        if (!this.filter(this, plugin)) continue;
      }

      const newid = `${hash}-${i}`;
      this.plugins.set(newid, plugin);

      /* Prefix command (e.g. cmd:'ai' + prefixes:['!'] -> '!ai'). Dispatched
         centrally, so it is NOT also added as a listener. */
      if (opt.cmd) {
        for (const [pattern, id] of this.generatePrefixCmd(newid, opt.cmd, opt.noPrefix)) {
          this.prefixCmds.set(pattern, id);
        }
      } else if (plugin.data) {
        /* Check if plugin has data, so it is a slash command */
        this.slashs.set(plugin.data.name, newid);
        if (opt.autocomplete) this.autoc.set(plugin.data.name, opt.autocomplete);
      } else {
        this.listens.set(newid, newid);
      }

      i++;
    }
  }

  /**
   * Generate prefix+cmd patterns for a plugin (ala mushi WA generateCMD).
   * @param {string} id plugin id
   * @param {string | string[]} cmds
   * @param {boolean} noPrefix match bare cmd without prefix
   * @returns {Array<[string, string]>} [pattern, id] pairs, pattern lowercase
   */
  generatePrefixCmd(id, cmds, noPrefix) {
    const list = Array.isArray(cmds) ? cmds : [cmds];
    const out = [];
    for (let cmd of list) {
      cmd = String(cmd).toLowerCase();
      if (noPrefix) {
        out.push([cmd, id]);
      } else {
        for (const prefix of this.prefixes) {
          out.push([`${prefix}${cmd}`.toLowerCase(), id]);
        }
      }
    }
    return out;
  }

  /** Check if given pattern is a registered prefix command. */
  isPrefixCmd(pattern) {
    return !!pattern && this.prefixCmds.has(String(pattern).toLowerCase());
  }

  /** Resolve pattern to its prefix command plugin. */
  getPrefixCmd(pattern) {
    if (!pattern) return null;
    const id = this.prefixCmds.get(String(pattern).toLowerCase());
    if (!id) return null;
    return this.plugins.get(id) ?? null;
  }

  /**
   * Persisted prefixes (data.json `prefixes`), default ['!'].
   * @param {string | string[]} list
   */
  setPrefixes(list) {
    this.prefixes = Array.isArray(list) ? list : [list];
    const data = read();
    data.prefixes = this.prefixes;
    write(data);
    // Rebuild patterns for already loaded prefix commands.
    this.prefixCmds.clear();
    for (const [id, plugin] of this.plugins) {
      if (plugin.cmd) {
        for (const [pattern, pid] of this.generatePrefixCmd(id, plugin.cmd, plugin.noPrefix)) {
          this.prefixCmds.set(pattern, pid);
        }
      }
    }
  }

  getPrefixes() {
    return this.prefixes;
  }

  /**
   * Remove plugin by hash
   * @param {string} hash
   */
  async removeOn(hash) {
    try {
      for (const id of this.plugins.keys()) {
        if (id.startsWith(hash)) {
          this.plugins.delete(id);
          for (const [id_ls, val] of this.listens) {
            if (val === id) this.listens.delete(id_ls);
          }
          for (const [id_sls, val] of this.slashs) {
            if (val === id_sls) this.slashs.delete(id_sls);
          }
          for (const [pattern, val] of this.prefixCmds) {
            if (val === id) this.prefixCmds.delete(pattern);
          }
        }
      }
    } catch (e) {
      this.pen.Error('remove-on', e);
    }
  }

  /**
   * Plugin scanner for given directory
   * @param {string} dir
   */
  async scanPlugin(dir) {
    let files = [];
    try {
      files = readdirSync(dir);
    } catch (e) {
      this.pen.Error('scan-plugin', e);
    }
    for (const file of files) {
      const loc = `${dir}/${file}`.replace('//', '/');

      try {
        if (statSync(loc)?.isDirectory()) await this.scanPlugin(loc);
      } catch (e) {
        this.pen.Error('scan-plugin-stat', e.message);
      }

      await this.loadFile(loc);
    }
  }

  /**
   * Preload plugins before start
   * @param {...Function} callbacks
   */
  async preLoad(...callbacks) {
    if (!callbacks) return;

    for (const callback of callbacks) {
      try {
        await callback(this);
      } catch (e) {
        this.pen.Error('pre-load', e);
      }
    }
  }

  /**
   * Load plugin file from given location
   * @param {string} loc
   */
  async loadFile(loc) {
    if (loc.endsWith('.js')) {
      try {
        const filename = loc.split('/').pop();
        if (filename.startsWith('_') || filename.startsWith('.') || filename.endsWith('.test.js')) {
          this.pen.Debug('Skip:', loc);
          return;
        }

        if (platform() === 'win32') {
          loc = pathToFileURL(loc).href;
        }

        const loaded = await import(`${loc}?t=${Date.now()}`);
        const counter = {
          pre: 0,
          default: 0,
        };

        if (loaded.pre) {
          if (Array.isArray(loaded.pre)) {
            this.preLoad(...loaded.pre);
            counter.pre++;
          } else {
            this.preLoad(loaded.pre);
            counter.pre++;
          }
        }

        if (loaded.default) {
          if (Array.isArray(loaded.default)) {
            this.on(loc, ...loaded.default);
          } else {
            this.on(loc, loaded.default);
            counter.default++;
          }
        }

        const msgs = ['Loaded'];
        for (const [name, val] of Object.entries(counter)) {
          if (val > 0) msgs.push(`${name}: ${val}`);
        }

        msgs.push(loc);

        this.pen.Debug(...msgs);
      } catch (e) {
        this.pen.Error('load-file', loc, e);
      }
    }
  }

  /**
   * Check if given context id is already exist in watchID
   * @param {import('./context.js').Ctx} ctx
   * @returns {boolean|undefined}
   */
  idExist(ctx) {
    if (this.watchID.includes(ctx?.id) || !ctx.type) {
      return true;
    } else {
      if (this.watchID.length >= 100) this.watchID.shift();
      this.watchID.push(ctx.id);
      return false;
    }
  }

  /**
   * Check if given context is safe to execute
   * @param {import('./context.js').Ctx} ctx
   * @returns {boolean|undefined}
   */
  isSafe() {
    return true;
  }

  /**
   * Handle autocomplete event with debouncing, cancellation, and caching
   * @param {import('discord.js').AutocompleteInteraction} event
   */
  async handleAutocomplete(event) {
    const fn = this.autoc.get(event.commandName);
    if (!fn) return;

    const focused = event.options.getFocused();
    const userId = event.user.id;
    const cacheKey = `${userId}-${event.commandName}-${focused}`;

    // Check cache (1 minute expiry)
    if (this.autocCache.has(cacheKey)) {
      const { results, expires } = this.autocCache.get(cacheKey);
      if (Date.now() < expires) {
        return await event.respond(results).catch(() => {});
      }
      this.autocCache.delete(cacheKey);
    }

    const key = `${userId}-${event.commandName}`;

    if (this.debounceAutoc.has(key)) {
      const { timer, controller } = this.debounceAutoc.get(key);
      clearTimeout(timer);
      controller.abort();
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await fn(event, controller.signal);
        if (results && !controller.signal.aborted) {
          await event.respond(results).catch(() => {});
          // Cache results for 1 minute
          this.autocCache.set(cacheKey, { results, expires: Date.now() + 60_000 });

          // Cleanup old cache entries
          if (this.autocCache.size > 1000) {
            const now = Date.now();
            for (const [k, v] of this.autocCache) {
              if (v.expires < now) this.autocCache.delete(k);
            }
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          this.pen.Error('autocomplete', e);
        }
      } finally {
        if (this.debounceAutoc.get(key)?.timer === timer) {
          this.debounceAutoc.delete(key);
        }
      }
    }, 1000);

    this.debounceAutoc.set(key, { timer, controller });
  }

  /**
   * Handle event and passed it to all plugins whether it is a command or a listener
   * @param {{event: import('discord.js').Message, oldEvent: import('discord.js').Message, eventType: string, eventName: string}}
   */
  async handle({ event, oldEvent, eventType, eventName }) {
    try {
      if (event?.author?.bot) return;

      if (event?.isAutocomplete?.()) {
        await this.handleAutocomplete(event);
        return;
      }

      const t0 = Date.now();
      const meta = () => ({
        guildId: event?.guildId ?? event?.guild?.id ?? null,
        channelId: event?.channelId ?? event?.channel?.id ?? null,
        userId: event?.user?.id ?? event?.author?.id ?? null,
        username: event?.user?.username ?? event?.author?.username ?? null,
      });
      const ctx = new Ctx({
        handler: this,
        eventName: eventName,
        event: event,
        oldEvent: oldEvent,
        eventType: eventType,
      });

      await this.updateData(ctx);

      if (this.paused) {
        if (ctx.isSlash && ctx.cmd === 'pause') return;
      }

      for (const lsid of this.listens.values()) {
        /** @type {import('./plugin.js').Plugin} */
        const listen = this.plugins.get(lsid);
        try {
          if (!listen) continue;

          ctx.plugin = () => listen;

          /* Check rules and midware before exec */
          const reason = await listen.check(ctx);
          if (!reason?.success) {
            if (listen?.final) await listen.final(ctx, reason);
            continue;
          }

          /* Exec */
          if (listen.exec) await listen.exec(ctx);
        } catch (e) {
          this.pen.Error('handle-listen', e);
          if (listen?.final) {
            await listen.final(
              ctx,
              new Reason({
                success: false,
                code: 'handle-listen-error',
                author: import.meta.url,
                message: e.message,
              }),
            );
          }
        } finally {
          ctx.plugin = null;
        }
      }

      /* Handle slash command */
      if (ctx.isSlash && ctx.cmd && this.isSafe(ctx)) {
        const pid = this.slashs.get(ctx.cmd);
        if (pid) {
          const plugin = this.plugins.get(pid);
          if (plugin) {
            const act = { type: 'slash', cmd: ctx.cmd, args: sanitizeArgs(ctx.argv), ...meta() };
            try {
              /** @type {import('./plugin.js').Plugin} */
              ctx.plugin = () => plugin;

              /* Check rules and midware before exec */
              const reason = await plugin?.check(ctx);
              if (!reason?.success) {
                try {
                  await ctx.reply({ content: reason.message, flags: MessageFlags.Ephemeral });
                } catch {
                  /* ignore */
                }
                if (plugin?.final) await plugin.final(ctx, reason);
                this.activity.record({ ...act, ok: false, code: reason?.code, latencyMs: Date.now() - t0 });
                return;
              }

              /* Exec */
              if (plugin?.exec) await plugin?.exec(ctx);
              this.activity.record({ ...act, ok: true, latencyMs: Date.now() - t0 });
            } catch (e) {
              this.pen.Error('handle-command', ctx.pattern, e);
              this.activity.record({ ...act, ok: false, code: 'handle-command-error', latencyMs: Date.now() - t0 });
              if (plugin?.final) {
                await plugin?.final(
                  ctx,
                  new Reason({
                    success: false,
                    code: 'handle-command-error',
                    author: import.meta.url,
                    message: e.message,
                  }),
                );
              }
            } finally {
              ctx.plugin = null;
            }
          }
        }
      }

      /* Handle prefix command */
      if (!ctx.isSlash && ctx.isPrefixCmd && this.isSafe(ctx)) {
        const plugin = this.getPrefixCmd(ctx.pattern);
        if (plugin) {
          const act = { type: 'prefix', cmd: ctx.cmd, prefix: ctx.prefix, args: sanitizeArgs(ctx.argv), ...meta() };
          try {
            /** @type {import('./plugin.js').Plugin} */
            ctx.plugin = () => plugin;

            /* Check rules and midware before exec */
            const reason = await plugin?.check(ctx);
            if (!reason?.success) {
              try {
                await ctx.reply({ content: reason.message, flags: MessageFlags.Ephemeral });
              } catch {
                /* ignore */
              }
              if (plugin?.final) await plugin.final(ctx, reason);
              this.activity.record({ ...act, ok: false, code: reason?.code, latencyMs: Date.now() - t0 });
              return;
            }

            /* Exec */
            if (plugin?.exec) await plugin?.exec(ctx);
            this.activity.record({ ...act, ok: true, latencyMs: Date.now() - t0 });
          } catch (e) {
            this.pen.Error('handle-prefix', ctx.pattern, e);
            this.activity.record({ ...act, ok: false, code: 'handle-prefix-error', latencyMs: Date.now() - t0 });
            if (plugin?.final) {
              await plugin?.final(
                ctx,
                new Reason({
                  success: false,
                  code: 'handle-prefix-error',
                  author: import.meta.url,
                  message: e.message,
                }),
              );
            }
          } finally {
            ctx.plugin = null;
          }
        }
      }

      /* message-like events only; intents without author/user (voice, member) skip the record */
      const msgLike =
        eventType === Events.MessageCreate ||
        eventType === Events.MessageUpdate ||
        eventType === Events.InteractionCreate;
      if (!ctx.isSlash && msgLike) {
        this.activity.record({
          type: 'message',
          eventType,
          messageId: event?.id ?? null,
          snippet: ctx.text?.slice(0, 200) ?? null,
          ...meta(),
          ok: true,
          latencyMs: Date.now() - t0,
        });
      }
    } catch (e) {
      this.pen.Error('handle', e);
    }
  }

  /**
   * Handle update data
   * @param {import('./context.js').Ctx} ctx
   */
  async updateData() {
    // Placeholder for future data updates
  }

  /**
   * Attach client to handler & start listening for events
   * @param {import('discord.js').Client} client
   */
  async attach(client) {
    this.pen.Debug('Attaching client');

    this.client = client ?? this.client;

    this.client.once(Events.ClientReady, async (e) => await this.eventReady(e));

    this.client.on(
      Events.MessageUpdate,
      async (o, m) => await this.handle({ eventType: Events.MessageUpdate, event: m, oldEvent: o }),
    );
    this.client.on(Events.MessageCreate, async (m) => await this.handle({ eventType: Events.MessageCreate, event: m }));

    /* messageDelete / messageDeleteBulk */
    this.client.on(Events.MessageDelete, async (m) => {
      try {
        this.activity.record({
          type: 'message-delete',
          guildId: m?.guildId ?? m?.channel?.guildId ?? null,
          channelId: m?.channelId ?? m?.channel?.id ?? null,
          messageId: m?.id ?? null,
          snippet: m?.content?.slice(0, 200) ?? null,
        });
        await this.handle({ eventType: Events.MessageDelete, event: m });
      } catch (e) {
        this.pen.Error('message-delete', e);
      }
    });
    this.client.on(Events.MessageBulkDelete, async (collection) => {
      try {
        const first = collection?.first() ?? null;
        this.activity.record({
          type: 'message-delete-bulk',
          guildId: first?.guildId ?? first?.channel?.guildId ?? null,
          channelId: first?.channelId ?? first?.channel?.id ?? null,
          count: collection?.size ?? 0,
        });
        await this.handle({ eventType: Events.MessageBulkDelete, event: collection });
      } catch (e) {
        this.pen.Error('message-delete-bulk', e);
      }
    });

    /** create/update/delete wiring: fields(current, old) builds the activity record. */
    const wireCrud = (addEvt, updEvt, delEvt, prefix, fields) => {
      this.client.on(addEvt, async (e) => {
        try {
          this.activity.record({ type: `${prefix}-create`, ...fields(e, e) });
          await this.handle({ eventType: addEvt, event: e });
        } catch (err) {
          this.pen.Error(`${prefix}-create`, err);
        }
      });
      this.client.on(updEvt, async (oldX, newX) => {
        try {
          this.activity.record({ type: `${prefix}-update`, ...fields(newX, oldX) });
          await this.handle({ eventType: updEvt, event: newX, oldEvent: oldX });
        } catch (err) {
          this.pen.Error(`${prefix}-update`, err);
        }
      });
      this.client.on(delEvt, async (e) => {
        try {
          this.activity.record({ type: `${prefix}-delete`, ...fields(e, e) });
          await this.handle({ eventType: delEvt, event: e });
        } catch (err) {
          this.pen.Error(`${prefix}-delete`, err);
        }
      });
    };
    wireCrud(Events.ThreadCreate, Events.ThreadUpdate, Events.ThreadDelete, 'thread', (thread, oldThread) => ({
      guildId: thread?.guildId ?? thread?.guild?.id ?? null,
      threadId: thread?.id ?? null,
      threadName: thread?.name ?? oldThread?.name ?? null,
    }));
    wireCrud(Events.RoleCreate, Events.RoleUpdate, Events.RoleDelete, 'role', (role, oldRole) => ({
      guildId: role?.guildId ?? role?.guild?.id ?? null,
      roleId: role?.id ?? null,
      roleName: role?.name ?? oldRole?.name ?? null,
      oldRoleName: oldRole?.name && oldRole?.name !== role?.name ? oldRole.name : null,
    }));
    wireCrud(Events.GuildEmojiCreate, Events.GuildEmojiUpdate, Events.GuildEmojiDelete, 'emoji', (emoji, oldEmoji) => ({
      guildId: emoji?.guildId ?? emoji?.guild?.id ?? null,
      emojiId: emoji?.id ?? null,
      emojiName: emoji?.name ?? oldEmoji?.name ?? null,
      oldEmojiName: oldEmoji?.name && oldEmoji?.name !== emoji?.name ? oldEmoji.name : null,
    }));
    wireCrud(
      Events.GuildStickerCreate,
      Events.GuildStickerUpdate,
      Events.GuildStickerDelete,
      'sticker',
      (sticker, oldSticker) => ({
        guildId: sticker?.guildId ?? sticker?.guild?.id ?? null,
        stickerId: sticker?.id ?? null,
        stickerName: sticker?.name ?? oldSticker?.name ?? null,
        oldStickerName: oldSticker?.name && oldSticker?.name !== sticker?.name ? oldSticker.name : null,
      }),
    );

    /* invites */
    this.client.on(Events.InviteCreate, async (invite) => {
      try {
        this.activity.record({
          type: 'invite-create',
          guildId: invite?.guildId ?? invite?.guild?.id ?? null,
          code: invite?.code ?? null,
          inviterId: invite?.inviterId ?? invite?.inviter?.id ?? null,
          username: invite?.inviter?.username ?? null,
          channelId: invite?.channelId ?? null,
        });
        await this.handle({ eventType: Events.InviteCreate, event: invite });
      } catch (e) {
        this.pen.Error('invite-create', e);
      }
    });
    this.client.on(Events.InviteDelete, async (invite) => {
      try {
        this.activity.record({
          type: 'invite-delete',
          guildId: invite?.guildId ?? invite?.guild?.id ?? null,
          code: invite?.code ?? null,
          channelId: invite?.channelId ?? null,
        });
        await this.handle({ eventType: Events.InviteDelete, event: invite });
      } catch (e) {
        this.pen.Error('invite-delete', e);
      }
    });

    /* bans */
    this.client.on(Events.GuildBanAdd, async (ban) => {
      try {
        this.activity.record({
          type: 'ban',
          guildId: ban?.guild?.id ?? ban?.guildId ?? null,
          userId: ban?.user?.id ?? ban?.id ?? null,
          username: ban?.user?.username ?? null,
          reason: ban?.reason ?? null,
        });
        await this.handle({ eventType: Events.GuildBanAdd, event: ban });
      } catch (e) {
        this.pen.Error('ban', e);
      }
    });
    this.client.on(Events.GuildBanRemove, async (ban) => {
      try {
        this.activity.record({
          type: 'unban',
          guildId: ban?.guild?.id ?? ban?.guildId ?? null,
          userId: ban?.user?.id ?? ban?.id ?? null,
          username: ban?.user?.username ?? null,
          reason: ban?.reason ?? null,
        });
        await this.handle({ eventType: Events.GuildBanRemove, event: ban });
      } catch (e) {
        this.pen.Error('unban', e);
      }
    });

    /* audit log entries: who did what (executor, action, target) */
    this.client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
      try {
        this.activity.record({
          type: 'audit',
          guildId: guild?.id ?? entry?.guild?.id ?? null,
          actionType: entry?.actionType ?? null,
          action: entry?.targetType ?? entry?.action ?? null,
          executorId: entry?.executorId ?? null,
          username: entry?.executor?.username ?? null,
          targetName: entry?.target?.name ?? entry?.target?.username ?? entry?.targetTag ?? null,
          reason: entry?.reason ?? null,
        });
        await this.handle({ eventType: Events.GuildAuditLogEntryCreate, event: entry, oldEvent: guild });
      } catch (e) {
        this.pen.Error('audit', e);
      }
    });

    /* reactions */
    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      try {
        this.activity.record({
          type: 'reaction-add',
          guildId: reaction?.message?.guildId ?? null,
          channelId: reaction?.message?.channelId ?? null,
          messageId: reaction?.message?.id ?? null,
          emoji: reaction?.emoji?.name ?? null,
          userId: user?.id ?? null,
          username: user?.username ?? null,
        });
        await this.handle({ eventType: Events.MessageReactionAdd, event: reaction, oldEvent: user });
      } catch (e) {
        this.pen.Error('reaction-add', e);
      }
    });
    this.client.on(Events.MessageReactionRemove, async (reaction, user) => {
      try {
        this.activity.record({
          type: 'reaction-remove',
          guildId: reaction?.message?.guildId ?? null,
          channelId: reaction?.message?.channelId ?? null,
          messageId: reaction?.message?.id ?? null,
          emoji: reaction?.emoji?.name ?? null,
          userId: user?.id ?? null,
          username: user?.username ?? null,
        });
        await this.handle({ eventType: Events.MessageReactionRemove, event: reaction, oldEvent: user });
      } catch (e) {
        this.pen.Error('reaction-remove', e);
      }
    });

    /* user rename / avatar change (global) */ /* user rename / avatar change (global) */
    this.client.on(Events.UserUpdate, async (oldUser, user) => {
      try {
        this.activity.record({
          type: 'user-update',
          userId: user?.id ?? null,
          oldUsername: oldUser?.username ?? null,
          username: user?.username ?? null,
        });
        await this.handle({ eventType: Events.UserUpdate, event: user, oldEvent: oldUser });
      } catch (e) {
        this.pen.Error('user-update', e);
      }
    });

    /* server rename / icon change (global) */
    this.client.on(Events.GuildUpdate, async (oldGuild, guild) => {
      try {
        this.activity.record({
          type: 'guild-update',
          guildId: guild?.id ?? null,
          oldGuildName: oldGuild?.name ?? null,
          guildName: guild?.name ?? null,
        });
        await this.handle({ eventType: Events.GuildUpdate, event: guild, oldEvent: oldGuild });
      } catch (e) {
        this.pen.Error('guild-update', e);
      }
    });

    /* scheduled events */
    for (const [evt, type] of [
      [Events.GuildScheduledEventCreate, 'schedule-create'],
      [Events.GuildScheduledEventUpdate, 'schedule-update'],
      [Events.GuildScheduledEventDelete, 'schedule-delete'],
    ]) {
      this.client.on(evt, async (e) => {
        try {
          this.activity.record({
            type,
            guildId: e?.guild?.id ?? e?.guildId ?? null,
            eventId: e?.id ?? null,
            eventName: e?.name ?? null,
            startAt: e?.scheduledStartTimestamp ?? null,
          });
          await this.handle({ eventType: evt, event: e });
        } catch (err) {
          this.pen.Error(type, err);
        }
      });
    }
    this.client.on(Events.GuildScheduledEventUserAdd, async (e, user) => {
      try {
        this.activity.record({
          type: 'schedule-subscribe',
          guildId: e?.guild?.id ?? null,
          eventId: e?.id ?? null,
          eventName: e?.name ?? null,
          userId: user?.id ?? null,
          username: user?.username ?? null,
        });
        await this.handle({ eventType: Events.GuildScheduledEventUserAdd, event: e, oldEvent: user });
      } catch (err) {
        this.pen.Error('schedule-subscribe', err);
      }
    });
    this.client.on(Events.GuildScheduledEventUserRemove, async (e, user) => {
      try {
        this.activity.record({
          type: 'schedule-unsubscribe',
          guildId: e?.guild?.id ?? null,
          eventId: e?.id ?? null,
          eventName: e?.name ?? null,
          userId: user?.id ?? null,
          username: user?.username ?? null,
        });
        await this.handle({ eventType: Events.GuildScheduledEventUserRemove, event: e, oldEvent: user });
      } catch (err) {
        this.pen.Error('schedule-unsubscribe', err);
      }
    });

    /* webhook create/delete is audit-level info; this event fires per channel */
    this.client.on(Events.WebhooksUpdate, async (guild, channel) => {
      try {
        this.activity.record({
          type: 'webhook-update',
          guildId: guild?.id ?? channel?.guildId ?? null,
          channelId: channel?.id ?? null,
          channelName: channel?.name ?? null,
        });
        await this.handle({ eventType: Events.WebhooksUpdate, event: channel, oldEvent: guild });
      } catch (e) {
        this.pen.Error('webhook-update', e);
      }
    });

    /* Member join/leave: activity record + listener plugins */
    for (const [evt, type] of [
      [Events.GuildMemberAdd, 'member-join'],
      [Events.GuildMemberRemove, 'member-leave'],
    ]) {
      this.client.on(evt, async (member) => {
        try {
          this.activity.record({
            type,
            guildId: member?.guild?.id ?? null,
            userId: member?.id ?? null,
            username: member?.user?.username ?? member?.id ?? null,
          });
          await this.handle({ eventType: evt, eventName: evt, event: member });
          /* Leaving the server ends any voice session */
          if (type === 'member-leave') this.voiceSessions.delete(`${member?.guild?.id}:${member?.id}`);
        } catch (e) {
          this.pen.Error(type, e);
        }
      });
    }

    this.client.on(Events.ChannelDelete, async (ch) => {
      try {
        this.activity.record({
          type: 'channel-delete',
          guildId: ch?.guild?.id ?? ch?.guildId ?? null,
          channelId: ch?.id ?? null,
          channelName: ch?.name ?? null,
        });
        await this.handle({ eventType: Events.ChannelDelete, event: ch });
        if (!ch?.isVoiceBased?.()) return;
        const { handleVoiceChannelDelete } = await import('./plugins/music/_player.js');
        handleVoiceChannelDelete(ch.guild?.id ?? ch.guildId, ch.id);
      } catch (e) {
        this.pen.Error('channel-delete', e?.message ?? e);
      }
    });
    this.client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      try {
        const { channelId: oldChannelId } = oldState;
        const { channelId: newChannelId } = newState;

        /* Same channel: only mute/deaf/screen changes dispatch to listener plugins */
        if (oldChannelId === newChannelId) {
          const changed =
            oldState.selfMute !== newState.selfMute ||
            oldState.selfDeaf !== newState.selfDeaf ||
            oldState.serverMute !== newState.serverMute ||
            oldState.serverDeaf !== newState.serverDeaf ||
            oldState.streaming !== newState.streaming ||
            oldState.selfVideo !== newState.selfVideo;
          if (!changed) return;
          await this.handle({
            eventType: Events.VoiceStateUpdate,
            eventName: Events.VoiceStateUpdate,
            event: newState,
            oldEvent: oldState,
          });
          return;
        }

        const userId = newState.id;
        const member = newState.guild?.members.cache.get(userId);
        const username = member?.user?.username ?? userId;
        const guildId = newState.guild?.id ?? null;
        const key = `${guildId}:${userId}`;

        if (!oldChannelId && newChannelId) {
          const ch = newState.channel;
          this.voiceSessions.set(key, { channelId: newChannelId, joinedAt: Date.now(), totalMs: 0 });
          this.activity.record({
            type: 'voice-join',
            guildId,
            channelId: newChannelId,
            channelName: ch?.name ?? null,
            userId,
            username,
          });
        } else if (oldChannelId && !newChannelId) {
          const ch = oldState.channel;
          const s = this.voiceSessions.get(key);
          const segMs = s ? Date.now() - s.joinedAt : null;
          const totalMs = s && segMs !== null ? s.totalMs + segMs : null;
          this.activity.record({
            type: 'voice-leave',
            guildId,
            channelId: oldChannelId,
            channelName: ch?.name ?? null,
            userId,
            username,
            durationMs: segMs,
            totalMs,
          });
        } else {
          const oldCh = oldState.channel;
          const newCh = newState.channel;
          const s = this.voiceSessions.get(key);
          const segMs = s ? Date.now() - s.joinedAt : null;
          if (s) {
            s.totalMs += segMs;
            s.channelId = newChannelId;
            s.joinedAt = Date.now();
          }
          this.activity.record({
            type: 'voice-move',
            guildId,
            channelId: newChannelId,
            channelName: newCh?.name ?? null,
            fromChannelId: oldChannelId,
            fromChannelName: oldCh?.name ?? null,
            userId,
            username,
            durationMs: segMs,
          });
        }

        /* Listener plugins see voice changes as ctx.event/ctx.oldEvent */
        await this.handle({
          eventType: Events.VoiceStateUpdate,
          eventName: Events.VoiceStateUpdate,
          event: newState,
          oldEvent: oldState,
        });

        /* Session ends after dispatch so the leave duration stays readable */
        if (oldChannelId && !newChannelId) this.voiceSessions.delete(key);
      } catch (e) {
        this.pen.Error('voice-state-update', e?.message ?? e);
      }
    });
    if (this.useSlash)
      this.client.on(
        Events.InteractionCreate,
        async (m) => await this.handle({ eventType: Events.InteractionCreate, event: m }),
      );
  }

  /**
   * Rejoin stay voice channels saved in data.json (after bot restart).
   */
  async restoreStay() {
    const stay = read().stay ?? {};
    const guildIds = Object.keys(stay);
    if (guildIds.length === 0) return;
    const { connect, getState } = await import('./plugins/music/_player.js');
    let rejoined = 0;
    for (const guildId of guildIds) {
      try {
        const guild = this.client.guilds.cache.get(guildId);
        const channelId = stay[guildId]?.channelId;
        if (!guild || !channelId) continue;
        const ch = await guild.channels.fetch(channelId).catch(() => null);
        if (!ch?.isVoiceBased?.()) continue;
        getState(guildId);
        await connect(guild, ch);
        rejoined++;
      } catch (e) {
        this.pen.Error('restore-stay', guildId, e?.message ?? e);
      }
    }
    if (rejoined > 0) this.pen.Info(`Stay restored in ${rejoined} voice channel(s)`);
  }

  /**
   * Handle when client ready
   *
   * @param {import()} e
   */
  async eventReady(e) {
    this.pen.Info('Client ready :', e.user.tag);
    this.pen.Info(
      `${this.slashs.size} Slashs (${this.useSlash ? 'enabled' : 'disabled'}), ${this.listens.size} Listeners of ${this.plugins.size} Plugins`,
    );
    this.restoreStay().catch((err) => this.pen.Error('restore-stay', err?.message ?? err));
    await delay(1000);

    if (this.useSlash) {
      this.client.commands = new Collection();
      const commands = [];
      for (const [name, pid] of this.slashs) {
        const cmd = this.plugins.get(pid);
        this.client.commands.set(name, cmd);
        commands.push(cmd.data.toJSON());
      }

      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      if (process.env.DISCORD_GUILD_ID) {
        await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID), {
          body: commands,
        });
      } else {
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
      }
    }
  }
}

export const handler = new Handler({});
