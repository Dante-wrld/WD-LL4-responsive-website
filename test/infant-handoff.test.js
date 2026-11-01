'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Room, palace, TILE}=require('../vessel');
const {solidFor}=require('../grid');

function setup(){
  const room=new Room('HAND',()=>{});
  const p=room.newPlayer('Traveler');
  room.start(p.id);
  const priest=room.bodies.find(b=>b.role==='priest');
  room.enterBody(p,priest);
  assert.ok(room.takeInfant(p));
  // The infant is transferred in the public hall, outside the nursery.
  p.x=20*TILE+16;p.y=11*TILE+16;
  priest.x=p.x;priest.y=p.y;
  return {room,p,priest};
}

test('the blocked red barracks door is role-based, not an alarm',()=>{
  const map=palace();
  assert.equal(solidFor(map,13,16,'priest'),true);
  assert.equal(solidFor(map,13,16,'soldier'),false);
  assert.equal(solidFor(map,27,11,'servant'),false);
  assert.equal(solidFor(map,27,11,'priest'),true);
});

test('a nearby witness cannot instantly return a deliberately set-down child',()=>{
  const {room,p,priest}=setup();
  room.dropInfant(p);
  const deadline=room.infant.safeUntil;
  assert.ok(deadline>room.time+10);
  assert.equal(room.infant.carrier,0);
  const guard=room.bodies.find(b=>b.role==='soldier');
  guard.x=room.infant.x+20;guard.y=room.infant.y;
  guard.route=[{x:guard.x,y:guard.y}];guard.wp=0;
  guard.state='idle';guard.ignoreUntil=0;
  room.updateBodies();
  assert.equal(room.infant.x,p.x,'child stays in hall during handoff grace');
  room.time=deadline-0.01;
  room.updateBodies();
  assert.equal(room.infant.x,p.x,'handoff stays safe throughout grace');
  const state=JSON.parse(room.sharedJSON());
  assert.equal(state.hand,1,'HUD can display seconds remaining');
  room.time=deadline+0.1;
  room.updateBodies();
  assert.equal(room.infant.x,room.infant.home.x,
    'a guard can still find and return an unattended child after grace');
  assert.equal(room.infant.y,room.infant.home.y);
});

test('a priest can hand off to a servant without sounding an alarm',()=>{
  const {room,p}=setup();
  room.dropInfant(p);
  const infantAt={x:room.infant.x,y:room.infant.y};
  room.leaveBody(p,'slump');
  const servant=room.bodies.find(b=>b.role==='servant');
  p.x=servant.x;p.y=servant.y;
  room.enterBody(p,servant);
  p.x=infantAt.x;p.y=infantAt.y;
  assert.ok(room.takeInfant(p),'new host can pick the child up');
  assert.equal(room.infant.carrier,p.id);
  assert.equal(room.infant.safeUntil,0,'pickup clears the grace clock');
  assert.equal(p.carrying,true);
  assert.equal(p.form,'worn');
  assert.equal(room.won,false,'handoff is not an automatic victory');
});

test('player sees required roles, handoff timer and nearest servant prompt',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.match(html,/LOCKED/);
  assert.match(html,/NEXT: SERVANT/);
  assert.match(html,/PRIEST CANNOT EXIT/);
  assert.match(html,/HANDOFF: /);
  assert.match(html,/snap\.hand/);
  assert.match(html,/NEEDS /);
});
