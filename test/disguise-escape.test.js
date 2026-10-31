'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Shrine } = require('../act2');

function room() {
  const s = new Shrine('TEST', () => {});
  const p = s.newPlayer('Chaminuka');
  s.begin({ affinities: [], boons: [] });
  return { s, p };
}

test('repossessing an unexposed soldier breaks previous disguise identification', () => {
  const { s, p } = room();
  const [first, second] = s.foes;
  s.stepOut(p);
  p.x = first.x; p.y = first.y; s.wear(p, first);
  p.struckWhileWorn = true; s.betrayed = true;
  assert.ok(s.marks().some(m => m.kind === 'worn' && m.foe.id === first.id));
  s.release(p);
  p.x = second.x; p.y = second.y; s.wear(p, second);
  assert.equal(s.betrayed, true, 'the room remembers the earlier attack');
  assert.equal(p.struckWhileWorn, false, 'a fresh disguise is not exposed');
  assert.ok(!s.marks().some(m => m.kind === 'worn'),
    'every borrowed body must not inherit the first identity');
  assert.equal(s.pickTarget(first)?.mark.kind, 'vacant',
    'the original unattended body is still vulnerable');
});

test('an alerted guard is vulnerable to a close takeover from behind', () => {
  const { s, p } = room();
  const f = s.foes[0];
  for (const other of s.foes) if (other !== f) other.dead = true;
  s.stepOut(p); s.betrayed = true;
  f.state = 'hunt'; f.aim = 0;
  p.x = f.x + 30; p.y = f.y;
  assert.equal(s.takeTarget(p), null, 'a frontal takeover remains blocked');
  p.x = f.x - 30;
  assert.equal(s.takeTarget(p), f, 'approaching his back creates an escape opportunity');
  p.x = f.x - 48;
  assert.equal(s.takeTarget(p), null, 'the player must approach closely');
  p.x = f.x - 30; s.wear(p, f);
  assert.equal(p.struckWhileWorn, false);
  assert.ok(s.marks().every(m => m.kind !== 'worn'));
});

test('searching guards cannot see an unattended body behind them from anywhere', () => {
  const { s, p } = room();
  const f = s.foes[0];
  for (const other of s.foes) if (other !== f) other.dead = true;
  s.stepOut(p);
  p.bodyX = f.x - 75; p.bodyY = f.y;
  f.state = 'hunt'; f.aim = 0; f.lostT = 1;
  f.lastX = 0; f.lastY = 0;
  s.roused = true; s.lastX = f.x + 150; s.lastY = f.y;
  s.tick();
  assert.ok(f.lostT > 1, 'guard cannot acquire abandoned flesh behind his back');
  assert.ok(p.hp > 0, 'no omniscient immediate hit');
});
