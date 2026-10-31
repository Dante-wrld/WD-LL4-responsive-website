'use strict';
/* Act II with two real WebSocket clients. Act I's co-op was proven this way; Act
 * II's never was, and the campaign seats players into a brand new stage object
 * mid-session, which is exactly the sort of thing that works in a unit test and
 * falls over on a socket. */
const test = require('node:test');
const assert = require('node:assert');
const WS = require('ws');
const os = require('os');
const path = require('path');
const { start } = require('../server');
const { NIGHTS } = require('../road');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nth = 0;
const tmpRecords = () => ({ recordsFile: path.join(os.tmpdir(), `vessel-coop-${process.pid}-${nth++}.json`) });

function client(port) {
  const c = { id: 0, code: '', snaps: 0, me: null, shared: null, lobby: null, err: null,
    map2: null, road: null, jump: null, gift: null, down: null, done: null };
  c.ws = new WS('ws://127.0.0.1:' + port);
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') { c.id = m.id; c.code = m.code; c.foes = m.foes; }
    else if (m.t === 'lobby') c.lobby = m;
    else if (m.t === 'map') c.map = m;
    else if (m.t === 'map2') { c.map2 = m; c.snaps = 0; }
    else if (m.t === 'road') c.road = m;
    else if (m.t === 'story') { c.story = m; if (m.key === 'jump') c.jump = m; }
    else if (m.t === 'gift') c.gift = m;
    else if (m.t === 'down') c.down = m;
    else if (m.t === 'done') c.done = m;
    else if (m.t === 'err') c.err = m.msg;
    else if (m.t === 's2') { c.snaps++; c.shared = m; c.me = m.me; }
    else if (m.t === 's') { c.shared = m; c.me = m.me; }
  });
  c.send = (o) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); };
  c.open = new Promise((r) => c.ws.on('open', r));
  return c;
}
const until = async (fn, ms, what) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); }
  throw new Error('timed out waiting for ' + what);
};

/** Win the palace from the server side, so the test is about Act II. */
function winPalace(session, pid) {
  const p = session.players.get(pid);
  const serv = session.room.bodies.find((b) => b.role === 'servant');
  for (const b of session.room.bodies) if (b.role !== 'servant') { b.x = -4000; b.y = -4000; b.route = [{ x: -4000, y: -4000 }]; }
  p.x = serv.x; p.y = serv.y;
  session.setInput(pid, { use: true }); session.tick(); session.setInput(pid, {}); session.tick();
  p.x = session.room.infant.x; p.y = session.room.infant.y; session.tick();
  session.setInput(pid, { take: true }); session.tick(); session.setInput(pid, {}); session.tick();
  const g = session.room.map.exits[0];
  p.x = g.x; p.y = g.y; session.setInput(pid, {}); session.tick();
  return p;
}

test('two players cross from the palace into the shrine together', { timeout: 60000 }, async () => {
  const { server, rooms, stop } = await start(0, tmpRecords());
  const port = server.address().port;
  const a = client(port), b = client(port);
  try {
    await a.open; a.send({ t: 'join', name: 'Wrld' });
    await until(() => a.code, 3000, 'room code');
    await b.open; b.send({ t: 'join', name: 'Tendai', code: a.code });
    await until(() => b.id, 3000, 'second join');
    a.send({ t: 'start' });
    // the opening cinematic stands between START and the palace now
    a.send({ t: 'seen' });
    if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await until(() => a.map && b.map, 3000, 'the palace');
    const session = rooms.get(a.code);

    winPalace(session, a.id);
    await until(() => session.room.phase === 'won', 3000, 'the palace is won');
    // the beat, then the escape card, then the road — and BOTH of them get it
    for (let i = 0; i < 200; i++) session.tick();
    a.send({ t: 'seen' }); b.send({ t: 'seen' });
    await sleep(250);
    await until(() => a.road && b.road, 10000, 'the road reaches both players');
    assert.equal(a.road.night.id, NIGHTS[0].id);
    assert.equal(b.road.night.id, NIGHTS[0].id, 'the guest sees the same night');

    // only the host may answer, over the wire as well as in the rules
    b.send({ t: 'road', key: NIGHTS[0].options[1].key });
    await sleep(250);
    assert.equal(session.nightN, 0, 'the guest cannot choose');
    for (const n of NIGHTS) {
      a.send({ t: 'road', key: n.options[0].key });
      await sleep(180);
    }
    await until(() => a.jump && b.jump, 10000, 'the sixteen-year card reaches both');
    assert.ok(a.jump.wait, 'and it waits');
    assert.ok(a.jump.jump && a.jump.jump.costs.length, 'with the summary on it');
    assert.ok(!a.map2, 'Act II has not started underneath it');

    b.send({ t: 'go' }); await sleep(250);
    assert.equal(session.stage, 'road', 'the party is still waiting on the host');
    a.send({ t: 'go' });
    await until(() => a.map2 && b.map2, 10000, 'the chamber reaches both');
    assert.equal(a.map2.index, 0);
    assert.equal(a.map2.name, b.map2.name, 'the same chamber');
    await until(() => a.snaps > 3 && b.snaps > 3, 10000, 'both receiving Act II snapshots');

    // both are seated, both alive, each with a private readout of their own
    assert.equal(a.shared.p.length, 2, 'A sees both of them');
    assert.equal(b.shared.p.length, 2, 'B sees both of them');
    assert.ok(a.me && b.me, 'each has his own readout');
    assert.equal(a.me.act, 2); assert.equal(b.me.act, 2);
    assert.equal(a.me.form, 'self'); assert.equal(b.me.form, 'self');
    assert.ok(a.me.hp > 0 && b.me.hp > 0, 'and hearts to spend');
    assert.deepEqual([...session.players.keys()].sort(), [a.id, b.id].sort(), 'ids survived the crossing');
  } finally { a.ws.close(); b.ws.close(); await stop(); }
});

test('one player stepping out is visible to the other, body and all', { timeout: 60000 }, async () => {
  const { server, rooms, stop } = await start(0, tmpRecords());
  const port = server.address().port;
  const a = client(port), b = client(port);
  try {
    await a.open; a.send({ t: 'join', name: 'Host' });
    await until(() => a.code, 3000, 'code');
    await b.open; b.send({ t: 'join', name: 'Other', code: a.code });
    await until(() => b.id, 3000, 'join');
    a.send({ t: 'start' });
    // the opening cinematic stands between START and the palace now
    a.send({ t: 'seen' });
    if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await until(() => a.map, 3000, 'palace');
    const session = rooms.get(a.code);
    winPalace(session, a.id);
    for (let i = 0; i < 200; i++) session.tick();
    a.send({ t: 'seen' }); if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await sleep(250);
    await until(() => a.road, 10000, 'road');
    for (const n of NIGHTS) { a.send({ t: 'road', key: n.options[0].key }); await sleep(180); }
    await until(() => a.jump, 10000, 'jump');
    a.send({ t: 'go' }); if (typeof b !== 'undefined' && b) b.send({ t: 'go' });
    await until(() => a.map2 && b.map2 && b.snaps > 3, 12000, 'act two');

    const pb = session.players.get(b.id);
    b.send({ t: 'in', use: true }); await sleep(120); b.send({ t: 'in', use: false });
    await until(() => pb.form === 'spirit', 8000, 'B steps out');
    // A can see that B is unhoused, and where B's body is lying
    await until(() => {
      const seen = a.shared && a.shared.p.find((p) => p.i === b.id);
      return seen && seen.f === 1 && seen.v === 1;
    }, 8000, 'A sees B unhoused with a body left behind');
    const seen = a.shared.p.find((p) => p.i === b.id);
    assert.ok(Number.isFinite(seen.bx) && Number.isFinite(seen.by), 'and knows where that body is');
    assert.equal(a.me.form, 'self', 'while A is still in his own');
  } finally { a.ws.close(); b.ws.close(); await stop(); }
});

test('the host picks the gift and both players get it', { timeout: 60000 }, async () => {
  const { server, rooms, stop } = await start(0, tmpRecords());
  const port = server.address().port;
  const a = client(port), b = client(port);
  try {
    await a.open; a.send({ t: 'join', name: 'Host' });
    await until(() => a.code, 3000, 'code');
    await b.open; b.send({ t: 'join', name: 'Other', code: a.code });
    await until(() => b.id, 3000, 'join');
    a.send({ t: 'start' });
    // the opening cinematic stands between START and the palace now
    a.send({ t: 'seen' });
    if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await until(() => a.map, 3000, 'palace');
    const session = rooms.get(a.code);
    winPalace(session, a.id);
    for (let i = 0; i < 200; i++) session.tick();
    a.send({ t: 'seen' }); if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await sleep(250);
    await until(() => a.road, 10000, 'road');
    for (const n of NIGHTS) { a.send({ t: 'road', key: n.options[0].key }); await sleep(180); }
    await until(() => a.jump, 10000, 'jump');
    a.send({ t: 'go' }); if (typeof b !== 'undefined' && b) b.send({ t: 'go' });
    await until(() => a.map2 && b.map2, 12000, 'act two');

    for (const f of session.shrine.foes) f.dead = true;
    const d = session.shrine.map.door;
    const pa = session.players.get(a.id);
    await until(() => {
      pa.x = d.x; pa.y = d.y;                 // keep him on the threshold while we wait
      return a.gift && b.gift;
    }, 15000, 'the offer reaches both');
    assert.equal(a.gift.offer.length, 2);
    assert.deepEqual(a.gift.offer.map((o) => o.key), b.gift.offer.map((o) => o.key), 'the same two gifts');

    // pick something that leaves a mark on the sheet, not the heal
    const pick = (a.gift.offer.find((o) => o.key !== 'mend') || a.gift.offer[0]).key;
    const before = { a: session.players.get(a.id).gifts.length, b: session.players.get(b.id).gifts.length };
    b.send({ t: 'gift', key: pick }); await sleep(250);
    assert.equal(session.shrine.phase, 'gift', 'a guest cannot take the gift');
    a.send({ t: 'gift', key: pick });
    await until(() => session.shrine.chamberN === 1, 10000, 'on to the next chamber');
    const after = { a: session.players.get(a.id).gifts.length, b: session.players.get(b.id).gifts.length };
    assert.ok(after.a > before.a, 'the host has it');
    assert.ok(after.b > before.b, 'and so does everybody else — it is a party gift');
    await until(() => a.map2.index === 1 && b.map2.index === 1, 10000, 'both are in chamber two');
  } finally { a.ws.close(); b.ws.close(); await stop(); }
});

test('nonsense Act II input cannot corrupt a position or stop the shrine ticking', { timeout: 30000 }, async () => {
  const { server, rooms, stop } = await start(0, tmpRecords());
  const port = server.address().port;
  const a = client(port);
  try {
    await a.open; a.send({ t: 'join', name: 'Fuzz' });
    await until(() => a.code, 3000, 'code');
    a.send({ t: 'start' });
    // the opening cinematic stands between START and the palace now
    a.send({ t: 'seen' });
    if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await until(() => a.map, 3000, 'palace');
    const session = rooms.get(a.code);
    winPalace(session, a.id);
    for (let i = 0; i < 200; i++) session.tick();
    a.send({ t: 'seen' }); if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await sleep(250);
    await until(() => a.road, 10000, 'road');
    for (const n of NIGHTS) { a.send({ t: 'road', key: n.options[0].key }); await sleep(180); }
    await until(() => a.jump, 10000, 'jump');
    a.send({ t: 'go' }); if (typeof b !== 'undefined' && b) b.send({ t: 'go' });
    await until(() => a.map2 && a.snaps > 2, 12000, 'act two');
    const p = session.players.get(a.id);
    for (const bad of [
      { t: 'in', mx: 'NaN', my: Infinity, a: 'x', atk: 'yes', dodge: {} },
      { t: 'in', mx: 1e9, my: -1e9, a: NaN, use: [] },
      { t: 'in', mx: null, my: undefined, a: 1e308 * 10 },
      { t: 'in' }, { t: 'gift', key: null }, { t: 'road', key: 12 },
      { t: 'gift', key: '__proto__' }, { t: 'go' }, { t: 'skip', to: 'act2' },
    ]) a.send(bad);
    a.send('not json at all');
    await sleep(500);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'position is still a number');
    assert.ok(Number.isFinite(p.aim), 'so is the facing');
    assert.ok(Number.isFinite(p.hp), 'and so are his hearts');
    const before = a.snaps;
    await sleep(300);
    assert.ok(a.snaps > before, 'and the shrine is still ticking');
  } finally { a.ws.close(); await stop(); }
});
