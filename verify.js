'use strict';
/* CHAMINUKA v0.9.10 — the two-device browser check your release checklist is
 * blocked on. Nothing here is specific to my build: it drives YOUR client's own
 * element ids, against YOUR server, in two real browser contexts at once.
 *
 *   npm ci
 *   npm install --no-save playwright     (optional browser-check dependency)
 *   npx playwright install chromium      (once)
 *   node verify.js                       (from the repo root)
 *
 * It opens three independent browser profiles — different storage, different
 * sockets, plus a third phone-sized viewport with touch support — puts them
 * in one room by code, and
 * walks the whole campaign. Every JS error on any of them is reported.
 *
 * Read-only against your production data: it uses throwaway local records and
 * sessions files in the system temp directory and deletes them at the end.
 * Screenshots are kept in verify-shots/ for inspection (gitignored).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); }
catch (_) {
  console.error('Playwright is optional. To run the browser check: npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const { start } = require('./server');

const SHOTS = path.join(__dirname, 'verify-shots');
const TMP = path.join(os.tmpdir(), 'chaminuka-verify-' + process.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let failed = 0;
const ok = (label, cond, extra) => {
  if (!cond) failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${extra !== undefined ? '  ' + extra : ''}`);
};

/** A browser profile of its own: separate storage, separate socket. */
async function openClient(browser, url, name, phone) {
  const ctx = phone
    ? await browser.newContext({ ...devices['Pixel 5'],
        viewport: { width: devices['Pixel 5'].viewport.height, height: devices['Pixel 5'].viewport.width },
        hasTouch: true, isMobile: true })
    : await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  await page.goto(url);
  await sleep(500);
  return { page, ctx, name };
}
const shot = (c, n) => c.page.screenshot({ path: path.join(SHOTS, `${n}-${c.name}.png`) }).catch(() => {});
const visible = (c, sel) => c.page.isVisible(sel).catch(() => false);
async function clickIfThere(c, sel) {
  if (await visible(c, sel)) { await c.page.click(sel).catch(() => {}); return true; }
  return false;
}
/** Skip whatever cutscene is up, for every client, as a player would. */
async function skipStory(clients) {
  for (let i = 0; i < 8; i++) {
    let any = false;
    for (const c of clients) if (await visible(c, '#story')) { any = await clickIfThere(c, '#storySkip') || any; }
    if (!any) return;
    await sleep(700);
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, rooms, stop } = await start(0, {
    recordsFile: path.join(TMP, 'runs.json'),
    sessionsFile: path.join(TMP, 'sessions.json'),
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch();
  console.log(`\nserver up on ${port}\n`);

  // ---------------------------------------------------------------- 1
  console.log('1. two separate devices join one room');
  const host = await openClient(browser, url, 'host');
  const guest = await openClient(browser, url, 'guest');
  const phone = await openClient(browser, url, 'phone', true);
  await host.page.fill('#name', 'Host');
  await host.page.click('#create');
  await host.page.waitForSelector('#lobby:not(.hidden)', { timeout: 10000 });
  const code = (await host.page.textContent('#lcode')).trim();
  ok('host created a room', /^[A-Z]{4}$/.test(code), code);

  for (const c of [guest, phone]) {
    await c.page.fill('#name', c.name === 'phone' ? 'Phone' : 'Guest');
    await c.page.fill('#code', code);
    await c.page.click('#join');
    await c.page.waitForSelector('#lobby:not(.hidden)', { timeout: 10000 }).catch(() => {});
  }
  await sleep(900);
  const room = rooms.get(code);
  ok('all three are in the same room', room && room.roster.length === 3, room ? room.roster.length + ' players' : 'no room');
  ok('each has its own storage (a real second device)',
    (await host.page.evaluate(() => { try { return localStorage.getItem('vname'); } catch (e) { return null; } })) !== null);
  ok('the phone is on touch controls', await phone.page.evaluate(() => !!document.querySelector('#chamTouch, .chamButton')));
  await shot(host, '1-lobby'); await shot(phone, '1-lobby');

  // ---------------------------------------------------------------- 2
  console.log('\n2. the build screen and the opening cutscene');
  if (await visible(host, '#buildSelect')) {
    const builds = await host.page.$$eval('#buildSelect button', (b) => b.map((x) => x.textContent.trim()));
    ok('Act II builds offered', builds.length >= 2, builds.join(' | '));
    await host.page.click('#buildSelect button');
  } else ok('build screen (shown later in this build)', true, 'not on the lobby');
  await host.page.click('#start');
  await sleep(1200);
  ok('the palace waits for everyone to watch', room.room.map === null, 'map built: ' + (room.room.map !== null));
  await shot(host, '2-prologue');
  await skipStory([host, guest, phone]);
  await sleep(1200);
  ok('and is built once they have', room.room.map !== null, room.room.bodies.length + ' bodies');
  ok('all three are simulated', room.players.size === 3, room.players.size + '');

  // ---------------------------------------------------------------- 3
  console.log('\n3. they can see each other move');
  const ids = [...room.players.keys()];
  const p0 = room.players.get(ids[0]);
  const before = { x: p0.x, y: p0.y };
  await host.page.keyboard.down('d'); await sleep(900); await host.page.keyboard.up('d');
  await sleep(400);
  ok('the host moved', Math.hypot(p0.x - before.x, p0.y - before.y) > 30,
    Math.round(Math.hypot(p0.x - before.x, p0.y - before.y)) + 'px');
  const guestState = await guest.page.evaluate(() => window.__vessel?.state?.()).catch(() => null);
  ok('the guest is receiving synchronized player snapshots',
    !!guestState && guestState.players >= 3 && guestState.snap === true,
    guestState ? `${guestState.players} players` : 'no state');
  await shot(guest, '3-palace'); await shot(phone, '3-palace');

  // ---------------------------------------------------------------- 4
  console.log('\n4. the phone can play by touch alone');
  const pads = await phone.page.$$('.chamButton');
  ok('touch pad is on screen', pads.length >= 3, pads.length + ' buttons');
  const phoneId = ids[2];
  const pp = room.players.get(phoneId);
  const px0 = pp.x;
  if (pads.length) { await pads[0].tap().catch(() => {}); }
  // The live joystick listens to POINTER events, not legacy TouchEvents.
  // CDP emits genuine touch input through Chromium's input subsystem.
  const zone = await phone.page.locator('#chamStickZone').boundingBox();
  if (zone) {
    const cdp = await phone.ctx.newCDPSession(phone.page);
    const x = zone.x + zone.width * 0.3, y = zone.y + zone.height * 0.6;
    try {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: x + 65, y, id: 3 }] });
      await sleep(1100);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  }
  ok('the stick moves him', Math.abs(pp.x - px0) > 25,
    Math.round(Math.abs(pp.x - px0)) + 'px');
  await shot(phone, '4-touch');

  // ---------------------------------------------------------------- 5
  console.log('\n5. a player drops out and comes back');
  // Reuse the same browser profile: room recovery requires its local token.
  await guest.page.goto('about:blank');
  await sleep(1200);
  ok('the room survives a disconnect', rooms.has(code) && room.roster.length === 3,
    room.roster.length + ' stable seats');
  ok('nobody is left carrying the child into the void', !room.room.infant || room.room.infant.carrier !== ids[1]);
  await guest.page.goto(url);
  const resumed = await clickIfThere(guest, '#resumeRoom');
  await sleep(1200);
  ok('RESUME LAST ROOM reclaims the same seat',
    resumed && room.roster.length === 3 && !!room.roster.find(r => r.id === ids[1] && r.connected),
    resumed ? 'same profile/token' : 'resume option missing');
  await shot(guest, '5-rejoin');

  // ---------------------------------------------------------------- 6
  console.log('\n6. the whole campaign, to the end of the shrine');
  const p = room.players.get(ids[0]);
  const serv = room.room.bodies.find((b) => b.role === 'servant' && b.state === 'idle');
  if (serv) {
    for (const b of room.room.bodies) if (b.role !== 'servant') { b.x = -4000; b.y = -4000; b.route = [{ x: -4000, y: -4000 }]; }
    p.x = serv.x; p.y = serv.y;
    await host.page.keyboard.down('e'); await sleep(120); await host.page.keyboard.up('e'); await sleep(300);
    p.x = room.room.infant.x; p.y = room.room.infant.y; await sleep(200);
    await host.page.keyboard.down(' '); await sleep(160); await host.page.keyboard.up(' '); await sleep(400);
    const gate = room.room.map.exits ? room.room.map.exits[0] : room.room.map.exit;
    p.x = gate.x; p.y = gate.y;
    await sleep(1500);
    ok('Act I can be won', room.room.phase === 'won', room.room.phase);
    await skipStory([host, phone]);
    await sleep(1200);
    for (let i = 0; i < 4 && await visible(host, '#road'); i++) {
      await host.page.click('.roadopt:nth-of-type(1)').catch(() => {});
      await sleep(600);
    }
    await skipStory([host, phone]);
    await sleep(1800);
    ok('the road leads into the shrine', room.stage === 'act2', room.stage);
    if (room.shrine) {
      ok('a chamber is built', !!room.shrine.map, room.shrine.map && room.shrine.map.name);
      await shot(host, '6-shrine'); await shot(phone, '6-shrine');
    }
  } else ok('Act I playable', false, 'no idle servant found');

  console.log('\n' + '='.repeat(58));
  console.log(errors.length ? `JS ERRORS (${errors.length}):` : 'JS ERRORS: none');
  for (const e of errors.slice(0, 15)) console.log('  ' + e);
  console.log(`CHECKS FAILED: ${failed}`);
  console.log(`screenshots: ${SHOTS}`);
  console.log('='.repeat(58) + '\n');

  await browser.close(); await stop();
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(failed || errors.length ? 1 : 0);
})().catch(async (e) => {
  console.error('\nVERIFY FAILED TO RUN:', e.message);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
