'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exit(1);
}

if (pkg.version !== '1.1.0') fail(`package version is ${pkg.version}, expected 1.1.0`);
if (!fs.existsSync(path.join(__dirname, '..', '.env.example'))) fail('.env.example is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'docs', 'V1_DEPLOY_CHECKLIST.md'))) fail('V1 deploy checklist is missing');
if (!fs.existsSync(path.join(__dirname, '..', 'package-lock.json'))) fail('package-lock.json is missing');
if (fs.existsSync(path.join(__dirname, '..', '.env'))) fail('.env must not be included in release folder');
if (fs.existsSync(path.join(__dirname, '..', 'data', 'hashgoblin.sqlite'))) fail('SQLite database must not be included in release zip');
if (fs.existsSync(path.join(__dirname, '..', 'node_modules'))) console.warn('node_modules exists locally; exclude it from the zip.');

const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'HASHGOBLIN_DB']) {
  if (!envExample.includes(key)) fail(`.env.example missing ${key}`);
}
console.log('HashGoblin release check passed.');
