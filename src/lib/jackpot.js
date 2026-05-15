'use strict';

const LOTTO_POOL_TYPE = 'lotto';
const DEFAULT_LOTTO_JACKPOT = 100000;
const LOTTO_POOL_CONTRIBUTION_BPS = 3000; // 30% of each ticket goes into the rolling pool.

function ensureLottoPool(db, guildId) {
  let row = db.prepare('SELECT * FROM jackpot_pools WHERE guild_id = ? AND pool_type = ?').get(guildId, LOTTO_POOL_TYPE);
  if (!row) {
    db.prepare('INSERT INTO jackpot_pools (guild_id, pool_type, amount) VALUES (?, ?, ?)')
      .run(guildId, LOTTO_POOL_TYPE, DEFAULT_LOTTO_JACKPOT);
    row = db.prepare('SELECT * FROM jackpot_pools WHERE guild_id = ? AND pool_type = ?').get(guildId, LOTTO_POOL_TYPE);
  }
  return row;
}

function getLottoPool(db, guildId) {
  return ensureLottoPool(db, guildId);
}

function settleLottoPool(db, guildId, userId, ticketCost, hitJackpot) {
  return db.transaction(() => {
    const pool = ensureLottoPool(db, guildId);
    const contribution = Math.max(1, Math.floor(ticketCost * LOTTO_POOL_CONTRIBUTION_BPS / 10000));
    if (hitJackpot) {
      db.prepare(`UPDATE jackpot_pools
        SET amount = ?, last_won_by = ?, last_won_amount = ?, last_won_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ? AND pool_type = ?`)
        .run(DEFAULT_LOTTO_JACKPOT, userId, pool.amount, guildId, LOTTO_POOL_TYPE);
      return { before: pool.amount, after: DEFAULT_LOTTO_JACKPOT, contribution: 0, reset: true, wonAmount: pool.amount };
    }
    const after = pool.amount + contribution;
    db.prepare('UPDATE jackpot_pools SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND pool_type = ?')
      .run(after, guildId, LOTTO_POOL_TYPE);
    return { before: pool.amount, after, contribution, reset: false, wonAmount: 0 };
  })();
}

module.exports = {
  LOTTO_POOL_TYPE,
  DEFAULT_LOTTO_JACKPOT,
  LOTTO_POOL_CONTRIBUTION_BPS,
  getLottoPool,
  settleLottoPool
};
