/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

export const LL_NONE = 0;
export const LL_DEBUG = 1;
export const LL_INFO = 2;
export const LL_WARN = 3;
export const LL_ERROR = 4;

/** @type {string} */
export const TIME_FORMAT = 'HH:mm:ss.SSS';

/** 
 * getTime returns the current time in the specified format.
 *
 * @param {string} format - The format of the time.
 * @returns {string} The current time in the specified format.
 */
export function getTime(format) {
  if (!format || format === '') {
    format = TIME_FORMAT;
  }
  const now = new Date();
  const repl = {
    'HH': now.getHours().toString().padStart(2, '0'),
    'mm': now.getMinutes().toString().padStart(2, '0'),
    'ss': now.getSeconds().toString().padStart(2, '0'),
    'SSS': now.getMilliseconds().toString().padStart(3, '0')
  }

  for (const key in repl) {
    format = format.replaceAll(key, repl[key]);
  }
  return format;
}


/**
 * Pen is a class that provides methods to print colored logs to the console.
 *
 * @param {number} level - The level of the log.
 * @returns {Pen} A new instance of the Pen class with the specified level.
 */
export class Pen {

  constructor({ level, format, prefix }) {
    this.prefix = prefix;
    this.level = level;
    this.format = format ?? TIME_FORMAT;
  }

  SetPrefix(prefix) {
    this.prefix = prefix;
  }

  asString(...args) {
    return args?.map(arg =>
      typeof arg === 'object' && arg !== null
        ? JSON.stringify(arg)
        : String(arg)
    ).join(' ')
  }

  asColor(code, ...args) { return `\x1b[${code}m` + this.asString(...args) + '\x1b[0m'; }

  Black(...args) { return this.asColor(30, ...args); }
  Red(...args) { return this.asColor(31, ...args); }
  Green(...args) { return this.asColor(32, ...args); }
  Yellow(...args) { return this.asColor(33, ...args); }
  Blue(...args) { return this.asColor(34, ...args); }
  Magenta(...args) { return this.asColor(35, ...args); }
  Cyan(...args) { return this.asColor(36, ...args); }
  White(...args) { return this.asColor(37, ...args); }

  BlackFG(...args) { return this.asColor(40, ...args); }
  RedFG(...args) { return this.asColor(41, ...args); }
  GreenFG(...args) { return this.asColor(42, ...args); }
  YellowFG(...args) { return this.asColor(43, ...args); }
  BlueFG(...args) { return this.asColor(44, ...args); }
  MagentaFG(...args) { return this.asColor(45, ...args); }
  CyanFG(...args) { return this.asColor(46, ...args); }
  WhiteFG(...args) { return this.asColor(47, ...args); }

  BlackBr(...args) { return this.asColor(90, ...args); }
  RedBr(...args) { return this.asColor(91, ...args); }
  GreenBr(...args) { return this.asColor(92, ...args); }
  YellowBr(...args) { return this.asColor(93, ...args); }
  BlueBr(...args) { return this.asColor(94, ...args); }
  MagentaBr(...args) { return this.asColor(95, ...args); }
  CyanBr(...args) { return this.asColor(96, ...args); }
  WhiteBr(...args) { return this.asColor(97, ...args); }

  BlackBrFG(...args) { return this.asColor(100, ...args); }
  RedBrFG(...args) { return this.asColor(101, ...args); }
  GreenBrFG(...args) { return this.asColor(102, ...args); }
  YellowBrFG(...args) { return this.asColor(103, ...args); }
  BlueBrFG(...args) { return this.asColor(104, ...args); }
  MagentaBrFG(...args) { return this.asColor(105, ...args); }
  CyanBrFG(...args) { return this.asColor(106, ...args); }
  WhiteBrFG(...args) { return this.asColor(107, ...args); }

  Log(...args) {
    if (this.prefix) {
      console.log(getTime(this.format), this.prefix, ...args);
    } else {
      console.log(getTime(this.format), ...args);
    }
  }

  Debug(...args) {
    if (this.level > LL_DEBUG || this.level == LL_NONE) {
      return
    }
    this.Log(this.Magenta('[D]'), ...args);
  }

  Info(...args) {
    if (this.level > LL_INFO || this.level == LL_NONE) {
      return
    }
    this.Log(this.Cyan('[I]'), ...args);
  }

  Warn(...args) {
    if (this.level > LL_WARN || this.level == LL_NONE) {
      return
    }
    this.Log(this.Yellow('[W]'), ...args);
  }

  Error(...args) {
    if (this.level > LL_ERROR || this.level == LL_NONE) {
      return
    }
    this.Log(this.Red('[E]'), ...args);
  }
}

export const pen = new Pen({ format: 'HH:mm:ss' });

export default pen;
