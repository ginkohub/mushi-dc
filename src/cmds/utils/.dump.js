import pen from '../../pen.js';
import { writeFileSync } from 'fs';

/** @param {import('discord.js').InteractionResponse} m */
export const on = async (m) => {
  if (m.author.bot) return;
  try {

    // get object name 
    let filename = Object(m).name;
    writeFileSync(`temp/${filename}.json`, JSON.stringify(m, null, 2), 'utf8')
  } catch (e) {
    pen.Error(e);
  }
}
