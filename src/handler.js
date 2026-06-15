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
  constructor({ pluginDir, useSlash, filter, pen }) {
    /** @type {number} */
    this.startAt = Date.now();

    this.pluginDir = pluginDir ?? `${import.meta.dirname}/plugins/`;

    /** @type {Function} */
    this.filter = filter;

    /** @type {boolean} */
    this.useSlash = useSlash ?? true;

    /** @type {import('discord.js').Client} */
    this.client = null;

    /** @type {import('./pen.js').Pen)} */
    this.pen = pen ?? new Pen({ prefix: 'hand' });

    /** @type {Map<number, import('./plugin.js').Plugin>} */
    this.plugins = new Map();

    /** @type {Map<number, number>} */
    this.listens = new Map();

    /* Slash command */
    this.slashs = new Map();

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

      /* Check if plugin has data, so it is a slash command */
      if (plugin.data) {
        this.slashs.set(plugin.data.name, newid);
        if (opt.autocomplete) this.autoc.set(plugin.data.name, opt.autocomplete);
      } else {
        this.listens.set(newid, newid);
      }

      i++;
    }
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
                return;
              }

              /* Exec */
              if (plugin?.exec) await plugin?.exec(ctx);
            } catch (e) {
              this.pen.Error('handle-command', ctx.pattern, e);
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
    if (this.useSlash)
      this.client.on(
        Events.InteractionCreate,
        async (m) => await this.handle({ eventType: Events.InteractionCreate, event: m }),
      );
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
