'use strict';
/*
 * The palace, built as an ACCESS PUZZLE rather than a stealth corridor.
 *
 * Each wing belongs to a role. Wearing the wrong body in the wrong wing is what
 * gets you noticed — not footsteps, not light. The infant starts in the nursery
 * (priests only) and must leave by the servants' door (servants only), so no
 * single body can do the job. You have to change who you are on the way.
 *
 * Geometry tiles: # wall  T pillar  . floor  o brazier (solid, lit)  D door
 */
const { TILE } = require('./grid');
const px = (t) => t * TILE + TILE / 2;

function grid(w, h) {
  const g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill('#'));
  return g;
}
const rect = (g, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
const put = (g, x, y, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
const scatter = (g, pts, c) => pts.forEach(([x, y]) => put(g, x, y, c));

/** Roles, their colours and what each one can do once. */
const ROLES = {
  priest: {
    name: 'Priest', col: '#c9a7ff', dark: '#6b4fa8',
    action: 'Blessing', actionKey: 'F',
    blurb: 'Tends the nursery. A blessing calms everyone\'s suspicion, yours included.',
  },
  soldier: {
    name: 'Soldier', col: '#d2a24c', dark: '#7d5a1c',
    action: 'Dismiss', actionKey: 'F',
    blurb: 'Walks the barracks and checkpoints. Can order someone off their post.',
  },
  servant: {
    name: 'Servant', col: '#79c7a4', dark: '#2f6e52',
    action: 'Summon', actionKey: 'F',
    blurb: 'The only hands that may carry a royal infant. Can call someone over.',
  },
  captain: {
    name: 'Captain', col: '#e06b5a', dark: '#8a2f22',
    action: 'Stand Down', actionKey: 'F',
    blurb: 'Goes anywhere — but everyone watches the captain, so suspicion never stops climbing.',
  },
};

function palace() {
  const W = 40, H = 24;
  const g = grid(W, H);

  // ---- carve the wings -----------------------------------------------------
  rect(g, 2, 2, 12, 9, '.');          // nursery
  rect(g, 15, 2, 25, 21, '.');        // great hall, the public spine
  rect(g, 2, 13, 12, 21, '.');        // barracks
  rect(g, 28, 2, 37, 21, '.');        // service corridor
  rect(g, 13, 5, 14, 6, '.');         // nursery passage
  rect(g, 13, 16, 14, 17, '.');       // barracks passage
  rect(g, 26, 11, 27, 12, '.');       // service passage
  rect(g, 13, 11, 14, 12, '.');       // hall link, public
  rect(g, 1, 19, 1, 20, '.');         // the postern alcove, cut into the outer wall

  // ---- role-gated doors ----------------------------------------------------
  put(g, 13, 5, 'D'); put(g, 13, 6, 'D');      // nursery door
  put(g, 13, 16, 'D'); put(g, 13, 17, 'D');    // barracks door
  put(g, 27, 11, 'D'); put(g, 27, 12, 'D');    // service door
  const doors = [
    { name: 'Nursery', tiles: [[13, 5], [13, 6]], roles: ['priest', 'captain'] },
    { name: 'Barracks', tiles: [[13, 16], [13, 17]], roles: ['soldier', 'captain'] },
    { name: 'Service', tiles: [[27, 11], [27, 12]], roles: ['servant', 'captain'] },
  ];

  // ---- furniture -----------------------------------------------------------
  scatter(g, [[4, 4], [10, 7], [20, 4], [20, 19], [5, 15], [10, 19], [31, 5], [34, 18]], 'o');
  scatter(g, [[17, 7], [23, 7], [17, 16], [23, 16], [6, 17], [9, 17], [31, 9], [34, 14]], 'T');

  // ---- who belongs where ---------------------------------------------------
  const zones = [
    { name: 'the nursery', x0: 2, y0: 2, x1: 12, y1: 9, roles: ['priest', 'captain'] },
    { name: 'the barracks', x0: 2, y0: 13, x1: 12, y1: 21, roles: ['soldier', 'captain'] },
    { name: 'the service corridor', x0: 28, y0: 2, x1: 37, y1: 21, roles: ['servant', 'captain'] },
    // the great hall is public: anyone may stand there
  ];

  return {
    w: W, h: H, rows: g.map((r) => r.join('')), name: 'The Palace of Dzimbahwe',
    doors, zones,
    spiritStart: { x: px(7), y: px(6) },          // you wake as a spirit beside the cradle
    infant: { x: px(5), y: px(6) },               // the cradle, deep in the nursery
    // Two ways out, and they want different bodies. The servants' door is the
    // long safe road; the postern is short but sits inside the barracks, so you
    // must be a soldier to reach it — and a soldier holding an infant is damning.
    exits: [
      { x: px(37), y: px(20), r: 44, name: 'the servants\u2019 door', key: 'servants', hint: 'a servant may carry him unremarked' },
      { x: px(1), y: px(20), r: 40, name: 'the postern gate', key: 'postern', hint: 'short, but it lies inside the barracks' },
    ],
    // Sent in as the palace wakes up. Escalation, Hitman-style: get rumbled and
    // the place gets harder rather than simply ending your run.
    reinforcements: [
      { role: 'soldier', name: 'Ngoni', route: [[16, 6], [24, 6], [24, 17], [16, 17]], pause: 1.0 },
      { role: 'soldier', name: 'Munashe', route: [[18, 3], [18, 20]], pause: 0.9 },
      { role: 'captain', name: 'Rudo-Chef', route: [[21, 8], [21, 15]], pause: 1.6 },
      { role: 'soldier', name: 'Batsirai', route: [[30, 8], [30, 16], [35, 16]], pause: 1.1 },
    ].map((b, i) => ({ id: 200 + i, role: b.role, name: b.name, pause: b.pause,
      route: b.route.map(([x, y]) => ({ x: px(x), y: px(y) })) })),
    bodies: [
      // nursery — priests, and one soldier posted at the door
      { role: 'priest', name: 'Rwatira', route: [[4, 6], [9, 4], [9, 8]], pause: 2.4 },
      { role: 'priest', name: 'Chenzira', route: [[6, 8], [11, 8], [11, 3]], pause: 2.0 },
      { role: 'soldier', name: 'Garai', route: [[12, 5], [12, 8]], pause: 3.0 },
      { role: 'servant', name: 'Mazvita', route: [[3, 8], [3, 3], [7, 3]], pause: 2.6 },
      // the hall — the public spine. You must cross it, so it is busy: crossing
      // with the child in the wrong arms should feel like a real gamble.
      { role: 'soldier', name: 'Tapiwa', route: [[16, 3], [24, 3], [24, 9], [16, 9]], pause: 1.4 },
      { role: 'soldier', name: 'Nyasha', route: [[24, 20], [16, 20], [16, 14], [24, 14]], pause: 1.4 },
      { role: 'soldier', name: 'Garikai', route: [[16, 11], [24, 11]], pause: 1.2 },
      { role: 'captain', name: 'Mukoma', route: [[20, 11], [20, 5], [20, 18]], pause: 2.4 },
      { role: 'servant', name: 'Chipo', route: [[17, 13], [17, 5], [23, 5], [23, 13]], pause: 1.8 },
      { role: 'priest', name: 'Tarisai', route: [[22, 17], [18, 17], [18, 21]], pause: 2.2 },
      // barracks
      { role: 'soldier', name: 'Farai', route: [[4, 15], [4, 20], [10, 20]], pause: 2.0 },
      { role: 'soldier', name: 'Tonderai', route: [[10, 14], [10, 18], [6, 18]], pause: 2.2 },
      // service corridor — servants, and the door it guards
      { role: 'servant', name: 'Ruva', route: [[29, 12], [29, 4], [35, 4]], pause: 2.2 },
      { role: 'servant', name: 'Tendai', route: [[33, 20], [29, 20], [29, 15]], pause: 2.4 },
      { role: 'servant', name: 'Rudo', route: [[35, 9], [35, 16], [31, 16]], pause: 2.0 },
      { role: 'soldier', name: 'Shungu', route: [[28, 11], [28, 13]], pause: 3.2 },
      { role: 'captain', name: 'Zivai', route: [[34, 6], [34, 12]], pause: 3.0 },
    ].map((b, i) => ({
      id: i + 1, role: b.role, name: b.name, pause: b.pause,
      route: b.route.map(([x, y]) => ({ x: px(x), y: px(y) })),
    })),
  };
}

module.exports = { palace, ROLES, TILE, px };
