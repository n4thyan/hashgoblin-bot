'use strict';

const { getSettings, ensureUser } = require('./db');

const DEFAULT_WELCOME = 'Welcome {user} to **{server}**. You have joined the goblin economy with your starter Glory. Try `/balance`, `/daily` and `/odds game:wheelspin`.';
const DEFAULT_GOODBYE = '{userTag} left **{server}**. The goblin vault is quieter now.';

function cleanTemplate(value, fallback) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return (text || fallback).slice(0, 900);
}

function renderGreeting(template, member, settings) {
  return cleanTemplate(template, DEFAULT_WELCOME)
    .replaceAll('{user}', `<@${member.user.id}>`)
    .replaceAll('{userTag}', member.user.tag || member.user.username)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount || 'unknown'))
    .replaceAll('{currency}', settings.currency_name || 'Glory');
}

function updateGreeting(db, guildId, adminUserId, kind, options) {
  if (!['welcome', 'goodbye'].includes(kind)) throw new Error('Greeting kind must be welcome or goodbye.');
  const settings = getSettings(db, guildId);
  const enabledKey = `${kind}_enabled`;
  const channelKey = `${kind}_channel_id`;
  const messageKey = `${kind}_message`;

  const enabled = typeof options.enabled === 'boolean' ? (options.enabled ? 1 : 0) : Number(settings[enabledKey] || 0);
  const channelId = options.channelId !== undefined ? options.channelId : settings[channelKey];
  const fallback = kind === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE;
  const message = options.message !== undefined ? cleanTemplate(options.message, fallback) : (settings[messageKey] || fallback);

  db.prepare(`UPDATE guild_settings SET ${enabledKey} = ?, ${channelKey} = ?, ${messageKey} = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`)
    .run(enabled, channelId || null, message, guildId);
  db.prepare('INSERT INTO admin_logs (guild_id, admin_user_id, action, details) VALUES (?, ?, ?, ?)')
    .run(guildId, adminUserId, `${kind}_greeting_update`, JSON.stringify({ enabled: !!enabled, channelId: channelId || null }));
  return getSettings(db, guildId);
}


function updateMemberRole(db, guildId, adminUserId, options) {
  const settings = getSettings(db, guildId);
  const enabled = typeof options.enabled === 'boolean' ? (options.enabled ? 1 : 0) : Number(settings.member_role_enabled || 0);
  const roleId = options.roleId !== undefined ? options.roleId : settings.member_role_id;
  db.prepare('UPDATE guild_settings SET member_role_enabled = ?, member_role_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?')
    .run(enabled, roleId || null, guildId);
  db.prepare('INSERT INTO admin_logs (guild_id, admin_user_id, action, details) VALUES (?, ?, ?, ?)')
    .run(guildId, adminUserId, 'member_role_update', JSON.stringify({ enabled: !!enabled, roleId: roleId || null }));
  return getSettings(db, guildId);
}

async function assignMemberRole(db, member) {
  const settings = getSettings(db, member.guild.id);
  if (Number(settings.member_role_enabled || 0) !== 1 || !settings.member_role_id) return { assigned: false, reason: 'disabled_or_no_role' };
  if (!member.guild.members.me || !member.guild.members.me.permissions.has('ManageRoles')) return { assigned: false, reason: 'missing_manage_roles' };
  const role = await member.guild.roles.fetch(settings.member_role_id).catch(() => null);
  if (!role) return { assigned: false, reason: 'role_not_found' };
  if (member.roles.cache.has(role.id)) return { assigned: false, reason: 'already_has_role' };
  if (role.managed) return { assigned: false, reason: 'managed_role' };
  const botMember = member.guild.members.me;
  if (role.position >= botMember.roles.highest.position) return { assigned: false, reason: 'role_above_bot' };
  await member.roles.add(role, 'HashGoblin auto member role').catch(err => {
    throw new Error(`Auto-role failed: ${err.message}`);
  });
  return { assigned: true, roleId: role.id };
}

async function sendMemberGreeting(db, member, kind, makeEmbed) {
  const settings = getSettings(db, member.guild.id);
  const enabled = Number(settings[`${kind}_enabled`] || 0) === 1;
  const channelId = settings[`${kind}_channel_id`];
  if (!enabled || !channelId) return { sent: false, reason: 'disabled_or_no_channel' };

  if (kind === 'welcome') ensureUser(db, member.guild.id, member.user.id);

  const channel = await member.client.channels.fetch(channelId).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return { sent: false, reason: 'channel_not_sendable' };

  const fallback = kind === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE;
  const text = renderGreeting(settings[`${kind}_message`] || fallback, member, settings);
  const title = kind === 'welcome' ? '🧌 Welcome to the goblin economy' : '👋 Goblin goodbye';
  const embed = makeEmbed(title)
    .setDescription(text)
    .addFields(
      { name: 'Server', value: member.guild.name, inline: true },
      { name: 'Members', value: String(member.guild.memberCount || 'unknown'), inline: true }
    );
  if (kind === 'welcome') {
    embed.addFields({ name: 'Start here', value: '`/balance` `/daily` `/odds game:coinflip`', inline: false });
  }
  await channel.send({ embeds: [embed] });
  return { sent: true };
}

function greetingSummary(settings) {
  const w = Number(settings.welcome_enabled || 0) === 1;
  const g = Number(settings.goodbye_enabled || 0) === 1;
  return [
    `Welcome: ${w ? 'enabled' : 'disabled'}${settings.welcome_channel_id ? ` in <#${settings.welcome_channel_id}>` : ''}`,
    `Goodbye: ${g ? 'enabled' : 'disabled'}${settings.goodbye_channel_id ? ` in <#${settings.goodbye_channel_id}>` : ''}`,
    `Member role: ${Number(settings.member_role_enabled || 0) === 1 ? 'enabled' : 'disabled'}${settings.member_role_id ? ` → <@&${settings.member_role_id}>` : ''}`,
    'Templates: {user}, {userTag}, {username}, {server}, {memberCount}, {currency}'
  ].join('\n');
}

module.exports = { DEFAULT_WELCOME, DEFAULT_GOODBYE, updateGreeting, updateMemberRole, assignMemberRole, sendMemberGreeting, greetingSummary, cleanTemplate };
