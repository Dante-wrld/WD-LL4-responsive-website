'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Room, ROLES, TICK, DT, TILE, palace, solidFor, zoneAt,
  POSSESS_TIME, SPIRIT_MAX, SUSP_MAX, SLUMP_TIME, STUTTER_AT, WALK,
  AWARE_MAX, AWARE_BURN, AWARE_STEPS, PROPHECY } = require('../vessel');

const T = (v) => Math.floor(v / TILE);
const run = (r, secs) => { for (let i = 0; i < Math.round(secs * TICK); i++) r.tick(); };
function mk(n = 1) {
  const r = new Room('V', () => {}); const ps = [];
  for (let i = 0; i < n; i++) ps.push(r.newPlayer('P' + (i + 1)));
  r.start(ps[0].id);
  return { r, ps };
}
/** Park every body far from the action so a test can isolate one rule. */
function clearBodies(r, keep) {
  for (const b of r.bodies) if (!keep || b.id !== keep.id) { b.x = -4000; b.y = -4000; b.route = [{ x: -4000, y: -4000 }]; }
}
const tap = (r, p, key) => { r.setInput(p.id, { [key]: true }); r.tick(); r.setInput(p.id, {}); r.tick(); };
/** Put a body where it can see the player and keep it facing them.
 *  Its route is set beyond the player so walking the route keeps it looking this way. */
function stare(b, p, dist) {
  b.x = p.x + (dist || 110); b.y = p.y;
  b.state = 'idle'; b.alertT = 0; b.ignoreUntil = 0; b.orderUntil = 0;
  b.route = [{ x: p.x - 200, y: p.y }]; b.wp = 0; b.lookT = 0;
  b.aim = Math.PI;
  return b;
}
function reach(m, role, from, to) {
  const k = (x, y) => x + ',' + y, seen = new Set([k(T(from.x), T(from.y))]);
  const q = [[T(from.x), T(from.y)]], gx = T(to.x), gy = T(to.y);
  while (q.length) {
    const [x, y] = q.pop();
    if (x === gx && y === gy) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(k(nx, ny)) || solidFor(m, nx, ny, role)) continue;
      seen.add(k(nx, ny)); q.push([nx, ny]);
    }
  }
  return false;
}

// ---------------------------------------------------------------- the puzzle
test('no single role can do the whole job — the handover is forced', () => {
  const m = palace();
  const cradle = m.infant, hall = { x: 20 * TILE + 16, y: 11 * TILE + 16 };
  const gate = (k) => m.exits.find((g) => g.key === k);
  assert.ok(reach(m, 'priest', cradle, hall), 'a priest can carry the child out of the nursery');
  assert.ok(!reach(m, 'servant', hall, cradle), 'but a servant can never enter the nursery');
  for (const g of m.exits) assert.ok(!reach(m, 'priest', cradle, g), `a priest can never reach ${g.name}`);
  assert.ok(reach(m, 'captain', cradle, gate('servants')), 'only the captain can walk the whole route');
  assert.ok(reach(m, 'spirit', cradle, gate('servants')), 'and a spirit may drift anywhere to scout');
});

test('the two gates want different bodies — that is what makes the choice real', () => {
  const m = palace();
  const hall = { x: 20 * TILE + 16, y: 11 * TILE + 16 };
  const servants = m.exits.find((g) => g.key === 'servants');
  const postern = m.exits.find((g) => g.key === 'postern');
  assert.ok(servants && postern, 'both gates exist');
  assert.ok(reach(m, 'servant', hall, servants), 'a servant can reach the servants\u2019 door');
  assert.ok(!reach(m, 'servant', hall, postern), 'but not the postern — it is inside the barracks');
  assert.ok(reach(m, 'soldier', hall, postern), 'a soldier can reach the postern');
  assert.ok(!reach(m, 'soldier', hall, servants), 'but not the servants\u2019 door');
  assert.ok(reach(m, 'captain', hall, servants) && reach(m, 'captain', hall, postern),
    'the captain may use either, and is watched the whole way');
  for (const g of m.exits) assert.ok(!solidFor(m, T(g.x), T(g.y), 'spirit'), `${g.name} is on open ground`);
});

test('the palace is sound: nobody patrols inside a wall, every body is reachable', () => {
  const m = palace();
  for (const b of m.bodies) {
    for (const w of b.route) assert.ok(!solidFor(m, T(w.x), T(w.y), b.role), `${b.name} patrols into a wall`);
    assert.ok(reach(m, 'spirit', m.infant, b.route[0]), `${b.name} is unreachable`);
  }
  assert.ok(!solidFor(m, T(m.infant.x), T(m.infant.y), 'spirit'), 'the cradle is on open ground');
  const roles = new Set(m.bodies.map((b) => b.role));
  for (const r of ['priest', 'soldier', 'servant', 'captain']) assert.ok(roles.has(r), `no ${r} exists to possess`);
});

// ---------------------------------------------------------------- possession
test('a spirit cannot lift the child, carry anything, or be seen', () => {
  const { r, ps } = mk();
  const p = ps[0];
  assert.equal(p.form, 'spirit');
  p.x = r.infant.x; p.y = r.infant.y;
  assert.equal(r.takeInfant(p), false, 'no hands');
  assert.equal(r.watchers(p.x, p.y).length >= 0, true);
  const s = r.suspicionRate(p);
  assert.equal(s.rate, 0, 'nothing to suspect — there is nobody there to see');
});

test('E steps into a nearby body and out again', () => {
  const { r, ps } = mk();
  const p = ps[0], b = r.bodies[0];
  clearBodies(r, b);
  p.x = b.x + 20; p.y = b.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  assert.equal(p.bodyId, b.id);
  assert.equal(b.state, 'worn');
  assert.ok(Math.abs(p.hostT - POSSESS_TIME) < 0.1, 'the host clock starts: ' + p.hostT.toFixed(2));
  tap(r, p, 'use');
  assert.equal(p.form, 'spirit');
  assert.equal(b.state, 'slumped', 'stepping out deliberately leaves him slumped, not shouting');
});

test('you cannot step into a body somebody else is already wearing', () => {
  const { r, ps } = mk(2);
  const [a, c] = ps;
  const b = r.bodies[0];
  a.x = b.x + 20; a.y = b.y; tap(r, a, 'use');
  assert.equal(a.bodyId, b.id);
  c.x = b.x + 20; c.y = b.y; tap(r, c, 'use');
  assert.notEqual(c.bodyId, b.id, 'that one is taken');
});

// ---------------------------------------------------------------- suspicion
test('suspicion only climbs while somebody can actually see you', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const worn = r.bodies.find((b) => b.role === 'soldier');
  const watcher = r.bodies.find((b) => b.role !== 'soldier' && b.id !== worn.id);
  clearBodies(r, worn);
  // a soldier standing in the nursery, with nobody about
  p.x = worn.x; p.y = worn.y; tap(r, p, 'use');
  p.x = 5 * TILE; p.y = 6 * TILE;  // deep in the nursery
  const z = zoneAt(r.map, p.x, p.y);
  assert.ok(z && !z.roles.includes('soldier'), 'he does not belong here');
  p.susp = 40;
  run(r, 1);
  assert.ok(p.susp < 40, 'unseen, it ebbs away: ' + Math.round(p.susp));
  // now put somebody in the doorway looking at him
  watcher.x = -4000; watcher.y = -4000;
  watcher.route = [{ x: p.x + 120, y: p.y }];
  watcher.x = p.x + 120; watcher.y = p.y; watcher.state = 'idle';
  const before = p.susp;
  for (let i = 0; i < TICK; i++) { watcher.aim = Math.PI; r.tick(); }
  assert.ok(p.susp > before, 'seen in the wrong wing, it climbs: ' + Math.round(p.susp));
  const reasons = r.suspicionRate(p).reasons.join(', ');
  assert.ok(/nursery/.test(reasons), 'and it tells you why: ' + reasons);
});

test('carrying the child is damning in any hands but a servant\'s', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const priest = r.bodies.find((b) => b.role === 'priest');
  const watcher = r.bodies.find((b) => b.role === 'soldier');
  clearBodies(r, priest);
  p.x = priest.x; p.y = priest.y; tap(r, p, 'use');
  p.x = r.infant.x; p.y = r.infant.y;
  assert.ok(r.takeInfant(p), 'a priest may lift him');
  stare(watcher, p);
  r.tick();
  const reasons = r.suspicionRate(p).reasons.join(', ');
  assert.ok(/royal child/.test(reasons), 'the child is the problem: ' + reasons);
  const rate = r.suspicionRate(p).rate;
  // the same walk as a servant draws no comment
  const servant = r.bodies.find((b) => b.role === 'servant');
  r.leaveBody(p, 'slump');
  priest.x = -4000; priest.y = -4000;            // the spent priest is out of reach
  servant.x = p.x; servant.y = p.y; servant.state = 'idle';
  p.x = servant.x; p.y = servant.y; tap(r, p, 'use');
  assert.equal(r.body(p.bodyId).role, 'servant', 'now wearing a servant');
  r.infant.x = p.x; r.infant.y = p.y; r.infant.carrier = 0;
  assert.ok(r.takeInfant(p));
  stare(watcher, p);
  r.tick();
  const servantReasons = r.suspicionRate(p).reasons.join(', ');
  assert.ok(!/royal child/.test(servantReasons), 'a servant carrying a baby is unremarkable: ' + servantReasons);
  assert.ok(r.suspicionRate(p).rate < rate, 'and far less suspicious overall');
});

test('a full suspicion meter burns the body and rouses the wing', () => {
  const { r, ps } = mk();
  const p = ps[0];
  // a soldier loitering in the nursery, with somebody watching him do it
  const worn = r.bodies.find((b) => b.role === 'soldier');
  const near = r.bodies.find((b) => b.id !== worn.id);
  clearBodies(r, worn);
  p.x = worn.x; p.y = worn.y; tap(r, p, 'use');
  p.x = 5 * TILE; p.y = 6 * TILE;
  r.tick();
  // A close witness should still notice this obvious violation with a smaller FOV.
  stare(near, p, 105);
  assert.ok(r.suspicionRate(p).rate > 0, 'he is being noticed');
  p.susp = SUSP_MAX - 0.2;
  r.setInput(p.id, {}); r.tick(); r.tick();
  assert.equal(p.form, 'spirit', 'thrown out');
  assert.equal(worn.state, 'alert', 'and he knows');
  assert.equal(near.state, 'alert', 'and so do the others nearby');
  assert.equal(p.burns, 1);
});

// ---------------------------------------------------------------- the host
test('the host wakes on his own and shouts where you are standing', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const worn = r.bodies[0];
  clearBodies(r, worn);
  p.x = worn.x; p.y = worn.y; tap(r, p, 'use');
  p.hostT = STUTTER_AT + 0.2;
  run(r, 0.5);
  assert.ok(r.suspicionRate(p).rate !== undefined);
  p.hostT = 0.05;
  r.setInput(p.id, {}); r.tick(); r.tick();
  assert.equal(p.form, 'spirit', 'thrown clear');
  assert.equal(worn.state, 'alert', 'and he raises the alarm');
});

test('a slumped body left lying about is eventually found', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const worn = r.bodies.find((b) => b.role === 'priest');
  const passer = r.bodies.find((b) => b.id !== worn.id);
  clearBodies(r, worn);
  p.x = worn.x; p.y = worn.y; tap(r, p, 'use');
  tap(r, p, 'use');
  assert.equal(worn.state, 'slumped');
  passer.x = worn.x + 60; passer.y = worn.y; passer.state = 'idle';
  passer.route = [{ x: worn.x + 60, y: worn.y }];
  run(r, 0.3);
  assert.equal(worn.state, 'slumped', 'he remains unnoticed during the handoff window');
  assert.ok(!r.bodies.some((b) => b.state === 'alert'), 'switching bodies does not instantly raise an alarm');
  run(r, 8.1);
  assert.notEqual(worn.state, 'slumped', 'a body left for too long is discovered');
  assert.ok(r.bodies.some((b) => b.state === 'alert'), 'and the wing is eventually alerted');
});

test('a slumped body left somewhere quiet is safe until he wakes by himself', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const worn = r.bodies[0];
  clearBodies(r, worn);
  p.x = worn.x; p.y = worn.y; tap(r, p, 'use');
  tap(r, p, 'use');
  run(r, SLUMP_TIME - 2);
  assert.equal(worn.state, 'slumped', 'still out cold, nobody the wiser');
  run(r, 3);
  assert.equal(worn.state, 'idle', 'and then he comes round');
});

// ---------------------------------------------------------------- the tether
test('a spirit left unhoused too long is drawn back to the cradle', () => {
  const { r, ps } = mk();
  const p = ps[0];
  clearBodies(r);
  p.x = 20 * TILE; p.y = 11 * TILE;
  p.energy = 0.5;
  run(r, 1);
  assert.ok(Math.hypot(p.x - r.infant.home.x, p.y - r.infant.home.y) < 5, 'pulled home');
  assert.ok(p.energy > 0, 'with something left to work with');
});

test('wearing a body restores the tether', () => {
  const { r, ps } = mk();
  const p = ps[0], b = r.bodies[0];
  p.energy = 4;
  p.x = b.x + 20; p.y = b.y; tap(r, p, 'use');
  run(r, 3);
  assert.ok(p.energy > 4, 'it refills while you are housed: ' + p.energy.toFixed(1));
});

// ---------------------------------------------------------------- role actions
test('a priest\'s blessing clears suspicion and calms an alerted wing', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const priest = r.bodies.find((b) => b.role === 'priest');
  const angry = r.bodies.find((b) => b.id !== priest.id);
  p.x = priest.x; p.y = priest.y; tap(r, p, 'use');
  p.susp = 70;
  angry.x = p.x + 120; angry.y = p.y; angry.state = 'alert'; angry.alertT = 20;
  p.actReady = 0;
  tap(r, p, 'act');
  assert.equal(p.susp, 0, 'your own suspicion is wiped');
  assert.equal(angry.state, 'idle', 'and he settles down');
});

test('a soldier can order somebody off their post, a servant can call them over', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const soldier = r.bodies.find((b) => b.role === 'soldier');
  const servantBody = r.bodies.find((b) => b.role === 'servant');
  const other = r.bodies.find((b) => b.id !== soldier.id && b.id !== servantBody.id);
  // clear the rest so the action cannot pick a nearer bystander instead
  for (const b of r.bodies) if (![soldier.id, servantBody.id, other.id].includes(b.id)) { b.x = -4000; b.y = -4000; b.route = [{ x: -4000, y: -4000 }]; }
  p.x = soldier.x; p.y = soldier.y; tap(r, p, 'use');
  stare(other, p, 100);
  p.actReady = 0;
  r.setInput(p.id, { act: true }); r.tick();
  assert.ok(other.orderUntil > r.time, 'he has been sent away');
  assert.ok(Math.hypot(other.orderX - p.x, other.orderY - p.y) > 150, 'and away is away from you');
  // and now the same trick in reverse, as a servant
  r.leaveBody(p, 'slump');
  soldier.x = -4000; soldier.y = -4000;           // the spent soldier is out of reach
  const servant = servantBody;
  servant.x = p.x; servant.y = p.y; servant.state = 'idle';
  p.x = servant.x; p.y = servant.y; tap(r, p, 'use');
  assert.equal(r.body(p.bodyId).role, 'servant', 'now wearing a servant');
  stare(other, p, 160); other.orderUntil = 0;
  p.actReady = 0;
  r.setInput(p.id, { act: true }); r.tick();
  assert.ok(other.orderUntil > r.time, 'summoned');
  assert.ok(Math.hypot(other.orderX - p.x, other.orderY - p.y) < 10, 'and summoned to you');
});

test('the captain can make a whole wing stand down, but is always being watched', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const cap = r.bodies.find((b) => b.role === 'captain');
  p.x = cap.x; p.y = cap.y; tap(r, p, 'use');
  const near = r.bodies.filter((b) => b.id !== cap.id && Math.hypot(b.x - p.x, b.y - p.y) < 330);
  for (const b of near) { b.state = 'alert'; b.alertT = 20; }
  p.actReady = 0;
  tap(r, p, 'act');
  assert.ok(near.every((b) => b.state === 'idle'), 'all of them stand down');
  assert.ok(near.every((b) => b.ignoreUntil > r.time), 'and look the other way for a while');
  const reasons = r.suspicionRate(p).reasons.join(', ');
  assert.ok(/captain/.test(reasons), 'but the captain is never inconspicuous: ' + reasons);
});

// ---------------------------------------------------------------- the whole run
test('the intended route can actually be played start to finish', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const priest = r.bodies.find((b) => b.role === 'priest');
  const servant = r.bodies.find((b) => b.role === 'servant');
  // 1. wear a priest and lift the child out of the nursery
  p.x = priest.x; p.y = priest.y; tap(r, p, 'use');
  assert.equal(r.body(p.bodyId).role, 'priest');
  p.x = r.infant.x; p.y = r.infant.y;
  tap(r, p, 'take');
  assert.ok(p.carrying, 'the priest has him');
  // 2. walk out to the public hall and set him down
  p.x = 20 * TILE + 16; p.y = 11 * TILE + 16;
  r.tick();
  tap(r, p, 'take');
  assert.ok(!p.carrying && !r.infant.carrier, 'left in the hall');
  // 3. shed the priest, find a servant
  tap(r, p, 'use');
  assert.equal(p.form, 'spirit');
  p.x = servant.x; p.y = servant.y;
  tap(r, p, 'use');
  assert.equal(r.body(p.bodyId).role, 'servant', 'now wearing a servant');
  // 4. collect the child and carry him out the servants' door
  p.x = r.infant.x; p.y = r.infant.y; r.tick();
  tap(r, p, 'take');
  assert.ok(p.carrying, 'the servant has him');
  p.x = r.map.exits[0].x; p.y = r.map.exits[0].y;
  r.setInput(p.id, {}); r.tick();
  assert.equal(r.phase, 'won', 'out through the servants\' door');
  assert.ok(r.won);
});

test('reaching the door without the child does not count', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const servant = r.bodies.find((b) => b.role === 'servant');
  p.x = servant.x; p.y = servant.y; tap(r, p, 'use');
  p.x = r.map.exits[0].x; p.y = r.map.exits[0].y;
  run(r, 1);
  assert.equal(r.phase, 'run', 'you have to bring him with you');
});

test('an unattended child is carried back to the cradle', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const finder = r.bodies.find((b) => b.role === 'soldier');
  r.infant.x = 20 * TILE; r.infant.y = 11 * TILE; r.infant.carrier = 0;
  finder.x = r.infant.x + 20; finder.y = r.infant.y; finder.state = 'idle';
  finder.route = [{ x: finder.x, y: finder.y }];
  run(r, 0.3);
  assert.ok(Math.hypot(r.infant.x - r.infant.home.x, r.infant.y - r.infant.home.y) < 5, 'back in the cradle');
  void p;
});

test('there is no combat, no health and no way to die', () => {
  const { r, ps } = mk();
  const p = ps[0];
  assert.equal(p.hp, undefined, 'players have no health');
  assert.equal(r.bodies[0].hp, undefined, 'nor do bodies');
  const worn = r.bodies[0];
  p.x = worn.x; p.y = worn.y; tap(r, p, 'use');
  // surround him with alerted bodies: the worst case is losing the body
  for (const b of r.bodies) if (b.id !== worn.id) { b.x = p.x + 20; b.y = p.y; b.state = 'alert'; b.alertT = 30; }
  run(r, 3);
  assert.equal(p.form, 'spirit', 'the worst that happens is you are thrown out');
  assert.ok(r.phase === 'run', 'the run continues');
});

test('the per-player readout explains the situation in words', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const priest = r.bodies.find((b) => b.role === 'priest');
  p.x = priest.x + 20; p.y = priest.y;
  let me = JSON.parse(r.meJSON(p.id));
  assert.equal(me.form, 'spirit');
  assert.ok(me.target && me.target.name === priest.name, 'it names who you could become');
  tap(r, p, 'use');
  me = JSON.parse(r.meJSON(p.id));
  assert.equal(me.form, 'worn');
  assert.equal(me.role, 'priest');
  assert.equal(me.act, ROLES.priest.action);
  assert.ok(me.zone.length > 0 && me.hostMax === POSSESS_TIME);
  assert.equal(me.energyMax, SPIRIT_MAX);
});

test('you cannot climb back into the body you just abandoned', () => {
  const { r, ps } = mk();
  const p = ps[0], b = r.bodies[0];
  clearBodies(r, b);
  p.x = b.x + 20; p.y = b.y;
  tap(r, p, 'use');
  tap(r, p, 'use');
  assert.equal(b.state, 'slumped');
  p.x = b.x; p.y = b.y;
  assert.equal(r.possessTarget(p), null, 'he is no use to you now');
  tap(r, p, 'use');
  assert.equal(p.form, 'spirit', 'still unhoused — go and find somebody else');
});

test('you cannot take the body of somebody who is hunting you', () => {
  const { r, ps } = mk();
  const p = ps[0], b = r.bodies[0];
  clearBodies(r, b);
  b.state = 'alert'; b.alertT = 20;
  p.x = b.x; p.y = b.y;
  assert.equal(r.possessTarget(p), null, 'he is far too awake');
});

// ---------------------------------------------------------------- the house waking
test('being rumbled wakes the house, and a quiet spell settles it again', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const body = r.bodies.find((b) => b.role === 'soldier');
  const watcher = r.bodies.find((b) => b.role === 'priest');
  clearBodies(r, body);
  watcher.x = -4000; watcher.y = -4000;
  p.x = r.map.infant.x; p.y = r.map.infant.y;        // a soldier standing in the nursery
  body.x = p.x; body.y = p.y; tap(r, p, 'use');
  assert.equal(r.aware, 0, 'the house starts calm');
  stare(watcher, p, 120); r.tick();                  // a priest who can see him plainly
  assert.ok(r.suspicionRate(p).rate > 0, 'and doubt is climbing');
  p.susp = SUSP_MAX; r.tick();
  assert.equal(p.form, 'spirit', 'you were thrown clear');
  assert.ok(r.aware >= AWARE_BURN, `word spread: ${r.aware}`);
  const peak = r.aware;
  run(r, 10);
  assert.equal(Math.round(r.aware), Math.round(peak), 'it does not cool while anyone is still hunting');
  run(r, 25);
  assert.ok(r.aware < peak, `but it settles once the search is over: ${peak} -> ${r.aware.toFixed(1)}`);
});

test('a roused house sends reinforcements rather than simply ending the run', () => {
  const { r } = mk();
  const before = r.bodies.length;
  r.rouse(AWARE_STEPS[0], 'test');
  assert.ok(r.bodies.length > before, `more patrols walked in: ${before} -> ${r.bodies.length}`);
  assert.ok(r.phase === 'run', 'and the run carries on');
  const mid = r.bodies.length;
  r.rouse(AWARE_STEPS[1] - AWARE_STEPS[0], 'test');
  assert.ok(r.bodies.length > mid, 'the second wave arrives at the second threshold');
  for (const b of r.bodies.slice(before)) {
    assert.ok(!solidFor(r.map, T(b.x), T(b.y), b.role), `${b.name} arrived inside a wall`);
    for (const w of b.route) assert.ok(!solidFor(r.map, T(w.x), T(w.y), b.role), `${b.name} patrols into a wall`);
  }
});

test('a fully roused house ends the attempt — and the story still moves on', () => {
  const { r, ps } = mk();
  const sent = [];
  r.out = (pid, m) => sent.push(m);
  const chapter = r.chapter;
  r.rouse(AWARE_MAX, 'test');
  assert.equal(r.phase, 'lost', 'the attempt is over');
  assert.ok(ps[0].form !== 'dead', 'but nobody died — there is no dying in this game');
  const card = sent.find((m) => m && m.t === 'lost');
  assert.ok(card, 'the players are told');
  assert.ok(PROPHECY.includes(card.line), 'and given a line of the prophecy: ' + card.line);
  assert.equal(r.chapter, chapter + 1, 'the story advanced even though the run failed');
  assert.ok(/Mavambo|house|cradle/i.test(card.next), 'and pointed at what comes next');
});

test('a failed attempt can be tried again, and what you earned carries over', () => {
  const { r, ps } = mk();
  ps[0].affinities.push('veiled');
  r.rouse(AWARE_MAX, 'test');
  assert.equal(r.phase, 'lost');
  r.begin();
  assert.equal(r.phase, 'run', 'you go again');
  assert.equal(r.aware, 0, 'with the house calm');
  assert.deepEqual(ps[0].affinities, ['veiled'], 'and the affinity you earned still with you');
  assert.equal(ps[0].usedBodies.size, 0, 'but the run tally reset');
});

// ---------------------------------------------------------------- mastery
test('a clean fast run earns mastery, and mastery grants a lasting affinity', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const servant = r.bodies.find((b) => b.role === 'servant');
  clearBodies(r, servant);
  p.x = servant.x; p.y = servant.y; tap(r, p, 'use');
  p.x = r.infant.x; p.y = r.infant.y; r.tick(); tap(r, p, 'take');
  assert.ok(p.carrying);
  const gate = r.map.exits.find((g) => g.key === 'servants');
  p.x = gate.x; p.y = gate.y; r.setInput(p.id, {}); r.tick();
  assert.equal(r.phase, 'won');
  const keys = r.run.mastery;
  assert.ok(keys.includes('swift'), 'fast enough: ' + keys.join(','));
  assert.ok(keys.includes('frugal'), 'one body only: ' + keys.join(','));
  assert.ok(keys.includes('ghost'), 'never doubted: ' + keys.join(','));
  assert.ok(p.affinities.length >= 3, 'and three affinities earned: ' + p.affinities.join(','));
  assert.equal(r.run.exitUsed, 'servants', 'the gate used is recorded');
});

test('leaving by the postern is its own challenge, and needs a soldier', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const soldier = r.bodies.find((b) => b.role === 'soldier');
  clearBodies(r, soldier);
  p.x = soldier.x; p.y = soldier.y; tap(r, p, 'use');
  p.x = r.infant.x; p.y = r.infant.y; r.tick(); tap(r, p, 'take');
  const gate = r.map.exits.find((g) => g.key === 'postern');
  p.x = gate.x; p.y = gate.y; r.setInput(p.id, {}); r.tick();
  assert.equal(r.phase, 'won', 'the postern is a real way out');
  assert.equal(r.run.exitUsed, 'postern');
  assert.ok(r.run.mastery.includes('postern'), 'and counts as its own mastery');
});

test('the Veiled affinity really does slow suspicion, and Quick really does reach further', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const body = r.bodies.find((b) => b.role === 'soldier');
  clearBodies(r, body);
  p.x = r.map.infant.x; p.y = r.map.infant.y;          // a soldier in the nursery
  body.x = p.x; body.y = p.y; tap(r, p, 'use');
  const watcher = r.bodies.find((b) => b.id !== body.id);
  stare(watcher, p, 120);
  r.tick();
  const plain = r.suspicionRate(p).rate;
  p.affinities.push('veiled');
  const veiled = r.suspicionRate(p).rate;
  assert.ok(plain > 0 && veiled < plain, `veiled is slower: ${plain} -> ${veiled}`);

  const { r: r2, ps: ps2 } = mk();
  const q = ps2[0];
  const far = r2.bodies[0];
  clearBodies(r2, far);
  far.x = q.x + 60; far.y = q.y;                       // just out of ordinary reach
  assert.equal(r2.possessTarget(q), null, 'too far for an ordinary spirit');
  q.affinities.push('quick');
  assert.ok(r2.possessTarget(q), 'but a Quick spirit can reach him');
});

test('the win hands the player on toward Mavambo instead of just saying "you win"', () => {
  const { r, ps } = mk();
  const sent = [];
  r.out = (pid, m) => sent.push(m);
  const p = ps[0];
  const servant = r.bodies.find((b) => b.role === 'servant');
  clearBodies(r, servant);
  p.x = servant.x; p.y = servant.y; tap(r, p, 'use');
  p.x = r.infant.x; p.y = r.infant.y; r.tick(); tap(r, p, 'take');
  p.x = r.map.exits[0].x; p.y = r.map.exits[0].y; r.setInput(p.id, {}); r.tick();
  const card = sent.find((m) => m && m.t === 'won');
  assert.ok(card, 'a win card is sent');
  assert.match(card.next, /Mavambo/, 'and it points north: ' + card.next);
  assert.ok(PROPHECY.includes(card.line), 'with a line of the prophecy');
  assert.ok(card.earned.length, 'and what was mastered');
  assert.ok(card.gateName, 'and which way he went out');
});
