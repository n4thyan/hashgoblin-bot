'use strict';

function comb(n, k) {
  if (k < 0 || k > n) return 0n;
  k = Math.min(k, n - k);
  let result = 1n;
  for (let i = 1; i <= k; i++) {
    result = (result * BigInt(n - k + i)) / BigInt(i);
  }
  return result;
}

function formatInt(n) {
  const value = typeof n === 'bigint' ? n : BigInt(Math.trunc(n));
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatNumber(n, decimals = 2) {
  return Number(n).toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

function percentFromCount(count, total, decimals = 3) {
  return `${((Number(count) / Number(total)) * 100).toFixed(decimals)}%`;
}

function oneIn(count, total) {
  return Number(total) / Number(count);
}

function hashToRoll(hex, modulus) {
  const n = BigInt('0x' + String(hex).slice(0, 16));
  return Number(n % BigInt(modulus));
}

module.exports = { comb, formatInt, formatNumber, percentFromCount, oneIn, hashToRoll };
