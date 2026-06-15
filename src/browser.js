/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { pen } from './pen.js';

export const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0';

/**
 * Browser class mimics a real web browser by providing consistent headers,
 * session management, and robust request handling.
 */
export class Browser {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 10000,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        ...options.headers,
      },
    };
  }

  /**
   * Performs a fetch request with browser-like headers.
   *
   * @param {string} url - The URL to fetch.
   * @param {RequestInit} init - Additional fetch options.
   * @returns {Promise<Response>} The fetch response.
   */
  async fetch(url, init = {}) {
    const signal = init.signal || AbortSignal.timeout(this.options.timeout);
    const headers = { ...this.options.headers, ...init.headers };

    try {
      const res = await fetch(url, { ...init, headers, signal });
      return res;
    } catch (e) {
      if (e.name === 'TimeoutError') {
        pen.Error('browser', `Request to ${url} timed out`);
      } else {
        pen.Error('browser', `Request to ${url} failed: ${e.message}`);
      }
      throw e;
    }
  }

  /**
   * Performs a GET request and returns the JSON body.
   *
   * @param {string} url - The URL to fetch.
   * @param {RequestInit} init - Additional fetch options.
   * @returns {Promise<any>} The parsed JSON data.
   */
  async getJSON(url, init = {}) {
    const res = await this.fetch(url, { ...init, method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error(`Expected JSON but received ${contentType}`);
    }
    return await res.json();
  }

  /**
   * Performs a GET request and returns the text body.
   *
   * @param {string} url - The URL to fetch.
   * @param {RequestInit} init - Additional fetch options.
   * @returns {Promise<string>} The response body as text.
   */
  async getText(url, init = {}) {
    const res = await this.fetch(url, { ...init, method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.text();
  }

  /**
   * Static helper for a one-off GET request.
   */
  static async get(url, init = {}) {
    return new Browser().fetch(url, init);
  }

  /**
   * Static helper for a one-off JSON request.
   */
  static async json(url, init = {}) {
    return new Browser().getJSON(url, init);
  }
}

export const browser = new Browser();

export default Browser;
