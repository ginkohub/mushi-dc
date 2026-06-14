/**
 * Copyright (C) 2025 Ginko
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 *
 * This code is part of Ginko project (https://github.com/ginkohub)
 */

export async function searchWiki(query) {
 const search = await (
  await fetch(
   `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`,
  )
 ).json();

 const page = search?.query?.search?.[0];
 if (!page) return null;

 const extract = await (
  await fetch(
   `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&exsentences=5&pageids=${page.pageid}&format=json`,
  )
 ).json();

 const text = extract?.query?.pages?.[page.pageid]?.extract?.trim();
 const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`;

 return { title: page.title, text, url };
}
