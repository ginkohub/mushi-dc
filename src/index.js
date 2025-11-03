import dotenv from 'dotenv';
import { Client, Collection, Events, GatewayIntentBits, MessageFlags, Partials, REST, Routes } from 'discord.js';
import pen from './pen.js';
import path from 'path';
import { readdirSync, statSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

// if .env file exists, load it
try {
  pen.Info('Loading.env file')
  dotenv.config();
} catch (e) {
  pen.Warn('No .env file found');
  pen.Warn('Please check and edit .env file');
  // create .env file
  writeFileSync('.env', 'DISCORD_TOKEN=<your_token>\nDISCORD_CLIENT_ID=<your_client_id>\n# DISCORD_GUILD_ID=<your_guild_id>')
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});



client.commands = new Collection();
const commands = [];
const eventOn = [];

async function walkCommands(dir) {
  try {
    const commandFiles = readdirSync(dir);

    for (const file of commandFiles) {
      let filePath = path.join(dir, file);
      if (file.startsWith('.')) continue;

      if (file.endsWith('.js')) {
        // check if system are Windows
        if (process.platform === 'win32') {
          filePath = pathToFileURL(filePath).href;
        }

        try {
          const impt = await import(filePath);

          const on = impt.on;
          if (on && typeof (on) === 'function') {
            eventOn.push(on);
          }

          const command = impt.cmd;
          if (!command?.data?.name) {
            continue;
          }

          client.commands.set(command.data.name, command);
          commands.push(command.data.toJSON());

          pen.Debug(`${command.data.name} : ${file}`);
        } catch (e) {
          pen.Error(e);
        }
      } else {
        if (statSync(filePath)?.isDirectory()) {
          await walkCommands(filePath);
        }
      }
    }
  } catch (e) {
    pen.Error(e)
  }
}

client.on(Events.MessageCreate, async (m) => {
  for (const on of eventOn) {
    try {
      await on(m, client);
    } catch (e) {
      pen.Error(e)
    }
  }
});

// Load commands
const commandPath = path.join(import.meta.dirname, 'cmds');
pen.Debug('Loading commands', commandPath);
await walkCommands(commandPath);

pen.Debug(`${commands.length} commands loaded`)
pen.Debug(`${eventOn.length} event loaded`);

client.once(Events.ClientReady, async (evt) => {
  pen.Info('Client is ready', evt.user.tag);

  const rest = new REST({ 'version': '10' }).setToken(process.env.DISCORD_TOKEN);
  if (process.env.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );
  } else {
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );
  }
});

/** @param {import('discord.js').ChatInputCommandInteraction} m */
client.on(Events.InteractionCreate, async (m) => {
  if (!m.isCommand()) return;

  const cmd = client.commands.get(m.commandName);
  if (!cmd) return;

  try {
    pen.Debug(`⚡${m.commandName} : ${m.options?.data?.length}`);
    await cmd.execute(m);
  } catch (error) {
    pen.Error(error);
    try {
      await m.reply({
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral
      });
    } catch (ee) {
      pen.Error(ee);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
