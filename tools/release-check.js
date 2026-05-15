'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const EXPECTED_VERSION = '1.3.0-rc.1';

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exit(1);
}

if (pkg.version !== EXPECTED_VERSION) fail(`package version is ${pkg.version}, expected ${EXPECTED_VERSION}`);
if (!fs.existsSync(path.join(__dirname, '..', '.env.example'))) fail('.env.example is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'docs', 'V1_DEPLOY_CHECKLIST.md'))) fail('V1 deploy checklist is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'docs', 'GAME_POLISH_PLAN.md'))) fail('v1.3 game polish plan is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'src', 'bootstrap.js'))) fail('src/bootstrap.js is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'src', 'lib', 'slotAnimation.js'))) fail('slot animation library is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'tools', 'slot-animation-selftest.js'))) fail('slot animation selftest is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'tools', 'bootstrap-selftest.js'))) fail('bootstrap selftest is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'package-lock.json'))) fail('package-lock.json is missing');
if (fs.existsSync(path.join(__dirname, '..', '.env'))) fail('.env must not be included in release folder');
if (fs.existsSync(path.join(__dirname, '..', 'data', 'hashgoblin.sqlite'))) fail('SQLite database must not be included in release zip');
if (fs.existsSync(path.join(__dirname, '..', 'node_modules'))) console.warn('node_modules exists locally; exclude it from the zip.');

const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
for (const key of [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'HASHGOBLIN_DB',
  'HASHGOBLIN_ANIMATED_SLOTS',
  'HASHGOBLIN_SLOT_ANIMATION_DELAY_MS',
  'HASHGOBLIN_VS_COINFLIP'
]) {
  if (!envExample.includes(key)) fail(`.env.example missing ${key}`);
}

console.log('HashGoblin release check passed.');
