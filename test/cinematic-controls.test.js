'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '../public/cinematic-controls.js');
const html = path.join(__dirname, '../public/index.html');

test('cinematic side controls are shipped and parse as browser JavaScript', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'cinematic-controls.js' }));
  const page = fs.readFileSync(html, 'utf8');
  assert.match(page, /<script src="\/cinematic-controls\.js" defer><\/script>/);
  assert.match(source, /storySideVolume/);
  assert.match(source, /storySideSkip/);
  assert.match(source, /storySideDetails/);
});

test('cinematic overlay respects video playback, story readability and mobile autoplay', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /video\.addEventListener\('playing', scheduleHide\)/);
  assert.match(source, /!isVideo\(\) \|\| video\.paused \|\| needsPlay\(\)/);
  assert.match(source, /if \(visible\(\) && needsPlay\(\)\)/);
  assert.match(source, /new MutationObserver\(\(\) => newScene\(\)\)/);
  assert.match(source, /card\.inert = !open/);
  assert.match(source, /prefers-reduced-motion:reduce/);
});

test("cinematic side controls preserve the game\'s original skip and sound actions", () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /skipButton\.click\(\)/);
  assert.match(source, /\(isVideo\(\) \? soundButton : voiceButton\)\.click\(\)/);
  assert.match(source, /if \(!skipButton\.disabled\)/);
  assert.match(source, /setPanel\(true\); \/\/ if other players are watching/);
});
