/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Role, translate } from '#mushi';

const t = translate({
  en: {
    latest_title: 'LATEST EARTHQUAKE',
    recent_title: 'RECENT EARTHQUAKES',
    date: 'Date',
    time: 'Time',
    magnitude: 'Magnitude',
    depth: 'Depth',
    location: 'Location',
    coordinates: 'Coordinates',
    potential: 'Tsunami',
    felt: 'Felt In',
    error: 'Failed to fetch earthquake data.',
    no_data: 'No earthquake data available.',
    footer: '_Data: BMKG (bmkg.go.id)_',
  },
  id: {
    latest_title: 'GEMPA TERBARU',
    recent_title: 'GEMPA TERKINI',
    date: 'Tanggal',
    time: 'Waktu',
    magnitude: 'Magnitudo',
    depth: 'Kedalaman',
    location: 'Lokasi',
    coordinates: 'Koordinat',
    potential: 'Potensi',
    felt: 'Dirasakan',
    error: 'Gagal memuat data gempa.',
    no_data: 'Tidak ada data gempa.',
    footer: '_Data: BMKG (bmkg.go.id)_',
  },
});

async function fetchLatest() {
  const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json');
  if (!res.ok) return null;
  const data = await res.json();
  return data.Infogempa?.gempa || null;
}

async function fetchRecent() {
  const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json');
  if (!res.ok) return null;
  const data = await res.json();
  return data.Infogempa?.gempa || [];
}

async function latestQuake(c) {
  try {
    const g = await fetchLatest();
    if (!g) return await c.reply(t('no_data', {}, c));
    await c.reply(
      [
        `**${t('latest_title', {}, c)}**`,
        '',
        `📅 **${t('date', {}, c)}:** ${g.Tanggal}`,
        `⏰ **${t('time', {}, c)}:** ${g.Jam}`,
        `📊 **${t('magnitude', {}, c)}:** **${g.Magnitude}** SR`,
        `⛰ **${t('depth', {}, c)}:** ${g.Kedalaman}`,
        `📍 **${t('location', {}, c)}:** ${g.Wilayah}`,
        `🌐 **${t('coordinates', {}, c)}:** ${g.Coordinates}`,
        `🗺 [Google Maps](https://www.google.com/maps?q=${g.Coordinates})`,
        `🌊 **${t('potential', {}, c)}:** ${g.Potensi}`,
        g.Dirasakan && g.Dirasakan !== '-' ? `👤 **${t('felt', {}, c)}:** ${g.Dirasakan}` : '',
        '',
        t('footer', {}, c),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  } catch {
    await c.reply(t('error', {}, c));
  }
}

async function recentQuakes(c) {
  try {
    const list = await fetchRecent();
    if (!list || list.length === 0) return await c.reply(t('no_data', {}, c));
    const lines = list.slice(0, 15).map((g) => {
      const mag = g.Magnitude;
      const depth = g.Kedalaman;
      const loc = g.Wilayah;
      const time = `${g.Tanggal} ${g.Jam}`;
      let icon = '🟢';
      const m = parseFloat(mag);
      if (m >= 6) icon = '🔴';
      else if (m >= 5) icon = '🟡';
      return `${icon} **M${mag}** | ${depth} | ${time}\n└ ${loc}`;
    });
    await c.reply([`**${t('recent_title', {}, c)}**`, '', ...lines, '', t('footer', {}, c)].join('\n'));
  } catch {
    await c.reply(t('error', {}, c));
  }
}

const base = (name) =>
  new SlashCommandBuilder()
    .setName(name)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

export default [
  {
    data: base('gempa')
      .setDescription('Info gempa dari BMKG')
      .addSubcommand((s) => s.setName('latest').setDescription('Gempa terbaru'))
      .addSubcommand((s) => s.setName('recent').setDescription('Daftar gempa terkini')),
    exec: async (c) => {
      const sub = c.event.options.getSubcommand();
      if (sub === 'latest') await latestQuake(c);
      else if (sub === 'recent') await recentQuakes(c);
    },
  },
];
