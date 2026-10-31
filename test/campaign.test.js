'use strict';
/* The joins between the three stages. What is being tested is not the stages —
 * they have their own suites — but that nothing is dropped at the seams. */
const test = require('node:test');
const assert = require('node:assert');
const { Session } = require('../campaign');
const { NIGHTS } = require('../road');
const { CHAMBERS } = require('../shrine');
const { TICK } = require('../vessel');

const run = (s, secs) => { for (let i = 0; i < Math.round(secs * TICK); i++) s.tick(); };
/** Everyone says they are done watching. Barriers wait for the whole party. */
const watched = (s, ps) => { for (const p of ps) s.seen(p.id); };
const tap = (s, id, key) => { s.setInput(id, { [key]: true }); s.tick(); s.setInput(id, {}); s.tick(); };

function mk(n = 1) {
  const sent = [];
  const s = new Session('TEST', (pid, m) => sent.push(m));
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(s.newPlayer('P' + (i + 1)));
  s.start(ps[0].id);
  // the opening cinematic now stands between START and the palace; every player
  // watches it, so every player must say they are done with it
  watched(s, ps);
  return { s, ps, sent };
}
/** Win the palace the short way: wear a servant, lift the child, walk out. */
function winAct1(s, id) {
  const p = s.players.get(id);
  const serv = s.room.bodies.find((b) => b.role === 'servant');
  for (const b of s.room.bodies) if (b.role !== 'servant') { b.x = -4000; b.y = -4000; b.route = [{ x: -4000, y: -4000 }]; }
  p.x = serv.x; p.y = serv.y; tap(s, id, 'use');
  p.x = s.room.infant.x; p.y = s.room.infant.y; s.tick(); tap(s, id, 'take');
  const g = s.room.map.exits[0];
  p.x = g.x; p.y = g.y; s.setInput(id, {}); s.tick();
  return p;
}

test('the party keeps its names, its ids and its host across all three stages', () => {
  const { s, ps } = mk(3);
  const before = s.roster.map((r) => `${r.id}:${r.name}:${r.host ? 'host' : ''}`).join('|');
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);                             // the escape card
  assert.equal(s.stage, 'road');
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  watched(s, ps);
  assert.equal(s.stage, 'act2');
  const after = s.roster.map((r) => `${r.id}:${r.name}:${r.host ? 'host' : ''}`).join('|');
  assert.equal(after, before, 'the roster is untouched');
  assert.deepEqual([...s.players.keys()].sort(), s.roster.map((r) => r.id).sort(),
    'and every one of them is actually seated in Act II');
});

test('winning the palace opens the road on its own, without anyone pressing anything', () => {
  const { s, ps } = mk();
  winAct1(s, ps[0].id);
  assert.equal(s.room.phase, 'won');
  assert.equal(s.stage, 'act1', 'there is a beat to read the win first');
  run(s, 5);
  assert.equal(s.phase, 'prologue', 'then the escape card');
  assert.equal(s.story.key, 'escape');
  watched(s, ps);
  assert.equal(s.stage, 'road', 'and then the road');
  assert.equal(s.phase, 'road');
});

test('affinities earned in the palace reach Act II intact', () => {
  const { s, ps } = mk();
  const p = winAct1(s, ps[0].id);
  assert.ok(p.affinities.length, 'the palace granted something: ' + p.affinities.join(','));
  const earned = p.affinities.slice();
  run(s, 5);
  watched(s, ps);                             // the escape card
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  watched(s, ps);                             // the sixteen years
  assert.deepEqual(s.carried.affinities.sort(), earned.sort(), 'carried across the join');
  const q = s.players.get(ps[0].id);
  assert.deepEqual((q.carried || []).sort(), earned.sort(), 'and applied to the man himself');
});

test('the road asks three questions and then jumps sixteen years', () => {
  const { s, ps, sent } = mk();
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  const asked = [];
  for (let i = 0; i < NIGHTS.length; i++) {
    const msg = sent.filter((m) => m.t === 'road').pop();
    assert.ok(msg && msg.night, 'a night was put to the party');
    asked.push(msg.night.id);
    assert.equal(msg.night.options.length, 2);
    for (const o of msg.night.options) assert.ok(o.lose, 'and each way through it is priced');
    s.choose(ps[0].id, msg.night.options[i % 2].key);
  }
  assert.deepEqual(asked, NIGHTS.map((n) => n.id), 'all three, in order');
  const jump = (sent.filter((m) => m.t === 'story' && m.key === 'jump').pop() || {}).jump;
  assert.ok(jump, 'the years pass');
  assert.equal(jump.years, 16);
  assert.equal(jump.costs.length, NIGHTS.length, 'and it tells you what each night cost');
  assert.match(jump.next, /ACT II/);
});

test('what you chose on the road is what you fight with', () => {
  const a = mk(); winAct1(a.s, a.ps[0].id); run(a.s, 5); watched(a.s, a.ps);
  a.s.choose(a.ps[0].id, 'carry');     // the spear
  a.s.choose(a.ps[0].id, 'hide');      // nothing
  a.s.choose(a.ps[0].id, 'stay');      // a name of his own
  watched(a.s, a.ps);
  const pa = a.s.players.get(a.ps[0].id);

  const b = mk(); winAct1(b.s, b.ps[0].id); run(b.s, 5); watched(b.s, b.ps);
  b.s.choose(b.ps[0].id, 'leave');     // the silence
  b.s.choose(b.ps[0].id, 'hide');
  b.s.choose(b.ps[0].id, 'go');        // the robe
  watched(b.s, b.ps);
  const pb = b.s.players.get(b.ps[0].id);

  assert.ok(pa.hpMax > pb.hpMax, 'the one who was named has another heart');
  assert.ok(pa.damage > pb.damage, 'the one with the spear hits harder');
  assert.ok(pb.noticeMult < pa.noticeMult, 'the one who walked alone is seen later');
  assert.ok(pb.outMax > pa.outMax, 'the one in the robe holds the spirit longer');
});

test('only the host answers for the party', () => {
  const { s, ps } = mk(2);
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  const n0 = s.nightN;
  s.choose(ps[1].id, NIGHTS[0].options[0].key);
  assert.equal(s.nightN, n0, 'a guest cannot decide the night');
  s.choose(ps[0].id, NIGHTS[0].options[0].key);
  assert.equal(s.nightN, n0 + 1, 'the host can');
});

test('an unanswered road still produces somebody who can fight', () => {
  const { s, ps } = mk();
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  s.skipTo(ps[0].id, 'act2');
  assert.equal(s.stage, 'act2');
  const p = s.players.get(ps[0].id);
  assert.ok(p.hpMax >= 4 && p.damage > 0, 'armed and breathing');
  assert.ok(s.shrine.map, 'and standing in a chamber');
});

test('going again in Act II keeps the road behind you', () => {
  const { s, ps } = mk();
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  watched(s, ps);
  const boons = s.carried.boons.slice();
  const p = s.players.get(ps[0].id);
  for (let i = 0; i < 20; i++) { p.hurtT = 0; s.shrine.hurt(p, 1, 'test'); }
  assert.equal(s.shrine.phase, 'down');
  s.again(ps[0].id);
  assert.equal(s.shrine.phase, 'run', 'you go again');
  assert.deepEqual(s.carried.boons, boons, 'with what the road gave you');
  assert.equal(s.stage, 'act2', 'and you do not have to do the palace over');
});

test('a player leaving mid-campaign hands the host on and does not break the stage', () => {
  const { s, ps } = mk(2);
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  watched(s, ps);
  assert.equal(s.stage, 'act2');
  s.removePlayer(ps[0].id);
  assert.equal(s.roster.length, 1);
  assert.ok(s.roster[0].host, 'the one left is host now');
  assert.ok(s.isHost(ps[1].id));
  run(s, 1);
  assert.ok(s.shrine.phase === 'run' || s.shrine.phase === 'down', 'and the act carries on');
});

test('the campaign reports which stage it is in, so a client is never guessing', () => {
  const { s, ps, sent } = mk();
  const lobby = () => sent.filter((m) => m.t === 'lobby').pop();
  assert.equal(lobby().stage, 'act1');
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  assert.equal(s.phase, 'road');
  const road = sent.filter((m) => m.t === 'road').pop();
  assert.equal(road.of, NIGHTS.length);
  assert.equal(road.nightN, 0);
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  watched(s, ps);
  assert.equal(lobby().stage, 'act2');
  const map2 = sent.filter((m) => m.t === 'map2').pop();
  assert.ok(map2, 'and Act II sends its own map');
  assert.equal(map2.act, 2);
  assert.equal(map2.index, 0);
  assert.ok(map2.last === false, 'with four chambers to go, not one');
  assert.equal(CHAMBERS.length, 4);
});

test('the sixteen-year card is not swept away by Act II starting underneath it', () => {
  const { s, ps, sent } = mk();
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  const jump = sent.filter((m) => m.t === 'story' && m.key === 'jump').pop();
  assert.ok(jump && jump.wait, 'the card says it is waiting');
  assert.ok(jump.jump && jump.jump.costs.length, 'and carries the summary with it');
  assert.equal(s.stage, 'road', 'and Act II has not begun');
  assert.ok(!sent.some((m) => m.t === 'map2'), 'no chamber has been sent yet');
  assert.equal(jump.key, 'jump', 'and the sixteen years play over it');
  watched(s, ps);
  assert.equal(s.stage, 'act2', 'the host presses on and the years pass');
  assert.ok(sent.some((m) => m.t === 'map2'));
});

test('and if nobody presses it, the years pass anyway', () => {
  const { s, ps } = mk();
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  assert.ok(s.story, 'waiting');
  s.story.until = s.clock() - 1;         // as if the fail-safe had run out
  s.tick();
  assert.equal(s.stage, 'act2', 'it does not wait forever');
});

test('a guest cannot press on through the years', () => {
  const { s, ps } = mk(2);
  winAct1(s, ps[0].id);
  run(s, 5);
  watched(s, ps);
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  s.go(ps[1].id);                       // only the guest has watched it
  assert.equal(s.stage, 'road', 'the party is still waiting on the host');
  s.go(ps[0].id);
  assert.equal(s.stage, 'act2', 'and once he has watched it too, the years pass');
});
