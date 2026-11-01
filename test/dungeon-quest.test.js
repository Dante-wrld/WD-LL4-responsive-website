'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chamber, CHAMBERS, DUNGEONS, FOES } = require('../shrine');
const { Shrine, GEAR } = require('../act2');
const { Session } = require('../campaign');
const { SessionStore, pack, restore } = require('../session-store');
const { TILE, tx, ty, solidFor, flood } = require('../grid');

function party(n=1) {
  const emitted = [];
  const s = new Shrine('QWER',(pid,m)=>emitted.push({pid,m}));
  const ps=Array.from({length:n},(_,i)=>s.newPlayer('Hero '+i));
  s.begin({boons:[],affinities:[]});
  return {s,ps,emitted};
}
function clear(s,p) {
  for (const f of s.foes) f.dead=true;
  p.x=s.map.door.x;p.y=s.map.door.y;
  for(let i=0;i<60;i++)s.tick();
  assert.equal(s.phase,'gift','door opens with a reward');
  assert.equal(s.offer.length,2);
  s.takeGift(p.id,s.offer[0].key);
}
function finishShrine(s,p){
  for(let i=0;i<CHAMBERS.length;i++)clear(s,p);
  assert.equal(s.phase,'done');
}

test('six extra dungeon maps and two bosses have safe reachable doors',()=>{
  assert.equal(CHAMBERS.length,4);
  assert.equal(DUNGEONS.length,6);
  assert.equal(DUNGEONS.filter(x=>!!x.boss).length,2);
  for(let n=0;n<DUNGEONS.length;n++){
    const m=chamber(CHAMBERS.length+n);
    assert.equal(m.chapter,'dungeon');
    assert.equal(m.step,n+1);
    assert.equal(m.total,DUNGEONS.length);
    assert.ok(!solidFor(m,tx(m.start.x),ty(m.start.y),'self'));
    assert.ok(!solidFor(m,tx(m.door.x),ty(m.door.y),'self'));
    const walk=flood(m,tx(m.start.x),ty(m.start.y),'self');
    assert.ok(walk.has(tx(m.door.x)+','+ty(m.door.y)),m.name+' exit unreachable');
    for(const f of m.foes){
      assert.ok(!solidFor(m,tx(f.x),ty(f.y),'self'),m.name+' enemy in wall');
      assert.ok(walk.has(tx(f.x)+','+ty(f.y)),m.name+' enemy unreachable');
    }
    assert.equal(m.rewards.length,2);
    assert.ok(m.rewards.every(key=>GEAR[key]),m.name+' references unavailable gear');
    if(m.boss) assert.ok(m.foes.some(x=>x.kind===m.boss));
  }
  assert.equal(chamber(3).last,true,'original shrine completion still works');
  assert.equal(chamber(9).last,true,'new dungeon has a true final room');
  assert.ok(FOES.warden.boss&&FOES.warlord.boss);
});

test('dungeon starts after original shrine and retains earlier gifts',()=>{
  const {s,ps}=party(1),p=ps[0];
  assert.equal(s.beginDungeon(),false,'cannot bypass the original quest');
  finishShrine(s,p);
  const gifts=p.gifts.slice(), priorLevel=p.level;
  assert.equal(s.lastDone.canDungeon,true);
  assert.match(s.lastDone.next,/ACT III/);
  assert.equal(s.beginDungeon(),true);
  assert.equal(s.chapter,'dungeon');
  assert.equal(s.map.name,'THE FORSAKEN ARMORY');
  assert.deepEqual(p.gifts,gifts);
  assert.equal(p.level,priorLevel);
  assert.equal(p.hp,p.hpMax,'sanctuary heals before the optional dungeon');
  assert.equal(s.beginDungeon(),false,'cannot restart mid-combat');
});

test('equipment replaces previous slot modifiers and XP levels up',()=>{
  const {s,ps}=party(1),p=ps[0];
  const d=p.damage,range=p.reach,max=p.hpMax;
  assert.ok(s.equip(p,'bronze_spear'));
  assert.equal(p.damage,d+.25);
  assert.equal(p.reach,range+12);
  assert.ok(s.equip(p,'iron_spear'));
  assert.ok(Math.abs(p.damage-(d+.55))<1e-8,'no doubled weak weapon bonus');
  assert.equal(p.reach,range+18);
  assert.equal(s.equip(p,'bronze_spear'),false,'cannot downgrade');
  assert.ok(s.equip(p,'leather_vest'));
  assert.ok(s.equip(p,'warded_armor'));
  assert.equal(p.hpMax,max+2,'armor replaces weak vest bonus');
  const out=p.outMax;
  assert.ok(s.equip(p,'spirit_beads'));
  assert.ok(s.equip(p,'moon_charm'));
  assert.equal(p.outMax,out+7,'relic replaces spirit bonus');
  s.awardXP(p,'warden');
  assert.equal(p.level,2);
  assert.equal(p.hpMax,max+3,'level grows heart total');
  assert.ok(p.xp>=0&&p.xp<100);
  assert.equal(p.gear.weapon,'iron_spear');
});

test('room rewards and final boss keep progression through all six rooms',()=>{
  const {s,ps}=party(1),p=ps[0],events=[];
  s.out=(_pid,m)=>events.push(m);
  finishShrine(s,p);
  s.beginDungeon();
  for(let n=0;n<DUNGEONS.length;n++){
    assert.equal(s.map.chapter,'dungeon');
    assert.equal(s.map.step,n+1);
    const oldGear={...p.gear};
    for(const f of s.foes)f.dead=true;
    p.x=s.map.door.x;p.y=s.map.door.y;
    for(let t=0;t<60;t++)s.tick();
    assert.equal(s.phase,'gift','dungeon '+(n+1)+' provides loot');
    assert.equal(s.offer[0].slot,GEAR[s.offer[0].key].slot);
    s.takeGift(p.id,s.offer[0].key);
    assert.notDeepEqual(p.gear,oldGear,'item equipped at dungeon '+(n+1));
  }
  assert.equal(s.phase,'done');
  assert.equal(s.lastDone.chapter,'dungeon');
  assert.equal(s.lastDone.canDungeon,false);
  assert.match(s.lastDone.line,/Ash Warlord/);
  assert.ok(events.some(x=>x.t==='done'));
  assert.equal(s.lastDone.equipment[0].weapon,p.gear.weapon);
});

test('dungeon entry and treasure selection are host-authorized',()=>{
  const s=new Session('QWER',()=>{});
  const a=s.newPlayer('Host'),b=s.newPlayer('Guest');
  s.toAct2();
  const sh=s.shrine;
  for(let n=0;n<CHAMBERS.length;n++)clear(sh,sh.players.get(a.id));
  assert.equal(s.enterDungeon(b.id),false);
  assert.equal(sh.phase,'done');
  assert.equal(s.enterDungeon(a.id),true);
  const p=sh.players.get(a.id),guest=sh.players.get(b.id);
  for(const f of sh.foes)f.dead=true;
  p.x=sh.map.door.x;p.y=sh.map.door.y;
  for(let i=0;i<60;i++)sh.tick();
  const item=sh.offer[0].key;
  sh.takeGift(b.id,item);
  assert.equal(sh.phase,'gift','guest cannot decide for party');
  sh.takeGift(a.id,item);
  assert.equal(sh.phase,'run');
  assert.equal(p.gear[GEAR[item].slot],item);
  assert.equal(guest.gear[GEAR[item].slot],item,'party members receive the selected equipment');
});

test('dungeon equipment, levels and boss room survive room checkpoint serialization',()=>{
  const s=new Session('QWER',()=>{}),host=s.newPlayer('Host');
  s.toAct2();const sh=s.shrine,p=sh.players.get(host.id);
  for(let n=0;n<CHAMBERS.length;n++)clear(sh,p);
  s.enterDungeon(host.id);
  sh.equip(p,'iron_spear');sh.awardXP(p,'warden');
  sh.enterChamber(6); // tomb boss
  const state=pack(s),back=restore(state,()=>{});
  const q=back.shrine.players.get(host.id);
  assert.equal(back.shrine.chapter,'dungeon');
  assert.equal(back.shrine.map.boss,'warden');
  assert.equal(q.gear.weapon,'iron_spear');
  assert.equal(q.level,p.level);
  assert.equal(q.reach,p.reach);
  assert.equal(q.xp,p.xp);
  assert.equal(back.shrine.map.step,3);
});

test('dungeon UI includes entry, equipment choices, boss bar and level HUD',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.match(html,/id="dungeonGo"/);
  assert.match(html,/send\(\{ t: 'dungeon' \}\)/);
  assert.match(html,/THE ASH WARLORD FALLS/);
  assert.match(html,/m\.chapter === 'dungeon'/);
  assert.match(html,/map\.boss/);
  assert.match(html,/me2\.gear/);
  assert.match(html,/me2\.level/);
});
