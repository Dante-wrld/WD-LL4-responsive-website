'use strict';
/* Two real WebSocket clients against the real server: joining, seeing each
 * other, the handover that co-op is built around, and leaving mid-run. */
const test = require('node:test');
const assert = require('node:assert');
const WS = require('ws');
const { start } = require('../server');
const os = require('os');
const pathmod = require('path');
/** A throwaway records file per run, so tests never touch anybody's real board. */
let nth = 0;
const tmpRecords = () => ({ recordsFile: pathmod.join(os.tmpdir(), `vessel-test-${process.pid}-${nth++}.json`) });
const { TILE } = require('../vessel');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A thin client that records what the server tells it. */
function client(port) {
  const c = { id: 0, code: '', snaps: 0, me: null, shared: null, lobby: null, won: null, err: null, roles: null };
  c.ws = new WS('ws://127.0.0.1:' + port);
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') { c.id = m.id; c.code = m.code; c.roles = m.roles; }
    else if (m.t === 'lobby') c.lobby = m;
    else if (m.t === 'map') c.map = m;
    else if (m.t === 'won') c.won = m;
    else if (m.t === 'err') c.err = m.msg;
    else if (m.t === 's') { c.snaps++; c.shared = m; c.me = m.me; }
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

test('two spirits share one palace and the handover works end to end', { timeout: 30000 }, async () => {
  const { server, rooms, stop } = await start(0, tmpRecords());
  const port = server.address().port;
  const a = client(port), b = client(port);
  try {
    await a.open; a.send({ t: 'join', name: 'Wrld' });
    await until(() => a.code, 3000, 'room code');
    await b.open; b.send({ t: 'join', name: 'Tendai', code: a.code });
    await until(() => b.id, 3000, 'second join');
    assert.equal(b.code, a.code, 'same room');
    await until(() => a.lobby && a.lobby.players.length === 2, 3000, 'both in the lobby');
    assert.ok(a.lobby.players.find((p) => p.id === a.id).host, 'the first in is host');
    assert.ok(!a.lobby.players.find((p) => p.id === b.id).host);

    a.send({ t: 'start' });
    // the opening cinematic stands between START and the palace now
    a.send({ t: 'seen' });
    if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await until(() => a.map && b.map, 3000, 'the palace reaches both');
    await until(() => a.snaps > 3 && b.snaps > 3, 3000, 'both receiving snapshots');
    const room = rooms.get(a.code);
    const pa = room.players.get(a.id), pb = room.players.get(b.id);

    // each sees the other in the shared state, with its own private readout
    assert.equal(a.shared.p.length, 2, 'A sees both spirits');
    assert.equal(b.shared.p.length, 2, 'B sees both spirits');
    assert.ok(a.me && b.me, 'each gets a private readout');
    assert.equal(a.me.form, 'spirit'); assert.equal(b.me.form, 'spirit');

    // A wears a priest, B wears a servant — the two halves of the route
    const priest = room.bodies.find((x) => x.role === 'priest');
    const servant = room.bodies.find((x) => x.role === 'servant');
    pa.x = priest.x; pa.y = priest.y;
    a.send({ t: 'in', use: true }); await sleep(120); a.send({ t: 'in', use: false });
    await until(() => pa.form === 'worn', 2000, 'A wears a body');
    assert.equal(room.body(pa.bodyId).role, 'priest');
    pb.x = servant.x; pb.y = servant.y;
    b.send({ t: 'in', use: true }); await sleep(120); b.send({ t: 'in', use: false });
    await until(() => pb.form === 'worn', 2000, 'B wears a body');
    assert.equal(room.body(pb.bodyId).role, 'servant');

    // both see that the other is wearing somebody, and each private readout
    // now describes its own body rather than the other's
    await until(() => a.shared.p.filter((p) => p.f === 1).length === 2, 2000, 'both shown as housed');
    await until(() => a.me.role === 'priest' && b.me.role === 'servant', 2000, 'readouts diverge');
    assert.equal(a.me.act, 'Blessing', 'A is told what a priest can do');
    assert.equal(b.me.act, 'Summon', 'B is told what a servant can do');
    assert.notEqual(a.me.bodyName, b.me.bodyName, 'and they are different people');

    // A lifts the child and sets him down in the hall; B collects him
    pa.x = room.infant.x; pa.y = room.infant.y;
    a.send({ t: 'in', take: true }); await sleep(120); a.send({ t: 'in', take: false });
    await until(() => pa.carrying, 2000, 'A has the child');
    await until(() => b.shared.inf[2] === a.id, 2000, 'B can see who is carrying him');
    pa.x = 20 * TILE; pa.y = 11 * TILE; await sleep(120);
    a.send({ t: 'in', take: true }); await sleep(150); a.send({ t: 'in', take: false });
    await until(() => !pa.carrying && !room.infant.carrier, 2000, 'set down in the hall');

    pb.x = room.infant.x; pb.y = room.infant.y; await sleep(120);
    b.send({ t: 'in', take: true }); await sleep(150); b.send({ t: 'in', take: false });
    await until(() => pb.carrying, 2000, 'B picked him up');
    assert.equal(room.infant.carrier, b.id, 'the handover is complete');

    // B carries him out, and the win is credited to B
    pb.x = room.map.exits[0].x; pb.y = room.map.exits[0].y;
    await until(() => room.phase === 'won', 3000, 'the run is won');
    await until(() => a.won && b.won, 2000, 'both told');
    assert.equal(a.won.by, 'Tendai', 'credited to whoever carried him out');
  } finally {
    a.ws.close(); b.ws.close(); await stop();
  }
});

test('a spirit who drops out mid-run lets go of the child and frees their body', { timeout: 20000 }, async () => {
  const { server, rooms, stop } = await start(0, tmpRecords());
  const port = server.address().port;
  const a = client(port), b = client(port);
  try {
    await a.open; a.send({ t: 'join', name: 'Host' });
    await until(() => a.code, 3000, 'code');
    await b.open; b.send({ t: 'join', name: 'Leaver', code: a.code });
    await until(() => b.id, 3000, 'join');
    a.send({ t: 'start' });
    // the opening cinematic stands between START and the palace now
    a.send({ t: 'seen' });
    if (typeof b !== 'undefined' && b) b.send({ t: 'seen' });
    await until(() => a.map && a.snaps > 3, 3000, 'running');
    const room = rooms.get(a.code);
    const pb = room.players.get(b.id);
    const body = room.bodies.find((x) => x.role === 'priest');
    pb.x = body.x; pb.y = body.y;
    b.send({ t: 'in', use: true }); await sleep(120); b.send({ t: 'in', use: false });
    await until(() => pb.form === 'worn', 2000, 'B housed');
    pb.x = room.infant.x; pb.y = room.infant.y;
    b.send({ t: 'in', take: true }); await sleep(150); b.send({ t: 'in', take: false });
    await until(() => pb.carrying, 2000, 'B carrying');
    const wornId = pb.bodyId;

    b.ws.close();
    await until(() => !room.players.get(b.id).connected, 3000, 'B is offline');
    assert.equal(room.players.size, 2, 'B keeps their recoverable player slot');
    assert.equal(room.infant.carrier, 0, 'the child is not carried off into the void');
    assert.notEqual(room.body(wornId).state, 'worn', 'and the body is released');
    await until(() => a.lobby && a.lobby.players.find((p) => p.id === b.id && !p.online), 2000, 'the host sees an offline player');
    assert.ok(room.phase === 'run', 'the run carries on for whoever is left');
  } finally {
    a.ws.close(); b.ws.close(); await stop();
  }
});

test('the room is capped and a bad code is refused', { timeout: 20000 }, async () => {
  const { server, rooms, stop } = await start(0, tmpRecords());
  const port = server.address().port;
  const cs = [];
  try {
    const host = client(port); cs.push(host);
    await host.open; host.send({ t: 'join', name: 'Host' });
    await until(() => host.code, 3000, 'code');
    for (let i = 0; i < 3; i++) {
      const c = client(port); cs.push(c);
      await c.open; c.send({ t: 'join', name: 'P' + i, code: host.code });
      await until(() => c.id, 3000, 'join ' + i);
    }
    await until(() => rooms.get(host.code).players.size === 4, 3000, 'four spirits');
    const fifth = client(port); cs.push(fifth);
    await fifth.open; fifth.send({ t: 'join', name: 'Late', code: host.code });
    await until(() => fifth.err, 3000, 'the fifth is turned away');
    assert.match(fifth.err, /full/i);
    const wrong = client(port); cs.push(wrong);
    await wrong.open; wrong.send({ t: 'join', name: 'Lost', code: 'ZZZZ' });
    await until(() => wrong.err, 3000, 'bad code refused');
    assert.match(wrong.err, /No room/i);
  } finally {
    for (const c of cs) c.ws.close(); await stop();
  }
});

test('nonsense input over the wire cannot corrupt a position or crash a tick', { timeout: 20000 }, async () => {
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
    await until(() => a.map && a.snaps > 2, 3000, 'running');
    const room = rooms.get(a.code);
    const p = room.players.get(a.id);
    for (const bad of [
      { t: 'in', mx: 'NaN', my: Infinity, a: 'x' },
      { t: 'in', mx: 1e9, my: -1e9, a: NaN },
      { t: 'in', mx: null, my: undefined, a: 1e308 * 10 },
      { t: 'in' }, { t: 'nonsense' }, { t: 'in', mx: [], my: {} },
    ]) a.send(bad);
    a.send('not json at all');
    await sleep(400);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'position is still a number');
    assert.ok(Number.isFinite(p.aim), 'so is the facing');
    const before = a.snaps;
    await sleep(250);
    assert.ok(a.snaps > before, 'and the server is still ticking');
  } finally {
    a.ws.close(); await stop();
  }
});
