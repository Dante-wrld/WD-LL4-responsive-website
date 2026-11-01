'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chamber, CHAMBERS, DUNGEONS, TRIALS, FOES } = require('../shrine');
const { ASPECTS } = require('../act2');
const { Session } = require('../campaign');
const { pack, restore } = require('../session-store');
const { tx, ty, flood, solidFor } = require('../grid');

function clearRoom(sh, p) {
  for (const f of sh.foes) f.dead = true;
  p.x = sh.map.door.x; p.y = sh.map.door.y;
  for (let i = 0; i < 65; i++) sh.tick();
  assert.equal(sh.phase, 'gift', sh.map.name + ' should offer treasure');
  sh.takeGift(p.id, sh.offer[0].key);
}
function reachedShrineEnd() {
  const s = new Session('QWER', () => {});
  const host = s.newPlayer('Chaminuka');
  const guest = s.newPlayer('Friend');
  s.toAct2();
  const sh = s.shrine, p = sh.players.get(host.id);
  for (let n = 0; n < CHAMBERS.length; n++) clearRoom(sh, p);
  assert.equal(sh.phase, 'done');
  return { s, sh, p, host, guest };
}

test('three optional spirit rooms and two guardians have walkable routes', () => {
  assert.equal(TRIALS.length, 3);
  assert.equal(TRIALS.filter(t => !!t.boss).length, 2);
  const start = CHAMBERS.length + DUNGEONS.length;
  for (let i = 0; i < TRIALS.length; i++) {
    const map = chamber(start + i);
    assert.equal(map.chapter, 'trials');
    assert.equal(map.step, i + 1);
    assert.equal(map.total, 3);
    assert.equal(map.last, i === TRIALS.length - 1);
    assert.ok(ASPECTS[map.mastery], map.name + ' has a real unlock');
    assert.ok(!solidFor(map, tx(map.start.x), ty(map.start.y), 'self'));
    const reachable = flood(map, tx(map.start.x), ty(map.start.y), 'self');
    assert.ok(reachable.has(tx(map.door.x) + ',' + ty(map.door.y)), 'exit reachable');
    for (const f of map.foes) {
      assert.ok(reachable.has(tx(f.x) + ',' + ty(f.y)), 'enemy reachable');
      assert.ok(!solidFor(map, tx(f.x), ty(f.y), 'self'));
    }
    if (map.boss) assert.ok(FOES[map.boss]?.boss);
    assert.equal(map.rewards.length, 2);
  }
  assert.equal(chamber(4).chapter, 'dungeon', 'existing dungeon indexes unchanged');
  assert.equal(chamber(9).last, true);
});

test('the host unlocks all three forms through an optional Act II side quest', () => {
  const {s, sh, p, host, guest} = reachedShrineEnd();
  assert.equal(s.enterTrials(guest.id), false, 'guest cannot begin the quest');
  assert.equal(s.enterTrials(host.id), true);
  assert.equal(sh.chapter, 'trials');
  assert.equal(sh.beginTrials(), false, 'cannot restart during combat');
  const want = ['panther', 'eagle', 'ancestor'];
  for (let i = 0; i < want.length; i++) {
    assert.equal(sh.map.mastery, want[i]);
    clearRoom(sh, p);
    assert.deepEqual(p.aspects, want.slice(0, i + 1));
    assert.deepEqual(sh.players.get(guest.id).aspects, want.slice(0, i + 1),
      'cooperative players earn their own transformation');
  }
  assert.equal(sh.phase, 'done');
  assert.equal(sh.lastDone.canTrials, false);
  assert.equal(sh.lastDone.canDungeon, true);
  assert.equal(s.enterTrials(host.id), false);
  assert.equal(s.enterDungeon(host.id), true);
  assert.equal(sh.map.name, 'THE FORSAKEN ARMORY');
  assert.deepEqual(p.aspects, want, 'learned forms follow Chaminuka into the dungeon');
});

test('transformation activates on input, times out and respects cooldown', () => {
  const { s, sh, p, host } = reachedShrineEnd();
  s.enterTrials(host.id);
  clearRoom(sh, p); // Panther Aspect earned
  assert.deepEqual(p.aspects, ['panther']);
  for (const foe of sh.foes) foe.dead = true; // isolate timers from combat and death
  sh.setInput(p.id, { skill: true }); sh.tick();
  assert.equal(p.aspect, 'panther');
  assert.equal(sh.useAspect(p), false, 'cannot chain transformations instantly');
  sh.setInput(p.id, { skill: false }); sh.tick();
  for (let i = 0; i < 9 * 30; i++) sh.tick();
  assert.equal(p.aspect, null, 'transformation expires after eight seconds');
  assert.equal(sh.useAspect(p), false, 'cooldown outlasts transformation');
  for (let i = 0; i < 7 * 30; i++) sh.tick();
  assert.equal(sh.useAspect(p), true, 'form can be used after cooldown');
});

test('training progress and active spirit arts survive checkpoint restoration', () => {
  const {s, sh, p, host} = reachedShrineEnd();
  s.enterTrials(host.id);
  clearRoom(sh, p);
  const save = pack(s), back = restore(save, () => {});
  assert.ok(back);
  assert.equal(back.shrine.chapter, 'trials');
  assert.equal(back.shrine.map.step, 2);
  const restored = back.shrine.players.get(host.id);
  assert.deepEqual(restored.aspects, ['panther']);
  assert.equal(back.shrine.useAspect(restored), true);
  assert.equal(restored.aspect, 'panther');
  assert.equal(JSON.parse(back.shrine.meJSON(host.id)).nextAspect, 'Panther Aspect');
});

test('desktop, touch, server and combat HUD all expose training controls', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const touch = fs.readFileSync(path.join(root, 'public/touch-controls.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="trialsGo"/);
  assert.match(html, /send\(\{ t: 'trials' \}\)/);
  assert.match(html, /skill: actQ/);
  assert.match(html, /SPIRIT ARTS:/);
  assert.match(html, /p\.asp/);
  assert.match(touch, /press\('KeyF'\)/);
  assert.match(touch, /ASPECT/);
  assert.match(server, /case 'trials': room\.enterTrials/);
});
