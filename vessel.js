'use strict';
/*
 * CHAMINUKA: THE EXILED PROPHET — the possession rules.
 *
 * You are a spirit. You cannot fight, open a gate or lift the child. To do
 * anything you must wear somebody. Two clocks run against you:
 *
 *   SUSPICION  — people notice a soldier loitering in the kitchens, and they
 *                certainly notice anyone carrying a royal infant. It climbs
 *                only while somebody can actually see you.
 *   THE HOST   — every body wakes up. Let the clock run out and you are thrown
 *                clear where you stand, and he shouts. Step out deliberately
 *                and he slumps quietly instead — but a patrol that finds a
 *                slumped man knows something is wrong.
 *
 * There is no health and no combat. Being discovered costs you a body, never
 * the run.
 */
const { palace, ROLES } = require('./palace');
const { TILE, TAU, clamp, hyp, rd, tx, ty, angDiff, tileAt, doorAt, solidFor,
  blocked, moveBy, los, zoneAt } = require('./grid');

const TICK = 30, DT = 1 / TICK;

// --- movement ---------------------------------------------------------------
const SPIRIT_SPEED = 182;      // unhoused, you move quickly and nobody sees you
const WALK = 116;              // a body's ordinary pace
const HURRY = 168;             // moving fast, which people notice
// --- the spirit -------------------------------------------------------------
const SPIRIT_MAX = 28;         // seconds you can stay unhoused — long enough to cross the palace, short enough to hurry
const SPIRIT_REGEN = 2.2;      // per second while wearing somebody
// --- the host ---------------------------------------------------------------
const POSSESS_TIME = 48;       // seconds before he wakes on his own
const STUTTER_AT = 12;         // he starts fighting you below this
const SLUMP_TIME = 35;         // how long he lies there after you step out
const POSSESS_RANGE = 46;
// A deliberate change of host needs time before an unattended child is reported.
// This is a short grace period, not immunity while carrying the infant.
const HANDOFF_GRACE = 12;
// --- suspicion --------------------------------------------------------------
const SUSP_MAX = 100;
const S_WRONG_ZONE = 13;       // per second, seen somewhere your role does not belong
const S_INFANT = 21;           // per second, seen carrying the child in the wrong hands
const S_HURRY = 7;             // per second, seen moving fast
const S_LOITER = 4;            // per second, seen standing still too long
const S_CAPTAIN = 3;           // per second, always: everyone watches the captain
const S_DECAY_UNSEEN = 9;      // per second once nobody is looking
const S_DECAY_SEEN = 4;        // per second while seen but behaving
const LOITER_AFTER = 4;
// --- being noticed ----------------------------------------------------------
// Palace patrols have a narrower forward view and a shorter notice distance.
// Each cone is a HALF-angle in radians. Regular view spans ~34 degrees.
// Keep alarmed guards more watchful, but never draw a wider cone than detects.
const NOTICE = 120, NOTICE_CONE = 0.30;
const ALERT_NOTICE = 150, ALERT_NOTICE_CONE = 0.48;
const NOTICE_CLOSE = 30;       // anyone right beside a guard still gets noticed
const PATROL_PACE = 0.60;      // relative to a player walking at WALK
const ALERT_PACE = 0.84;       // guards still close distance after a confirmed alarm
const ALERT_CALM = 25;         // an alerted body settles down again after this
const ALERT_REACH = 40;        // close enough to lay hands on you
const COOLDOWN = { priest: 25, soldier: 18, servant: 18, captain: 35 };
// --- the palace waking up ---------------------------------------------------
const AWARE_MAX = 100;
const AWARE_BURN = 22;         // you were seen for what you are
const AWARE_FOUND = 14;        // somebody found a man you left slumped
const AWARE_RETURNED = 12;     // the child was carried back to the cradle
const AWARE_DECAY = 1.6;       // per second of nothing going wrong
const AWARE_STEPS = [40, 70];  // reinforcements arrive at each of these
// --- mastery ----------------------------------------------------------------
const SWIFT_UNDER = 240;       // seconds
const FRUGAL_BODIES = 2;
const UNSEEN_UNDER = 50;       // never let suspicion pass this
/** Earned by mastery, and they stack. */
const AFFINITIES = {
  veiled: { from: 'ghost', name: 'Veiled', blurb: 'Suspicion gathers a quarter slower around you.' },
  quick: { from: 'frugal', name: 'Quick', blurb: 'You can reach into a body from further away.' },
  bold: { from: 'swift', name: 'Bold', blurb: 'You can take a body even while its owner is alarmed.' },
};
/** Revealed one line at a time, win or lose, so every attempt moves the story. */
const PROPHECY = [
  'The child who refused the king will not die in this house.',
  'He will wear a hundred faces before he wears his own.',
  'The spirits lend their bodies gladly; the living lend theirs only once.',
  'Mavambo keeps a cradle for him, and a name he has not earned.',
  'Sixteen harvests will pass before the king learns the boy still breathes.',
  'What the prophet takes, the prophet must one day give back.',
];

class Room {
  constructor(code, out) {
    this.code = code; this.out = out || (() => {});
    this.players = new Map(); this.nextPid = 1;
    this.phase = 'lobby'; this.time = 0; this.tickN = 0; this.ev = [];
    this.map = null; this.bodies = []; this.infant = null; this.won = false; this.runStart = 0;
    this.aware = 0; this.awareStep = 0; this.lost = false; this.lastRouse = -99;
    this.run = null; this.chapter = 0; this.records = null; this.onRun = null;
  }

  // ---------------------------------------------------------------- lobby
  newPlayer(name) {
    const id = this.nextPid++;
    const p = {
      id, name, host: this.players.size === 0, connected: true,
      form: 'spirit', bodyId: 0, x: 0, y: 0, r: 10, aim: 0,
      energy: SPIRIT_MAX, susp: 0, hostT: 0, carrying: false, seenT: 0, stillT: 0,
      actReady: 0, speedNow: 0, burns: 0, hops: 0,
      affinities: [], maxSusp: 0, usedBodies: new Set(),
      inp: { mx: 0, my: 0, a: 0, hurry: false, use: false, useEdge: false, act: false, actEdge: false, take: false, takeEdge: false },
    };
    this.players.set(id, p);
    if (this.map) { p.x = this.map.spiritStart.x; p.y = this.map.spiritStart.y; }
    this.sendLobby();
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    if (p.form === 'worn') this.leaveBody(p, 'slump');
    if (p.carrying) this.dropInfant(p);
    this.players.delete(id);
    if (p.host) { const n = this.players.values().next().value; if (n) n.host = true; }
    this.sendLobby();
  }
  setInput(id, m) {
    const p = this.players.get(id); if (!p) return; const i = p.inp;
    const num = (v, d) => (Number.isFinite(+v) ? +v : d);
    i.mx = clamp(num(m.mx, 0), -1, 1); i.my = clamp(num(m.my, 0), -1, 1);
    i.a = num(m.a, i.a); i.hurry = !!m.hurry;
    if (m.use && !i.use) i.useEdge = true; i.use = !!m.use;
    if (m.act && !i.act) i.actEdge = true; i.act = !!m.act;
    if (m.take && !i.take) i.takeEdge = true; i.take = !!m.take;
  }
  sendLobby() {
    this.out(null, { t: 'lobby', code: this.code, phase: this.phase,
      players: [...this.players.values()].map((p) => ({ id: p.id, n: p.name, host: p.host })) });
  }
  start(id) {
    const p = this.players.get(id);
    if (!p || !p.host || this.phase !== 'lobby') return;
    this.begin();
  }
  begin() {
    this.phase = 'run'; this.won = false; this.lost = false; this.runStart = this.time;
    this.aware = 0; this.awareStep = 0; this.lastRouse = -99;
    this.map = palace();
    this.run = { exitUsed: null, mastery: [], reinforced: 0 };
    this.bodies = this.map.bodies.map((b) => ({
      id: b.id, role: b.role, name: b.name, pause: b.pause, route: b.route,
      x: b.route[0].x, y: b.route[0].y, r: 11, aim: 0, wp: 0, lookT: 0,
      state: 'idle', wornBy: 0, slumpUntil: 0, alertT: 0, ignoreUntil: 0,
      orderUntil: 0, orderX: 0, orderY: 0, homeX: b.route[0].x, homeY: b.route[0].y,
    }));
    this.infant = { x: this.map.infant.x, y: this.map.infant.y, carrier: 0, safeUntil: 0,
      home: { x: this.map.infant.x, y: this.map.infant.y } };
    let n = 0;
    for (const pl of this.players.values()) {
      Object.assign(pl, { form: 'spirit', bodyId: 0, susp: 0, hostT: 0, carrying: false,
        energy: SPIRIT_MAX, seenT: 0, stillT: 0, actReady: 0, burns: 0, hops: 0,
        maxSusp: 0, usedBodies: new Set() });
      pl.x = this.map.spiritStart.x + (n % 3 - 1) * 22;
      pl.y = this.map.spiritStart.y + (Math.floor(n / 3) - 0.5) * 22;
      n++;
    }
    this.out(null, this.mapMsg());
    this.ev.push(['ban', 'THE CHILD IN THE CRADLE', 'You have no body. Take one — press E beside somebody.']);
    this.sendLobby();
  }
  mapMsg() {
    const m = this.map; if (!m) return null;
    return { t: 'map', w: m.w, h: m.h, rows: m.rows, name: m.name, zones: m.zones,
      doors: m.doors.map((d) => ({ name: d.name, roles: d.roles, tiles: d.tiles })),
      exits: m.exits, roles: ROLES, phase: this.phase,
      prophecy: PROPHECY[this.chapter % PROPHECY.length],
      goals: [{ name: 'Swift', how: `out in under ${SWIFT_UNDER / 60 | 0} minutes` },
        { name: 'Frugal', how: `wear no more than ${FRUGAL_BODIES} bodies` },
        { name: 'Unseen', how: 'never let doubt pass halfway, never be rumbled' },
        { name: 'The Postern', how: 'leave by the soldiers\u2019 gate' }],
      board: this.records ? this.records.top() : null };
  }
  syncTo(pid) {
    this.sendLobby();
    if (this.phase === 'run') this.out(pid, this.mapMsg());
  }

  // ---------------------------------------------------------------- bodies
  body(id) { return this.bodies.find((b) => b.id === id) || null; }
  /** A body you could step into right now.
   *  Only the calm and unaware: you cannot climb back into the man you just left
   *  slumped on the floor, and you cannot take the one who is hunting you. That
   *  restriction is what forces you to keep finding new bodies. */
  possessTarget(p) {
    if (p.form !== 'spirit') return null;
    const bold = p.affinities.includes('bold');
    let best = null, bd = POSSESS_RANGE * (p.affinities.includes('quick') ? 1.45 : 1);
    for (const b of this.bodies) {
      if (b.state !== 'idle' && !(bold && b.state === 'alert')) continue;
      const d = hyp(b.x, b.y, p.x, p.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  enterBody(p, b) {
    p.form = 'worn'; p.bodyId = b.id; p.susp = 0; p.hostT = POSSESS_TIME;
    p.x = b.x; p.y = b.y; p.seenT = 0; p.stillT = 0; p.hops++;
    p.actReady = this.time + 2;
    p.usedBodies.add(b.id);
    b.state = 'worn'; b.wornBy = p.id; b.alertT = 0; b.slumpUntil = 0;
    this.ev.push(['enter', rd(b.x), rd(b.y), b.role, p.id]);
    this.ev.push(['feed', `${p.name} is wearing ${b.name} the ${ROLES[b.role].name}`]);
  }
  /** how: 'slump' (deliberate, quiet) | 'wake' (clock ran out) | 'burn' (rumbled) */
  leaveBody(p, how) {
    const b = this.body(p.bodyId); if (!b) { p.form = 'spirit'; p.bodyId = 0; return; }
    if (p.carrying) this.dropInfant(p);
    p.form = 'spirit'; p.bodyId = 0; p.susp = 0; p.hostT = 0;
    p.x = b.x; p.y = b.y; b.wornBy = 0;
    if (how === 'slump') {
      b.state = 'slumped'; b.slumpUntil = this.time + SLUMP_TIME;
      this.ev.push(['slump', rd(b.x), rd(b.y)]);
    } else {
      b.state = 'alert'; b.alertT = ALERT_CALM;
      this.alertNear(b.x, b.y, 260, b.id);
      p.burns++;
      this.rouse(AWARE_BURN, how === 'wake' ? `${b.name} woke and shouted` : `${b.name} was seen for what he was`);
      this.ev.push(['burn', rd(b.x), rd(b.y)]);
      this.ev.push(['ban', how === 'wake' ? `${b.name} WAKES` : `THAT IS NOT ${b.name.toUpperCase()}`,
        how === 'wake' ? 'He is shouting. Find another body — fast.' : 'You have been seen for what you are.']);
    }
    this.out(null, { t: 'left' });
  }
  /** Something went wrong and word spreads. */
  rouse(n, why) {
    if (this.phase !== 'run') return;
    this.aware = clamp(this.aware + n, 0, AWARE_MAX);
    this.lastRouse = this.time;
    this.ev.push(['aware', Math.round(this.aware), why || '']);
    while (this.awareStep < AWARE_STEPS.length && this.aware >= AWARE_STEPS[this.awareStep]) {
      this.reinforce(); this.awareStep++;
    }
    if (this.aware >= AWARE_MAX) this.lose();
  }
  /** Two more patrols walk in. */
  reinforce() {
    const pool = this.map.reinforcements || [];
    const already = this.run.reinforced;
    const next = pool.slice(already, already + 2);
    if (!next.length) return;
    this.run.reinforced += next.length;
    for (const spec of next) {
      this.bodies.push({
        id: 500 + this.bodies.length, role: spec.role, name: spec.name, pause: spec.pause, route: spec.route,
        x: spec.route[0].x, y: spec.route[0].y, r: 11, aim: 0, wp: 0, lookT: 0,
        state: 'idle', wornBy: 0, slumpUntil: 0, alertT: 0, ignoreUntil: 0,
        orderUntil: 0, orderX: 0, orderY: 0, homeX: spec.route[0].x, homeY: spec.route[0].y,
      });
    }
    this.ev.push(['reinforce', next.length]);
    this.ev.push(['ban', 'THE PALACE IS WAKING', `${next.length} more patrols sent for. Keep your head down.`]);
  }
  /** The house is fully awake: the attempt is over, but the story still moves.
   *  Nobody dies here — you lose the night, learn a line, and go again. */
  lose() {
    if (this.lost || this.won) return;
    this.lost = true; this.phase = 'lost';
    const secs = +(this.time - this.runStart).toFixed(1);
    const all = [...this.players.values()];
    const bodies = new Set(); for (const q of all) for (const id of q.usedBodies) bodies.add(id);
    const burns = all.reduce((n, q) => n + q.burns, 0);
    const line = PROPHECY[this.chapter % PROPHECY.length];
    this.chapter++;
    this.ev.push(['ban', 'THE HOUSE IS ROUSED', 'The child is back under guard. Again, then.']);
    const rec = { won: false, by: all[0] ? all[0].name : 'Spirit', secs,
      bodies: bodies.size, burns, worst: Math.round(Math.max(0, ...all.map((q) => q.maxSusp))),
      gate: null, mastery: [], chapter: this.chapter - 1, line };
    if (this.onRun) this.onRun(rec);
    this.out(null, Object.assign({ t: 'lost', aware: Math.round(this.aware),
      affinities: all[0] ? [...all[0].affinities] : [],
      next: 'He is still in the house. The priests will watch the cradle more closely tonight.',
      board: this.records ? this.records.top() : null }, rec));
  }
  alertNear(x, y, radius, exceptId) {
    for (const b of this.bodies) {
      if (b.id === exceptId || b.state === 'worn' || b.state === 'slumped') continue;
      if (hyp(b.x, b.y, x, y) > radius) continue;
      if (this.time < b.ignoreUntil) continue;
      b.state = 'alert'; b.alertT = ALERT_CALM; b.suspX = x; b.suspY = y;
    }
  }

  // ---------------------------------------------------------------- the child
  takeInfant(p) {
    if (p.form !== 'worn' || p.carrying) return false;
    if (this.infant.carrier) return false;
    if (hyp(this.infant.x, this.infant.y, p.x, p.y) > 44) return false;
    p.carrying = true; this.infant.carrier = p.id;
    this.infant.safeUntil = 0;
    this.ev.push(['feed', `${p.name} lifts the child`]);
    return true;
  }
  dropInfant(p) {
    if (!p.carrying) return;
    p.carrying = false; this.infant.carrier = 0;
    this.infant.x = p.x; this.infant.y = p.y;
    this.infant.safeUntil = this.time + HANDOFF_GRACE;
    this.ev.push(['feed', `The child is set down. ${HANDOFF_GRACE} seconds to change bodies and pick him up.`]);
  }

  // ---------------------------------------------------------------- noticing
  /** Everyone who can presently see this point. */
  watchers(x, y, ignoreId) {
    const out = [];
    for (const b of this.bodies) {
      if (b.state === 'worn' || b.state === 'slumped') continue;
      if (b.id === ignoreId) continue;
      if (this.time < b.ignoreUntil) continue;
      const d = hyp(b.x, b.y, x, y);
      const alerted = b.state === 'alert';
      const reach = alerted ? ALERT_NOTICE : NOTICE;
      const half = alerted ? ALERT_NOTICE_CONE : NOTICE_CONE;
      if (d > reach) continue;
      if (angDiff(b.aim, Math.atan2(y - b.y, x - b.x)) > half && d > NOTICE_CLOSE) continue;
      if (!los(this.map, b.x, b.y, x, y)) continue;
      out.push(b);
    }
    return out;
  }
  /** Why this player is attracting attention, and how fast. */
  suspicionRate(p) {
    const reasons = [];
    if (p.form !== 'worn') return { rate: 0, reasons };
    const b = this.body(p.bodyId); if (!b) return { rate: 0, reasons };
    const seen = this.watchers(p.x, p.y, b.id);
    let rate = 0;
    if (b.role === 'captain') { rate += S_CAPTAIN; reasons.push('you are the captain'); }
    if (!seen.length) {
      return { rate: rate - S_DECAY_UNSEEN, reasons, seen };
    }
    const z = zoneAt(this.map, p.x, p.y);
    if (z && !z.roles.includes(b.role)) { rate += S_WRONG_ZONE; reasons.push(`a ${ROLES[b.role].name.toLowerCase()} in ${z.name}`); }
    if (p.carrying && b.role !== 'servant') { rate += S_INFANT; reasons.push('carrying the royal child'); }
    if (p.inp.hurry && p.speedNow > WALK + 10) { rate += S_HURRY; reasons.push('moving too fast'); }
    if (p.stillT > LOITER_AFTER) { rate += S_LOITER; reasons.push('standing about'); }
    if (!reasons.length || (reasons.length === 1 && b.role === 'captain' && rate === S_CAPTAIN)) {
      rate -= S_DECAY_SEEN;                        // behaving exactly as you should
    }
    // A roused house looks harder at everyone; the Veiled look back less sharply.
    if (rate > 0) {
      rate *= 1 + (this.aware / AWARE_MAX) * 0.5;
      if (p.affinities.includes('veiled')) rate *= 0.75;
    }
    return { rate, reasons, seen };
  }

  // ---------------------------------------------------------------- actions
  roleAction(p) {
    if (p.form !== 'worn' || this.time < p.actReady) return;
    const b = this.body(p.bodyId); if (!b) return;
    p.actReady = this.time + (COOLDOWN[b.role] || 20);
    if (b.role === 'priest') {
      for (const q of this.players.values()) if (hyp(q.x, q.y, p.x, p.y) < 220) q.susp = 0;
      for (const o of this.bodies) if (o.state === 'alert' && hyp(o.x, o.y, p.x, p.y) < 220) { o.state = 'idle'; o.alertT = 0; }
      this.ev.push(['bless', rd(p.x), rd(p.y), 220]);
      this.ev.push(['feed', `${b.name} offers a blessing — the hall calms`]);
    } else if (b.role === 'soldier') {
      let t = null, td = 210;
      for (const o of this.bodies) { if (o.id === b.id || o.state !== 'idle') continue; const d = hyp(o.x, o.y, p.x, p.y); if (d < td) { td = d; t = o; } }
      if (t) {
        const a = Math.atan2(t.y - p.y, t.x - p.x);
        t.orderUntil = this.time + 13; t.orderX = t.x + Math.cos(a) * 190; t.orderY = t.y + Math.sin(a) * 190;
        t.ignoreUntil = this.time + 3;
        this.ev.push(['order', rd(t.x), rd(t.y)]);
        this.ev.push(['feed', `${b.name} sends ${t.name} off his post`]);
      } else this.ev.push(['feed', 'nobody close enough to order about']);
    } else if (b.role === 'servant') {
      let t = null, td = 270;
      for (const o of this.bodies) { if (o.id === b.id || o.state !== 'idle') continue; const d = hyp(o.x, o.y, p.x, p.y); if (d < td) { td = d; t = o; } }
      if (t) {
        t.orderUntil = this.time + 9; t.orderX = p.x; t.orderY = p.y; t.ignoreUntil = this.time + 2;
        this.ev.push(['summon', rd(p.x), rd(p.y)]);
        this.ev.push(['feed', `${b.name} calls ${t.name} over`]);
      } else this.ev.push(['feed', 'nobody within earshot']);
    } else {
      let n = 0;
      for (const o of this.bodies) {
        if (o.id === b.id || o.state === 'worn' || o.state === 'slumped') continue;
        if (hyp(o.x, o.y, p.x, p.y) > 330) continue;
        o.state = 'idle'; o.alertT = 0; o.ignoreUntil = this.time + 10; o.orderUntil = 0; n++;
      }
      this.ev.push(['standdown', rd(p.x), rd(p.y), 330]);
      this.ev.push(['feed', `${b.name} orders ${n} of them to stand down`]);
    }
  }

  // ---------------------------------------------------------------- updates
  updatePlayers() {
    for (const p of this.players.values()) {
      const i = p.inp;
      const clearEdges = () => { i.useEdge = false; i.actEdge = false; i.takeEdge = false; };
      if (!p.connected) { clearEdges(); continue; }
      p.aim = i.a;
      const b = p.form === 'worn' ? this.body(p.bodyId) : null;
      const role = b ? b.role : 'spirit';

      // step in or out of a body
      if (i.useEdge) {
        if (p.form === 'spirit') { const t = this.possessTarget(p); if (t) this.enterBody(p, t); }
        else this.leaveBody(p, 'slump');
        clearEdges();
        continue;
      }
      if (i.actEdge) this.roleAction(p);
      if (i.takeEdge) { if (p.carrying) this.dropInfant(p); else this.takeInfant(p); }

      // movement
      let mx = i.mx, my = i.my; const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      let sp = p.form === 'spirit' ? SPIRIT_SPEED : (i.hurry ? HURRY : WALK);
      if (p.form === 'worn' && p.hostT < STUTTER_AT && Math.sin(this.time * 9) > 0.55) sp *= 0.25;  // he fights you
      const bx = p.x, by = p.y;
      moveBy(this.map, p, mx * sp * DT, my * sp * DT, role);
      p.speedNow = hyp(bx, by, p.x, p.y) / DT;
      p.stillT = p.speedNow < 14 ? p.stillT + DT : 0;

      if (p.form === 'worn') {
        if (b) { b.x = p.x; b.y = p.y; b.aim = p.aim; }
        p.energy = Math.min(SPIRIT_MAX, p.energy + SPIRIT_REGEN * DT);
        p.hostT -= DT;
        if (p.hostT <= STUTTER_AT && p.hostT + DT > STUTTER_AT) this.ev.push(['ban', `${b.name} IS STIRRING`, 'Step out somewhere quiet, or he throws you clear.']);
        if (p.hostT <= 0) { this.leaveBody(p, 'wake'); clearEdges(); continue; }
        const s = this.suspicionRate(p);
        p.susp = clamp(p.susp + s.rate * DT, 0, SUSP_MAX);
        if (p.susp > p.maxSusp) p.maxSusp = p.susp;
        if (p.susp >= SUSP_MAX) { this.leaveBody(p, 'burn'); clearEdges(); continue; }
        if (p.carrying) { this.infant.x = p.x; this.infant.y = p.y; }
        // out through either gate — and which one you chose is remembered
        if (p.carrying) {
          for (const g of this.map.exits) {
            if (hyp(p.x, p.y, g.x, g.y) < g.r) { this.win(p, g); break; }
          }
        }
      } else {
        p.energy -= DT;
        if (p.energy <= 0) {                        // drawn back to the cradle
          p.energy = SPIRIT_MAX * 0.5;
          p.x = this.infant.home.x; p.y = this.infant.home.y;
          this.ev.push(['recall', rd(p.x), rd(p.y)]);
          this.ev.push(['ban', 'THE TETHER PULLS', 'Unhoused too long — you are drawn back to the cradle.']);
        }
      }
      clearEdges();
    }
  }
  updateBodies() {
    for (const b of this.bodies) {
      if (b.state === 'worn') continue;
      if (b.state === 'slumped') {
        // a patrol that walks past a slumped man knows something is wrong
        if (this.time >= b.slumpUntil) { b.state = 'idle'; this.ev.push(['wake', rd(b.x), rd(b.y)]); this.alertNear(b.x, b.y, 200, b.id); continue; }
        for (const o of this.bodies) {
          if (o.state !== 'idle' || o.id === b.id) continue;
          if (hyp(o.x, o.y, b.x, b.y) < 110 && los(this.map, o.x, o.y, b.x, b.y)) {
            b.state = 'idle'; b.slumpUntil = 0;
            this.ev.push(['found', rd(b.x), rd(b.y)]);
            this.rouse(AWARE_FOUND, `${o.name} found ${b.name} on the floor`);
            this.alertNear(b.x, b.y, 240, 0);
            break;
          }
        }
        continue;
      }
      let gx, gy, speed = WALK * PATROL_PACE;
      if (b.state === 'alert') {
        b.alertT -= DT;
        if (b.alertT <= 0) { b.state = 'idle'; b.suspX = 0; continue; }
        // make for whoever is wearing a body nearby, else the spot that worried them
        let tgt = null, td = 1e9;
        for (const p of this.players.values()) {
          if (p.form !== 'worn' || !p.connected) continue;
          const d = hyp(p.x, p.y, b.x, b.y);
          if (d < td && d < 420 && los(this.map, b.x, b.y, p.x, p.y)) { td = d; tgt = p; }
        }
        const gxx = tgt ? tgt.x : (b.suspX || b.homeX), gyy = tgt ? tgt.y : (b.suspY || b.homeY);
        const a = Math.atan2(gyy - b.y, gxx - b.x);
        gx = Math.cos(a); gy = Math.sin(a); b.aim = a; speed = WALK * ALERT_PACE;
        if (tgt && td < ALERT_REACH) {              // laid hands on the body you are wearing
          const p = tgt; this.leaveBody(p, 'burn');
        }
      } else if (this.time < b.orderUntil) {
        const d = hyp(b.orderX, b.orderY, b.x, b.y);
        if (d > 26) { const a = Math.atan2(b.orderY - b.y, b.orderX - b.x); gx = Math.cos(a); gy = Math.sin(a); b.aim = a; }
        else { b.lookT += DT; b.aim += Math.sin(b.lookT * 1.6) * 1.6 * DT; }
      } else {
        const wp = b.route[b.wp % b.route.length];
        const d = hyp(wp.x, wp.y, b.x, b.y);
        if (d > 16) { const a = Math.atan2(wp.y - b.y, wp.x - b.x); gx = Math.cos(a); gy = Math.sin(a); b.aim = a; b.lookT = 0; }
        else { b.lookT += DT; b.aim += Math.sin(b.lookT * 1.5) * 1.7 * DT; if (b.lookT > b.pause) { b.wp = (b.wp + 1) % b.route.length; b.lookT = 0; } }
      }
      if (gx !== undefined) {
        const ox = b.x, oy = b.y;
        moveBy(this.map, b, gx * speed * DT, gy * speed * DT, b.role);
        if (hyp(ox, oy, b.x, b.y) < speed * DT * 0.3) {
          b.stuck = (b.stuck || 0) + DT;
          if (b.stuck > 0.8) { moveBy(this.map, b, -gy * speed * DT * 1.4, gx * speed * DT * 1.4, b.role); }
          if (b.stuck > 2.4) { b.stuck = 0; if (b.state === 'alert') { b.state = 'idle'; } else b.wp = (b.wp + 1) % b.route.length; }
        } else b.stuck = 0;
      }
    }
    // an unattended child gets carried back to the cradle
    if (!this.infant.carrier && this.time >= (this.infant.safeUntil || 0)) {
      for (const b of this.bodies) {
        if (b.state !== 'idle' && b.state !== 'alert') continue;
        if (hyp(b.x, b.y, this.infant.x, this.infant.y) > 48) continue;
        if (hyp(this.infant.x, this.infant.y, this.infant.home.x, this.infant.home.y) < 40) break;
        this.infant.x = this.infant.home.x; this.infant.y = this.infant.home.y;
        this.ev.push(['returned', rd(this.infant.x), rd(this.infant.y)]);
        this.ev.push(['ban', 'THE CHILD IS CARRIED BACK', `${b.name} found him and returned him to the cradle.`]);
        this.rouse(AWARE_RETURNED, 'the child was found out of his cradle');
        this.alertNear(b.x, b.y, 200, 0);
        break;
      }
    }
  }
  /** The three mastery challenges, judged on the whole team's run. */
  masteryEarned(secs, gate) {
    const all = [...this.players.values()];
    const bodies = new Set();
    for (const q of all) for (const id of q.usedBodies) bodies.add(id);
    const worst = Math.max(0, ...all.map((q) => q.maxSusp));
    const burns = all.reduce((n, q) => n + q.burns, 0);
    const got = [];
    if (secs < SWIFT_UNDER) got.push({ key: 'swift', name: 'Swift', how: `out in under ${SWIFT_UNDER / 60 | 0} minutes` });
    if (bodies.size <= FRUGAL_BODIES) got.push({ key: 'frugal', name: 'Frugal', how: `only ${bodies.size} ${bodies.size === 1 ? 'body' : 'bodies'} worn` });
    if (worst < UNSEEN_UNDER && burns === 0) got.push({ key: 'ghost', name: 'Unseen', how: 'never doubted, never rumbled' });
    if (gate && gate.key === 'postern') got.push({ key: 'postern', name: 'The Postern', how: 'out the soldiers\u2019 way' });
    return { got, bodies: bodies.size, worst: Math.round(worst), burns };
  }
  win(p, gate) {
    if (this.won) return;
    this.won = true; this.phase = 'won';
    const secs = +(this.time - this.runStart).toFixed(1);
    this.run.exitUsed = gate ? gate.key : null;
    const m = this.masteryEarned(secs, gate);
    this.run.mastery = m.got.map((x) => x.key);
    // Mastery is what grants an affinity, and it sticks for the next attempt.
    const fresh = [];
    for (const key of Object.keys(AFFINITIES)) {
      const a = AFFINITIES[key];
      if (!this.run.mastery.includes(a.from)) continue;
      for (const q of this.players.values()) {
        if (q.affinities.includes(key)) continue;
        q.affinities.push(key);
        if (!fresh.includes(key)) fresh.push(key);
      }
    }
    const line = PROPHECY[this.chapter % PROPHECY.length];
    this.chapter++;
    this.ev.push(['ban', 'THE CHILD IS AWAY',
      `Out through ${gate ? gate.name : 'the gate'} in ${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`]);
    const rec = { won: true, by: p.name, secs, gate: this.run.exitUsed,
      gateName: gate ? gate.name : 'the gate', bodies: m.bodies, burns: m.burns, worst: m.worst,
      mastery: this.run.mastery, chapter: this.chapter - 1, line };
    if (this.onRun) this.onRun(rec);
    this.out(null, Object.assign({ t: 'won', hops: p.hops,
      earned: m.got, fresh: fresh.map((k) => ({ key: k, name: AFFINITIES[k].name, blurb: AFFINITIES[k].blurb })),
      affinities: [...p.affinities], aware: Math.round(this.aware),
      next: 'He is out of the house. Mavambo lies three days north \u2014 and the king will learn of this.',
      board: this.records ? this.records.top() : null }, rec));
  }

  tick() {
    this.time += DT; this.tickN++; this.ev = [];
    if (this.phase !== 'run') return;
    this.updatePlayers();
    this.updateBodies();
    // The house settles, but only once nothing is going wrong and nobody is hunting.
    if (this.time > this.lastRouse + 3 && !this.bodies.some((b) => b.state === 'alert')) {
      this.aware = Math.max(0, this.aware - AWARE_DECAY * DT);
    }
  }

  // ---------------------------------------------------------------- snapshot
  sharedJSON() {
    const ST = { idle: 0, worn: 1, slumped: 2, alert: 3 };
    return JSON.stringify({
      t: 's', tm: +this.time.toFixed(2), ph: this.phase,
      p: [...this.players.values()].map((p) => ({
        i: p.id, x: rd(p.x), y: rd(p.y), a: +p.aim.toFixed(2),
        f: p.form === 'worn' ? 1 : 0, b: p.bodyId, c: p.carrying ? 1 : 0,
        s: Math.round(p.susp), h: Math.round(p.hostT), on: p.connected ? 1 : 0,
      })),
      b: this.bodies.map((b) => [b.id, b.role, rd(b.x), rd(b.y), +b.aim.toFixed(2), ST[b.state],
        b.wornBy, this.time < b.ignoreUntil ? 1 : 0,
        rd(b.state === 'alert' ? ALERT_NOTICE : NOTICE),
        +(b.state === 'alert' ? ALERT_NOTICE_CONE : NOTICE_CONE).toFixed(2)]),
      aw: Math.round(this.aware), rf: this.run ? this.run.reinforced : 0,
      inf: [rd(this.infant.x), rd(this.infant.y), this.infant.carrier],
      infz: (zoneAt(this.map, this.infant.x, this.infant.y) || { name: 'the great hall' }).name,
      ev: this.ev,
    });
  }
  meJSON(pid) {
    const p = this.players.get(pid); if (!p) return '{}';
    const b = p.form === 'worn' ? this.body(p.bodyId) : null;
    const s = this.suspicionRate(p);
    const t = this.possessTarget(p);
    const z = zoneAt(this.map, p.x, p.y);
    return JSON.stringify({
      form: p.form, role: b ? b.role : null, bodyName: b ? b.name : null,
      susp: Math.round(p.susp), rate: +(s.rate || 0).toFixed(1), reasons: s.reasons,
      watchers: (s.seen || []).length,
      host: +Math.max(0, p.hostT).toFixed(1), hostMax: POSSESS_TIME, stutter: p.hostT < STUTTER_AT ? 1 : 0,
      energy: +p.energy.toFixed(1), energyMax: SPIRIT_MAX,
      carrying: p.carrying ? 1 : 0, canTake: !p.carrying && p.form === 'worn' && !this.infant.carrier
        && hyp(this.infant.x, this.infant.y, p.x, p.y) <= 44 ? 1 : 0,
      target: t ? { id: t.id, name: t.name, role: t.role } : null,
      act: b ? ROLES[b.role].action : null, actCd: +Math.max(0, p.actReady - this.time).toFixed(1),
      zone: z ? z.name : 'the great hall', zoneOk: !b || !z || z.roles.includes(b.role) ? 1 : 0,
      hops: p.hops, burns: p.burns, maxSusp: Math.round(p.maxSusp),
      bodies: p.usedBodies.size,
      affinities: p.affinities.map((k) => ({ key: k, name: AFFINITIES[k].name, blurb: AFFINITIES[k].blurb })),
    });
  }
}

module.exports = { Room, ROLES, TICK, DT, TILE, palace, tileAt, solidFor, blocked, los, zoneAt, doorAt,
  POSSESS_TIME, SPIRIT_MAX, SUSP_MAX, SLUMP_TIME, STUTTER_AT,
  NOTICE, NOTICE_CONE, ALERT_NOTICE, ALERT_NOTICE_CONE, NOTICE_CLOSE, PATROL_PACE, ALERT_PACE, WALK, HURRY,
  AWARE_MAX, AWARE_BURN, AWARE_STEPS, AFFINITIES, PROPHECY, SWIFT_UNDER, FRUGAL_BODIES, UNSEEN_UNDER };
