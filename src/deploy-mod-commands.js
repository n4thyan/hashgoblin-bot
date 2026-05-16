'use strict';

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./modCommands');

async function main() {
  const token = process.env['DISCORD_' + 'TOKEN'];
  const clientId = process.env['DISCORD_' + 'CLIENT_ID'];
  const guildId = process.env['DISCORD_' + 'GUILD_ID'];
  if (!token || !clientId) throw new Error('Discord bot token and client id are required in .env.');

  const body = commands.map(c => c.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  console.log(`Registering ${body.length} mod command ${guildId ? `to guild ${guildId}` : 'globally'}...`);
  await rest.put(route, { body });
  console.log('Mod slash command deployed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
