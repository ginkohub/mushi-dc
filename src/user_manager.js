/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

import { Role } from './plugin.js';
import { read, write } from './store.js';

export class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username ?? null;
    this.displayName = data.displayName ?? null;
    this.roles = data.roles ?? [Role.GUEST];
    this.roles = this.roles.map((r) => {
      if (r <= 4) return [1, 10, 100, 1000, 10000][r] ?? r;
      return r;
    });
    this.level = data.level ?? 1;
    this.xp = data.xp ?? 0;
    this.addedAt = data.addedAt ?? new Date().toISOString();
    this.banned = data.banned ?? false;
    this.bannedAt = data.bannedAt ?? null;
    this.stats = data.stats ?? {};
    this.lang = data.lang ?? 'en';
    this.afk = data.afk ?? null;
  }

  isAtLeast(role) {
    return Math.max(...this.roles) >= role;
  }

  hasRole(role) {
    return this.roles.includes(role);
  }
}

export class UserManager {
  constructor() {
    this.data = read().users || {};
    this._saveTimer = null;
  }

  getUser(id) {
    const u = this.data[id];
    if (u && !(u instanceof User)) {
      this.data[id] = new User(u);
    }
    return this.data[id] instanceof User ? this.data[id] : null;
  }

  updateUser(id, update) {
    const existing = this.getUser(id);
    const data = { id, ...(existing ? { ...existing } : {}), ...update };
    this.data[id] = data instanceof User ? data : new User(data);
    this.save();
    return this.data[id];
  }

  rolesEnough(id, requiredRoles) {
    const user = this.getUser(id);
    if (!user) return false;
    return requiredRoles.some((role) => user.isAtLeast(role));
  }

  save() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      const current = read();
      write({ ...current, users: this.data });
    }, 5000);
  }
}
