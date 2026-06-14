/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.join(import.meta.dirname, '../data.json');

export const read = () => {
  if (!fs.existsSync(DATA_FILE)) return {};
  const raw = fs.readFileSync(DATA_FILE, 'utf-8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
};

export const write = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};
