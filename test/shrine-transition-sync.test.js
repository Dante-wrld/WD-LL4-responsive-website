'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const WS=require('ws');
const {Session}=require('../campaign');
const {start}=require('../server');

test('the Mavambo shrine sends player and enemies immediately after its map',()=>{
 const events=[];
 const s=new Session('SHRN',(pid,msg)=>events.push({pid,msg}));
 const a=s.newPlayer('One'),b=s.newPlayer('Two');
 s.toAct2();
 const i=events.findIndex(x=>x.msg?.t==='map2');
 assert.ok(i>=0,'shrine map was sent');
 for(const [offset,player] of [[1,a],[2,b]]){
  const e=events[i+offset];
  assert.equal(e.pid,player.id,'each player receives their own state');
  assert.equal(e.msg.t,'s2');
  assert.equal(e.msg.me.act,2);
  assert.ok(e.msg.p.some(p=>p.i===player.id),'character exists in snapshot');
  assert.equal(e.msg.f.length,2,'outer court begins with enemies');
 }
 events.length=0;s.syncTo(b.id);
 const j=events.findIndex(x=>x.pid===b.id&&x.msg.t==='map2');
 assert.ok(j>=0);assert.equal(events[j+1]?.msg.t,'s2','rejoin gets state immediately');
});

test('WebSocket receives a populated Act II snapshot directly after map2',{timeout:12000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chaminuka-shrine-'));let app,ws;
 try{
  app=await start(0,{recordsFile:path.join(dir,'runs.json'),sessionsFile:path.join(dir,'sessions.json')});
  const messages=[];
  ws=new WS('ws://127.0.0.1:'+app.server.address().port);
  ws.on('message',buf=>{
   const m=JSON.parse(buf.toString());messages.push(m);
   if(m.t==='joined')ws.send(JSON.stringify({t:'skip',to:'act2'}));
  });
  await new Promise((res,rej)=>{
   ws.once('open',()=>{ws.send(JSON.stringify({t:'join',name:'Tester'}));res();});
   ws.once('error',rej);
  });
  const started=Date.now();
  while(Date.now()-started<2000&&!messages.some(m=>m.t==='s2'))await new Promise(r=>setTimeout(r,10));
  const i=messages.findIndex(m=>m.t==='map2');
  assert.ok(i>=0);assert.equal(messages[i+1]?.t,'s2');
  assert.equal(messages[i+1].p.length,1);
  assert.equal(messages[i+1].f.length,2);
  assert.equal(messages[i+1].me.act,2);
 }finally{if(ws)ws.terminate();if(app)await app.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Act II rendering waits for its own snapshot, not an old palace snapshot',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/phase = 'loading2'/);
 assert.match(html,/snap = null; snap2 = null; me = null; me2 = null;/);
 assert.match(html,/m\.p\.some\(\(p\) => p\.i === myId\)/);
 assert.match(html,/send\(\{ t: 'sync' \}\)/);
 assert.match(html,/ENTERING THE SHRINE/);
});