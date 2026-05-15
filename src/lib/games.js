'use strict';

const { uniformIntFromHash, leadingHexZeroes } = require('./proof');
const { comb, formatInt } = require('./math');

const WHEEL_SEGMENTS = [
  { name: 'Goblin ate it', from: 0, to: 39999, multiplier: 0, positions: 40000 },
  { name: 'Half back', from: 40000, to: 64999, multiplier: 0.5, positions: 25000 },
  { name: 'Refund', from: 65000, to: 84999, multiplier: 1, positions: 20000 },
  { name: 'Double', from: 85000, to: 94999, multiplier: 2, positions: 10000 },
  { name: 'Fivefold', from: 95000, to: 98999, multiplier: 5, positions: 4000 },
  { name: 'Tenfold', from: 99000, to: 99899, multiplier: 10, positions: 900 },
  { name: 'Fifty Goblins', from: 99900, to: 99989, multiplier: 50, positions: 90 },
  { name: 'Hundred Goblins', from: 99990, to: 99999, multiplier: 100, positions: 10 }
];

const WHEEL_TOTAL = 100000;

function wheelExpectedReturn() {
  return WHEEL_SEGMENTS.reduce((sum, seg) => sum + (seg.positions / WHEEL_TOTAL) * seg.multiplier, 0);
}

function playCoinflip(resultHash, choice, bet) {
  const roll = uniformIntFromHash(resultHash, 10000, 'coinflip');
  const result = roll < 5000 ? 'heads' : 'tails';
  const win = result === choice;
  const payout = win ? Math.floor(bet * 1.95) : 0;
  return {
    gameType: 'coinflip',
    roll,
    rollMax: 9999,
    result,
    win,
    payout,
    profit: payout - bet,
    oddsText: '50%',
    edgeText: '2.5%',
    details: { choice, payoutMultiplier: win ? 1.95 : 0 }
  };
}

function playWheel(resultHash, bet) {
  const roll = uniformIntFromHash(resultHash, WHEEL_TOTAL, 'wheelspin');
  const segment = WHEEL_SEGMENTS.find(s => roll >= s.from && roll <= s.to);
  const payout = Math.floor(bet * segment.multiplier);
  return {
    gameType: 'wheelspin',
    roll,
    rollMax: WHEEL_TOTAL - 1,
    result: segment.name,
    win: payout > bet,
    payout,
    profit: payout - bet,
    oddsText: `${((segment.positions / WHEEL_TOTAL) * 100).toFixed(3)}%`,
    edgeText: `${((1 - wheelExpectedReturn()) * 100).toFixed(1)}%`,
    details: { segment, multiplier: segment.multiplier }
  };
}

function parseLottoNumbers(input) {
  if (!input) return null;
  const nums = String(input)
    .split(/[\s,.-]+/)
    .filter(Boolean)
    .map(n => Number.parseInt(n, 10));
  if (nums.length !== 6) throw new Error('Enter exactly 6 numbers, for example: 4 12 19 31 44 48');
  for (const n of nums) {
    if (!Number.isInteger(n) || n < 1 || n > 49) throw new Error('Lotto numbers must be between 1 and 49.');
  }
  if (new Set(nums).size !== 6) throw new Error('Lotto numbers must be unique.');
  return nums.sort((a, b) => a - b);
}

function pickUniqueNumbers(resultHash, count = 6, max = 49, salt = 'lotto') {
  const remaining = Array.from({ length: max }, (_, i) => i + 1);
  const picked = [];
  for (let i = 0; i < count; i++) {
    const idx = uniformIntFromHash(resultHash, remaining.length, `${salt}:${i}`);
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked.sort((a, b) => a - b);
}

const LOTTO_PRIZES = {
  0: 0,
  1: 0,
  2: 25,
  3: 750,
  4: 25000,
  5: 500000,
  6: null
};
const LOTTO_PICK = 6;
const LOTTO_POOL = 49;
const LOTTO_TICKET_COST = 100;
const LOTTO_TOTAL_COMBOS = comb(LOTTO_POOL, LOTTO_PICK);

function lottoTierOdds(matches) {
  const ways = comb(LOTTO_PICK, matches) * comb(LOTTO_POOL - LOTTO_PICK, LOTTO_PICK - matches);
  return { ways, total: LOTTO_TOTAL_COMBOS, oneIn: Number(LOTTO_TOTAL_COMBOS) / Number(ways) };
}

function lottoExpectedReturn(jackpot = 100000) {
  let ev = 0;
  for (let k = 0; k <= 6; k++) {
    const odds = lottoTierOdds(k);
    const prize = k === 6 ? jackpot : LOTTO_PRIZES[k];
    ev += (Number(odds.ways) / Number(odds.total)) * prize;
  }
  return ev;
}

function playLotto(resultHash, userNumbers, options = {}) {
  const ticketCost = Number.isInteger(options.ticketCost) ? options.ticketCost : LOTTO_TICKET_COST;
  const jackpot = Number.isInteger(options.jackpot) ? options.jackpot : 100000;
  const ticket = userNumbers || pickUniqueNumbers(resultHash, 6, 49, 'lotto-ticket');
  const draw = pickUniqueNumbers(resultHash, 6, 49, 'lotto-draw');
  const drawSet = new Set(draw);
  const matchedNumbers = ticket.filter(n => drawSet.has(n));
  const matches = matchedNumbers.length;
  const prize = matches === 6 ? jackpot : LOTTO_PRIZES[matches];
  const odds = lottoTierOdds(matches);
  return {
    gameType: 'lotto',
    roll: matches,
    rollMax: 6,
    result: `${matches}/6 matched`,
    win: prize > LOTTO_TICKET_COST,
    payout: prize,
    profit: prize - ticketCost,
    oddsText: `1 in ${formatInt(Math.round(odds.oneIn))}`,
    edgeText: `${((1 - lottoExpectedReturn(jackpot) / ticketCost) * 100).toFixed(1)}%`,
    details: {
      ticket,
      draw,
      matchedNumbers,
      matches,
      ticketCost,
      jackpot,
      hitJackpot: matches === 6,
      prizeTable: { ...LOTTO_PRIZES, 6: jackpot },
      combinations: LOTTO_TOTAL_COMBOS.toString(),
      quickpick: !userNumbers
    }
  };
}

const SLOT_SYMBOLS = [
  { key: 'cherry', emoji: '🍒', name: 'Cherry', weight: 300, tripleMultiplier: 5 },
  { key: 'lemon', emoji: '🍋', name: 'Lemon', weight: 240, tripleMultiplier: 10 },
  { key: 'bell', emoji: '🔔', name: 'Bell', weight: 180, tripleMultiplier: 20 },
  { key: 'diamond', emoji: '💎', name: 'Diamond', weight: 120, tripleMultiplier: 40 },
  { key: 'seven', emoji: '7️⃣', name: 'Seven', weight: 80, tripleMultiplier: 100 },
  { key: 'goblin', emoji: '🧌', name: 'Goblin', weight: 50, tripleMultiplier: 250 },
  { key: 'zero', emoji: '0️⃣', name: 'Zero', weight: 30, tripleMultiplier: 1000 }
];
const SLOT_TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
const SLOT_TWO_MATCH_MULTIPLIER = 0.75;

function slotExpectedReturn() {
  let ev = 0;
  for (const a of SLOT_SYMBOLS) {
    for (const b of SLOT_SYMBOLS) {
      for (const c of SLOT_SYMBOLS) {
        const p = (a.weight / SLOT_TOTAL_WEIGHT) * (b.weight / SLOT_TOTAL_WEIGHT) * (c.weight / SLOT_TOTAL_WEIGHT);
        let mult = 0;
        if (a.key === b.key && b.key === c.key) mult = a.tripleMultiplier;
        else if (new Set([a.key, b.key, c.key]).size === 2) mult = SLOT_TWO_MATCH_MULTIPLIER;
        ev += p * mult;
      }
    }
  }
  return ev;
}

function pickSlotSymbol(resultHash, reelIndex) {
  const roll = uniformIntFromHash(resultHash, SLOT_TOTAL_WEIGHT, `slots:${reelIndex}`);
  let cursor = 0;
  for (const symbol of SLOT_SYMBOLS) {
    cursor += symbol.weight;
    if (roll < cursor) return { ...symbol, roll };
  }
  return { ...SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1], roll };
}

function slotOutcomeOdds(reels) {
  const [a, b, c] = reels;
  if (a.key === b.key && b.key === c.key) {
    const p = (a.weight / SLOT_TOTAL_WEIGHT) ** 3;
    return { probability: p, text: `1 in ${formatInt(Math.round(1 / p))}` };
  }
  if (new Set(reels.map(r => r.key)).size === 2) {
    const matched = reels.find(r => reels.filter(x => x.key === r.key).length === 2);
    const other = reels.find(r => r.key !== matched.key);
    const p = 3 * ((matched.weight / SLOT_TOTAL_WEIGHT) ** 2) * (other.weight / SLOT_TOTAL_WEIGHT);
    return { probability: p, text: `1 in ${formatInt(Math.round(1 / p))}` };
  }
  const p = reels.reduce((acc, r) => acc * (r.weight / SLOT_TOTAL_WEIGHT), 1) * 6;
  return { probability: p, text: `${(p * 100).toFixed(3)}% combo class` };
}

function playSlots(resultHash, bet) {
  const reels = [0, 1, 2].map(i => pickSlotSymbol(resultHash, i));
  const keys = reels.map(r => r.key);
  let multiplier = 0;
  let label = 'No match';
  if (keys[0] === keys[1] && keys[1] === keys[2]) {
    multiplier = reels[0].tripleMultiplier;
    label = `Triple ${reels[0].name}`;
  } else if (new Set(keys).size === 2) {
    multiplier = SLOT_TWO_MATCH_MULTIPLIER;
    label = 'Two matching';
  }
  const payout = Math.floor(bet * multiplier);
  const odds = slotOutcomeOdds(reels);
  return {
    gameType: 'slots',
    roll: reels.reduce((sum, r, i) => sum + r.roll * (i + 1), 0),
    rollMax: SLOT_TOTAL_WEIGHT ** 3 - 1,
    result: `${reels.map(r => r.emoji).join(' ')} — ${label}`,
    win: payout > bet,
    payout,
    profit: payout - bet,
    oddsText: odds.text,
    edgeText: `${((1 - slotExpectedReturn()) * 100).toFixed(1)}%`,
    details: { reels: reels.map(({ key, emoji, name, weight }) => ({ key, emoji, name, weight })), label, multiplier, expectedReturn: slotExpectedReturn() }
  };
}


const HASHJACKPOT_TABLE = {
  0: 0,
  1: 0,
  2: 50,
  3: 500,
  4: 5000,
  5: 50000,
  6: 1000000,
  7: 10000000,
  8: 100000000
};

function playHashJackpot(resultHash, bet) {
  const zeroes = leadingHexZeroes(resultHash);
  const capped = Math.min(zeroes, 8);
  const multiplier = HASHJACKPOT_TABLE[capped] || 0;
  const payout = Math.floor(bet * multiplier);
  const odds = zeroes === 0 ? 'about 15 in 16' : `1 in ${formatInt(16 ** capped)}`;
  return {
    gameType: 'hashjackpot',
    roll: zeroes,
    rollMax: 64,
    result: `${zeroes} leading zero${zeroes === 1 ? '' : 'es'}`,
    win: payout > bet,
    payout,
    profit: payout - bet,
    oddsText: odds,
    edgeText: 'high variance',
    details: { leadingZeroes: zeroes, paidTier: capped, multiplier }
  };
}


function pct(n) {
  return `${(n * 100).toFixed(3).replace(/\.000$/, '')}%`;
}

function oddsLine(label, probability, payout) {
  const oneIn = probability > 0 ? Math.round(1 / probability) : 0;
  return `${label}: ${pct(probability)}${oneIn ? ` (1 in ${formatInt(oneIn)})` : ''} — ${payout}`;
}

function coinflipOddsSummary() {
  return {
    title: '🪙 Coinflip maths',
    edge: '2.5%',
    expectedReturn: '97.5 Glory returned per 100 Glory bet, on average.',
    lines: [
      'Heads: 50% — pays 1.95x total if you picked heads.',
      'Tails: 50% — pays 1.95x total if you picked tails.',
      'The edge comes from payout, not from rigged odds: the coin is still 50/50.'
    ]
  };
}

function wheelOddsSummary() {
  const ev = wheelExpectedReturn();
  return {
    title: '🎡 Wheelspin maths',
    edge: `${((1 - ev) * 100).toFixed(1)}%`,
    expectedReturn: `${(ev * 100).toFixed(1)} Glory returned per 100 Glory bet, on average.`,
    lines: WHEEL_SEGMENTS.map(s => oddsLine(`${s.name} (${s.multiplier}x)`, s.positions / WHEEL_TOTAL, `${s.multiplier}x`))
  };
}

function lottoOddsSummary() {
  const ev = lottoExpectedReturn();
  return {
    title: '🎟 Lotto maths',
    edge: `${((1 - ev / LOTTO_TICKET_COST) * 100).toFixed(1)}%`,
    expectedReturn: `${ev.toFixed(2)} Glory returned per ${LOTTO_TICKET_COST} Glory ticket before the live jackpot pool is included.`,
    lines: [0,1,2,3,4,5,6].map(k => {
      const o = lottoTierOdds(k);
      const prize = k === 6 ? 'rolling jackpot pool' : `${formatInt(LOTTO_PRIZES[k])} Glory`;
      return `Match ${k}: 1 in ${formatInt(Math.round(o.oneIn))} — ${prize}`;
    }).concat([`Total combinations: C(49, 6) = ${formatInt(Number(LOTTO_TOTAL_COMBOS))}`])
  };
}

function slotsOddsSummary() {
  const ev = slotExpectedReturn();
  return {
    title: '🎰 Slots maths',
    edge: `${((1 - ev) * 100).toFixed(1)}%`,
    expectedReturn: `${(ev * 100).toFixed(1)} Glory returned per 100 Glory bet, on average.`,
    lines: SLOT_SYMBOLS.map(s => `${s.emoji} ${s.name}: reel weight ${s.weight}/${SLOT_TOTAL_WEIGHT}; triple pays ${s.tripleMultiplier}x`)
      .concat([`Two matching symbols pay ${SLOT_TWO_MATCH_MULTIPLIER}x. Reels are weighted, then mapped from SHA-256 rolls.`])
  };
}

function hashJackpotOddsSummary() {
  const lines = Object.entries(HASHJACKPOT_TABLE)
    .map(([z, mult]) => {
      const n = Number(z);
      if (n === 0) return `0-1 leading zeroes: common miss — 0x`;
      return `${n} leading zeroes: 1 in ${formatInt(16 ** n)} — ${formatInt(mult)}x`;
    });
  return {
    title: '💀 HashJackpot maths',
    edge: 'High variance',
    expectedReturn: 'This mode is intentionally brutal: most hashes miss, rare leading-zero hits can be huge.',
    lines: lines.concat(['Each leading hex zero is another 1-in-16 condition.'])
  };
}

function oddsSummaryFor(game) {
  if (game === 'coinflip') return coinflipOddsSummary();
  if (game === 'wheelspin') return wheelOddsSummary();
  if (game === 'slots') return slotsOddsSummary();
  if (game === 'lotto') return lottoOddsSummary();
  if (game === 'hashjackpot') return hashJackpotOddsSummary();
  throw new Error('Unknown game odds request.');
}

module.exports = {
  WHEEL_SEGMENTS,
  WHEEL_TOTAL,
  wheelExpectedReturn,
  playCoinflip,
  playWheel,
  parseLottoNumbers,
  pickUniqueNumbers,
  LOTTO_PRIZES,
  LOTTO_TICKET_COST,
  LOTTO_TOTAL_COMBOS,
  lottoTierOdds,
  lottoExpectedReturn,
  playLotto,
  SLOT_SYMBOLS,
  slotExpectedReturn,
  playSlots,
  playHashJackpot,
  oddsSummaryFor,
  coinflipOddsSummary,
  wheelOddsSummary,
  lottoOddsSummary,
  slotsOddsSummary,
  hashJackpotOddsSummary
};
