'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chamber, CHAMBERS, DUNGEONS, TRIALS, W, H } = require('../shrine');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const pixelArt = fs.readFileSync(path.join(__dirname, '..', 'public', 'pixel-art.js'), 'utf8');
const solid = (c) => c === '#' || c === 'T' || c === 'o';
const cell = (v) => Math.floor(v / 32);

test('all thirteen Act II rooms have four wall-side braziers and remain fully traversable', () => {
  const total = CHAMBERS.length + DUNGEONS.length + TRIALS.length;
  assert.equal(total, 13);
  const fires = [[2,5],[2,H - 6],[W - 3,5],[W - 3,H - 6]];
  for (let n = 0; n < total; n++) {
    const map = chamber(n);
    for (const [x,y] of fires) assert.equal(map.rows[y][x], 'o', map.name + ' missing flame');
    const start = [cell(map.start.x), cell(map.start.y)];
    assert.ok(!solid(map.rows[start[1]][start[0]]), map.name + ' start is clear');
    const q = [start], seen = new Set([start.join(',')]);
    for (let h = 0; h < q.length; h++) {
      const [x,y] = q[h];
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx, ny=y+dy;
        if (ny < 0 || ny >= map.h || nx < 0 || nx >= map.w || solid(map.rows[ny][nx])) continue;
        const key = nx + ',' + ny;
        if (seen.has(key)) continue;
        seen.add(key); q.push([nx,ny]);
      }
    }
    let walks=0;
    for (let y=0;y<map.h;y++) for (let x=0;x<map.w;x++) if(!solid(map.rows[y][x])) walks++;
    assert.equal(seen.size, walks, map.name + ' may not disconnect any walkable tile');
    for (const f of map.foes) {
      assert.ok(seen.has(cell(f.x)+','+cell(f.y)), map.name + ' foe can be reached');
    }
    assert.ok(seen.has(cell(map.door.x)+','+cell(map.door.y)), map.name + ' door reachable');
    assert.ok(!fires.some(([x,y])=>x===cell(map.start.x)&&y===cell(map.start.y)));
  }
});

test('lighting pass preserves current crisp camera and boss introductions', () => {
  assert.match(html, /ZOOM = 1;/, 'camera remains integer-zoom');
  assert.doesNotMatch(html, /function pixelateWorld\(/, 'blurred resampling remains deleted');
  assert.match(html, /function drawVeil2\(\) \{ veil\(0\.68,/);
  assert.match(html, /function drawVeil\(\) \{ veil\(0\.34,/);
  assert.match(html, /const LIGHT_STEPS = /);
  assert.match(html, /const FIRE_STEPS = /);
  assert.match(html, /drawParts\(\);\s*ctx\.restore\(\);\s*\/\/[^\n]*\n\s*drawVeil2\(\);/);
  assert.match(html, /function ambientEmbers\(dt\)/);
  assert.match(html, /if \(!p\.rises\) p\.vy \+= 180 \* dt/);
  assert.doesNotMatch(html, /Pixel\.atmosphere\(ctx, map, cam/,'avoid duplicate gradient lighting');
  assert.match(html, /function showBossIntro\(kind\)/, 'newer boss intros remain');
  assert.match(html, /id="bossPortrait"/);
  assert.match(pixelArt, /if \(\(h % 5\) < 2\)/, 'floor seams are sparse');
});

test('Act II and Act I draw lighting before HUD, keeping text crisp', () => {
  const stage = html.slice(html.indexOf('function frame(now) {'), html.indexOf('requestAnimationFrame(frame);\n\ntry {'));
  assert.match(stage, /drawWorld2\(\); ctx\.setTransform\(1, 0, 0, 1, 0, 0\); drawHUD2\(\)/);
  assert.match(stage, /drawWorld\(\); ctx\.setTransform\(1, 0, 0, 1, 0, 0\); drawHUD\(\)/);
  assert.ok(html.indexOf('function drawWorld2() {') < html.indexOf('function drawVeil2()'));
});
