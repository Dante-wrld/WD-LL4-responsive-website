'use strict';
/* The tile grid: what is solid, what blocks sight, and how a thing moves through
 * it. Both acts share this, so collision and line-of-sight have exactly one
 * definition. Nothing in here knows about possession, suspicion or combat.
 *
 * A map is { w, h, rows: [string], doors?: [...], zones?: [...] } where each
 * character of a row is a tile:
 *     .  floor      #  wall       T  tree/pillar (blocks sight)
 *     o  furniture  D  door (role-gated)         others: floor
 */
const TILE = 32, TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rd = (v) => Math.round(v);
const tx = (x) => Math.floor(x / TILE);
const ty = (y) => Math.floor(y / TILE);
/** The smaller of the two ways round a circle. */
function angDiff(a, b) { const d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; }

/** Off the map counts as wall, so nothing can walk out of the world. */
function tileAt(m, i, j) { return (i < 0 || j < 0 || i >= m.w || j >= m.h) ? '#' : m.rows[j][i]; }
const sightBlock = (c) => c === '#' || c === 'T' || c === 'o';

/** Which door covers this tile, if any. */
function doorAt(m, i, j) {
  if (tileAt(m, i, j) !== 'D') return null;
  return (m.doors || []).find((d) => d.tiles.some(([x, y]) => x === i && y === j)) || null;
}

/** Solid for this mover. Spirits drift through doors but not through stone. */
function solidFor(m, i, j, role) {
  const c = tileAt(m, i, j);
  if (c === 'D') {
    if (role === 'spirit') return false;
    const d = doorAt(m, i, j);
    return !(d && d.roles.includes(role));
  }
  return c === '#' || c === 'T' || c === 'o';
}

/** Would a circle of radius r at (x,y) overlap anything solid for this mover? */
function blocked(m, x, y, r, role) {
  for (let j = ty(y - r); j <= ty(y + r); j++) {
    for (let i = tx(x - r); i <= tx(x + r); i++) if (solidFor(m, i, j, role)) return true;
  }
  return false;
}

/** Move, sliding along a wall rather than stopping dead against it. */
function moveBy(m, e, dx, dy, role) {
  const nx = e.x + dx; if (!blocked(m, nx, e.y, e.r, role)) e.x = nx;
  const ny = e.y + dy; if (!blocked(m, e.x, ny, e.r, role)) e.y = ny;
}

/** Clear line of sight, stepped along the ray. */
function los(m, x0, y0, x1, y1) {
  const steps = Math.ceil(hyp(x0, y0, x1, y1) / 10);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (sightBlock(tileAt(m, tx(x0 + (x1 - x0) * t), ty(y0 + (y1 - y0) * t)))) return false;
  }
  return true;
}

/** The wing a point sits in, and who belongs there. null = public ground. */
function zoneAt(m, x, y) {
  const i = tx(x), j = ty(y);
  return (m.zones || []).find((z) => i >= z.x0 && i <= z.x1 && j >= z.y0 && j <= z.y1) || null;
}

/** Can `a` see a point, given a facing, a reach and how wide its cone is? */
function canSee(m, a, x, y, reach, halfCone) {
  const d = hyp(a.x, a.y, x, y);
  if (d > reach) return false;
  if (halfCone < Math.PI && angDiff(Math.atan2(y - a.y, x - a.x), a.aim) > halfCone) return false;
  return los(m, a.x, a.y, x, y);
}

/** Every open tile reachable from a start tile, for this mover. */
function flood(m, i0, j0, role) {
  const key = (i, j) => i + ',' + j;
  const seen = new Set([key(i0, j0)]);
  const q = [[i0, j0]];
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (seen.has(key(ni, nj)) || solidFor(m, ni, nj, role)) continue;
      seen.add(key(ni, nj)); q.push([ni, nj]);
    }
  }
  return seen;
}

/** Walk distance in tiles between two points, or Infinity if unreachable.
 *  Used by the map tests to catch dead ends a plain reachability check misses. */
function walkDist(m, from, to, role) {
  const key = (i, j) => i + ',' + j;
  const gi = tx(to.x), gj = ty(to.y);
  const seen = new Map([[key(tx(from.x), ty(from.y)), 0]]);
  let q = [[tx(from.x), ty(from.y)]];
  while (q.length) {
    const next = [];
    for (const [i, j] of q) {
      const d = seen.get(key(i, j));
      if (i === gi && j === gj) return d;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (seen.has(key(ni, nj)) || solidFor(m, ni, nj, role)) continue;
        seen.set(key(ni, nj), d + 1); next.push([ni, nj]);
      }
    }
    q = next;
  }
  return Infinity;
}

/** Walk distance, in tiles, from every reachable tile to a goal.
 *  A breadth-first sweep outward from the goal — 570 tiles in a chamber, so it
 *  costs nothing to recompute a few times a second. A mover reads it by stepping
 *  to whichever neighbour has a smaller number than the tile it stands on, which
 *  is a real path: it goes around pillars instead of pressing into them. */
function flowField(m, to, role) {
  const key = (i, j) => i + ',' + j;
  const gi = tx(to.x), gj = ty(to.y);
  const dist = new Map();
  if (solidFor(m, gi, gj, role)) return dist;
  dist.set(key(gi, gj), 0);
  let q = [[gi, gj]];
  while (q.length) {
    const next = [];
    for (const [i, j] of q) {
      const d = dist.get(key(i, j));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (dist.has(key(ni, nj)) || solidFor(m, ni, nj, role)) continue;
        dist.set(key(ni, nj), d + 1); next.push([ni, nj]);
      }
    }
    q = next;
  }
  return dist;
}

/** The direction to step from (x,y) to get closer along a flow field.
 *  Returns null when already there, or when the field does not cover this tile. */
function flowStep(field, x, y) {
  const key = (i, j) => i + ',' + j;
  const i = tx(x), j = ty(y);
  const here = field.get(key(i, j));
  if (here === undefined) return null;
  if (here === 0) return null;
  let best = null, bd = here;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const d = field.get(key(i + di, j + dj));
    if (d !== undefined && d < bd) { bd = d; best = [di, dj]; }
  }
  if (!best) return null;
  // aim at the centre of the next tile, so a mover does not scrape the corner
  const cx = (i + best[0]) * TILE + TILE / 2, cy = (j + best[1]) * TILE + TILE / 2;
  return Math.atan2(cy - y, cx - x);
}

module.exports = { TILE, TAU, clamp, hyp, rd, tx, ty, angDiff, tileAt, sightBlock,
  doorAt, solidFor, blocked, moveBy, los, zoneAt, canSee, flood, walkDist,
  flowField, flowStep };
