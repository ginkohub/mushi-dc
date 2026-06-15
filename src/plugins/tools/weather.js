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
 *   Open-Meteo - https://open-meteo.com
 */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { Browser, getWeather, pen, Role, translate } from '#mushi';

const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';

const t = translate({
  en: {
    help_title: 'WEATHER INFO',
    help_usage: 'Use `/weather [city]` to check current weather.',
    not_found: 'City "{query}" not found!',
    api_error: 'Failed to fetch weather data.',
    header: 'Weather in {location}',
    temp: 'Temperature: {temp}°C',
    condition: 'Condition: {condition}',
    humidity: 'Humidity: {humidity}%',
    wind: 'Wind Speed: {wind} km/h',
    footer: '_Data: Open-Meteo_',
  },
  id: {
    help_title: 'INFO CUACA',
    help_usage: 'Gunakan `/weather [kota]` untuk cek cuaca.',
    not_found: 'Kota "{query}" tidak ditemukan!',
    api_error: 'Gagal memuat data cuaca.',
    header: 'Cuaca di {location}',
    temp: 'Suhu: {temp}°C',
    condition: 'Kondisi: {condition}',
    humidity: 'Kelembapan: {humidity}%',
    wind: 'Kecepatan Angin: {wind} km/h',
    footer: '_Data: Open-Meteo_',
  },
});

async function autoCity(m) {
  const query = m.options.getFocused();
  if (!query || query.length < 2) return await m.respond([]);
  try {
    const data = await Browser.json(`${GEO_API}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    const choices = (data.results || []).map((r) => ({
      name: `${r.name}${r.country ? `, ${r.country}` : ''}${r.admin1 ? ` (${r.admin1})` : ''}`,
      value: r.name,
    }));
    await m.respond(choices);
  } catch (e) {
    pen.Error('weather-autocomplete', e);
    await m.respond([]);
  }
}

async function weather(c) {
  const query = c.event.options.getString('city') || '';
  if (!query || query === '?') {
    return await c.reply([t('help_title', {}, c), '', t('help_usage', {}, c)].join('\n'));
  }
  try {
    const result = await getWeather(query);
    if (!result) return await c.reply(t('not_found', { query }, c));
    await c.reply(
      [
        t('header', { location: result.location }, c),
        '',
        t('temp', { temp: result.temp }, c),
        t('condition', { condition: result.condition }, c),
        t('humidity', { humidity: result.humidity }, c),
        t('wind', { wind: result.wind }, c),
        '',
        t('footer', {}, c),
      ].join('\n'),
    );
  } catch (e) {
    pen.Error(`weather-error: ${e.message}`);
    await c.reply(t('api_error', {}, c));
  }
}

export default [
  {
    roles: [Role.GUEST],
    autocomplete: autoCity,
    data: new SlashCommandBuilder()
      .setName('weather')
      .setDescription('Check current weather for a city')
      .addStringOption((o) => o.setName('city').setDescription('City name').setRequired(true).setAutocomplete(true))
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    exec: weather,
  },
];
