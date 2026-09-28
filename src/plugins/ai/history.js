/**
 * Copyright (C) 2025-2026 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { read, write } from '#mushi';
import { GeminiClient, tagIt } from './client.js';

const DEFAULT_SYSTEM_PROMPT =
  "Your name is Mushi, humble, always energetic and enthusiastic, love programming, calm. Speak in casual, everyday language using 'you' (kamu) and 'I' (aku). Keep sentences as short as possible, like a Discord chat. Respond without conversational formatting and keep it under 2000 characters.";

export function loadCookies() {
  const data = read();
  const s = data.gemini || {};
  return s.cookies || {};
}

export function saveCookies(map) {
  const data = read();
  data.gemini = data.gemini || {};
  data.gemini.cookies = { ...(data.gemini.cookies || {}), ...map };
  write(data);
}

export function getSystemPrompt() {
  const data = read();
  return data.gemini?.systemPrompt || data.settings?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
}

export function getModel() {
  return read().gemini?.model || null;
}

export function getTimezone() {
  const data = read();
  return data.gemini?.timezone || null;
}

export function getCompactCeiling() {
  const data = read();
  return data.gemini?.compactCeiling ?? DEFAULT_COMPACT_CEILING;
}

export function getCompactBuffer() {
  const data = read();
  return data.gemini?.compactBuffer ?? DEFAULT_COMPACT_BUFFER;
}

export function getClient() {
  const cookies = loadCookies();
  if (Object.keys(cookies).length === 0) return null;
  const arr = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
  }));
  return new GeminiClient({ cookies: arr, timezone: getTimezone() });
}

export const geminiMessages = new Set();

const conversationHistory = new Map();
const MAX_HISTORY = 10;
const MAX_CONTENT_LENGTH = 500;
const DEFAULT_COMPACT_CEILING = 100_000;
const DEFAULT_COMPACT_BUFFER = 10_000;

export { DEFAULT_COMPACT_BUFFER, DEFAULT_COMPACT_CEILING, MAX_CONTENT_LENGTH, MAX_HISTORY };

function estTokens(text) {
  return Math.ceil((text?.length || 0) / 4);
}

export function getHistory(channelId) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  return conversationHistory.get(channelId);
}

export function clearHistory(channelId) {
  conversationHistory.delete(channelId);
}

export function addHistory(channelId, messages) {
  const h = getHistory(channelId);
  for (const m of messages) {
    if (m.content?.length > MAX_CONTENT_LENGTH) {
      m.content = `${m.content.slice(0, MAX_CONTENT_LENGTH)}...`;
    }
    h.push(m);
  }
  if (h.length > MAX_HISTORY * 2) h.splice(0, h.length - MAX_HISTORY * 2);
}

export function formatHistory(channelId) {
  const h = getHistory(channelId);
  if (h.length === 0) return '';
  const turns = h.map((m) => tagIt(m.role, m.content, { name: m.name, time: m.time, id: m.id })).join('\n');
  return `${tagIt('history', `\n${turns}\n`)}\n`;
}

export function estHistoryTokens(channelId) {
  return getHistory(channelId).reduce((sum, m) => sum + estTokens(m.content), 0);
}

export function shouldCompact(channelId) {
  const ceiling = getCompactCeiling();
  if (ceiling <= 0) return false;
  const buffer = getCompactBuffer();
  return estHistoryTokens(channelId) > ceiling - buffer;
}

export async function summarizeHistory(channelId, client) {
  const h = getHistory(channelId);
  if (h.length < 4) return;
  const text = h.map((m) => `${m.role} ${m.name}: ${m.content}`).join('\n');
  try {
    const r = await client.ask(text, {
      systemPrompt:
        'You are a conversation summarizer. Condense the above conversation into a concise summary under 200 words. Preserve key facts, decisions, user preferences, and context needed for follow-up. Output only the summary.',
    });
    if (r.response?.trim()) {
      conversationHistory.set(channelId, [
        {
          role: 'summary',
          name: 'system',
          content: r.response.trim(),
          time: new Date().toISOString(),
        },
      ]);
    }
  } catch (e) {
    console.error('[ai] compact failed:', e);
  }
}
