'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, TILE, WALK, NOTICE, NOTICE_CONE, ALERT_NOTICE, ALERT_NOTICE_CONE, NOTICE_CLOSE, PATROL_PACE, ALERT_PACE } = require('../vessel');
const { FOES } = require('../shrine');
const { canSee } = require('../grid');
const px = (t) => (t + 0.5) * TILE;
function scenario() {
  const r = new Room('SAFE', () => {});
  const p = r.newPlayer('Chaminuka'); r.start(p.id);
  const b = r.bodies[0];
  for (const other of r.bodies) if (other !== b) other.state = 'worn';
  b.x = px(17); b.y = px(10); b.aim = 0;
  b.route = [{ x: px(24), y: px(10) }]; b.wp = 0;
  b.state = 'idle'; b.ignoreUntil = 0; b.orderUntil = 0;
  p.x = px(5); p.y = px(6);
  return { r, b };
}
test('palace watch cones are shorter, narrower, but detect touching distance', () => {
  const { r, b } = scenario();
  assert.equal(NOTICE, 120); assert.equal(NOTICE_CONE, 0.30); assert.equal(NOTICE_CLOSE, 30);
  assert.equal(ALERT_NOTICE, 150); assert.equal(ALERT_NOTICE_CONE, 0.48);
  const sees = (x, y) => r.watchers(x, y).some((w) => w.id === b.id);
  assert.ok(sees(b.x + 100, b.y));
  assert.ok(!sees(b.x, b.y + 100));
  assert.ok(!sees(b.x + NOTICE + 5, b.y));
  assert.ok(sees(b.x, b.y + 24), 'very close detection remains');
  let snapshot = JSON.parse(r.sharedJSON());
  let row = snapshot.b.find(v => v[0] === b.id);
  assert.equal(row[8], NOTICE, 'ordinary cone reach matches server detection');
  assert.equal(row[9], NOTICE_CONE, 'ordinary cone width matches server detection');

  b.state = 'alert'; b.alertT = 15; b.aim = 0;
  assert.ok(sees(b.x + 140, b.y), 'alerted guard notices directly ahead');
  assert.ok(!sees(b.x + 151, b.y), 'alerted guard does not see beyond 150px');
  assert.ok(!sees(b.x - 110, b.y), 'alerted guard cannot see behind at a distance');
  assert.ok(sees(b.x - 20, b.y), 'close contact remains detectable while alerted');
  snapshot = JSON.parse(r.sharedJSON());
  row = snapshot.b.find(v => v[0] === b.id);
  assert.equal(row[8], ALERT_NOTICE, 'alert cone reach matches server detection');
  assert.equal(row[9], ALERT_NOTICE_CONE, 'alert cone width matches server detection');
});
test('palace guards patrol more slowly than they chase when alerted', () => {
  const { r, b } = scenario();
  assert.equal(PATROL_PACE, 0.60); assert.equal(ALERT_PACE, 0.84);
  let before = b.x; r.tick(); const patrol = b.x - before;
  assert.ok(patrol > 0 && Math.abs(patrol - WALK * PATROL_PACE / 30) < 0.05);
  b.state = 'alert'; b.alertT = 15; b.suspX = px(24); b.suspY = px(10);
  before = b.x; r.tick(); const pursuit = b.x - before;
  assert.ok(pursuit > patrol && Math.abs(pursuit - WALK * ALERT_PACE / 30) < 0.05);
});
test('Act II guards have reduced speed and detection without weakened combat tells', () => {
  const expected = {
    spearman: { speed: 112, notice: 205, cone: .62, tell: .42 },
    hunter: { speed: 100, notice: 275, cone: .44, tell: .7 },
    captain: { speed: 102, notice: 245, cone: .72, tell: .95 }
  };
  for (const [name, settings] of Object.entries(expected))
    for (const [key, val] of Object.entries(settings))
      assert.equal(FOES[name][key], val, name + ' ' + key);
  const m = { w: 20, h: 20, rows: Array(20).fill('.'.repeat(20)), doors: [], zones: [] };
  const watcher = { x: 200, y: 200, aim: 0 }, spearman = FOES.spearman;
  assert.ok(canSee(m, watcher, 300, 200, spearman.notice, spearman.cone));
  assert.ok(!canSee(m, watcher, 200, 300, spearman.notice, spearman.cone));
});
