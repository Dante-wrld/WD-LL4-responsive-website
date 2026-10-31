'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=path.join(__dirname,'../public/touch-controls.js');

test('legacy controls are anchored in game stage, not a full-width bottom dock',()=>{
 const source=fs.readFileSync(file,'utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/stage\.appendChild\(layer\)/);
 assert.match(source,/#chamTouch\{position:absolute;inset:0;/);
 assert.match(source,/#chamActions\{position:absolute;right:/);
 assert.doesNotMatch(source,/body\.cham-touch-live/);
 assert.doesNotMatch(source,/document\.body\.appendChild\(layer\)/);
 assert.doesNotMatch(source,/--touch-h/);
});
test('legacy joystick appears only on touch and action buttons remain',()=>{
 const source=fs.readFileSync(file,'utf8');
 assert.match(source,/#chamStick\.show\{opacity:1/);
 assert.match(source,/#chamStick\{[^']*opacity:0/);
 for(const id of ['chamStickZone','chamA','chamB','chamC','chamD'])
  assert.ok(source.includes(id),'missing '+id);
 for(const key of ['KeyW','KeyD','KeyE','KeyF','Space','KeyJ','KeyK'])
  assert.ok(source.includes("'"+key+"'"),'missing '+key);
});
