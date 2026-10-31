'use strict';
/* The competitive layer. No PvP: your run against everyone else's run, which is
 * exactly how Hitman makes replaying one level worth doing. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Records } = require('../records');

let n = 0;
const tmp = () => path.join(os.tmpdir(), `vessel-rec-${process.pid}-${n++}.json`);

test('the boards rank by time, bodies worn and how quiet you stayed', () => {
  const file = tmp();
  try {
    const rec = new Records(file);
    rec.add({ by: 'Slow', won: true, secs: 400, bodies: 2, worst: 10 });
    rec.add({ by: 'Fast', won: true, secs: 90, bodies: 5, worst: 80 });
    rec.add({ by: 'Thrifty', won: true, secs: 300, bodies: 1, worst: 60 });
    rec.add({ by: 'Failed', won: false, secs: 20, bodies: 9, worst: 100 });
    const t = rec.top();
    assert.equal(t.fastest[0].by, 'Fast');
    assert.equal(t.fewest[0].by, 'Thrifty');
    assert.equal(t.quietest[0].by, 'Slow');
    assert.equal(t.runs, 4, 'every attempt counts toward the tally');
    assert.equal(t.wins, 3, 'but only wins make the boards');
    assert.ok(!t.fastest.some((r) => r.by === 'Failed'), 'a failed run is not a record');
  } finally { fs.rmSync(file, { force: true }); }
});

test('records survive a restart, which is what makes them worth chasing', () => {
  const file = tmp();
  try {
    const a = new Records(file);
    a.add({ by: 'Wrld', won: true, secs: 123.4, bodies: 2, worst: 30, gate: 'postern', mastery: ['swift'] });
    const b = new Records(file);                 // a fresh process, same file
    assert.equal(b.top().fastest.length, 1, 'the board came back');
    assert.equal(b.top().fastest[0].secs, 123.4);
    assert.equal(b.top().postern, 1, 'and it remembers which way he went out');
    const mine = b.best('Wrld');
    assert.equal(mine.wins, 1);
    assert.equal(mine.secs, 123.4);
    assert.equal(b.best('Nobody'), null, 'somebody who has never won has no best');
  } finally { fs.rmSync(file, { force: true }); }
});

test('a corrupt or missing file never takes the game down', () => {
  const file = tmp();
  try {
    assert.equal(new Records(file).top().runs, 0, 'no file at all is fine');
    fs.writeFileSync(file, '{{{not json');
    const r = new Records(file);
    assert.equal(r.top().runs, 0, 'and neither is a shredded one');
    r.add({ by: 'After', won: true, secs: 50, bodies: 1, worst: 5 });
    assert.equal(new Records(file).top().runs, 1, 'it just starts again');
  } finally { fs.rmSync(file, { force: true }); }
});

test('junk in a run record cannot poison the board', () => {
  const file = tmp();
  try {
    const r = new Records(file);
    const got = r.add({ by: '<script>x</script>'.repeat(9), won: 'yes', secs: NaN,
      bodies: 'lots', worst: Infinity, mastery: 'nope' });
    assert.ok(got.by.length <= 14, 'names are cut to size');
    assert.equal(got.secs, 0, 'a nonsense time becomes zero rather than NaN');
    assert.equal(got.bodies, 0);
    assert.ok(Array.isArray(got.mastery), 'mastery is always a list');
    assert.ok(JSON.parse(JSON.stringify(r.top())), 'and the board still serialises');
  } finally { fs.rmSync(file, { force: true }); }
});
