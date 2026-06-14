/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { Events } from 'discord.js';
import minimist from 'minimist';
import parseArgsStringToArgv from 'string-argv';
import { Role } from './plugin.js';

/**
 * @typedef {Object} CtxOpts
 * @property {import('./handler.js').Handler} handler
 * @property {string} eventName
 * @property {string} eventType
 * @property {import('discord.js').Message | import('discord.js').ChatInputCommandInteraction} event
 * @property {import('discord.js').Message} oldEvent
 */

export class Ctx {
 /**
  * @param {CtxOpts}
  */
 constructor({ handler, eventName, eventType, event, oldEvent }) {
  /** @returns {import('./handler.js').Handler} */
  this.handler = () => handler;

  /** @type {import('./plugin.js').Plugin} */
  this.plugin = null;

  /** @type {string} */
  this.prefix = '';

  /** @returns {import('discord.js').Client} */
  this.client = () => handler?.client;

  /**
   * @param {import('discord.js').Message | undefined} m
   * @returns {string}
   */
  this.getName = (m) => {
   if (!m) m = event;
   let senderName = m.user?.username ?? m.author?.username;

   if (m.user) {
    if (m.user?.globalName) senderName = m.user.globalName;
    if (m.user?.nickname) senderName = m.user.nickname;
   }

   if (m.author) {
    if (m.author?.globalName) senderName = m.author.globalName;
    if (m.author?.nickname) senderName = m.author.nickname;
   }
   return senderName;
  };

  /**
   * @param {string} id
   * @returns {import('discord.js').Message | undefined}
   */
  this.fetch = async (id) => await event?.channel?.messages?.fetch(id);

  /** @returns {import('./user_manager.js').User | null} */
  this.user = () => handler?.userManager?.getUser(this.senderId) ?? null;

  /** @type {string} */
  this.lang = this.user()?.lang || 'en';

  /** @param {string | import('discord.js').MessagePayload | import('discord.js').MessageReplyOptions} content */
  this.reply = async (content) => await event.reply(content);

  /** @param {string | import('discord.js').MessagePayload | import('discord.js').MessageReplyOptions} content */
  this.send = async (content) => await event?.channel?.send(content);

  /** @param {string} e */
  this.react = async (e) => {
   if (typeof event?.react === 'function') await event.react(e);
  };

  /**
   * @param {string} text - Text to parse
   */
  this.parseText = (text) => {
   this.text = text;

   /* Parsing cmd */
   if (text && text.length > 0) {
    const splitted = text.split(' ');
    /** @type {string} - With prefix */
    this.pattern = splitted[0];

    /** @type {string} - No prefixed */
    this.cmd = this.pattern?.slice(this.prefix?.length ?? 0);

    /** @type {string} */
    this.args = splitted.slice(1)?.join(' ');

    /** @type {boolean} */
    this.isCMD = handler?.isCMD(this.pattern);

    if (this.args && this.args?.length > 0) {
     try {
      /** @type {import('minimist').ParsedArgs} */
      this.argv = minimist(parseArgsStringToArgv(this.args));
     } catch {
      /* do nothing */
     }
    }
   }
  };

  this.parseText(event.content);

  /** @type {string} */
  this.eventName = eventName;

  /** @type {import('discord.js').Message | import('discord.js').ChatInputCommandInteraction} */
  this.event = event;

  /** @type {string} */
  this.eventType = eventType;

  /** @type {number} */
  this.timestamp = event?.timestamp ? event.timestamp * 1000 : Date.now();

  /** @type {string} */
  this.me = this.client()?.user?.username ?? this.client()?.user?.globalName ?? this.client()?.user?.tag;

  /** @type {string} */
  this.chat = event?.channelId;

  /** @type {string} */
  this.chatName = event?.channel?.name;

  /** @type {string} */
  this.sender = event?.user?.username ?? event?.author?.username;

  /** @type {string} */
  this.senderId = event?.user?.id ?? event?.author?.id;

  /** @type {string} */
  this.senderName = this.getName(null);

  /** @type {string} */
  this.serverName = event?.guild?.name;

  /** @type {boolean} */
  this.fromMe = event?.author?.id === this.client()?.user?.id;

  /** @type {boolean} */
  this.isEdited = oldEvent !== null || oldEvent !== undefined;

  /** @type {string} */
  this.quotedId = event?.reference?.messageId;

  /** @type {boolean} */
  this.quoted = async () => await this.fetch(this.quotedId);

  switch (eventType) {
   case Events.InteractionCreate:
    this.argv = {};
    event.options?.data?.forEach((o) => {
     this.argv[o.name] = o.value;
    });
    this.cmd = event.commandName;
    this.isCMD = true;

    /** @type {boolean} */
    this.isSlash = true;

    this.text = `/${event.commandName}`;
    break;

   default:
    break;
  }

  /** @type {Array<import('./plugin.js').Role> | any} */
  this.roles = handler?.userManager?.getUser(this.senderId)?.roles ?? [Role.USER];
 }
}
