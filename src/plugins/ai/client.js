/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const GEMINI_APP_URL = 'https://gemini.google.com/app';
const GEMINI_STREAM_GENERATE_URL =
  'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MODEL_HEADER_NAME = 'x-goog-ext-525001261-jspb';

function makeModelHeader(hash, idx, b = 1) {
  return JSON.stringify([
    1,
    null,
    null,
    null,
    hash,
    null,
    null,
    0,
    [4, 5, 6, 8],
    null,
    null,
    2,
    null,
    null,
    idx,
    b,
    crypto.randomUUID(),
  ]);
}

const MODEL_HEADERS = {
  'gemini-3.1-pro': makeModelHeader('e6fa609c3fa255c0', 3),
  'gemini-3.5-flash': makeModelHeader('56fdd199312815e2', 1),
  'gemini-3.1-flash-lite': makeModelHeader('8c46e95b1a07cecc', 6),
  'gemini-3.5-flash-lite': makeModelHeader('cf41b0e0dd7d53e5', 6),
  'gemini-3.6-flash': makeModelHeader('fbb127bbb056c959', 1),
  'gemini-3.6-flash-expanded': makeModelHeader('fbb127bbb056c959', 1, 2),
};
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MODEL_LIMITS = {
  'gemini-3.1-pro': 1_048_576,
  'gemini-3.5-flash': 1_048_576,
  'gemini-3.1-flash-lite': 1_048_576,
  'gemini-3.5-flash-lite': 1_048_576,
  'gemini-3.6-flash': 1_048_576,
  'gemini-3.6-flash-expanded': 1_048_576,
};
const ALL_COOKIE_NAMES = [
  '__Secure-1PSID',
  '__Secure-1PSIDTS',
  '__Secure-1PSIDCC',
  '__Secure-1PAPISID',
  'NID',
  'AEC',
  'SOCS',
  '__Secure-BUCKET',
  '__Secure-ENID',
  'SID',
  'HSID',
  'SSID',
  'APISID',
  'SAPISID',
  '__Secure-3PSID',
  '__Secure-3PSIDTS',
  '__Secure-3PAPISID',
  'SIDCC',
];

const REQUIRED_COOKIES = ['__Secure-1PSID', '__Secure-1PSIDTS'];

function getNestedValue(value, pathParts, fallback) {
  let current = value;
  for (const part of pathParts) {
    if (current == null) return fallback;
    if (typeof part === 'number') {
      if (!Array.isArray(current)) return fallback;
      current = current[part];
    } else {
      if (typeof current !== 'object') return fallback;
      current = current[part];
    }
  }
  return current ?? fallback;
}

function buildCookieHeader(cookieMap) {
  return Object.entries(cookieMap)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function buildCookieMap(cookies) {
  const cookieMap = {};
  for (const name of ALL_COOKIE_NAMES) {
    const cookie = cookies.find((c) => c.name === name && c.value);
    if (cookie) cookieMap[name] = cookie.value;
  }
  return cookieMap;
}

function hasRequiredCookies(cookieMap) {
  return REQUIRED_COOKIES.every((name) => Boolean(cookieMap[name]));
}

export function tagIt(tagName, content, attrs = {}) {
  return `<${tagName}${Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')}>${content}</${tagName}>`;
}

class GeminiClient {
  #agent;
  #cachedAccessToken = null;
  #accessTokenTime = 0;
  #cookieMap = {};
  #timeout = 300000;
  #timezone = 'Asia/Jakarta';

  constructor(options = {}) {
    this.#agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 5,
      maxHeaderSize: 65536,
    });
    if (options.cookies) {
      this.#cookieMap = buildCookieMap(options.cookies);
    } else if (options.cookiesFile) {
      this.loadCookiesFromFile(options.cookiesFile);
    }
    if (options.timeout) this.#timeout = options.timeout;
    if (options.timezone) this.#timezone = options.timezone;
  }

  loadCookiesFromFile(filePath = 'cookies.json') {
    const absPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Cookies file not found: ${absPath}`);
    }
    const cookies = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
    const arr = Array.isArray(cookies) ? cookies : Object.entries(cookies).map(([name, value]) => ({ name, value }));
    this.#cookieMap = buildCookieMap(arr);
    if (!hasRequiredCookies(this.#cookieMap)) {
      const missing = REQUIRED_COOKIES.filter((c) => !this.#cookieMap[c]);
      throw new Error(`Missing required cookies: ${missing.join(', ')}`);
    }
    return this;
  }

  loadCookies(cookies) {
    this.#cookieMap = buildCookieMap(cookies);
    if (!hasRequiredCookies(this.#cookieMap)) {
      const missing = REQUIRED_COOKIES.filter((c) => !this.#cookieMap[c]);
      throw new Error(`Missing required cookies: ${missing.join(', ')}`);
    }
    return this;
  }

  get hasCookies() {
    return hasRequiredCookies(this.#cookieMap);
  }

  async #httpsGet(url, headers, opts = {}) {
    const { binary = false, timeoutMs = 30000, label = 'httpsGet' } = opts;
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'user-agent': USER_AGENT,
          connection: 'keep-alive',
          ...headers,
        },
        agent: this.#agent,
        rejectUnauthorized: false,
        timeout: timeoutMs,
        maxHeaderSize: 65536,
      };
      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: binary ? null : buffer.toString('utf-8'),
            buffer: binary ? buffer : null,
          });
        });
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error(`${label}: timeout`)));
      req.on('error', reject);
      req.end();
    });
  }

  async #httpsPost(url, headers, body, opts = {}) {
    const { timeoutMs = 30000, label = 'httpsPost' } = opts;
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf-8');
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'user-agent': USER_AGENT,
          connection: 'keep-alive',
          ...headers,
          'content-length': bodyBuffer.length,
        },
        agent: this.#agent,
        rejectUnauthorized: false,
        timeout: timeoutMs,
        maxHeaderSize: 65536,
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: data,
          }),
        );
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error(`${label}: timeout`)));
      req.on('error', reject);
      req.write(bodyBuffer);
      req.end();
    });
  }

  async #fetchWithRedirects(url, headers, maxRedirects = 10, binary = false, opts = {}) {
    let current = url;
    for (let i = 0; i <= maxRedirects; i++) {
      const res = await this.#httpsGet(current, headers, { ...opts, binary });
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        current = new URL(res.headers.location, current).toString();
        continue;
      }
      return res;
    }
    throw new Error('Too many redirects');
  }

  async #getAccessToken() {
    const now = Date.now();
    if (this.#cachedAccessToken && now - this.#accessTokenTime < 5 * 60 * 1000) {
      return this.#cachedAccessToken;
    }
    const cookieHeader = buildCookieHeader(this.#cookieMap);
    const res = await this.#fetchWithRedirects(GEMINI_APP_URL, { cookie: cookieHeader }, 10, false, {
      label: 'accessToken',
    });
    const html = res.text;
    for (const key of ['SNlM0e', 'thykhd']) {
      const match = html.match(new RegExp(`"${key}":"(.*?)"`));
      if (match?.[1]) {
        this.#cachedAccessToken = match[1];
        this.#accessTokenTime = now;
        return this.#cachedAccessToken;
      }
    }
    throw new Error('Failed to get access token. Cookies may be expired.');
  }

  #trimJsonEnvelope(text) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('Invalid JSON response');
    return text.slice(start, end + 1);
  }

  #cleanText(text) {
    const cleaned = text
      .split('\n')
      .filter((line) => !line.match(/^https?:\/\/googleusercontent\.com\/card_content\//))
      .join('\n');
    return cleaned.trim();
  }

  #parseResponse(rawText) {
    const trimmed = this.#trimJsonEnvelope(rawText);
    const parts = JSON.parse(trimmed);
    const texts = [];
    for (const part of parts) {
      const partData = getNestedValue(part, [2], null);
      if (!partData || typeof partData !== 'string') continue;
      try {
        const parsed = JSON.parse(partData);
        const candidate = getNestedValue(parsed, [4, 0, 1, 0], null);
        if (candidate && typeof candidate === 'string' && !candidate.includes('rc_')) {
          texts.push(candidate);
        }
      } catch {}
    }
    const text = texts.length > 0 ? texts.reduce((a, b) => (a.length > b.length ? a : b), '') : '';
    return { text: this.#cleanText(text) };
  }

  async #request(prompt, model = DEFAULT_MODEL, chatMetadata = null, modelHeader = null, systemPrompt = null, info = null) {
    const at = await this.#getAccessToken();
    const cookieHeader = buildCookieHeader(this.#cookieMap);

    const now = new Date();

    const systems = [
      tagIt('time', '', {
        utc: now.toISOString(),
        local: now.toLocaleString('sv-SE', {
          timeZone: this.#timezone || 'Asia/Jakarta',
          hour12: false,
        }),
        tz: this.#timezone || 'Asia/Jakarta',
      }),
    ];

    if (info) {
      if (info.user)
        systems.push(
          tagIt('user', '', {
            name: info.user.name || 'Unknown',
            username: info.user.username || 'unknown',
          }),
        );
      if (info.channel) systems.push(tagIt('channel', info.channel));
      if (info.server) systems.push(tagIt('server', info.server));
      if (info.bot) systems.push(tagIt('bot', info.bot));
    }

    if (systemPrompt) {
      systems.push(tagIt('instruction', systemPrompt));
    }

    const promptPayload = [`${tagIt('system', systems.join('\n'))}\n\n${prompt}`];
    const inner = [promptPayload, null, chatMetadata];
    const fReq = JSON.stringify([null, JSON.stringify(inner)]);

    const params = new URLSearchParams();
    params.set('at', at);
    params.set('f.req', fReq);

    const headers = {
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      host: 'gemini.google.com',
      origin: 'https://gemini.google.com',
      referer: 'https://gemini.google.com/',
      'x-same-domain': '1',
      cookie: cookieHeader,
      [MODEL_HEADER_NAME]: modelHeader || MODEL_HEADERS[model] || MODEL_HEADERS[DEFAULT_MODEL],
    };

    const res = await this.#httpsPost(GEMINI_STREAM_GENERATE_URL, headers, params.toString(), {
      timeoutMs: this.#timeout,
      label: 'generate',
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Request failed: ${res.status}`);
    }

    const parsed = this.#parseResponse(res.text);
    return { ...parsed, effectiveModel: model };
  }

  async ask(prompt, options = {}) {
    if (!this.hasCookies) throw new Error('No cookies loaded. Use loadCookies() or loadCookiesFromFile() first.');

    const model = options.model || DEFAULT_MODEL;
    const systemPrompt = options.systemPrompt || null;
    const info = options.info || null;
    const startTime = Date.now();

    const result = await this.#request(prompt, model, null, options.modelHeader || null, systemPrompt, info);

    return {
      response: result.text,
      model: result.effectiveModel,
      tookMs: Date.now() - startTime,
    };
  }

  async chat(prompt, model = DEFAULT_MODEL) {
    return this.ask(prompt, { model });
  }
}

export { DEFAULT_MODEL, GeminiClient, MODEL_LIMITS };
