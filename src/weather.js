/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

const weatherCodes = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  95: 'Thunderstorm',
};

export async function getWeather(city) {
  const geo = await (
    await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    )
  ).json();

  if (!geo.results?.length) return null;

  const { latitude, longitude, name, country } = geo.results[0];

  const w = await (
    await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`,
    )
  ).json();

  const current = w.current;

  return {
    location: `${name}, ${country}`,
    temp: current.temperature_2m,
    condition: weatherCodes[current.weather_code] || 'Unknown',
    humidity: current.relative_humidity_2m,
    wind: current.wind_speed_10m,
  };
}
