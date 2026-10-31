'use strict';
/* THE SHRINE AT MAVAMBO — Act II's ground. Four chambers, fought in order.
 *
 * Each is hand-authored and small enough to read at a glance: you should be able
 * to see every enemy in the room when you walk in, because the interesting
 * decision is what to do about them, not where they are hiding.
 *
 * Pillars ('T') block sight as well as movement, which is what makes stepping
 * out of your body useful here — an empty body behind a pillar is an empty body
 * nobody is walking up to.
 */
const { TILE } = require('./grid');
const px = (t) => t * TILE + TILE / 2;

/** The king's men. Two kinds and a wall; nothing else. */
/* `commit` is where he begins his wind-up; `reach` is where the blow lands. A
 * melee foe must commit from FURTHER OUT than the player's own reach, or the
 * player simply kills him from a step beyond his threshold and takes nothing —
 * which is precisely how holding the attack button used to win fights. */
const FOES = {
  spearman: { name: 'Spearman', hp: 2, speed: 112, commit: 78, reach: 58, dmg: 1, tell: 0.42, swing: 0.12, rest: 0.5,
    notice: 205, cone: 0.62, col: '#c2714f', ranged: false },
  hunter: { name: 'Hunter', hp: 1, speed: 100, commit: 300, reach: 300, dmg: 1, tell: 0.7, swing: 0.1, rest: 1.2,
    notice: 275, cone: 0.44, col: '#8f9f5a', ranged: true, keep: 190 },
  captain: { name: 'Captain of the Guard', hp: 7, speed: 102, commit: 100, reach: 78, dmg: 2, tell: 0.95, swing: 0.2, rest: 1.05,
    notice: 245, cone: 0.72, col: '#b05070', ranged: false },
};

const W = 30, H = 19;

/** Blank room with a stone border. */
function blank() {
  const g = [];
  for (let j = 0; j < H; j++) {
    let row = '';
    for (let i = 0; i < W; i++) row += (i === 0 || j === 0 || i === W - 1 || j === H - 1) ? '#' : '.';
    g.push(row.split(''));
  }
  return g;
}
const put = (g, i, j, c) => { if (g[j] && g[j][i] !== undefined) g[j][i] = c; };
const pillar = (g, i, j) => { put(g, i, j, 'T'); };

/** The four chambers. Enemy counts rise; so does the amount of cover, because a
 *  harder room you cannot break line of sight in is just a worse room. */
const CHAMBERS = [
  {
    name: 'THE OUTER COURT', line: 'They came at first light and the mediums did not run.',
    pillars: [[8, 6], [8, 12], [21, 6], [21, 12]],
    foes: [['spearman', 20, 6], ['spearman', 20, 12]],
  },
  {
    name: 'THE DRUM HOUSE', line: 'The drums are still standing. Nobody is beating them.',
    pillars: [[7, 5], [7, 13], [14, 7], [14, 11], [22, 5], [22, 13]],
    foes: [['spearman', 21, 5], ['spearman', 21, 13], ['hunter', 25, 9]],
  },
  {
    name: 'THE GRAIN STORE', line: 'Sacks to your waist, and men between them.',
    // One bow, not two. Two archers firing while two spearmen pin you is more
    // than a single dodge cooldown can answer, and it killed careful play stone
    // dead in testing while rewarding blind aggression.
    // nothing sits on row 9: that is the line from the way in to the way out, and
    // a pillar parked on it reads as a dead end rather than as cover
    pillars: [[6, 4], [6, 14], [10, 7], [10, 11], [18, 4], [18, 14], [23, 6], [23, 12]],
    foes: [['spearman', 15, 4], ['spearman', 15, 14], ['hunter', 25, 5]],
  },
  {
    name: 'THE INNER SHRINE', line: 'The man who gave the order sent his captain instead.',
    pillars: [[9, 5], [9, 13], [13, 4], [13, 14], [20, 5], [20, 13], [16, 7], [16, 11], [24, 4], [24, 14]],
    foes: [['captain', 23, 9], ['spearman', 19, 5], ['hunter', 25, 13]],
  },
];

/** Build chamber n (0-based, clamped to the last). */
function chamber(n) {
  const spec = CHAMBERS[Math.min(n, CHAMBERS.length - 1)];
  const g = blank();
  for (const [i, j] of spec.pillars) pillar(g, i, j);
  // the way in behind you, and the way on once the room is clear
  put(g, 0, 9, '.'); put(g, W - 1, 9, '.');
  return {
    name: spec.name,
    line: spec.line,
    index: n,
    last: n >= CHAMBERS.length - 1,
    w: W, h: H,
    rows: g.map((r) => r.join('')),
    doors: [], zones: [],
    start: { x: px(2), y: px(9) },
    door: { x: px(W - 1), y: px(9), r: 40 },     // opens only once the room is clear
    foes: spec.foes.map(([kind, i, j], k) => ({
      id: 1 + k, kind, x: px(i), y: px(j), home: { x: px(i), y: px(j) },
    })),
  };
}

module.exports = { chamber, CHAMBERS, FOES, px, W, H };
