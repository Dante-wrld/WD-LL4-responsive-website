'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WS = require('ws');
const { start } = require('../server');
const until = async (check, label) => {
  const startMs = Date.now();
  while (Date.now() - startMs < 3500) {
    if (check()) return check();
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('timeout: ' + label);
};
function peer(port) {
  const c = { msgs: [], ws: new WS('ws://127.0.0.1:' + port) };
  c.ws.on('message', (buf) => c.msgs.push(JSON.parse(buf)));
  c.open = new Promise((resolve) => c.ws.on('open', resolve));
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.last = (type) => c.msgs.filter((m) => m.t === type).at(-1);
  return c;
}
function suite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cham-resume-'));
  return { dir, opts: { recordsFile: path.join(dir,'runs.json'), sessionsFile: path.join(dir,'sessions.json') } };
}
test('expired recovery returns actionable error, and new rooms remain available', { timeout: 15000 }, async () => {
  const { dir, opts } = suite();
  let srv; const clients = [];
  try {
    srv = await start(0, opts); const port = srv.server.address().port;
    const attempt = peer(port); clients.push(attempt); await attempt.open;
    attempt.send({ t:'join', name:'Prior', code:'ZZZZ', token:'a'.repeat(64) });
    const err = await until(()=>attempt.last('err'),'expiry error');
    assert.equal(err.code,'ROOM_EXPIRED');
    assert.match(err.msg,/BEGIN/);
    const newClient = peer(port); clients.push(newClient); await newClient.open;
    newClient.send({t:'join',name:'Fresh'});
    const joined = await until(()=>newClient.last('joined'),'fresh room');
    assert.equal(joined.code.length,4);
  } finally {
    for(const c of clients) c.ws.close();
    if(srv) await srv.stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('a bad resume token never creates a second seat; real token recovers the same one', {timeout:15000},async()=>{
  const {dir,opts}=suite(); let srv; const cs=[];
  try {
    srv=await start(0,opts); const port=srv.server.address().port;
    const host=peer(port);cs.push(host);await host.open;host.send({t:'join',name:'Guardian'});
    const joined=await until(()=>host.last('joined'),'host join');
    const { code,id,token }=joined;
    const invalid=peer(port);cs.push(invalid);await invalid.open;
    invalid.send({t:'join',name:'Impostor',code,token:'f'.repeat(64)});
    const err=await until(()=>invalid.last('err'),'invalid token');
    assert.equal(err.code,'INVALID_RECOVERY');
    assert.equal(srv.rooms.get(code).roster.length,1);
    const valid=peer(port);cs.push(valid);await valid.open;
    valid.send({t:'join',name:'Guardian',code,token});
    const recovery=await until(()=>valid.last('joined'),'reconnect');
    assert.equal(recovery.id,id);
    assert.equal(srv.rooms.get(code).roster.length,1);
  } finally {
    for(const c of cs)c.ws.close();if(srv)await srv.stop();fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('browser includes temporary-storage disclosure and expiry handling', () => {
  const source=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.match(source,/id="resumeRoom"/);
  assert.match(source,/ROOM_EXPIRED/);
  assert.match(source,/INVALID_RECOVERY/);
  assert.match(source,/localStorage\.removeItem\('chaminuka-seat'\)/);
  assert.match(source,/scores on the free-hosted demo are temporary/i);
});
