'use strict';
/* Act II. The thing being tested hardest is the trade at the heart of it: you can
 * leave your body to gain an advantage, and your body is worse off for it. */
const test = require('node:test');
const assert = require('node:assert');
const { Shrine, GIFTS, FROM_AFFINITY, TICK, DT, VACANT_MULT, WORN_TIME, DODGE_TIME } = require('../act2');
const { chamber, CHAMBERS, FOES } = require('../shrine');
const { TILE, solidFor, walkDist, flood, tx, ty } = require('../grid');
const { NIGHTS, resolve, loadout } = require('../road');

const run = (r, secs) => { for (let i = 0; i < Math.round(secs * TICK); i++) r.tick(); };
function mk(n = 1, opts) {
  const r = new Shrine('S', () => {}); const ps = [];
  for (let i = 0; i < n; i++) ps.push(r.newPlayer('P' + (i + 1)));
  r.begin(opts || {});
  return { r, ps };
}
const tap = (r, p, key) => { r.setInput(p.id, { [key]: true, a: p.aim }); r.tick(); r.setInput(p.id, { a: p.aim }); r.tick(); };
/** Park every foe out of the way so one rule can be isolated. */
const clearFoes = (r, keep) => {
  for (const f of r.foes) if (!keep || f.id !== keep.id) { f.x = -4000; f.y = -4000; f.home = { x: -4000, y: -4000 }; }
};
/** Stand the player next to a foe, facing it. */
function faceOff(r, p, f, dist) {
  p.x = f.x - (dist || 30); p.y = f.y; p.aim = 0;
  r.setInput(p.id, { a: 0 });
}

// ---------------------------------------------------------------- the ground
test('every chamber is sound: nobody stands in a wall, every foe and the door are reachable', () => {
  for (let n = 0; n < CHAMBERS.length; n++) {
    const m = chamber(n);
    assert.ok(!solidFor(m, tx(m.start.x), ty(m.start.y), 'self'), `${m.name}: you start inside a wall`);
    const open = flood(m, tx(m.start.x), ty(m.start.y), 'self');
    for (const f of m.foes) {
      assert.ok(!solidFor(m, tx(f.x), ty(f.y), 'self'), `${m.name}: a ${f.kind} stands in a wall`);
      assert.ok(open.has(tx(f.x) + ',' + ty(f.y)), `${m.name}: a ${f.kind} is walled off from you`);
    }
    const d = walkDist(m, m.start, m.door, 'self');
    assert.ok(Number.isFinite(d), `${m.name}: the far door cannot be walked to`);
    const straight = Math.hypot(m.door.x - m.start.x, m.door.y - m.start.y) / TILE;
    assert.ok(d / straight < 1.6, `${m.name}: the way on is a maze (detour ${(d / straight).toFixed(2)})`);
  }
});

test('the chambers get harder, and never by making the room emptier of cover', () => {
  let lastFoes = 0, lastCover = 0;
  for (let n = 0; n < CHAMBERS.length; n++) {
    const m = chamber(n);
    const cover = m.rows.join('').split('T').length - 1;
    assert.ok(m.foes.length >= lastFoes, `${m.name} has fewer foes than the room before it`);
    if (m.foes.length > lastFoes) assert.ok(cover >= lastCover, `${m.name} adds foes but takes away cover`);
    lastFoes = m.foes.length; lastCover = cover;
  }
  assert.ok(CHAMBERS[CHAMBERS.length - 1].foes.some((f) => f[0] === 'captain'), 'the last room has the captain in it');
});

// ---------------------------------------------------------------- the spear
test('the spear is one button: a spearman takes two thrusts and no more', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const f = r.foes.find((x) => x.kind === 'spearman');
  clearFoes(r, f);
  faceOff(r, p, f, 30);
  assert.equal(f.hp, 2);
  tap(r, p, 'atk'); run(r, 0.5);
  assert.equal(f.hp, 1, 'one thrust, one wound');
  f.stunT = 0;
  faceOff(r, p, f, 30);
  tap(r, p, 'atk'); run(r, 0.5);
  assert.ok(f.dead, 'two thrusts and he is down');
  assert.equal(p.kills, 1);
});

test('a thrust cannot reach through a pillar or behind your back', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const f = r.foes[0];
  clearFoes(r, f);
  faceOff(r, p, f, 30);
  p.aim = Math.PI;                       // facing away
  r.setInput(p.id, { a: Math.PI });
  tap(r, p, 'atk'); run(r, 0.5);
  assert.equal(f.hp, f.hpMax, 'nothing behind you gets hit');

  const m = r.map;
  const pil = [];
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.rows[j][i] === 'T') pil.push([i, j]);
  const [pi, pj] = pil[0];
  p.x = pi * TILE + 16 - 30; p.y = pj * TILE + 16; p.aim = 0;
  f.x = pi * TILE + 16 + 30; f.y = p.y; f.stunT = 0;
  r.setInput(p.id, { a: 0 });
  tap(r, p, 'atk'); run(r, 0.5);
  assert.equal(f.hp, f.hpMax, 'and a pillar stops a thrust dead');
});

test('the dodge makes you untouchable for its frames, and then it does not', () => {
  const { r, ps } = mk();
  const p = ps[0];
  clearFoes(r);
  tap(r, p, 'dodge');
  assert.ok(p.dodgeT > 0, 'rolling');
  r.hurt(p, 1, 'test');
  assert.equal(p.hp, p.hpMax, 'nothing lands mid-roll');
  run(r, DODGE_TIME + 0.1);
  assert.ok(p.dodgeT <= 0, 'and the roll ends');
  p.hurtT = 0;
  r.hurt(p, 1, 'test');
  assert.equal(p.hp, p.hpMax - 1, 'after which you are flesh again');
});

test('a hit buys you a moment of grace, so you cannot be chain-killed', () => {
  const { r, ps } = mk();
  const p = ps[0];
  clearFoes(r);
  r.hurt(p, 1, 'test');
  const after = p.hp;
  for (let i = 0; i < 5; i++) r.hurt(p, 1, 'test');
  assert.equal(p.hp, after, 'the follow-ups land on nothing');
});

// ---------------------------------------------------------------- stepping out
test('stepping out leaves your body standing where you left it', () => {
  const { r, ps } = mk();
  const p = ps[0];
  clearFoes(r);
  const bx = p.x, by = p.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'spirit');
  r.setInput(p.id, { mx: 1, my: 0, a: 0 });
  run(r, 1);
  assert.ok(Math.hypot(p.x - bx, p.y - by) > 60, 'the spirit has moved off');
  const b = r.bodyOf(p);
  assert.equal(Math.round(b.x), Math.round(bx), 'the body did not come with you');
  assert.ok(b.vacant, 'and it is flagged as undefended');
});

test('an unguarded body takes double, which is the whole price of leaving it', () => {
  const { r, ps } = mk(2);
  const [a, b] = ps;
  clearFoes(r);
  r.hurt(a, 1, 'test');
  assert.equal(a.hpMax - a.hp, 1, 'in your own body, one is one');
  tap(r, b, 'use');
  assert.equal(b.form, 'spirit');
  r.hurt(b, 1, 'test');
  assert.equal(b.hpMax - b.hp, VACANT_MULT, `out of it, one is ${VACANT_MULT}`);
});

test('a spirit has no hands: it cannot thrust', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const f = r.foes[0];
  clearFoes(r, f);
  tap(r, p, 'use');
  assert.equal(p.form, 'spirit');
  p.x = f.x - 20; p.y = f.y; p.aim = 0;
  r.setInput(p.id, { a: 0 });
  tap(r, p, 'atk'); run(r, 0.5);
  assert.equal(f.hp, f.hpMax, 'nothing happens');
  assert.equal(p.swingPhase, '', 'there was never a swing to begin with');
});

test('you can walk back into your own body, but only if you are beside it', () => {
  const { r, ps } = mk();
  const p = ps[0];
  clearFoes(r);
  const bx = p.x, by = p.y;
  tap(r, p, 'use');
  r.setInput(p.id, { mx: 1, a: 0 }); run(r, 1.2); r.setInput(p.id, { a: 0 });
  tap(r, p, 'use');
  assert.equal(p.form, 'spirit', 'too far away to get back in');
  p.x = bx; p.y = by;
  tap(r, p, 'use');
  assert.equal(p.form, 'self', 'beside it, you can');
  assert.equal(Math.round(p.x), Math.round(bx));
});

test('the tether drags you back rather than stranding you', () => {
  const { r, ps } = mk();
  const p = ps[0];
  clearFoes(r);
  const bx = p.x;
  tap(r, p, 'use');
  r.setInput(p.id, { mx: 1, a: 0 });
  run(r, p.outMax - 1);
  assert.equal(p.form, 'spirit', 'still out, with the tether running down');
  r.setInput(p.id, { a: 0 });
  run(r, 1.2);
  assert.equal(p.form, 'self', 'you end up back inside it');
  assert.ok(Math.abs(p.x - bx) < 4, 'wherever you left it');
});

// ---------------------------------------------------------------- wearing theirs
test('wearing one of the king’s men makes the others lose you', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0], other = r.foes[1];
  // put a watcher right on top of the player's body so it would certainly see it
  other.x = p.x + 60; other.y = p.y; other.aim = Math.PI; other.state = 'hunt';
  r.tick();
  assert.ok(r.pickTarget(other), 'it has something to kill');
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn', 'wearing one of theirs');
  // they have lost HIM — but the body he left behind is still lying there, and
  // that is now the only thing in the room they have any business with
  const t2 = r.pickTarget(other);
  assert.ok(t2 && t2.mark.kind === 'vacant', 'all they have left to find is the empty body');
});

test('but strike from inside one of theirs and every one of them turns at once', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0], victim = r.foes[1];
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  assert.ok(!r.betrayed);
  // stand him right beside you, on open ground, and stop him wandering off home
  // mid-thrust. (To his right is a pillar, and a pillar stops a thrust — which
  // is the point of the pillars.)
  victim.x = p.x - 30; victim.y = p.y;
  victim.home = { x: victim.x, y: victim.y };
  p.aim = Math.PI;
  r.setInput(p.id, { a: Math.PI });
  run(r, 0.8);                           // settle into the body first
  tap(r, p, 'atk'); run(r, 0.5);
  assert.ok(victim.hp < victim.hpMax, 'the thrust lands');
  assert.ok(r.betrayed, 'and the disguise is spent');
  assert.ok(r.hostiles().every((f) => f.state !== 'watch'), 'not one of them is still at his post');
  assert.ok(r.pickTarget(victim), 'including after your real body again');
});

test('a borrowed body throws you out on its own clock', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0];
  clearFoes(r, mine);
  // keep him close to your own body, so it is his clock that ends this and not
  // the leash
  mine.x = p.x + 110; mine.y = p.y; mine.home = { x: mine.x, y: mine.y };
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y; mine.state = 'watch'; mine.tellT = 0;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  run(r, WORN_TIME + 0.2);
  assert.notEqual(p.form, 'worn', 'he has had enough of you');
  assert.ok(!mine.wornBy, 'and he is his own man again');
  assert.notEqual(mine.state, 'watch', 'and he is cross about it');
});

test('killing the body you are wearing drops you out of it rather than wedging the game', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0];
  clearFoes(r, mine);
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  mine.dead = true;
  r.tick();
  assert.equal(p.form, 'spirit');
  assert.equal(p.foeId, 0);
});

test('you cannot take a man who is already mid-swing at you, unless Act I made you Bold', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const f = r.foes[0];
  clearFoes(r, f);
  tap(r, p, 'use');
  p.x = f.x; p.y = f.y;
  f.state = 'strike'; f.tellT = 0.4;
  assert.equal(r.takeTarget(p), null, 'not while he is swinging');
  p.affinities.push('bold');
  assert.ok(r.takeTarget(p), 'Bold says otherwise');
});

// ---------------------------------------------------------------- dying
test('your body falling while you are elsewhere ends the attempt', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0];
  clearFoes(r, mine);
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn', 'you are off wearing somebody else');
  for (let i = 0; i < 8; i++) { p.hurtT = 0; r.hurt(p, 1, 'test'); }
  assert.ok(p.dead, 'the body you left behind is dead');
  assert.equal(r.phase, 'down', 'and that is the attempt');
});

test('falling costs the chamber, not the campaign', () => {
  const { r, ps } = mk();
  const sent = [];
  r.out = (pid, m) => sent.push(m);
  const p = ps[0];
  p.gifts.push('reach'); const reachWas = p.reach;
  for (let i = 0; i < 9; i++) { p.hurtT = 0; r.hurt(p, 1, 'test'); }
  assert.equal(r.phase, 'down');
  const card = sent.find((m) => m && m.t === 'down');
  assert.ok(card, 'you are told');
  assert.match(card.next, /again|back/i, 'and told it is not over: ' + card.next);
  assert.equal(r.deaths, 1);
  r.enterChamber(0);
  assert.equal(r.phase, 'run', 'you go again');
  assert.equal(p.reach, reachWas, 'still holding what you had earned');
});

test('the debt owed on the road refuses death exactly once', () => {
  const { r, ps } = mk(1, { boons: ['debt'] });
  const p = ps[0];
  assert.equal(p.refusals, 1);
  for (let i = 0; i < p.hpMax; i++) { p.hurtT = 0; r.hurt(p, 1, 'test'); }
  assert.ok(!p.dead, 'the first death is refused');
  assert.equal(p.hp, 1, 'and leaves you on one heart');
  assert.equal(p.refusals, 0, 'the debt is spent');
  p.hurtT = 0; r.hurt(p, 1, 'test');
  assert.ok(p.dead, 'the second is not');
});

// ---------------------------------------------------------------- progress
test('the far door stays shut until the room is actually clear', () => {
  const { r, ps } = mk();
  const p = ps[0];
  p.x = r.map.door.x; p.y = r.map.door.y;
  run(r, 2);
  assert.equal(r.phase, 'run', 'standing in the doorway does nothing while they live');
  assert.ok(r.hostiles().length > 0);
  for (const f of r.foes) f.dead = true;
  run(r, 2);
  assert.equal(r.phase, 'gift', 'clear it and the way on opens');
  assert.equal(r.offer.length, 2, 'with two gifts to choose between');
});

test('gifts are never the same twice, and the choice actually changes a number', () => {
  const { r, ps } = mk();
  const p = ps[0];
  for (const f of r.foes) f.dead = true;
  p.x = r.map.door.x; p.y = r.map.door.y;
  run(r, 2);
  assert.equal(r.phase, 'gift');
  assert.notEqual(r.offer[0].key, r.offer[1].key, 'two different gifts');
  const before = { hp: p.hpMax, reach: p.reach, out: p.outMax, dmg: p.damage, cd: p.dodgeCd, vac: p.vacant };
  const key = r.offer.find((o) => o.key !== 'mend') ? r.offer.find((o) => o.key !== 'mend').key : r.offer[0].key;
  r.takeGift(p.id, key);
  const after = { hp: p.hpMax, reach: p.reach, out: p.outMax, dmg: p.damage, cd: p.dodgeCd, vac: p.vacant };
  assert.notDeepEqual(after, before, `taking ${key} changed nothing`);
  assert.equal(r.chamberN, 1, 'and you are in the next chamber');
});

test('clearing all four chambers finishes the act and points at Act III', () => {
  const { r, ps } = mk();
  const sent = [];
  r.out = (pid, m) => sent.push(m);
  const p = ps[0];
  for (let n = 0; n < CHAMBERS.length; n++) {
    assert.equal(r.chamberN, n, 'in chamber ' + n);
    for (const f of r.foes) f.dead = true;
    p.x = r.map.door.x; p.y = r.map.door.y;
    run(r, 2);
    assert.equal(r.phase, 'gift', 'gift offered after chamber ' + n);
    r.takeGift(p.id, r.offer[0].key);
  }
  assert.equal(r.phase, 'done');
  const card = sent.find((m) => m && m.t === 'done');
  assert.ok(card, 'an ending card');
  assert.match(card.next, /ACT III/, 'that says plainly where the road stops: ' + card.next);
  assert.ok(card.secs >= 0 && Number.isFinite(card.secs));
});

test('what Act I earned is what Act II opens with', () => {
  const { r, ps } = mk(1, { affinities: ['veiled', 'quick', 'bold'] });
  const p = ps[0];
  for (const a of ['veiled', 'quick', 'bold']) {
    assert.ok(p.carried.includes(FROM_AFFINITY[a]), `${a} came through as ${FROM_AFFINITY[a]}`);
  }
  const { r: r2, ps: ps2 } = mk(1, {});
  assert.equal(ps2[0].carried.length, 0, 'and a player who earned nothing starts with nothing');
  assert.ok(p.takeBonus > ps2[0].takeBonus || p.vacant < ps2[0].vacant, 'so Act I skill is worth something here');
});

// ---------------------------------------------------------------- the road
test('every night on the road costs something — there is no free choice in it', () => {
  for (const n of NIGHTS) {
    assert.equal(n.options.length, 2, `${n.id} offers exactly two ways`);
    for (const o of n.options) {
      assert.ok(o.lose && o.lose.length > 6, `${n.id}/${o.key} has no stated price`);
    }
  }
});

test('the road resolves to a playable character even if nobody chooses', () => {
  const none = resolve(null);
  assert.equal(none.picked.length, NIGHTS.length, 'every night resolves');
  assert.equal(none.costs.length, NIGHTS.length, 'and every one of them cost something');
  const l = loadout(none.boons);
  assert.ok(l.maxHp >= 4 && l.damage > 0, 'and you arrive able to fight');
});

test('the boons change the numbers Act II actually reads', () => {
  const plain = loadout([]);
  assert.ok(loadout(['spear']).damage > plain.damage, 'the spear hits harder');
  assert.ok(loadout(['robe']).hostMult > plain.hostMult, 'the robe holds the spirit longer');
  assert.ok(loadout(['name']).maxHp > plain.maxHp, 'the name is another heart');
  assert.ok(loadout(['silence']).noticeMult < plain.noticeMult, 'the silence is seen later');
  assert.equal(loadout(['debt']).deathsRefused, 1, 'the debt is one refused death');
  assert.ok(loadout(['name']).exitCost > plain.exitCost, 'and staying in the boy makes leaving cost more');
});

// ---------------------------------------------------------------- no going back
test('none of the systems that made the old build tedious are here', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'act2.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // code only, not prose
  for (const gone of ['posture', 'stagger', 'combo', 'riposte', 'stamina', 'parry', 'shield']) {
    assert.ok(!new RegExp('\\b' + gone, 'i').test(src),
      `"${gone}" has crept back into the combat`);
  }
  const { r, ps } = mk();
  const keys = Object.keys(ps[0].inp);
  assert.ok(!keys.some((k) => /block|parry|heavy|combo/.test(k)), 'and so has an extra button: ' + keys.join(','));
});

test('the readout says what is happening in words, not just numbers', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const me = JSON.parse(r.meJSON(p.id));
  assert.equal(me.form, 'self');
  assert.ok(me.left > 0, 'it tells you how many are left');
  assert.ok(me.chamber >= 1, 'and which room you are in');
  tap(r, p, 'use');
  const out = JSON.parse(r.meJSON(p.id));
  assert.equal(out.form, 'spirit');
  assert.equal(out.vacant, 1, 'and that your body is exposed');
  assert.equal(out.vacantMult, VACANT_MULT, 'and by exactly how much');
});

// ---------------------------------------------------------------- found in testing
/* Everything below is here because an automated probe caught it in play, not
 * because it seemed like a good idea in the abstract. */

test('every foe can actually walk to you, and the way out is never blocked', () => {
  const { flowField, flowStep } = require('../grid');
  for (let n = 0; n < CHAMBERS.length; n++) {
    const m = chamber(n);
    const field = flowField(m, m.start, 'self');
    for (const f of m.foes) {
      assert.ok(flowStep(field, f.x, f.y) !== null || Math.hypot(f.x - m.start.x, f.y - m.start.y) < 40,
        `${m.name}: a ${f.kind} cannot find a path to you`);
    }
    assert.ok(!m.rows[9].includes('T'),
      `${m.name}: something sits on the line between the way in and the way out`);
  }
});

test('holding the attack button is not a strategy: a thrust into air leaves you open', () => {
  const { r, ps } = mk();
  const p = ps[0];
  clearFoes(r);
  r.setInput(p.id, { atk: true, a: 0 }); r.tick();
  assert.equal(p.swingPhase, 'tell');
  run(r, 0.25);
  assert.equal(p.swingPhase, 'rest', 'the thrust found nothing and he is recovering');
  const whiffLeft = p.recover;
  // and you cannot roll out of that recovery
  r.setInput(p.id, { dodge: true, a: 0 }); r.tick();
  assert.ok(p.dodgeT <= 0, 'no rolling out of your own thrust');
  assert.ok(whiffLeft > 0.3, `a missed thrust is a real commitment (${whiffLeft.toFixed(2)}s)`);
});

test('a thrust that connects recovers faster than one that misses', () => {
  const a = mk(); const f = a.r.foes[0];
  clearFoes(a.r, f);
  faceOff(a.r, a.ps[0], f, 30);
  a.r.setInput(a.ps[0].id, { atk: true, a: 0 }); a.r.tick();
  run(a.r, 0.2);
  const hitRecovery = a.ps[0].recover;

  const b = mk();
  clearFoes(b.r);
  b.r.setInput(b.ps[0].id, { atk: true, a: 0 }); b.r.tick();
  run(b.r, 0.2);
  const missRecovery = b.ps[0].recover;
  assert.ok(missRecovery > hitRecovery, `missing costs more (${missRecovery.toFixed(2)}s vs ${hitRecovery.toFixed(2)}s)`);
});

test('a chamber is one fight: hurt one of them and the whole room comes', () => {
  const { r, ps } = mk(1);
  const p = ps[0];
  r.enterChamber(2);
  const far = r.foes[r.foes.length - 1];
  assert.equal(far.state, 'watch', 'they start at their posts');
  const near = r.foes[0];
  faceOff(r, p, near, 30);
  tap(r, p, 'atk'); run(r, 0.5);
  assert.ok(r.roused, 'the room is roused');
  assert.notEqual(far.state, 'watch', 'and the man across the room is coming');
});

test('a player in a far corner cannot stall the room out', () => {
  const { r, ps } = mk();
  const p = ps[0];
  r.enterChamber(2);
  p.x = 2 * TILE + 16; p.y = 2 * TILE + 16;
  r.rouseRoom(p.x, p.y);
  const before = r.foes.map((f) => Math.hypot(f.x - p.x, f.y - p.y));
  for (let i = 0; i < TICK * 8; i++) { p.hp = p.hpMax; p.dead = false; r.setInput(p.id, { a: 0 }); r.tick(); }
  const after = r.foes.map((f) => Math.hypot(f.x - p.x, f.y - p.y));
  for (let i = 0; i < before.length; i++) {
    assert.ok(after[i] < before[i] - 20 || after[i] < 200,
      `${r.foes[i].kind} never came (${Math.round(before[i])} -> ${Math.round(after[i])})`);
  }
});

test('once you strike from inside one of theirs, their blows wound that body, not you', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0];
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  r.betrayed = true;
  p.struckWhileWorn = true; // The current borrowed identity was actually exposed.
  const mark = r.marks().find((m) => m.kind === 'worn');
  assert.ok(mark, 'the body you are wearing is a thing they can hit');
  const hpWas = p.hp, bodyWas = mine.hp;
  r.strikeMark(mark, 1, 'test');
  assert.equal(p.hp, hpWas, 'you take nothing');
  assert.equal(mine.hp, bodyWas - 1, 'the borrowed body takes it');
});

test('and when that body fails you are spat out into the open', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0];
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  r.betrayed = true;
  p.struckWhileWorn = true; // The current borrowed identity was actually exposed.
  const mark = r.marks().find((m) => m.kind === 'worn');
  r.strikeMark(mark, 99, 'test');
  assert.ok(mine.dead, 'the body is finished');
  assert.equal(p.form, 'spirit', 'and you are loose, with no body of your own to hand');
});

test('once they know a spirit is loose, a hunting man will not stand still to be worn', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const f = r.foes[0];
  clearFoes(r, f);
  tap(r, p, 'use');
  p.x = f.x; p.y = f.y;
  f.state = 'hunt';
  assert.ok(r.takeTarget(p), 'before they know, a hunting man can still be taken');
  r.betrayed = true;
  assert.equal(r.takeTarget(p), null, 'after they know, he cannot');
  f.state = 'watch';
  assert.ok(r.takeTarget(p), 'break away and let him lose you, and he can again');
});

test('an empty body draws them more than a full one', () => {
  const { r, ps } = mk(2);
  const [a, b] = ps;
  clearFoes(r);
  const f = r.foes[0];
  f.x = 400; f.y = 300; f.dead = false; f.home = { x: 400, y: 300 };
  tap(r, b, 'use');                       // b steps out, leaving a body
  b.bodyX = 400; b.bodyY = 420;           // the empty body, further away
  a.x = 400; a.y = 400;                   // a is nearer, in his own flesh
  const t = r.pickTarget(f);
  assert.equal(t.mark.kind, 'vacant', 'they go for the undefended one');
});

test('clearing a room while wearing one of theirs does not lock you in it', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0];
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  for (const f of r.foes) if (f.id !== mine.id) f.dead = true;
  mine.dead = true; mine.wornBy = 0; p.form = 'spirit'; p.foeId = 0;
  // walk the spirit to the door with the body left behind across the room
  p.x = r.map.door.x; p.y = r.map.door.y;
  run(r, 2);
  assert.equal(r.phase, 'gift', 'the door reads where you actually are');
});

test('nobody carries a stolen body into the next chamber', () => {
  const { r, ps } = mk();
  const p = ps[0];
  const mine = r.foes[0];
  tap(r, p, 'use');
  p.x = mine.x; p.y = mine.y;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  r.gather();
  assert.equal(p.form, 'self', 'he comes back to himself at the threshold');
  assert.ok(!mine.wornBy);
});

test('a bowman with somebody in his face uses the shaft of it instead', () => {
  const { r, ps } = mk();
  const p = ps[0];
  r.enterChamber(1);
  const h = r.foes.find((f) => f.kind === 'hunter');
  clearFoes(r, h);
  h.state = 'hunt';
  p.x = h.x - 50; p.y = h.y;
  r.rouseRoom(p.x, p.y);
  r.setInput(p.id, { a: 0 });
  run(r, 0.6);
  assert.ok(h.melee || h.state === 'strike' || h.state === 'rest',
    `he should be swinging, not backing off (state ${h.state})`);
  assert.equal(r.shots.length, 0, 'and not loosing arrows point blank');
});

test('the leash keeps possession local: a man near your body is fine, one across the room is not', () => {
  const { Shrine: S, LEASH, LEASH_GRACE } = require('../act2');
  const { r, ps } = mk();
  const p = ps[0];
  const f = r.foes[0];
  clearFoes(r, f);
  // a man close to your body, not presently swinging at it
  f.x = p.x + 110; f.y = p.y; f.home = { x: f.x, y: f.y };
  tap(r, p, 'use');
  p.x = f.x; p.y = f.y; f.state = 'watch'; f.tellT = 0;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn', 'wearing the man near you');
  run(r, LEASH_GRACE + 1);
  assert.equal(p.form, 'worn', 'and staying there costs nothing');
  assert.equal(p.strain, 0);
  // now drag him to the far side of the room
  p.x = p.bodyX + LEASH + 60;
  run(r, LEASH_GRACE + 0.5);
  assert.equal(p.form, 'spirit', 'dragged too far from his own flesh and torn out');
});

test('you cannot thrust the instant you are inside a man', () => {
  const { TAKE_SETTLE } = require('../act2');
  const { r, ps } = mk();
  const p = ps[0];
  const f = r.foes[0], other = r.foes[1];
  clearFoes(r, f);
  // both of them near your own body, so the leash plays no part in this one
  f.x = p.x + 110; f.y = p.y; f.home = { x: f.x, y: f.y };
  other.dead = false; other.x = f.x - 40; other.y = f.y; other.home = { x: other.x, y: other.y };
  tap(r, p, 'use');
  p.x = f.x; p.y = f.y; f.state = 'watch'; f.tellT = 0;
  tap(r, p, 'use');
  assert.equal(p.form, 'worn');
  assert.equal(p.swingPhase, 'rest', 'he is still settling into the body');
  p.aim = Math.PI; r.setInput(p.id, { atk: true, a: Math.PI }); r.tick();
  assert.notEqual(p.swingPhase, 'swing', 'and cannot thrust yet');
  // and holding the button through the settle does NOT buy you a thrust the
  // moment it ends: a thrust is edge-triggered, so mashing is not a plan
  run(r, TAKE_SETTLE + 0.2);
  assert.ok(other.hp === other.hpMax, 'holding it down bought nothing');
  r.setInput(p.id, { a: Math.PI });       // let go
  other.x = p.x - 40; other.y = p.y;      // he has had time to move; put him back
  tap(r, p, 'atk'); run(r, 0.4);
  assert.ok(other.hp < other.hpMax, 'press it again and, settled, he can');
});

test('what Act I earned is extra, and never costs you a chamber gift', () => {
  const { CARRIED } = require('../act2');
  const rich = mk(1, { affinities: ['veiled', 'quick', 'bold'] });
  const poor = mk(1, {});
  assert.equal(rich.ps[0].carried.length, 3, 'three things carried in');
  assert.equal(rich.ps[0].gifts.length, 0, 'and not one of them taken out of the gift pool');
  // so both players are offered from the same full pool
  for (const g of [rich, poor]) {
    for (const f of g.r.foes) f.dead = true;
    g.ps[0].x = g.r.map.door.x; g.ps[0].y = g.r.map.door.y;
    run(g.r, 2);
    assert.equal(g.r.phase, 'gift');
    assert.equal(g.r.offer.length, 2, 'two gifts either way');
  }
  assert.ok(rich.ps[0].takeBonus > poor.ps[0].takeBonus, 'Quick really does reach further');
  assert.ok(rich.ps[0].vacant < poor.ps[0].vacant, 'Veiled really does protect the empty body');
  for (const k of Object.keys(CARRIED)) assert.ok(CARRIED[k].name && CARRIED[k].blurb, k + ' explains itself');
});

test('all four gifts of a run are different, so the act never runs dry', () => {
  const { r, ps } = mk(1, { affinities: ['veiled', 'quick', 'bold'] });
  const p = ps[0];
  const taken = [];
  for (let n = 0; n < CHAMBERS.length; n++) {
    for (const f of r.foes) f.dead = true;
    p.x = r.map.door.x; p.y = r.map.door.y;
    run(r, 2);
    assert.equal(r.phase, 'gift', 'offered a gift after chamber ' + (n + 1));
    const pick = r.offer.find((o) => o.key !== 'mend') || r.offer[0];
    taken.push(pick.key);
    r.takeGift(p.id, pick.key);
  }
  const real = taken.filter((k) => k !== 'mend');
  assert.equal(new Set(real).size, real.length, 'no gift was offered twice: ' + taken.join(','));
});

test('a heal is not offered to a party that has taken no damage', () => {
  const { r, ps } = mk();
  const p = ps[0];
  assert.equal(p.hp, p.hpMax, 'untouched');
  for (const f of r.foes) f.dead = true;
  p.x = r.map.door.x; p.y = r.map.door.y;
  run(r, 2);
  assert.equal(r.phase, 'gift');
  assert.ok(!r.offer.some((o) => o.key === 'mend'), 'no dead options: ' + r.offer.map((o) => o.key).join(','));
});

test('but it is offered the moment somebody is hurt', () => {
  const { r, ps } = mk();
  const p = ps[0];
  // take every other gift out of the pool so only the heal can be left
  for (const k of Object.keys(GIFTS)) if (k !== 'mend' && !p.gifts.includes(k)) p.gifts.push(k);
  p.hp = p.hpMax - 1;
  for (const f of r.foes) f.dead = true;
  p.x = r.map.door.x; p.y = r.map.door.y;
  run(r, 2);
  assert.equal(r.phase, 'gift');
  assert.ok(r.offer.some((o) => o.key === 'mend'), 'the heal is there when it is worth something');
});
