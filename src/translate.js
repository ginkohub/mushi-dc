/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 *
 * Credits:
 *   Google Translate - https://translate.google.com
 *   LibreTranslate - https://libretranslate.com
 */

import { Browser } from './browser.js';

export const translate = (translations) => {
  return (key, variables = {}, context = {}) => {
    const lang = context.lang || 'en';
    let text = translations[lang]?.[key] || translations.en?.[key] || key;

    for (const [vKey, vVal] of Object.entries(variables)) {
      text = text.replace(new RegExp(`\\{${vKey}\\}`, 'g'), vVal);
    }

    return text;
  };
};

async function translateGoogle(text, target, source) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const data = await Browser.json(url);
    const translated = data[0]?.[0]?.[0];
    if (!translated) throw new Error('Empty response from Google Translate');
    return translated;
  } catch (e) {
    throw new Error(`Google Translate failed: ${e.message}`);
  }
}

const LIBRE_INSTANCES = [
  'https://translate.fedilab.app',
  'https://translate.mstdn.social',
  'https://translate.rinderha.cc',
];

async function translateLibre(text, target, source, urls, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const body = JSON.stringify({ q: text, source, target, format: 'text' });

  const list = Array.isArray(urls) ? urls : [urls];
  const errors = [];

  for (const url of list) {
    try {
      const data = await Browser.json(`${url}/translate`, {
        method: 'POST',
        headers,
        body,
      });
      return data.translatedText;
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }

  throw new Error(`LibreTranslate failed on all instances:\n${errors.join('\n')}`);
}

export async function translateText(text, target, options = {}) {
  const { engine = 'google', source = 'auto', libreUrl = LIBRE_INSTANCES, apiKey } = options;

  if (engine === 'libre') {
    return translateLibre(text, target, source, libreUrl, apiKey);
  }
  return translateGoogle(text, target, source);
}
