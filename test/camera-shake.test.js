'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

test('Act II camera shake decays to zero after hit or defeat', () => {
  const start = html.indexOf('function drawWorld2() {');
  assert.ok(start >= 0, 'Act II renderer exists');
  const end = html.indexOf('  const mp = P.get(myId)', start);
  assert.ok(end > start, 'renderer preamble found');
  const preamble = html.slice(start + 'function drawWorld2() {'.length, end);
  assert.match(preamble, /shake \*= 0\.86/);
  assert.match(preamble, /if \(shake < 0\.2\) shake = 0/);
  // Execute the ACTUAL camera effect code, not a copied model of its behavior.
  const update = new Function('value', 'random',
    'let shake = value; const Math = { random };' + preamble +
    'return { shake, ox, oy };');
  let state = update(12, () => 0.75);
  assert.ok(state.shake < 12 && state.shake > 0);
  assert.notEqual(state.ox, 0, 'initial damage produces a visible impulse');
  for (let frame = 0; frame < 60; frame++) state = update(state.shake, () => 0.75);
  assert.equal(state.shake, 0, 'repeated frames fully clear the impulse');
  assert.equal(state.ox, 0, 'camera settles instead of endlessly shaking');
  assert.equal(state.oy, 0);
});

test('Act II room transition resets shake and clears prior effects', () => {
  const start = html.indexOf('function onMap2(m) {');
  const end = html.indexOf('function onSnap2(m) {', start);
  assert.ok(start >= 0 && end > start);
  const transition = html.slice(start, end);
  assert.match(transition, /shake = 0/);
  assert.match(transition, /fx\.length = 0; parts\.length = 0; texts\.length = 0/);
  assert.match(transition, /phase = 'loading2'/);
  assert.match(transition, /snap = null; snap2 = null/);
});

test('embedded game script still parses after camera fix', () => {
  const start = html.indexOf('<script>\n(() => {');
  const end = html.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotThrow(() => new vm.Script(html.slice(start + '<script>'.length, end)));
});
