'use strict';

const { ensureUser, getSettings } = require('./db');

const SHOP_TITLES = [
  { id: 'hash_goblin', name: 'Hash Goblin', price: 5000, description: 'A respectable goblin with suspicious hobbies.' },
  { id: 'zero_hunter', name: 'Zero Hunter', price: 15000, description: 'For players chasing leading zeroes.' },
  { id: 'wheel_gremlin', name: 'Wheel Gremlin', price: 25000, description: 'Lives near the wheel. Bad sign.' },
  { id: 'lotto_menace', name: 'Lotto Menace', price: 50000, description: 'Still convinced the numbers mean something.' },
  { id: 'proof_lord', name: 'Proof Lord', price: 100000, description: 'Every roll has receipts.' },
  { id: 'glory_hoarder', name: 'Glory Hoarder', price: 250000, description: 'A title for people with no chill.' }
];

function normalizeId(id) {
  return String(id || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
}

function getShopTitles() {
  return SHOP_TITLES.slice();
}

function getTitle(id) {
  const key = normalizeId(id);
  return SHOP_TITLES.find(t => t.id === key);
}

function hasItem(db, guildId, userId, itemId) {
  return !!db.prepare('SELECT 1 FROM user_items WHERE guild_id = ? AND user_id = ? AND item_id = ?')
    .get(guildId, userId, itemId);
}

function buyTitle(db, guildId, userId, itemId) {
  return db.transaction(() => {
    const settings = getSettings(db, guildId);
    const user = ensureUser(db, guildId, userId);
    const item = getTitle(itemId);
    if (!item) throw new Error('Unknown shop title. Use /shop view to see valid title IDs.');
    if (hasItem(db, guildId, userId, item.id)) throw new Error('You already own that title.');
    if (user.balance < item.price) throw new Error('You do not have enough Glory for that title.');
    const after = user.balance - item.price;
    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(after, guildId, userId);
    db.prepare('INSERT INTO user_items (guild_id, user_id, item_id, item_type, item_name, price_paid) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, item.id, 'title', item.name, item.price);
    db.prepare('INSERT INTO ledger (guild_id, user_id, change_amount, reason, balance_after) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, userId, -item.price, `shop_title:${item.id}`, after);
    return { item, balance: after, currency: settings.currency_name };
  })();
}

function getInventory(db, guildId, userId) {
  ensureUser(db, guildId, userId);
  return db.prepare('SELECT * FROM user_items WHERE guild_id = ? AND user_id = ? ORDER BY created_at ASC')
    .all(guildId, userId);
}

function equipTitle(db, guildId, userId, itemId) {
  return db.transaction(() => {
    ensureUser(db, guildId, userId);
    const key = normalizeId(itemId);
    const item = getTitle(key);
    if (!item) throw new Error('Unknown title ID. Use /inventory to see owned title IDs.');
    if (!hasItem(db, guildId, userId, item.id)) throw new Error('You do not own that title yet.');
    db.prepare('UPDATE users SET equipped_title = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
      .run(item.name, guildId, userId);
    return item;
  })();
}

function clearTitle(db, guildId, userId) {
  ensureUser(db, guildId, userId);
  db.prepare('UPDATE users SET equipped_title = NULL, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?')
    .run(guildId, userId);
}

function achievementList(user) {
  const net = Number(user.lifetime_won || 0) - Number(user.lifetime_lost || 0);
  return [
    { name: 'First Goblin Steps', unlocked: Number(user.lifetime_bet || 0) > 0, hint: 'Play any casino game.' },
    { name: 'Daily Goblin', unlocked: Number(user.daily_streak || 0) >= 3, hint: 'Reach a 3 day daily streak.' },
    { name: 'Proof Addict', unlocked: Number(user.lifetime_bet || 0) >= 10000, hint: 'Bet 10,000 Glory total.' },
    { name: 'Big Hit', unlocked: Number(user.biggest_win || 0) >= 10000, hint: 'Win at least 10,000 Glory in one game.' },
    { name: 'Jackpot Menace', unlocked: Number(user.biggest_win || 0) >= 100000, hint: 'Win at least 100,000 Glory in one game.' },
    { name: 'Profit Gremlin', unlocked: net >= 50000, hint: 'Reach +50,000 net profit.' },
    { name: 'Glory Hoarder', unlocked: Number(user.balance || 0) >= 100000, hint: 'Hold 100,000 Glory at once.' }
  ];
}

module.exports = { getShopTitles, buyTitle, getInventory, equipTitle, clearTitle, achievementList };
