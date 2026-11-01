'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'public/pixel-art.js'),'utf8');
function loadPixels() {
  const window = {};
  vm.runInNewContext(source, { window });
  assert.ok(window.ChamPixelArt, 'pixel renderer registered');
  return window.ChamPixelArt;
}
function context() {
  const draws = [];
  return {
    draws, globalAlpha: 1, fillStyle: '#fff', strokeStyle: '#fff', lineWidth: 1,
    save(){}, restore(){}, translate(){}, scale(){},
    fillRect(x,y,w,h){ draws.push([x,y,w,h,this.fillStyle]); },
    strokeRect(x,y,w,h){ draws.push(['stroke',x,y,w,h,this.strokeStyle]); }
  };
}
test('pixel renderer parses in isolation and provides visuals for all story stages', () => {
  const art = loadPixels();
  for (const name of ['tile','person','spirit','mark','frame','gauge','heart','atmosphere']) {
    assert.equal(typeof art[name], 'function', name + ' exported');
  }
  const ctx = context();
  art.tile(ctx,'#',0,0,0,0,32,null,'palace','GREAT HALL',0,true);
  art.tile(ctx,'T',1,0,32,0,32,null,'shrine','OUTER COURT',0,true);
  art.tile(ctx,'o',2,0,64,0,32,null,'palace','GREAT HALL',1,true);
  art.tile(ctx,'.',3,0,96,0,32,null,'trials','HALL OF BREATH',1,true);
  art.tile(ctx,'D',4,0,128,0,32,null,'palace','BARRACKS',0,false);
  assert.ok(ctx.draws.length > 40);
  assert.ok(ctx.draws.every(d => d[0] === 'stroke' || (d[2] > 0 && d[3] > 0)));
});
test('real sprite silhouettes for palace roles, Chaminuka and all four bosses', () => {
  const art = loadPixels();
  const variants = ['hero','priest','soldier','servant','captain','spearman',
    'hunter','echo','sentinel','warden','warlord'];
  const signatures = new Set();
  for (const kind of variants) {
    const ctx = context();
    art.person(ctx,{x:200,y:200,kind,color:'#f2a966',walk:10,alpha:1,flip:false});
    assert.ok(ctx.draws.length > 20,kind + ' has a layered pixel sprite');
    const shape = JSON.stringify(ctx.draws);
    signatures.add(shape);
  }
  assert.equal(signatures.size,variants.length,'each character type has its own actual sprite');
});
test('spirit, transformation and health HUD render using rectangular pixels', () => {
  const art = loadPixels(),ctx = context();
  art.spirit(ctx,{x:50,y:60,tick:1.2,alpha:0.9});
  art.mark(ctx,'panther',50,60,1);
  art.mark(ctx,'eagle',50,60,1);
  art.mark(ctx,'ancestor',50,60,1);
  art.frame(ctx,960,540);
  art.gauge(ctx,20,35,120,10,0.5,'#ff8844');
  art.heart(ctx,20,26,true,false);
  assert.ok(ctx.draws.length > 30);
  assert.ok(ctx.draws.some(d => d.includes('#69e8bc')),'panther aura distinct');
  assert.ok(ctx.draws.some(d => d.includes('#8fcfff')),'eagle aura distinct');
  assert.ok(ctx.draws.some(d => d.includes('#cda2ff')),'ancestor aura distinct');
});
test('pixel theme extends to title, rooms, combat HUD, mobile and existing cinematics', () => {
  const html = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const css = fs.readFileSync(path.join(root,'public/pixel-theme.css'),'utf8');
  assert.ok(html.indexOf('/pixel-art.js') < html.indexOf('<script>'),
    'pixel renderer is loaded before gameplay script');
  assert.match(html, /Pixel\.tile\(ctx/);
  assert.match(html, /Pixel\.person\(ctx/);
  assert.match(html, /Pixel\.spirit\(ctx/);
  assert.match(html, /Pixel\.mark\(ctx/);
  assert.match(html, /Pixel\.heart\(ctx/);
  assert.doesNotMatch(html, /function pixelateWorld\(/,'no blurry downsample/upscale pass');
  assert.match(html, /ZOOM = 1;/,'integer world zoom prevents fractional pixel edges');
  assert.match(html, /drawVeil2\(\)/, 'Act II uses banded light instead of layered gradient haze');
  assert.match(html, /storyPixelVideo/);
  assert.match(html, /pixelateStory\(\)/);
  assert.match(html, /Pixel\.frame\(ctx, W, H\)/);
  assert.match(css, /#storyPixelVideo/);
  assert.match(css, /#bossIntro/);
  assert.match(html, /showBossIntro\(m\.boss\)/);
  assert.match(html, /id="bossPortrait"/);
  assert.match(css, /#stage/);
  assert.match(css, /@media\(max-width:650px\)/);
  assert.match(html, /id="trialsGo"/,'optional Act II spirit trials remain available');
  assert.match(html, /id="dungeonGo"/,'existing dungeon remains available');
});

test('detailed room pixels and atmosphere use deterministic tile clusters and soft light', () => {
  const art = loadPixels();
  const c = context();
  for (const mood of ['forest','sky','ancestor','ash','crypt','palace']) {
    const chapter = ['forest','sky','ancestor'].includes(mood) ? 'trials' :
      ['ash','crypt'].includes(mood) ? 'dungeon' : 'palace';
    const name = {forest:'THE POOL OF REFLECTIONS',sky:'THE HALL OF BREATH',
      ancestor:'THE ANCESTORS CIRCLE',ash:'THE ASH WARLORD',crypt:'THE CRYPT',
      palace:'PALACE HALL'}[mood];
    for(let x=0;x<7;x++) art.tile(c,'.',x,2,x*32,64,32,null,chapter,name,1,true);
  }
  assert.ok(c.draws.length > 180, 'rooms include layered environmental detail');
  const lights = [];
  const contextWithGradients = {
    ...context(),
    createRadialGradient() {
      const stops = [];
      lights.push(stops);
      return { addColorStop(t, color) { stops.push([t,color]); } };
    },
    setTransform() {}
  };
  const map={w:8,h:8,chapter:'trials',rows:Array.from({length:8},(_,i)=>'.'.repeat(4)+(i%2===0?'o':'.')+'...')};
  assert.doesNotThrow(()=>art.atmosphere(contextWithGradients,map,{x:0,y:0},1,960,540,1));
  assert.ok(lights.length >= 3, 'distinct torch and ancestral glow rendered');
});
test('player sprite silhouette fits the 11-unit collision radius at rest', () => {
  const art=loadPixels(),ctx=context();
  art.person(ctx,{x:0,y:0,kind:'hero',walk:0,alpha:1,color:'#ffd166'});
  const xs=ctx.draws.filter(d=>typeof d[0]==='number').flatMap(d=>[d[0],d[0]+d[2]]);
  assert.ok(Math.min(...xs)>=-11,'sprite does not extend more than 11 left');
  assert.ok(Math.max(...xs)<=12,'sprite does not extend more than 12 right');
});
