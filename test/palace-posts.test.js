'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {palace,TILE}=require('../palace');
const {Room}=require('../vessel');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('most palace residents stay posted; local patrols are at most two tiles from home',()=>{
  const map=palace();
  const moving=map.bodies.filter(b=>b.route.length>1);
  assert.ok(moving.length <= Math.floor(map.bodies.length/2));
  assert.ok(map.bodies.filter(b=>b.route.length===1).length>=10);
  for(const b of map.bodies) for(const wp of b.route)
    assert.ok(dist(wp,b.route[0])<=2*Math.SQRT2*TILE+1,b.name+' exceeds local route');
});
test('idle residents do not roam the palace without an alarm',()=>{
  const room=new Room('POST',()=>{}),player=room.newPlayer('Tester');room.start(player.id);
  for(const body of room.bodies)body.ignoreUntil=1e6;
  for(let i=0;i<1200;i++)room.tick();
  for(const body of room.bodies){
    const d=dist(body,{x:body.homeX,y:body.homeY});
    if(body.route.length===1)assert.ok(d<1,body.name+' left its post');
    assert.ok(d<3*TILE,body.name+' wandered');
  }
});
