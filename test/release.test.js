'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WS = require('ws');
const { Records } = require('../records');
const { Shrine, BUILDS } = require('../act2');
const { start } = require('../server');
const { SessionStore, pack, restore } = require('../session-store');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 2500) { const t = Date.now(); while (Date.now()-t < ms) { if (fn()) return; await sleep(15); } throw new Error('timeout'); }
function client(port) {
  const c = { messages: [], ws: new WS(`ws://127.0.0.1:${port}`) };
  c.ready = new Promise((r) => c.ws.once('open', r));
  c.ws.on('message', (buf) => c.messages.push(JSON.parse(buf)));
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.last = (t) => c.messages.filter((x) => x.t === t).at(-1);
  return c;
}
test('palace boards exclude Act II and shrine board preserves combat statistics', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cham-rec-'));
  try {
    const records = new Records(path.join(folder,'runs.json'));
    records.add({ act: 1, by: 'Palace', won: true, secs: 85, bodies: 2, worst: 13 });
    records.add({ act: 2, by: 'Shrine', won: true, secs: 5, deaths: 2, kills: 12, gifts: ['tether'], builds: ['shadow'] });
    const board = records.top();
    assert.deepEqual(board.fastest.map((r) => r.by), ['Palace']);
    assert.deepEqual(board.shrineFastest.map((r) => r.by), ['Shrine']);
    assert.equal(board.shrineFastest[0].kills, 12);
    assert.equal(board.shrineFastest[0].deaths, 2);
    assert.deepEqual(new Records(path.join(folder, 'runs.json')).runs[1].builds, ['shadow']);
  } finally { fs.rmSync(folder, { recursive:true, force:true }); }
});
test('four builds alter only Act II stats and preserve the possession mechanic', () => {
  const selected = {};
  for (const key of Object.keys(BUILDS)) {
    const shrine = new Shrine('ABCD',()=>{});
    const p = shrine.newPlayer(key); p.build = key;
    shrine.begin({});
    selected[key] = { hp:p.hpMax, reach:p.reach, out:p.outMax, dodge:p.dodgeCd, damage:p.damage, vacant:p.vacant, take:p.takeBonus };
    assert.equal(p.form,'self');
    shrine.stepOut(p); assert.equal(p.form,'spirit', key+' can still astral-project');
  }
  assert.ok(selected.royal.hp > selected.spirit.hp);
  assert.ok(selected.royal.reach > selected.spirit.reach);
  assert.ok(selected.spirit.out > selected.royal.out);
  assert.ok(selected.spirit.take > selected.royal.take);
  assert.ok(selected.shadow.dodge < selected.royal.dodge);
  assert.ok(selected.shadow.vacant < selected.royal.vacant);
  assert.ok(selected.elemental.damage > selected.royal.damage);
});
test('server restart restores a room, personal build and checkpoint with the same recovery key', {timeout:15000}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'cham-sessions-'));
  const opts = {recordsFile:path.join(dir,'records.json'),sessionsFile:path.join(dir,'sessions.json')};
  let serverA, serverB, a, b;
  try {
    serverA = await start(0, opts);
    a = client(serverA.server.address().port); await a.ready;
    a.send({t:'join',name:'Amara'});
    await until(()=>a.last('joined'));
    const {code,id,token} = a.last('joined');
    assert.match(token,/^[a-f0-9]{64}$/);
    a.send({t:'build',key:'shadow'});
    await until(()=>serverA.rooms.get(code).roster[0].build === 'shadow');
    // Simulate passing the first two acts; save occurs at the server state boundary.
    serverA.rooms.get(code).toAct2();
    const s=serverA.rooms.get(code);
    s.shrine.enterChamber(2); s.shrine.players.get(id).kills=7;
    await serverA.stop();
    serverB = await start(0, opts);
    assert.ok(serverB.rooms.has(code));
    b = client(serverB.server.address().port); await b.ready;
    b.send({t:'join',name:'Amara',code,token});
    await until(()=>b.last('joined'));
    assert.equal(b.last('joined').id,id, 'same stable player id');
    const restored=serverB.rooms.get(code);
    assert.equal(restored.roster.length,1,'no phantom duplicate');
    assert.equal(restored.stage,'act2');
    assert.equal(restored.shrine.chamberN,2);
    assert.equal(restored.players.get(id).kills,7);
    assert.equal(restored.players.get(id).build,'shadow');
    await until(()=>b.last('map2'));
  } finally {
    if(a) a.ws.close(); if(b) b.ws.close();
    if(serverA && serverA.server.listening) await serverA.stop();
    if(serverB) await serverB.stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
