/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { pen, RoleMoji, sanitizeArgs } from '#mushi';

/** Highest-role emoji for the context's roles ('' when unknown). */
function badge(roles) {
  const list = Array.isArray(roles) ? roles : [roles];
  return RoleMoji[Math.max(...list)] ?? '';
}

/** Line prefix: `badge server> [channel>] [reply>] user:` ('dm' when not a server). */
function tag(roles, server, channel, user, reply) {
  const b = badge(roles);
  let chain = `${server ?? 'dm'}>`;
  if (channel) chain += ` ${channel}>`;
  if (reply) chain += ` ${reply}>`;
  return `${b ? `${b} ` : ''}${chain} ${user ?? 'unknown'}:`;
}

/** Truncated text, '(no text)' for empty. */
function snippet(text, max = 200) {
  if (!text) return '(no text)';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Emojis for message media: image, video, audio, link, sticker; '' for plain text. */
function mediaEmoji(m) {
  const out = new Set();
  for (const a of m?.attachments?.values() ?? []) {
    if (a?.contentType?.startsWith('image/')) out.add('🖼️');
    else if (a?.contentType?.startsWith('video/')) out.add('🎬');
    else if (a?.contentType?.startsWith('audio/')) out.add('🎵');
    else out.add('📎');
  }
  if (m?.stickers?.size > 0) out.add('🩹');
  if (/\bhttps?:\/\//.test(m?.content ?? '')) out.add('🔗');
  return out.size ? ` ${[...out].join('')}` : '';
}

/** Compact duration: '45s', '5m', '1h 5m'. */
function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** @type {import('#mushi/plugin.js').Plugin } */
export default {
  exec: async (c) => {
    const m = c.event;

    try {
      /* voice state change: c.event is the new state, c.oldEvent the previous one */
      if (c.eventType === 'voiceStateUpdate') {
        const { channelId: oldId } = c.oldEvent ?? {};
        const { channelId: newId } = m ?? {};
        const o = c.oldEvent ?? {};
        const n = m ?? {};

        if (oldId === newId) {
          /* mute/deaf/screen changes on the same channel */
          const user = n.guild?.members.cache.get(n.id)?.user?.username ?? n.id;
          const muted = n.selfMute || n.serverMute;
          const deaf = n.selfDeaf || n.serverDeaf;
          const wasMuted = o.selfMute || o.serverMute;
          const wasDeaf = o.selfDeaf || o.serverDeaf;
          if (muted !== wasMuted)
            pen.Info(
              `${tag([], n.guild?.name, n.channel?.name, user)} ${muted ? '🤐' : '🗣️'} ${muted ? 'mute' : 'unmute'}`,
            );
          if (deaf !== wasDeaf)
            pen.Info(
              `${tag([], n.guild?.name, n.channel?.name, user)} ${deaf ? '🙉' : '👂'} ${deaf ? 'deaf' : 'undeaf'}`,
            );
          return;
        }

        const user = n.guild?.members.cache.get(n.id)?.user?.username ?? n.id;
        if (!oldId && newId) {
          pen.Info(`${tag([], m.guild?.name, m.channel?.name, user)} 🔊 joined`);
        } else if (oldId && !newId) {
          const s = c.handler().voiceSessions?.get(`${m.guild?.id}:${m.id}`);
          const dur = s ? s.totalMs + (Date.now() - s.joinedAt) : null;
          pen.Info(
            `${tag([], c.oldEvent.guild?.name, c.oldEvent.channel?.name, user)} 🔇 left${dur ? ` after ${fmtDur(dur)}` : ''}`,
          );
        } else {
          pen.Info(
            `${tag([], m.guild?.name, m.channel?.name, user)} 🔀 moved from ${c.oldEvent?.channel?.name ?? oldId}`,
          );
        }
        return;
      }

      /* member join/leave the server */
      if (c.eventType === 'guildMemberAdd' || c.eventType === 'guildMemberRemove') {
        const n = m;
        const joining = c.eventType === 'guildMemberAdd';
        pen.Info(
          `${tag(c.roles, n?.guild?.name, null, n?.user?.username ?? n?.id)} ${joining ? '🚪 joined' : '🚪 left'}`,
        );
        return;
      }

      /* message deleted — author shows only if the message was cached */
      if (c.eventType === 'messageDelete' || c.eventType === 'messageDeleteBulk') {
        if (c.eventType === 'messageDeleteBulk') {
          const first = m?.first?.() ?? null;
          pen.Info(
            `${tag([], first?.guild?.name ?? 'dm', first?.channel?.name, 'unknown')} 🔥 ${m?.size} messages deleted`,
          );
        } else {
          pen.Info(
            `${tag([], m?.guild?.name ?? 'dm', m?.channel?.name, m?.author?.username ?? 'unknown')} 🗑️ ${snippet(m?.content)}`,
          );
        }
        return;
      }

      /* channels: create / update / delete */
      if (c.eventType === 'channelCreate' || c.eventType === 'channelUpdate' || c.eventType === 'channelDelete') {
        const ch = m;
        const renamed = c.oldEvent?.name && c.oldEvent?.name !== ch?.name ? ` from ${c.oldEvent?.name}` : '';
        const detail =
          c.eventType === 'channelCreate'
            ? '🆕 created'
            : c.eventType === 'channelUpdate'
              ? `🔧 updated${renamed}`
              : '❌ deleted';
        pen.Info(`${tag([], ch?.guild?.name ?? 'dm', null, ch?.name ?? ch?.id)} ${detail}`);
        return;
      }

      /* threads: create / update / delete */
      if (c.eventType === 'threadCreate' || c.eventType === 'threadUpdate' || c.eventType === 'threadDelete') {
        const t = m ?? c.oldEvent;
        const detail =
          c.eventType === 'threadCreate' ? '🧵 created' : c.eventType === 'threadUpdate' ? '🧵 updated' : '🧵 deleted';
        pen.Info(`${tag([], t?.guild?.name ?? 'dm', t?.parentId ?? null, t?.name ?? t?.id)} ${detail}`);
        return;
      }

      /* roles: create / update / delete */
      if (c.eventType === 'roleCreate' || c.eventType === 'roleUpdate' || c.eventType === 'roleDelete') {
        const r = m ?? c.oldEvent;
        const renamed = c.oldEvent?.name && c.oldEvent?.name !== r?.name ? ` from @${c.oldEvent?.name}` : '';
        const detail =
          c.eventType === 'roleCreate'
            ? '🏷️ created'
            : c.eventType === 'roleUpdate'
              ? `🏷️ updated${renamed}`
              : '🏷️ deleted';
        pen.Info(`${tag([], r?.guild?.name ?? 'dm', null, r?.name ?? r?.id)} ${detail}`);
        return;
      }

      /* emoji / sticker: create / update / delete */
      if (
        ['emojiCreate', 'emojiUpdate', 'emojiDelete', 'stickerCreate', 'stickerUpdate', 'stickerDelete'].includes(
          c.eventType,
        )
      ) {
        const r = m ?? c.oldEvent;
        const action = c.eventType.endsWith('Create')
          ? 'created'
          : c.eventType.endsWith('Update')
            ? 'updated'
            : 'deleted';
        const renamed = c.oldEvent?.name && c.oldEvent?.name !== r?.name ? ` from ${c.oldEvent?.name}` : '';
        const kind = c.eventType.startsWith('emoji') ? '😀' : '🔖';
        pen.Info(`${tag([], r?.guild?.name ?? 'dm', null, r?.name ?? r?.id)} ${kind} ${action}${renamed}`);
        return;
      }

      /* user rename / avatar change (global, no server) */
      if (c.eventType === 'userUpdate') {
        pen.Info(`${c.oldEvent?.username}> ${m?.username}: 🪪 user`);
        return;
      }

      /* server rename / icon change */
      if (c.eventType === 'guildUpdate') {
        pen.Info(`${c.oldEvent?.name}> ${m?.name}: 🏰 server`);
        return;
      }

      /* bans */
      if (c.eventType === 'guildBanAdd' || c.eventType === 'guildBanRemove') {
        const ban = m;
        const detail = `${c.eventType === 'guildBanAdd' ? '⛔ banned' : '⚖️ unbanned'}${ban?.reason ? ` — ${ban.reason}` : ''}`;
        pen.Info(`${tag([], ban?.guild?.name ?? 'dm', null, ban?.user?.username ?? ban?.id)} ${detail}`);
        return;
      }

      /* invites */
      if (c.eventType === 'inviteCreate' || c.eventType === 'inviteDelete') {
        const chain = tag([], m?.guild?.name ?? 'dm', null, m?.inviter?.username ?? 'unknown');
        pen.Info(
          `${chain} 🎟️ ${c.eventType === 'inviteCreate' ? `created ${m?.code}` : `deleted ${m?.code ?? c.oldEvent ?? '?'}`}`,
        );
        return;
      }

      /* audit log: who did what */
      if (c.eventType === 'guildAuditLogEntryCreate') {
        const entry = m;
        const guild = c.oldEvent ?? entry?.guild;
        const executor = entry?.executor?.username ?? entry?.executorId ?? 'unknown';
        const target = entry?.target?.username ?? entry?.target?.name ?? entry?.targetTag ?? null;
        const what = [entry?.action, entry?.targetType].filter(Boolean).join(' ');
        pen.Info(
          `${tag([], guild?.name ?? 'dm', null, executor)} 🧾 ${what}${target ? ` → ${target}` : ''}${entry?.reason ? ` — ${entry.reason}` : ''}`,
        );
        return;
      }

      /* reactions */
      if (c.eventType === 'messageReactionAdd' || c.eventType === 'messageReactionRemove') {
        const reactor = c.oldEvent;
        const chain = tag(
          [],
          m?.message?.guild?.name ?? 'dm',
          m?.message?.channel?.name,
          reactor?.username ?? reactor?.id ?? 'unknown',
          m?.message?.author?.username,
        );
        const emoji = m?.emoji?.name ? `:${m.emoji.name}:` : 'an emoji';
        pen.Info(`${chain} ${c.eventType === 'messageReactionAdd' ? '➕' : '➖'} reacted ${emoji}`);
        return;
      }

      /* scheduled events */
      if (
        c.eventType === 'guildScheduledEventCreate' ||
        c.eventType === 'guildScheduledEventUpdate' ||
        c.eventType === 'guildScheduledEventDelete'
      ) {
        const detail =
          c.eventType === 'guildScheduledEventCreate'
            ? '🗓️ created'
            : c.eventType === 'guildScheduledEventUpdate'
              ? '🗓️ updated'
              : '🗓️ deleted';
        pen.Info(`${tag([], m?.guild?.name ?? 'dm', null, m?.name ?? m?.id)} ${detail}`);
        return;
      }
      if (c.eventType === 'guildScheduledEventUserAdd' || c.eventType === 'guildScheduledEventUserRemove') {
        const sub = c.oldEvent;
        const detail = c.eventType === 'guildScheduledEventUserAdd' ? '🎪 subscribed' : '🎪 unsubscribed';
        pen.Info(`${tag([], m?.guild?.name ?? 'dm', m?.name ?? m?.id, sub?.username ?? sub?.id)} ${detail}`);
        return;
      }

      /* webhooks */
      if (c.eventType === 'webhooksUpdate') {
        pen.Info(
          `${tag([], c.oldEvent?.name ?? m?.guild?.name ?? 'dm', m?.name ?? m?.id, 'unknown')} 🕸️ webhooks changed`,
        );
        return;
      }

      const hdr = tag(
        c.roles,
        m?.guild?.name ?? 'dm',
        m?.channel?.name ?? m?.channelId ?? 'unknown',
        c.sender ?? 'unknown',
      );

      if (c.isSlash) {
        const args = sanitizeArgs(c.argv);
        const argStr = args && Object.keys(args).length > 0 ? ` ${JSON.stringify(args)}` : '';
        pen.Info(`${hdr} ⚡ /${c.cmd}${argStr}`);
        return;
      }

      if (c.isPrefixCmd) {
        pen.Info(`${hdr} ⌨️ ${c.pattern}${c.args ? ` ${c.args}` : ''}`);
        return;
      }

      if (m?.isButton?.()) {
        pen.Info(`${hdr} 🔘 pressed ${m.customId}`);
        return;
      }

      const replyTo = m.reference?.messageId
        ? (m.channel?.messages?.cache?.get(m.reference.messageId)?.author?.username ?? null)
        : null;
      const msgTag = tag(
        c.roles,
        m?.guild?.name ?? 'dm',
        m?.channel?.name ?? m?.channelId ?? 'unknown',
        c.sender ?? 'unknown',
        replyTo,
      );
      const media = mediaEmoji(m);
      const stickerName = m?.stickers?.first?.()?.name ?? null;
      const evt = c.isEdited ? '✏️' : '💬';
      pen.Info(`${msgTag} ${evt}${media} ${snippet(c.text || stickerName)}`);
    } catch (e) {
      pen.Error(e);
    }
  },
};
