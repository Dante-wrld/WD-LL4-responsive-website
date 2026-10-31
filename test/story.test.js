'use strict';
/* The cinematics layer, merged forward from the v0.6.2 branch. Two things are
 * being tested: that the media the scenes ask for actually exists, and that a
 * cutscene can never leave the game stuck — which is the failure mode that
 * matters, because a barrier that waits on somebody who has gone is a dead room. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Session } = require('../campaign');
const { SCENES, scenes, reel, mediaUsed, STORY_TIMEOUT } = require('../story');
const { NIGHTS } = require('../road');
const { start } = require('../server');
const { TICK } = require('../vessel');

const PUB = path.join(__dirname, '..', 'public');
const run = (s, secs) => { for (let i = 0; i < Math.round(secs * TICK); i++) s.tick(); };

function mk(n = 1) {
  const sent = [];
  const s = new Session('ST', (pid, m) => sent.push(m));
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(s.newPlayer('P' + (i + 1)));
  return { s, ps, sent };
}

// ---------------------------------------------------------------- the media
test('every clip and still a scene asks for is actually in the build', () => {
  const { videos, stills } = mediaUsed();
  assert.ok(videos.length >= 4, 'the footage is used: ' + videos.join(','));
  for (const v of videos) {
    const f = path.join(PUB, 'assets', 'video', v + '.mp4');
    assert.ok(fs.existsSync(f), `missing clip: ${v}.mp4`);
    assert.ok(fs.statSync(f).size > 100000, `${v}.mp4 is suspiciously small`);
  }
  for (const s of stills) {
    const f = path.join(PUB, 'assets', s + '.webp');
    assert.ok(fs.existsSync(f), `missing still: ${s}.webp`);
  }
});

test('every video scene has a still behind it, so a refused autoplay still shows something', () => {
  for (const key of Object.keys(SCENES)) {
    for (const s of SCENES[key]) {
      assert.ok(s.still, `${key}: a scene with no still to fall back on`);
      assert.ok(s.title && s.text, `${key}: a scene with nothing to read`);
    }
  }
});

test('the full 41 seconds of the original opening play before the palace', () => {
  const LENGTH = { 'kingdom-at-night': 29, 'sixteen-years-later': 12,
    'healing-vision': 20, 'warrior-vision': 10 };
  const movies = scenes('prologue').filter(s => s.video);
  assert.deepEqual(movies.map(s => s.video), ['kingdom-at-night', 'sixteen-years-later']);
  assert.ok(movies.every(s => !s.to), 'no prologue footage gets cut short');
  assert.equal(movies.reduce((sum, s) => sum + LENGTH[s.video], 0), 41);
  const full = reel().find(s => s.video === 'kingdom-at-night');
  assert.ok(full && !full.to);
});

test('the preview reel is the whole story, in order, and changes nothing', () => {
  const r = reel();
  const keys = Object.keys(SCENES).reduce((n, k) => n + SCENES[k].length, 0);
  assert.equal(r.length, keys, 'every scene is in the reel');
  assert.equal(r[0].video, 'kingdom-at-night', 'it opens on the kingdom');
  assert.equal(r[r.length - 1].video, 'warrior-vision', 'and ends on what is still ahead');
});

// ---------------------------------------------------------------- the barrier
test('the palace is not built until everybody has watched the opening', () => {
  const { s, ps, sent } = mk(2);
  s.start(ps[0].id);
  assert.equal(s.phase, 'prologue');
  assert.equal(s.room.map, null, 'no palace yet');
  assert.equal(s.room.bodies.length, 0, 'and nobody in it');
  const msg = sent.filter((m) => m.t === 'story').pop();
  assert.equal(msg.key, 'prologue');
  assert.ok(msg.scenes.length, 'with something to watch');
  s.seen(ps[0].id);
  assert.equal(s.room.map, null, 'one of two is not enough');
  s.seen(ps[1].id);
  assert.ok(s.room.map, 'and now the palace exists');
  assert.ok(s.room.bodies.length > 0);
});

test('a player who walks away cannot hold the party on a cutscene forever', () => {
  const { s, ps } = mk(2);
  s.start(ps[0].id);
  s.seen(ps[0].id);
  assert.equal(s.phase, 'prologue', 'still waiting on the other one');
  s.story.until = s.clock() - 1;          // as if the fail-safe had run out
  s.tick();
  assert.ok(s.room.map, 'the game goes on without him');
});

test('and a player who disconnects stops being waited for at all', () => {
  const { s, ps } = mk(2);
  s.start(ps[0].id);
  s.seen(ps[0].id);
  assert.equal(s.phase, 'prologue');
  s.removePlayer(ps[1].id);
  assert.ok(s.room.map, 'his leaving releases the rest');
});

test('somebody joining mid-cutscene is shown the cutscene, not an empty palace', () => {
  const { s, ps, sent } = mk(1);
  s.start(ps[0].id);
  const late = s.newPlayer('Late');
  sent.length = 0;
  s.syncTo(late.id);
  const msg = sent.find((m) => m.t === 'story');
  assert.ok(msg, 'he is handed the cutscene');
  assert.equal(msg.key, 'prologue');
  assert.equal(s.room.map, null, 'and the palace still is not built');
  s.seen(ps[0].id); s.seen(late.id);
  assert.ok(s.room.map, 'both of them watching starts it');
});

test('the footage sits on the seams this build actually has', () => {
  const { s, ps, sent } = mk(1);
  s.start(ps[0].id); s.seen(ps[0].id);
  // win the palace
  const p = s.players.get(ps[0].id);
  const serv = s.room.bodies.find((b) => b.role === 'servant');
  for (const b of s.room.bodies) if (b.role !== 'servant') { b.x = -4000; b.y = -4000; b.route = [{ x: -4000, y: -4000 }]; }
  p.x = serv.x; p.y = serv.y;
  s.setInput(ps[0].id, { use: true }); s.tick(); s.setInput(ps[0].id, {}); s.tick();
  p.x = s.room.infant.x; p.y = s.room.infant.y; s.tick();
  s.setInput(ps[0].id, { take: true }); s.tick(); s.setInput(ps[0].id, {}); s.tick();
  const g = s.room.map.exits[0];
  p.x = g.x; p.y = g.y; s.setInput(ps[0].id, {}); s.tick();
  assert.equal(s.room.phase, 'won');
  run(s, 5);
  assert.equal(s.story.key, 'escape', 'the palace win has a card of its own');
  s.seen(ps[0].id);
  assert.equal(s.stage, 'road');
  for (const n of NIGHTS) s.choose(ps[0].id, n.options[0].key);
  assert.equal(s.story.key, 'jump', 'and the sixteen years play on the jump');
  const jumpScenes = scenes('jump').map((x) => x.video || x.still);
  assert.ok(jumpScenes.includes('sixteen-years-later'), 'with the right clip: ' + jumpScenes.join(','));
  s.seen(ps[0].id);
  assert.equal(s.stage, 'act2', 'and then the shrine');
  assert.equal(s.story, null, 'with nothing left on screen');
});

test('no cutscene is ever the last thing standing between a player and the game', () => {
  // every barrier this build raises must be released by watching it, by the
  // fail-safe, or by everybody leaving — never none of the three
  for (const key of Object.keys(SCENES)) {
    const { s, ps } = mk(1);
    let released = false;
    s.playStory(key, () => { released = true; });
    assert.ok(s.story, key + ': a barrier went up');
    s.story.until = s.clock() - 1;
    s.tick();
    assert.ok(released, key + ': it never came down on its own');
  }
  assert.ok(STORY_TIMEOUT > 0 && STORY_TIMEOUT < 300, 'and the fail-safe is a sane length');
});

// ---------------------------------------------------------------- streaming
test('video is served with byte ranges, and a nonsense range is refused cleanly',
  { timeout: 20000 }, async () => {
  const { server, stop } = await start(0, { recordsFile: '/tmp/story-test-runs.json' });
  const port = server.address().port;
  const get = (p, headers, method) => new Promise((res) => {
    const r = http.request({ port, path: p, headers, method: method || 'GET' }, (x) => {
      let n = 0; x.on('data', (d) => { n += d.length; });
      x.on('end', () => res({ code: x.statusCode, h: x.headers, bytes: n }));
    });
    r.end();
  });
  try {
    const V = '/assets/video/kingdom-at-night.mp4';
    const whole = await get(V, {});
    assert.equal(whole.code, 200);
    assert.equal(whole.h['accept-ranges'], 'bytes', 'the server advertises seeking');
    assert.equal(whole.h['content-type'], 'video/mp4');

    const head = await get(V, {}, 'HEAD');
    assert.equal(head.code, 200);
    assert.equal(head.bytes, 0, 'HEAD sends no body');
    assert.equal(head.h['content-length'], whole.h['content-length'], 'but the right length');

    const part = await get(V, { Range: 'bytes=0-1023' });
    assert.equal(part.code, 206);
    assert.equal(part.bytes, 1024, 'exactly the bytes asked for');
    assert.match(part.h['content-range'], /^bytes 0-1023\/\d+$/);

    const tail = await get(V, { Range: 'bytes=-500' });
    assert.equal(tail.code, 206);
    assert.equal(tail.bytes, 500, 'a suffix range works too');

    for (const bad of ['bytes=99999999-', 'bytes=500-100', 'bytes=abc', 'bytes=-']) {
      const r = await get(V, { Range: bad });
      assert.equal(r.code, 416, `${bad} should be refused`);
      assert.match(r.h['content-range'], /^bytes \*\/\d+$/, 'and say how long the file really is');
    }

    const still = await get('/assets/birth.webp', {});
    assert.equal(still.code, 200);
    assert.equal(still.h['content-type'], 'image/webp');
    assert.equal((await get('/../package.json', {})).code, 403, 'and nothing escapes the public folder');
  } finally { await stop(); fs.rmSync('/tmp/story-test-runs.json', { force: true }); }
});
