'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('mobile controller is valid JavaScript and the page loads it',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/touch-controls.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(html,/<script src="\/touch-controls\.js" defer><\/script>/);
 assert.match(html,/state: \(\) => \(\{ phase, act, map:/);
});
test('touch controller exposes input for both story acts without replacing gameplay',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/touch-controls.js'),'utf8');
 for(const key of ['KeyW','KeyA','KeyS','KeyD','KeyE','KeyF','Space','ShiftLeft','KeyJ','KeyK'])
   assert.ok(js.includes("'"+key+"'"),'missing '+key);
 assert.match(js,/pointercancel/);
 assert.match(js,/pointermove/);
 assert.match(js,/visibilitychange/);
 assert.match(js,/chamRotate/);
});
