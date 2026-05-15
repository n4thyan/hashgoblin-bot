'use strict';

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !clientId) throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required.');

  const body = commands.map(c => c.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  console.log(`Registering ${body.length} slash commands ${guildId ? `to guild ${guildId}` : 'globally'}...`);
  await rest.put(route, { body });
  console.log('Slash commands deployed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
