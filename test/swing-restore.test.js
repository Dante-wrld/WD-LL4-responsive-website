'use strict';
/* Regression for the save/restore defect that cost a player his dodge.
 * Put this in test/ and it fails on v0.9.10, passes once session-store.js
 * cancels an in-flight swing. */
const test = require('node:test');
const assert = require('node:assert');
const { Shrine, TICK } = require('../act2');
const { pack, restore } = require('../session-store');
const { Session } = require('../campaign');

/** Drive a player into the active frames of a thrust. */
function midThrust(shrine, p) {
  shrine.setInput(p.id, { atk: true, a: 0 });
  shrine.tick();
  shrine.setInput(p.id, { a: 0 });
  let guard = 0;
  while (p.swingPhase !== 'swing' && guard++ < 30) shrine.tick();
  return p.swingPhase === 'swing';
}

test('a thrust in flight does not survive a save, and does not cripple the player', () => {
  const s = new Session('ABCD', () => {});
  const a = s.newPlayer('Wrld');
  s.toAct2();
  const p = s.players.get(a.id);
  const foe = s.shrine.foes[0];
  p.x = foe.x - 40; p.y = foe.y; p.aim = 0;
  assert.ok(midThrust(s.shrine, p), 'he is mid-thrust');
  assert.ok(p.swingHit instanceof Set, 'which means a Set is live on the player');

  // exactly what the store does on the way out and back in
  const back = restore(JSON.parse(JSON.stringify(pack(s))), () => {});
  assert.ok(back && back.shrine, 'the shrine came back');
  const q = back.shrine.players.get(a.id);
  assert.ok(q, 'and so did the player');
  // A restored seat is disconnected until the browser rejoins. This test
  // simulates that reconnection before exercising movement or dodge.
  assert.equal(q.connected, false);
  q.connected = true;

  assert.ok(!(q.swingHit && typeof q.swingHit.has !== 'function'),
    'swingHit must never come back as a plain object');
  assert.equal(q.swingPhase, '', 'the half-finished thrust is cancelled, not resumed');

  // and the two things a stuck swing silently takes away
  for (const f of back.shrine.foes) f.dead = true;
  q.dodgeReady = 0;
  back.shrine.setInput(q.id, { dodge: true, a: 0 });
  assert.doesNotThrow(() => back.shrine.tick(), 'the tick does not throw after a restore');
  assert.ok(q.dodgeT > 0, 'he can still dodge');

  q.dodgeT = 0; q.dodgeReady = back.shrine.time + 99;
  // Test free movement in the open central aisle rather than walking into
  // the pillar beside the spearman's original position.
  q.x = back.shrine.map.start.x;
  q.y = back.shrine.map.start.y;
  const x0 = q.x;
  back.shrine.setInput(q.id, { mx: 1, my: 0, a: 0 });
  for (let i = 0; i < TICK; i++) back.shrine.tick();
  assert.ok(q.x - x0 > 120, `and still moves at full speed (${Math.round(q.x - x0)}px/s, not ~53)`);
});
