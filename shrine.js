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
  warden: { name: 'The Tomb Warden', hp: 11, speed: 85, commit: 110, reach: 86, dmg: 2,
    tell: 1.12, swing: 0.23, rest: 1.20, notice: 240, cone: 0.76, col: '#9f83ef', ranged: false, boss: true },
  warlord: { name: 'The Ash Warlord', hp: 17, speed: 94, commit: 118, reach: 91, dmg: 2,
    tell: 1.04, swing: 0.24, rest: 1.12, notice: 270, cone: 0.79, col: '#ec8f49', ranged: false, boss: true },
  echo: { name: 'The Echo of the Hunter', hp: 10, speed: 117, commit: 104, reach: 74, dmg: 1,
    tell: 0.85, swing: 0.18, rest: 0.9, notice: 240, cone: 0.65, col: '#8db7ff', ranged: false, boss: true },
  sentinel: { name: 'Ancestral Sentinel', hp: 14, speed: 90, commit: 112, reach: 84, dmg: 2,
    tell: 1.12, swing: 0.22, rest: 1.2, notice: 255, cone: 0.7, col: '#c2a1ff', ranged: false, boss: true },
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
/* Four wall-side braziers sit within the clear visible playfield, rather
 * than under the top and bottom HUD rails. Solid, so protect pathing. */
const BRAZIERS = [[2, 5], [2, H - 6], [W - 3, 5], [W - 3, H - 6]];

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


/** Optional Act III quest, entered after the existing four-room shrine ending.
 *  Rewards are chosen at the door and equipped on the party. A pair of bosses
 *  demands patient dodging, not impossible damage spikes. */
const DUNGEONS = [
  {
    name: 'THE FORSAKEN ARMORY',
    line: 'Old iron sleeps under the roots of Mavambo. His first real weapon waits among it.',
    pillars: [[8, 4], [8, 14], [16, 6], [16, 12], [23, 4], [23, 14]],
    foes: [['spearman', 19, 5], ['spearman', 20, 13], ['hunter', 25, 9]],
    rewards: ['bronze_spear', 'leather_vest'],
  },
  {
    name: 'THE HOLLOW CAVES',
    line: 'Each stone echoes his footsteps. The dead do not warn him which way is safe.',
    pillars: [[6, 5], [6, 13], [11, 7], [11, 11], [20, 4], [20, 14], [24, 7], [24, 11]],
    foes: [['spearman', 17, 4], ['hunter', 23, 5], ['spearman', 18, 14], ['hunter', 25, 13]],
    rewards: ['spirit_beads', 'iron_spear'],
  },
  {
    name: 'THE FIRST PROPHET’S TOMB',
    line: 'The guardian rises. There is no treasure without a trial of courage.',
    pillars: [[8, 5], [8, 13], [15, 4], [15, 14], [22, 4], [22, 14]],
    foes: [['warden', 23, 9], ['spearman', 17, 5], ['hunter', 25, 13]],
    boss: 'warden',
    rewards: ['warded_armor', 'moon_charm'],
  },
  {
    name: 'THE WHISPERING TREASURY',
    line: 'They buried this hoard to keep it from kings. He must choose what to carry.',
    pillars: [[7, 4], [7, 14], [12, 6], [12, 12], [20, 5], [20, 13], [24, 4], [24, 14]],
    foes: [['spearman', 17, 5], ['hunter', 24, 6], ['spearman', 19, 13]],
    rewards: ['forged_spear', 'ancestral_vest'],
  },
  {
    name: 'THE EMBER FORGE',
    line: 'The last smith worked without a king. His craft survives the flame.',
    pillars: [[7, 5], [7, 13], [12, 4], [12, 14], [18, 5], [18, 13], [24, 5], [24, 13]],
    foes: [['captain', 22, 9], ['hunter', 25, 5], ['hunter', 25, 13]],
    rewards: ['ember_charm', 'ancestral_spear'],
  },
  {
    name: 'THE THRONE OF ASH',
    line: 'The warlord guards the last gate. Strength alone will not defeat him.',
    pillars: [[7, 5], [7, 13], [12, 4], [12, 14], [17, 5], [17, 13], [23, 4], [23, 14]],
    foes: [['warlord', 23, 9], ['spearman', 19, 5], ['hunter', 25, 13]],
    boss: 'warlord',
    rewards: ['ancestral_spear', 'moon_charm'],
  },
];

/** Optional Act II mastery quest. A room's aspect is guaranteed when cleared;
 *  treasure remains a two-way choice. Training does not block the dungeon. */
const TRIALS = [
  {
    name: 'THE POOL OF REFLECTIONS',
    line: 'He must outrun the image of his own fear. The Panther Aspect awaits.',
    pillars: [[7, 4], [7, 14], [14, 7], [14, 11], [21, 5], [21, 13]],
    foes: [['spearman', 18, 5], ['hunter', 24, 10]],
    mastery: 'panther',
    rewards: ['bronze_spear', 'leather_vest'],
  },
  {
    name: 'THE HALL OF BREATH',
    line: 'The Echo of the Hunter tests how far a free spirit may fly. The Eagle Aspect awaits.',
    pillars: [[6, 4], [6, 14], [13, 6], [13, 12], [20, 5], [20, 13]],
    foes: [['echo', 22, 9], ['hunter', 25, 13]],
    boss: 'echo', mastery: 'eagle',
    rewards: ['spirit_beads', 'iron_spear'],
  },
  {
    name: 'THE ANCESTORS’ CIRCLE',
    line: 'An ancestral sentinel tests the courage to guard the body he leaves behind.',
    pillars: [[8, 5], [8, 13], [15, 4], [15, 14], [22, 5], [22, 13]],
    foes: [['sentinel', 23, 9], ['spearman', 18, 5]],
    boss: 'sentinel', mastery: 'ancestor',
    rewards: ['warded_armor', 'moon_charm'],
  },
];

/** Build a shrine, dungeon, or optional Act II training room. */

function chamber(n) {
  // Keep existing dungeon indexes stable for saved games and v0.10 tests.
  const trials = n >= CHAMBERS.length + DUNGEONS.length;
  const dungeon = !trials && n >= CHAMBERS.length;
  const index = trials ? Math.min(n - CHAMBERS.length - DUNGEONS.length, TRIALS.length - 1)
    : dungeon ? Math.min(n - CHAMBERS.length, DUNGEONS.length - 1) : Math.max(0, n);
  const spec = trials ? TRIALS[index] : dungeon ? DUNGEONS[index] : CHAMBERS[index];
  const g = blank();
  for (const [i, j] of spec.pillars) pillar(g, i, j);
  for (const [i, j] of BRAZIERS) put(g, i, j, 'o');
  // the way in behind you, and the way on once the room is clear
  put(g, 0, 9, '.'); put(g, W - 1, 9, '.');
  return {
    name: spec.name,
    line: spec.line,
    index: n, chapter: trials ? 'trials' : dungeon ? 'dungeon' : 'shrine',
    step: (trials || dungeon) ? index + 1 : n + 1,
    total: trials ? TRIALS.length : dungeon ? DUNGEONS.length : CHAMBERS.length,
    boss: spec.boss || null, rewards: spec.rewards || null, mastery: spec.mastery || null,
    last: trials ? index === TRIALS.length - 1 : dungeon ? index === DUNGEONS.length - 1 : n === CHAMBERS.length - 1,
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

module.exports = { chamber, CHAMBERS, DUNGEONS, TRIALS, FOES, px, W, H };
