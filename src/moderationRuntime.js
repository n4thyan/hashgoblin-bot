'use strict';

const { Client, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { openDatabase, getSettings } = require('./lib/db');

const INSTALLED = Symbol.for('hashgoblin.moderationRuntimeInstalled');
let db;

function ensureModerationSchema(database) {
  database.exec(`
CREATE TABLE IF NOT EXISTS moderation_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  moderator_user_id TEXT NOT NULL,
  target_user_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
  `);

  const settingsColumns = database.prepare('PRAGMA table_info(guild_settings)').all().map(c => c.name);
  if (!settingsColumns.includes('mod_log_channel_id')) {
    database.prepare('ALTER TABLE guild_settings ADD COLUMN mod_log_channel_id TEXT').run();
  }
}

function baseEmbed(title) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x70ff9e)
    .setFooter({ text: 'HashGoblin moderation log' })
    .setTimestamp(new Date());
}

function requirePermission(interaction, permission, label) {
  if (!interaction.memberPermissions || !interaction.memberPermissions.has(permission)) {
    throw new Error(`You need ${label} permission to use this command.`);
  }
}

function trimReason(reason) {
  const cleaned = String(reason || '').trim();
  return cleaned || 'No reason given.';
}

function caseInsert({ guildId, moderatorId, targetId = null, action, reason, details = null }) {
  const info = db.prepare(`
    INSERT INTO moderation_cases (guild_id, moderator_user_id, target_user_id, action, reason, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, moderatorId, targetId, action, reason, details ? JSON.stringify(details) : null);
  return Number(info.lastInsertRowid);
}

function recentCases(guildId, limit = 10) {
  return db.prepare(`
    SELECT * FROM moderation_cases
    WHERE guild_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(guildId, limit);
}

async function getLogChannel(interaction) {
  const settings = getSettings(db, interaction.guildId);
  const channelId = settings.mod_log_channel_id;
  if (channelId) {
    const channel = interaction.client.channels.cache.get(channelId) || await interaction.client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.isTextBased()) return channel;
  }
  return interaction.channel && interaction.channel.isTextBased() ? interaction.channel : null;
}

async function sendModLog(interaction, entry) {
  const channel = await getLogChannel(interaction);
  if (!channel) return;

  const fields = [
    { name: 'Case', value: `#${entry.caseId}`, inline: true },
    { name: 'Action', value: entry.action, inline: true },
    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true }
  ];

  if (entry.targetId) fields.push({ name: 'Target', value: `<@${entry.targetId}>`, inline: true });
  fields.push({ name: 'Reason', value: trimReason(entry.reason).slice(0, 1000), inline: false });
  if (entry.details) fields.push({ name: 'Details', value: String(entry.details).slice(0, 1000), inline: false });

  const log = baseEmbed('Moderation log').addFields(fields);
  await channel.send({ embeds: [log] }).catch(err => console.error('Moderation log failed:', err));
}

async function fetchMember(interaction, user, required = true) {
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member && required) throw new Error('That user is not currently in this server.');
  return member;
}

function assertNotSelfOrBot(interaction, user) {
  if (user.id === interaction.user.id) throw new Error('You cannot moderate yourself with this command.');
  if (user.id === interaction.client.user.id) throw new Error('You cannot target HashGoblin with this command.');
}

function assertMemberAction(interaction, member, action) {
  if (!member) throw new Error('That member is not currently in this server.');
  if (member.id === interaction.guild.ownerId) throw new Error('You cannot moderate the server owner.');
  if (action === 'timeout' && !member.moderatable) throw new Error('I cannot timeout that member. Check my role position and permissions.');
  if (action === 'kick' && !member.kickable) throw new Error('I cannot kick that member. Check my role position and permissions.');
  if (action === 'ban' && !member.bannable) throw new Error('I cannot ban that member. Check my role position and permissions.');
}

async function handleConfig(interaction) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'Manage Server');
  const channel = interaction.options.getChannel('channel');
  getSettings(db, interaction.guildId);
  if (channel) {
    db.prepare('UPDATE guild_settings SET mod_log_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?')
      .run(channel.id, interaction.guildId);
  }
  const settings = getSettings(db, interaction.guildId);
  const embed = baseEmbed('Moderation settings')
    .addFields(
      { name: 'Log channel', value: settings.mod_log_channel_id ? `<#${settings.mod_log_channel_id}>` : 'Not set, logs fall back to the command channel.', inline: false },
      { name: 'Tip', value: 'Set this to your bot-commands channel if you want all mod logs there.', inline: false }
    );
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleWarn(interaction) {
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members');
  const target = interaction.options.getUser('user', true);
  assertNotSelfOrBot(interaction, target);
  const reason = trimReason(interaction.options.getString('reason'));
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, targetId: target.id, action: 'warn', reason });
  await sendModLog(interaction, { caseId, action: 'Warn', targetId: target.id, reason });
  return interaction.reply({ content: `Logged warning #${caseId} for ${target}.`, ephemeral: true });
}

async function handleTimeout(interaction, clear = false) {
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members');
  const target = interaction.options.getUser('user', true);
  assertNotSelfOrBot(interaction, target);
  const member = await fetchMember(interaction, target);
  assertMemberAction(interaction, member, 'timeout');
  const reason = trimReason(interaction.options.getString('reason'));
  const minutes = clear ? 0 : interaction.options.getInteger('minutes', true);
  const ms = clear ? null : minutes * 60 * 1000;

  await interaction.deferReply({ ephemeral: true });
  await member.timeout(ms, reason);
  const action = clear ? 'untimeout' : 'timeout';
  const details = clear ? null : { minutes };
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, targetId: target.id, action, reason, details });
  await sendModLog(interaction, { caseId, action: clear ? 'Remove timeout' : 'Timeout', targetId: target.id, reason, details: clear ? null : `${minutes} minute(s)` });
  return interaction.editReply(`${clear ? 'Removed timeout from' : 'Timed out'} ${target}. Case #${caseId}.`);
}

async function handleKick(interaction) {
  requirePermission(interaction, PermissionFlagsBits.KickMembers, 'Kick Members');
  const target = interaction.options.getUser('user', true);
  assertNotSelfOrBot(interaction, target);
  const member = await fetchMember(interaction, target);
  assertMemberAction(interaction, member, 'kick');
  const reason = trimReason(interaction.options.getString('reason'));

  await interaction.deferReply({ ephemeral: true });
  await member.kick(reason);
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, targetId: target.id, action: 'kick', reason });
  await sendModLog(interaction, { caseId, action: 'Kick', targetId: target.id, reason });
  return interaction.editReply(`Kicked ${target}. Case #${caseId}.`);
}

async function handleBan(interaction) {
  requirePermission(interaction, PermissionFlagsBits.BanMembers, 'Ban Members');
  const target = interaction.options.getUser('user', true);
  assertNotSelfOrBot(interaction, target);
  const member = await fetchMember(interaction, target, false);
  if (member) assertMemberAction(interaction, member, 'ban');
  const reason = trimReason(interaction.options.getString('reason'));
  const deleteHours = interaction.options.getInteger('delete_messages_hours') ?? 0;

  await interaction.deferReply({ ephemeral: true });
  await interaction.guild.members.ban(target.id, { deleteMessageSeconds: deleteHours * 3600, reason });
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, targetId: target.id, action: 'ban', reason, details: { deleteHours } });
  await sendModLog(interaction, { caseId, action: 'Ban', targetId: target.id, reason, details: `Deleted message window: ${deleteHours} hour(s)` });
  return interaction.editReply(`Banned ${target}. Case #${caseId}.`);
}

async function handleUnban(interaction) {
  requirePermission(interaction, PermissionFlagsBits.BanMembers, 'Ban Members');
  const userId = interaction.options.getString('user_id', true).trim();
  if (!/^\d{15,25}$/.test(userId)) throw new Error('That does not look like a valid Discord user ID.');
  const reason = trimReason(interaction.options.getString('reason'));

  await interaction.deferReply({ ephemeral: true });
  await interaction.guild.members.unban(userId, reason);
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, targetId: userId, action: 'unban', reason });
  await sendModLog(interaction, { caseId, action: 'Unban', targetId: userId, reason });
  return interaction.editReply(`Unbanned <@${userId}>. Case #${caseId}.`);
}

async function handlePurge(interaction) {
  requirePermission(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages');
  const amount = interaction.options.getInteger('amount', true);
  const target = interaction.options.getUser('user');
  const reason = trimReason(interaction.options.getString('reason'));
  if (!interaction.channel || !interaction.channel.isTextBased() || !interaction.channel.bulkDelete) {
    throw new Error('This channel does not support bulk message deletion.');
  }

  await interaction.deferReply({ ephemeral: true });
  const fetched = await interaction.channel.messages.fetch({ limit: Math.min(amount, 100) });
  const selected = target ? fetched.filter(m => m.author.id === target.id) : fetched;
  const deleted = await interaction.channel.bulkDelete(selected, true);
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, targetId: target ? target.id : null, action: 'purge', reason, details: { requested: amount, deleted: deleted.size } });
  await sendModLog(interaction, { caseId, action: 'Purge', targetId: target ? target.id : null, reason, details: `Deleted ${deleted.size} message(s) in <#${interaction.channelId}>.` });
  return interaction.editReply(`Deleted ${deleted.size} message(s). Case #${caseId}.`);
}

async function handleSlowmode(interaction) {
  requirePermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels');
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const seconds = interaction.options.getInteger('seconds', true);
  const reason = trimReason(interaction.options.getString('reason'));
  if (!channel || typeof channel.setRateLimitPerUser !== 'function') throw new Error('That channel does not support slowmode.');

  await interaction.deferReply({ ephemeral: true });
  await channel.setRateLimitPerUser(seconds, reason);
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, action: 'slowmode', reason, details: { channelId: channel.id, seconds } });
  await sendModLog(interaction, { caseId, action: 'Slowmode', reason, details: `<#${channel.id}> set to ${seconds}s.` });
  return interaction.editReply(`Set slowmode in <#${channel.id}> to ${seconds}s. Case #${caseId}.`);
}

async function handleLockdown(interaction, locked) {
  requirePermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels');
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const reason = trimReason(interaction.options.getString('reason'));
  if (!channel || !channel.permissionOverwrites || typeof channel.permissionOverwrites.edit !== 'function') {
    throw new Error('That channel does not support permission overwrites.');
  }

  await interaction.deferReply({ ephemeral: true });
  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: locked ? false : null }, { reason });
  const action = locked ? 'lockdown' : 'unlockdown';
  const caseId = caseInsert({ guildId: interaction.guildId, moderatorId: interaction.user.id, action, reason, details: { channelId: channel.id } });
  await sendModLog(interaction, { caseId, action: locked ? 'Lock channel' : 'Unlock channel', reason, details: `<#${channel.id}>` });
  return interaction.editReply(`${locked ? 'Locked' : 'Unlocked'} <#${channel.id}>. Case #${caseId}.`);
}

async function handleCases(interaction) {
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members');
  const target = interaction.options.getUser('user');
  const rows = recentCases(interaction.guildId, 15).filter(row => !target || row.target_user_id === target.id).slice(0, 10);
  const lines = rows.length ? rows.map(row => {
    const targetText = row.target_user_id ? ` → <@${row.target_user_id}>` : '';
    return `#${row.id} **${row.action}** by <@${row.moderator_user_id}>${targetText} <t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R> — ${trimReason(row.reason).slice(0, 120)}`;
  }) : ['No moderation cases found.'];
  const embed = baseEmbed('Moderation cases').setDescription(lines.join('\n').slice(0, 3900));
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleModCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'config') return handleConfig(interaction);
  if (sub === 'warn') return handleWarn(interaction);
  if (sub === 'timeout') return handleTimeout(interaction, false);
  if (sub === 'untimeout') return handleTimeout(interaction, true);
  if (sub === 'kick') return handleKick(interaction);
  if (sub === 'ban') return handleBan(interaction);
  if (sub === 'unban') return handleUnban(interaction);
  if (sub === 'purge') return handlePurge(interaction);
  if (sub === 'slowmode') return handleSlowmode(interaction);
  if (sub === 'lock') return handleLockdown(interaction, true);
  if (sub === 'unlock') return handleLockdown(interaction, false);
  if (sub === 'cases') return handleCases(interaction);
  throw new Error('Unknown moderation subcommand.');
}

async function safeReply(interaction, err) {
  const body = { content: `⚠️ ${err.message || 'Something went wrong.'}`, ephemeral: true };
  if (interaction.deferred || interaction.replied) return interaction.followUp(body).catch(() => null);
  return interaction.reply(body).catch(() => null);
}

function isModerationCommand(interaction) {
  return Boolean(interaction && interaction.isChatInputCommand?.() && interaction.commandName === 'mod');
}

function installModerationRuntime() {
  if (Client.prototype[INSTALLED]) return;
  db = openDatabase();
  ensureModerationSchema(db);
  const originalEmit = Client.prototype.emit;
  Client.prototype.emit = function moderationEmit(eventName, ...args) {
    const interaction = args[0];
    if (eventName === 'interactionCreate' && isModerationCommand(interaction)) {
      handleModCommand(interaction).catch(err => {
        console.error('Moderation command failed:', err);
        safeReply(interaction, err);
      });
      return true;
    }
    return originalEmit.call(this, eventName, ...args);
  };
  Object.defineProperty(Client.prototype, INSTALLED, { value: true });
}

module.exports = { installModerationRuntime, ensureModerationSchema };
