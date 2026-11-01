'use strict';
// Actual Chromium mobile-input smoke test. No production room or user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, devices } = require('playwright');
const { start } = require('../server');
const pause = (ms) => new Promise(r=>setTimeout(r,ms));

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'cham-touch-smoke-'));
  let instance, browser, context;
  try {
    instance = await start(0, {recordsFile:path.join(dir,'records.json'),sessionsFile:path.join(dir,'sessions.json')});
    browser = await chromium.launch({headless:true});
    context = await browser.newContext({...devices['Pixel 5'],hasTouch:true,isMobile:true});
    await context.addInitScript(()=>localStorage.setItem('cham-touch','0'));
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+instance.server.address().port+'/');
    await page.waitForSelector('#chamToggle');
    await page.evaluate(()=>{
      window.__touchCodes=[];
      window.addEventListener('keydown',e=>window.__touchCodes.push('down:'+e.code));
      window.addEventListener('keyup',e=>window.__touchCodes.push('up:'+e.code));
      window.__vessel.state=()=>({phase:'run',act:2,me:{form:'self'}});
      document.getElementById('title').classList.add('hidden');
    });
    await pause(350);
    assert.equal(await page.locator('#chamToggle').isVisible(),true,'toggle available while game runs');
    assert.match(await page.locator('#chamToggle').textContent(),/OFF/);
    await page.locator('#chamToggle').tap();
    await pause(250);
    assert.match(await page.locator('#chamToggle').textContent(),/ON/);
    assert.equal(await page.locator('#chamTouch').evaluate(el=>el.classList.contains('live')),true);
    assert.equal(await page.locator('#chamRotate').evaluate(el=>getComputedStyle(el).pointerEvents),'none',
      'portrait hint cannot block buttons');

    for (const [button,key] of [['#chamA','KeyJ'],['#chamB','KeyK'],['#chamC','KeyE'],['#chamD','KeyF']]) {
      await page.locator(button).tap();
      await pause(180);
      const events=await page.evaluate(()=>window.__touchCodes.slice());
      assert.ok(events.includes('down:'+key),button+' did not trigger '+key);
      assert.ok(events.includes('up:'+key),button+' did not release '+key);
    }
    const zone=await page.locator('#chamStickZone').boundingBox();
    assert.ok(zone,'joystick zone exists');
    const startX=zone.x+Math.max(28,zone.width*0.26), startY=zone.y+zone.height*0.44;
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y:startY,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX+62,y:startY-28,id:1}]});
    await pause(170);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await pause(170);
    await cdp.detach();
    const events=await page.evaluate(()=>window.__touchCodes.slice());
    assert.ok(events.includes('down:KeyD'),'moving joystick right holds direction');
    assert.ok(events.includes('up:KeyD'),'releasing joystick stops direction');
    assert.equal(await page.locator('#chamStick').evaluate(el=>el.classList.contains('show')),false);
    // Start movement at the *upper* and *lower* left corners. Before this fix
    // the joystick zone was only the bottom 67% of the stage.
    for (const fy of [0.1, 0.9]) {
      const x=zone.x+zone.width*0.22, y=zone.y+zone.height*fy;
      const before=(await page.evaluate(()=>window.__touchCodes.length));
      const session=await context.newCDPSession(page);
      try {
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:6}]});
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+50,y,id:6}]});
        await pause(160);
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await pause(150);
      } finally {await session.detach();}
      const cornerEvents=await page.evaluate(i=>window.__touchCodes.slice(i),before);
      assert.ok(cornerEvents.includes('down:KeyD'),'left '+fy+' corner movement failed');
      assert.ok(cornerEvents.includes('up:KeyD'),'left '+fy+' corner release failed');
    }
    await page.locator('#chamToggle').tap();
    await pause(150);
    assert.equal(await page.locator('#chamTouch').evaluate(el=>el.classList.contains('live')),false);
    assert.equal(await page.locator('#chamToggle').isVisible(),true,'OFF control remains recoverable');
    assert.deepEqual(errors,[],'no browser JavaScript errors');
    console.log('PASS: portrait touch is accessible; all four actions fire and release; joystick returns to neutral; toggle can recover in game');
  } finally {
    if(context)await context.close();
    if(browser)await browser.close();
    if(instance)await instance.stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
run().catch(e=>{console.error('TOUCH SMOKE FAILED:',e.stack||e);process.exitCode=1;});
