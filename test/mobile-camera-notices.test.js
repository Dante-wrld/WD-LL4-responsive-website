'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'),'utf8');
const touch = fs.readFileSync(path.join(__dirname,'../public/touch-controls.js'),'utf8');
const vessel = fs.readFileSync(path.join(__dirname,'../vessel.js'),'utf8');

test('left-side floating joystick spans full playfield for landscape and portrait', () => {
  assert.match(touch, /#chamStickZone\{position:absolute;left:0;top:0;bottom:0;width:50%;height:100%/);
  assert.match(touch, /const r=stage.getBoundingClientRect\(\)/);
  assert.match(touch, /ox=e.clientX;oy=e.clientY/);
  assert.match(touch, /zone.setPointerCapture\(e.pointerId\)/);
  assert.match(touch, /pointercancel/);
  assert.match(touch, /moving\(0,0\);stick.classList.remove\('show'\)/);
});

test('mobile camera shows 15% more world space and keeps rooms centered', () => {
  assert.match(html, /const ZOOM = mobileView \? 0\.85 : 1/);
  assert.match(html, /const VW = W \/ ZOOM, VH = H \/ ZOOM/);
  assert.match(html, /map\.w \* TILE <= VW \? \(map\.w \* TILE - VW\) \/ 2/);
  assert.match(html, /map\.h \* TILE <= VH \? \(map\.h \* TILE - VH\) \/ 2/);
  assert.doesNotMatch(html, /pixelateWorld\(\)/);
});

test('tether and possessed-host warning events belong only to the affected player', () => {
  assert.match(vessel, /THE TETHER PULLS'[^;\n]*p\.id/);
  assert.match(vessel, /IS STIRRING[^;\n]*p\.id/);
  assert.match(html, /if \(ev\[3\] != null && ev\[3\] !== myId\) break/);
  assert.match(html, /TETHER EXPIRED · returned to the cradle/);
  assert.match(html, /else if \(mobileView\) toast/);
});
