'use strict';
/* Three of the seventeen bodies in the palace started inside a wing their own
 * role can never walk out of, and two more patrolled to a waypoint behind a door
 * they cannot open:
 *
 *   Garai   (soldier) nursery      — nursery doors are priest + captain
 *   Mazvita (servant) nursery      — same
 *   Shungu  (soldier) service wing — servant + captain only
 *
 * A player who wears a sealed body is stuck there for the whole 48-second host
 * clock with no explanation, and a guard with an unreachable waypoint spends the
 * game shoving at a door. This test fails on v0.9.10.
 */
const test = require('node:test');
const assert = require('node:assert');
const { palace } = require('../palace');
const { walkDist, TILE } = require('../grid');

test('no body is sealed in, and every body can walk its own whole beat', () => {
  const m = palace();
  const hall = { x: 20 * TILE + 16, y: 11 * TILE + 16 };   // the public spine
  for (const b of m.bodies) {
    assert.ok(Number.isFinite(walkDist(m, b.route[0], hall, b.role)),
      `${b.name} the ${b.role} starts somewhere his own role can never walk out of`);
    for (let k = 1; k < b.route.length; k++) {
      assert.ok(Number.isFinite(walkDist(m, b.route[0], b.route[k], b.role)),
        `${b.name} the ${b.role} patrols to a point his own role cannot reach, `
        + 'so he spends the game pressed against a door');
    }
  }
});
