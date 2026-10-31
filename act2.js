'use strict';
/*
 * CHAMINUKA: ACT II — THE SHRINE AT MAVAMBO. Sixteen years on.
 *
 * He has his own body now, and a spear. That is the obvious half. The half that
 * matters is that he can still step out of it — and the body he leaves behind
 * keeps standing there, breathing, with his back to the room.
 *
 * So the combat is the Act I verb with a knife to it:
 *
 *   FIGHT     one thrust, one dodge. No posture bar, no combos, no stamina, no
 *             shield, no riposte window. Those were in the build that wasn't fun
 *             and they are not coming back.
 *   STEP OUT  you become the spirit again: fast, invisible, and able to wear one
 *             of the king's men. While you wear him the others lose track of you
 *             — until you strike, and then every one of them knows.
 *   THE COST  your own body is undefended while you are out, and takes double.
 *             If it falls while you are elsewhere, that is the run.
 *
 * Death is not the end of the story: it costs you the chamber, not the campaign.
 */
const { chamber, FOES } = require('./shrine');
const { TILE, TAU, clamp, hyp, rd, angDiff, blocked, moveBy, los, canSee,
  flowField, flowStep } = require('./grid');
const { loadout } = require('./road');

const TICK = 30, DT = 1 / TICK;

// --- Chaminuka --------------------------------------------------------------
const SPEED = 150;
const DODGE_SPEED = 430, DODGE_TIME = 0.22, DODGE_CD = 0.8;
const SPEAR_REACH = 56, SPEAR_ARC = 0.95;
const SPEAR_TELL = 0.07, SPEAR_SWING = 0.12, SPEAR_REST = 0.2;
/* A thrust into air leaves you hanging. This is the whole cost of attacking —
 * there is no stamina bar and there is not going to be one. You simply cannot
 * roll out of your own recovery, so every thrust is a thing you have committed
 * to, and a thrust at the wrong moment is how you get hit. */
const SPEAR_WHIFF = 0.42;
const HIT_STUN = 0.16;                 // how long a struck thing loses its footing
const STUN_IMMUNE = 0.85;              // and how long before he can be staggered again
const LUNGE = 20;                      // a spearman steps into his thrust
const IFRAME = 0.55;                   // after taking a hit, so you cannot be chain-killed
// --- the spirit, in a fight -------------------------------------------------
const OUT_MAX = 10;                    // far shorter than the palace: this is a fight
const OUT_REGEN = 2.6;
const OUT_SPEED = 250;
const TAKE_RANGE = 52;
const TAKE_SETTLE = 0.65;              // you cannot stab the instant you are inside him
const OUT_SETTLE = 0.3;                // nor the instant you are out
/* The leash. His spirit is tied to his own flesh: he cannot run a stolen body
 * around the far side of a room while his own stands abandoned at the door.
 * Without it you could park your body out of reach and butcher the chamber from
 * inside one of theirs for nothing — which is what every measured run did. */
const LEASH = 300;
const LEASH_GRACE = 1.6;               // seconds of strain before it snaps
const VACANT_MULT = 2;                 // your empty body takes double
const WORN_TIME = 14;                  // how long you can hold one of theirs
// --- the room ---------------------------------------------------------------
const CLEAR_PAUSE = 1.2;               // beat after the last foe falls, before the door opens
/* Who has to be looked for, and who does not.
 *
 * This is a fight, not a second stealth level. The king's men came here for
 * Chaminuka: while he is in his own body they know where he is, facing or not.
 * What they have to actually LOOK for is his body once he has stepped out of it
 * — and that is what the pillars are for. One rule, and it makes the spirit form
 * the stealth tool rather than making the whole room a stealth puzzle. */
const AWARE_MULT = 1.7;                // they sense him this much further than they see
const LOOK_SPIN = 1.6;                 // radians per second while searching
const SEARCH_HALF_CONE = 0.95;        // pursuers search broadly, but not through 360 degrees
const BACK_TAKE_ANGLE = 1.35;         // radians: reach an alerted guard from behind
const BACK_TAKE_RANGE = 40;          // a close, deliberate transfer is required

/** Offered two at a time between chambers. Short, legible, and each one changes
 *  a number the player can feel rather than a number on a sheet. */
const GIFTS = {
  mend: { name: 'Mended', blurb: 'One heart back, now.', apply: (p) => { p.hp = Math.min(p.hpMax, p.hp + 1); } },
  vessel: { name: 'Deeper Vessel', blurb: 'One more heart, for good.', apply: (p) => { p.hpMax++; p.hp++; } },
  reach: { name: 'Long Spear', blurb: 'Your thrust reaches further.', apply: (p) => { p.reach += 16; } },
  swift: { name: 'Swift Foot', blurb: 'Dodge more often.', apply: (p) => { p.dodgeCd *= 0.62; } },
  tether: { name: 'Long Tether', blurb: 'You can stay out of your body far longer.', apply: (p) => { p.outMax += 6; } },
  ward: { name: 'Warded Body', blurb: 'Your empty body is no longer easy meat.', apply: (p) => { p.vacant = 1.15; } },
  keen: { name: 'Keen Hand', blurb: 'Your spear bites harder.', apply: (p) => { p.damage += 0.5; } },
};
const GIFT_KEYS = Object.keys(GIFTS);
// The four specializations apply only after the time jump. Palace possession
// still depends on borrowing someone else's identity, not on a combat build.
const BUILDS = Object.freeze({
  royal: { name: 'Royal Warrior', desc: 'One extra heart, an extra-long spear.', apply: (p) => { p.hpMax++; p.hp++; p.reach += 9; } },
  spirit: { name: 'Spirit Vessel', desc: 'Longer astral projection and easier possession.', apply: (p) => { p.outMax += 6; p.out = p.outMax; p.takeBonus += 12; } },
  shadow: { name: 'Shadow Hunter', desc: 'Quicker dodges and safer unattended body.', apply: (p) => { p.dodgeCd *= .75; p.vacant = Math.min(p.vacant, 1.55); } },
  elemental: { name: 'Elemental Adept', desc: 'Stronger spear strikes but one fewer heart.', apply: (p) => { p.damage += .35; p.hpMax = Math.max(2, p.hpMax - 1); p.hp = Math.min(p.hp, p.hpMax); } },
});

/** What Act I's affinities are worth here. Deliberately NOT drawn from the gift
 *  pool: they are extra, and they leave the four chamber gifts untouched. */
const CARRIED = {
  veiled: { name: 'Veiled', blurb: 'Your empty body is harder to find.', apply: (p) => { p.vacant = Math.min(p.vacant, 1.4); } },
  quick: { name: 'Quick', blurb: 'You reach into a body from further away.', apply: (p) => { p.takeBonus += 18; } },
  bold: { name: 'Bold', blurb: 'You can take a man even while he hunts you.', apply: () => {} },
};
const FROM_AFFINITY = { veiled: 'veiled', quick: 'quick', bold: 'bold' };

class Shrine {
  /** @param out  (pid|null, msg) => void — null means everybody */
  constructor(code, out) {
    this.code = code; this.out = out || (() => {});
    this.players = new Map(); this.nextPid = 1;
    this.phase = 'lobby'; this.time = 0; this.ev = [];
    this.map = null; this.foes = []; this.shots = [];
    this.chamberN = 0; this.cleared = 0; this.clearAt = 0;
    this.offer = null; this.runStart = 0; this.deaths = 0;
    this.betrayed = false; this.roused = false; this.lastX = 0; this.lastY = 0;
    this.field = null; this.fieldAt = -9; this.fieldX = 0; this.fieldY = 0;
    this.onRun = null; this.records = null;
    this.load = loadout([]);
  }

  // ---------------------------------------------------------------- players
  newPlayer(name) {
    const id = this.nextPid++;
    const p = {
      id, name, host: this.players.size === 0, connected: true,
      x: 0, y: 0, r: 11, aim: 0,
      form: 'self', foeId: 0,                 // 'self' | 'spirit' | 'worn'
      hp: 4, hpMax: 4, hurtT: 0, dead: false,
      swingT: 0, swingPhase: '', swingHit: null, recover: 0,
      dodgeT: 0, dodgeReady: 0, dodgeCd: DODGE_CD,
      out: OUT_MAX, outMax: OUT_MAX, wornT: 0, strain: 0,
      reach: SPEAR_REACH, damage: 1, vacant: VACANT_MULT, noticeMult: 1, takeBonus: 0, carried: [],
      refusals: 0, kills: 0, struckWhileWorn: false,
      gifts: [], affinities: [], build: 'unbound',
      inp: { mx: 0, my: 0, a: 0, atk: false, atkEdge: false, dodge: false, dodgeEdge: false,
        use: false, useEdge: false, pick: 0 },
    };
    this.players.set(id, p);
    if (this.map) { p.x = this.map.start.x; p.y = this.map.start.y; }
    this.sendLobby();
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    if (p.form === 'worn') this.release(p);
    this.players.delete(id);
    if (p.host) { const n = this.players.values().next().value; if (n) n.host = true; }
    this.sendLobby();
  }
  setInput(id, m) {
    const p = this.players.get(id); if (!p) return; const i = p.inp;
    const num = (v, d) => (Number.isFinite(+v) ? +v : d);
    i.mx = clamp(num(m.mx, 0), -1, 1); i.my = clamp(num(m.my, 0), -1, 1);
    i.a = num(m.a, i.a);
    if (m.atk && !i.atk) i.atkEdge = true; i.atk = !!m.atk;
    if (m.dodge && !i.dodge) i.dodgeEdge = true; i.dodge = !!m.dodge;
    if (m.use && !i.use) i.useEdge = true; i.use = !!m.use;
    if (Number.isFinite(+m.pick)) i.pick = +m.pick;
  }
  sendLobby() {
    this.out(null, { t: 'lobby', code: this.code, phase: this.phase, act: 2,
      players: [...this.players.values()].map((p) => ({ id: p.id, n: p.name, host: p.host })) });
  }

  // ---------------------------------------------------------------- the run
  /** @param opts { boons, affinities } carried out of Act I and the road. */
  begin(opts) {
    const o = opts || {};
    this.load = loadout(o.boons || []);
    this.chamberN = 0; this.deaths = 0; this.runStart = this.time;
    this.phase = 'run'; this.offer = null;
    for (const p of this.players.values()) {
      p.affinities = (o.affinities || []).slice();
      p.gifts = [];
      p.hpMax = this.load.maxHp; p.hp = p.hpMax;
      p.reach = SPEAR_REACH; p.damage = this.load.damage;
      p.vacant = VACANT_MULT; p.noticeMult = this.load.noticeMult;
      p.outMax = OUT_MAX * this.load.hostMult; p.out = p.outMax;
      p.dodgeCd = DODGE_CD; p.refusals = this.load.deathsRefused;
      p.kills = 0; p.dead = false; p.takeBonus = 0;
      // what Act I earned carries forward, without spending a chamber gift on it
      p.carried = [];
      for (const a of p.affinities) {
        const c = CARRIED[a];
        if (c && !p.carried.includes(a)) { p.carried.push(a); c.apply(p); }
      }
      if (BUILDS[p.build]) BUILDS[p.build].apply(p);
    }
    this.enterChamber(0);
  }

  enterChamber(n) {
    this.chamberN = n;
    this.map = chamber(n);
    this.betrayed = false; this.roused = false; this.clearAt = 0; this.offer = null;
    this.field = null; this.fieldAt = -9;
    this.shots = [];
    this.foes = this.map.foes.map((f) => {
      const k = FOES[f.kind];
      return { id: f.id, kind: f.kind, name: k.name, x: f.x, y: f.y, r: 11, aim: Math.PI,
        hp: k.hp, hpMax: k.hp, state: 'watch', tellT: 0, restT: 0, stunT: 0, stunOkAt: 0, hurtT: 0,
        wornBy: 0, home: f.home, lostT: 0, dead: false };
    });
    let i = 0;
    for (const p of this.players.values()) {
      if (p.form === 'worn') p.foeId = 0;
      p.form = 'self'; p.swingT = 0; p.swingPhase = ''; p.recover = 0; p.dodgeT = 0;
      p.out = p.outMax; p.struckWhileWorn = false; p.strain = 0;
      p.x = this.map.start.x + (i % 2) * 20; p.y = this.map.start.y + (i > 1 ? 24 : 0); i++;
    }
    this.phase = 'run';
    this.out(null, this.mapMsg());
    this.ev.push(['ban', this.map.name, this.map.line]);
  }

  mapMsg() {
    const m = this.map; if (!m) return null;
    return { t: 'map2', act: 2, w: m.w, h: m.h, rows: m.rows, name: m.name, line: m.line,
      index: m.index, last: m.last, door: m.door, phase: this.phase,
      foes: Object.fromEntries(Object.entries(FOES).map(([k, v]) => [k, { name: v.name, col: v.col }])),
      boons: this.load.boons };
  }
  syncTo(pid) { this.sendLobby(); if (this.phase !== 'lobby') this.out(pid, this.mapMsg()); }

  /** The whole room joins in, and remembers where the flesh was last seen. */
  rouseRoom(x, y) {
    this.lastX = x; this.lastY = y;
    if (!this.roused) {
      this.roused = true;
      this.ev.push(['ban', 'THE ROOM TURNS', 'They have all seen him now.']);
    }
    for (const f of this.foes) if (!f.dead && !f.wornBy && f.state === 'watch') { f.state = 'hunt'; f.lostT = 0; }
  }
  foe(id) { return this.foes.find((f) => f.id === id) || null; }
  alive() { return this.foes.filter((f) => !f.dead); }
  /** Somebody still standing and still fighting for the king. */
  hostiles() { return this.foes.filter((f) => !f.dead && !f.wornBy); }

  // ---------------------------------------------------------------- stepping out
  /** The foe you could step into right now. Not one you are already in, not a
   *  corpse — and, unless Act I made you Bold, not one mid-swing at you. */
  takeTarget(p) {
    if (p.form !== 'spirit') return null;
    const bold = p.affinities.includes('bold');
    let best = null, bd = TAKE_RANGE + (p.takeBonus || 0);
    for (const f of this.foes) {
      if (f.dead || f.wornBy) continue;
      if (f.state === 'strike' && !bold) continue;
      const d = hyp(f.x, f.y, p.x, p.y);
      // After betrayal, frontal possession of an actively hunting guard
      // remains blocked. The spirit can escape by slipping close behind him,
      // while the Bold affinity can bypass that restriction.
      if (f.state === 'hunt' && this.betrayed && !bold) {
        const behind = angDiff(f.aim, Math.atan2(p.y - f.y, p.x - f.x)) > BACK_TAKE_ANGLE;
        if (d < 12 || d > BACK_TAKE_RANGE || !behind) continue;
      }
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  stepOut(p) {
    if (p.form !== 'self' || p.dead) return;
    p.form = 'spirit';
    p.bodyX = p.x; p.bodyY = p.y;                 // the body stays where you left it
    p.hp = Math.max(0, p.hp - 0);                 // stepping out costs no health, only exposure
    p.swingT = 0; p.swingPhase = ''; p.recover = OUT_SETTLE;
    this.ev.push(['out', rd(p.x), rd(p.y), p.id]);
    this.ev.push(['feed', `${p.name} steps out of his body`]);
  }
  stepIn(p) {
    if (p.form !== 'spirit') return;
    // back into your own body, wherever you left it
    p.form = 'self'; p.x = p.bodyX; p.y = p.bodyY;
    this.ev.push(['in', rd(p.x), rd(p.y), p.id]);
  }
  wear(p, f) {
    p.form = 'worn'; p.foeId = f.id; p.wornT = WORN_TIME;
    p.x = f.x; p.y = f.y; p.struckWhileWorn = false;
    f.wornBy = p.id; f.state = 'watch'; f.tellT = 0; f.stunT = 0;
    p.recover = TAKE_SETTLE;                   // it takes a moment to fit inside a man
    p.swingT = 0; p.swingPhase = 'rest';
    this.ev.push(['wear', rd(f.x), rd(f.y), f.kind, p.id]);
    this.ev.push(['feed', `${p.name} is wearing a ${f.name} — they have lost him`]);
  }
  release(p) {
    const f = this.foe(p.foeId);
    if (f) { f.wornBy = 0; f.state = 'hunt'; f.lostT = 0; }
    p.foeId = 0; p.form = 'spirit';
    p.x = f ? f.x : p.x; p.y = f ? f.y : p.y;
    this.ev.push(['shed', rd(p.x), rd(p.y), p.id]);
  }

  // ---------------------------------------------------------------- damage
  /** Where a player's flesh actually is — the thing that can be hurt. */
  bodyOf(p) {
    if (p.form === 'self') return { x: p.x, y: p.y, vacant: false };
    if (p.form === 'worn') return { x: p.bodyX, y: p.bodyY, vacant: true };
    return { x: p.bodyX, y: p.bodyY, vacant: true };
  }
  hurt(p, n, from) {
    if (p.dead || this.time < p.hurtT) return;
    if (p.form === 'self' && p.dodgeT > 0) { this.ev.push(['whiff', rd(p.x), rd(p.y)]); return; }
    const mult = p.form === 'self' ? 1 : p.vacant;
    const dmg = Math.max(1, Math.round(n * mult));
    p.hp -= dmg;
    p.hurtT = this.time + IFRAME;
    const b = this.bodyOf(p);
    this.ev.push(['hurt', rd(b.x), rd(b.y), dmg, p.id]);
    if (dmg > n) this.ev.push(['ban', 'HIS BODY IS UNGUARDED', 'Hits land twice as hard while you are out of it.']);
    if (p.hp <= 0) this.down(p, from);
  }
  down(p, from) {
    if (p.refusals > 0) {
      p.refusals--; p.hp = 1; p.hurtT = this.time + IFRAME * 2;
      this.ev.push(['refused', rd(p.x), rd(p.y), p.id]);
      this.ev.push(['ban', 'THE DEBT IS PAID', 'Somebody died for him on the road. Not today.']);
      return;
    }
    p.dead = true;
    if (p.form === 'worn') this.release(p);
    p.form = 'self';
    this.ev.push(['down', rd(p.x), rd(p.y), p.id]);
    if ([...this.players.values()].every((q) => q.dead || !q.connected)) this.wipe(from);
  }
  /** Everybody is down. Costs the chamber, not the campaign. */
  wipe(from) {
    if (this.phase !== 'run') return;
    this.phase = 'down';
    this.deaths++;
    this.ev.push(['ban', 'HE FALLS', 'The shrine is not taken today. Rise, and go again.']);
    this.lastDown = { t: 'down', chamber: this.chamberN + 1, chamberName: this.map.name,
      deaths: this.deaths, by: from || 'the king’s men',
      next: 'The mediums carry him back to the outer court. He has done this before.' };
    this.out(null, this.lastDown);
  }

  // ---------------------------------------------------------------- the spear
  startSwing(p) {
    if (p.swingT > 0 || p.recover > 0 || p.dodgeT > 0 || p.dead) return;
    if (p.form === 'spirit') return;                    // a spirit has no hands
    p.swingT = SPEAR_TELL + SPEAR_SWING;
    p.swingPhase = 'tell'; p.swingHit = new Set(); p.recover = 0;
  }
  /** The active frames of a thrust, resolved as an arc in front of you. */
  resolveSwing(p) {
    const reach = p.reach + (p.form === 'worn' ? 8 : 0);
    for (const f of this.foes) {
      if (f.dead || f.id === p.foeId || p.swingHit.has('f' + f.id)) continue;
      if (hyp(f.x, f.y, p.x, p.y) > reach) continue;
      if (angDiff(Math.atan2(f.y - p.y, f.x - p.x), p.aim) > SPEAR_ARC) continue;
      if (!los(this.map, p.x, p.y, f.x, f.y)) continue;
      p.swingHit.add('f' + f.id);
      f.hp -= p.damage; f.hurtT = this.time + 0.2;
      // You can knock a man off his stride, but not out of a blow he has already
      // committed to, and not twice in a row. Mashing does not win fights here.
      if (f.state !== 'strike' && this.time >= (f.stunOkAt || 0)) {
        f.stunT = this.time + HIT_STUN;
        f.stunOkAt = this.time + STUN_IMMUNE;
      }
      this.ev.push(['hit', rd(f.x), rd(f.y), p.id]);
      this.rouseRoom(p.x, p.y);              // steel on a man is heard across a room
      if (f.hp <= 0) {
        f.dead = true; f.wornBy = 0; p.kills++;
        this.ev.push(['kill', rd(f.x), rd(f.y), f.kind]);
      } else {
        f.state = 'hunt'; f.lostT = 0;
      }
      // striking from inside one of theirs gives the game away, all at once
      if (p.form === 'worn' && !p.struckWhileWorn) {
        p.struckWhileWorn = true; this.betrayed = true;
        for (const o of this.foes) if (!o.dead && !o.wornBy) { o.state = 'hunt'; o.lostT = 0; }
        this.ev.push(['ban', 'THEY KNOW', 'Strike from inside one of theirs and every one of them turns.']);
      }
    }
  }

  // ---------------------------------------------------------------- per-tick
  updatePlayers() {
    for (const p of this.players.values()) {
      const i = p.inp;
      const clearEdges = () => { i.atkEdge = false; i.dodgeEdge = false; i.useEdge = false; };
      if (p.dead || !p.connected) { clearEdges(); continue; }
      p.aim = i.a;

      // --- stepping between bodies
      if (i.useEdge) {
        if (p.form === 'self') this.stepOut(p);
        else if (p.form === 'worn') this.release(p);
        else {
          const t = this.takeTarget(p);
          if (t) this.wear(p, t);
          else if (hyp(p.x, p.y, p.bodyX, p.bodyY) < 40) this.stepIn(p);
          else this.ev.push(['nope', rd(p.x), rd(p.y)]);
        }
      }

      // --- the dodge
      // no rolling out of your own thrust, at any point in it
      if (i.dodgeEdge && p.form !== 'spirit' && this.time >= p.dodgeReady && p.dodgeT <= 0 && !p.swingPhase) {
        p.dodgeT = DODGE_TIME; p.dodgeReady = this.time + p.dodgeCd;
        p.dodgeAim = (i.mx || i.my) ? Math.atan2(i.my, i.mx) : p.aim;
        this.ev.push(['dodge', rd(p.x), rd(p.y), p.id]);
      }
      if (p.dodgeT > 0) p.dodgeT -= DT;

      // --- the spear
      if (i.atkEdge) this.startSwing(p);
      if (p.swingT > 0) {
        const before = p.swingPhase;
        p.swingT -= DT;
        p.swingPhase = p.swingT > SPEAR_SWING ? 'tell' : 'swing';
        if (p.swingPhase === 'swing') this.resolveSwing(p);
        if (before !== 'swing' && p.swingPhase === 'swing') this.ev.push(['thrust', rd(p.x), rd(p.y), +p.aim.toFixed(2), p.id]);
        if (p.swingT <= 0) {
          // the thrust is over: a hit carries him through, a miss leaves him hanging
          const found = p.swingHit && p.swingHit.size;
          p.recover = found ? SPEAR_REST : SPEAR_WHIFF;
          if (!found) this.ev.push(['whiff', rd(p.x), rd(p.y), p.id]);
          p.swingT = 0; p.swingPhase = 'rest'; p.swingHit = null;
        }
      } else if (p.recover > 0) {
        p.recover -= DT;
        p.swingPhase = p.recover > 0 ? 'rest' : '';
      }

      // --- moving
      let sp = p.form === 'spirit' ? OUT_SPEED : p.form === 'worn' ? FOES[this.foe(p.foeId) ? this.foe(p.foeId).kind : 'spearman'].speed * 1.25 : SPEED;
      if (p.swingPhase === 'tell' || p.swingPhase === 'swing') sp *= 0.35;
      if (p.swingPhase === 'rest') sp *= 0.7;
      let mx = i.mx, my = i.my;
      if (p.dodgeT > 0) { mx = Math.cos(p.dodgeAim); my = Math.sin(p.dodgeAim); sp = DODGE_SPEED; }
      else { const l = Math.hypot(mx, my) || 1; mx /= l; my /= l; if (!i.mx && !i.my) { mx = 0; my = 0; } }
      moveBy(this.map, p, mx * sp * DT, my * sp * DT, p.form === 'spirit' ? 'spirit' : 'self');

      // --- the two clocks that belong to stepping out
      if (p.form === 'spirit') {
        p.out -= DT;
        if (p.out <= 0) {                       // dragged back whether you like it or not
          p.out = p.outMax * 0.4; this.stepIn(p);
          this.ev.push(['ban', 'HE IS PULLED BACK', 'You cannot stay out of your own body forever.']);
        }
      } else if (p.form === 'worn') {
        const f = this.foe(p.foeId);
        if (!f || f.dead) { p.form = 'spirit'; p.foeId = 0; }
        else {
          f.x = p.x; f.y = p.y; f.aim = p.aim;
          p.wornT -= DT;
          p.out = Math.min(p.outMax, p.out + OUT_REGEN * DT);
          // how far you have dragged this man from your own body
          const pull = hyp(p.x, p.y, p.bodyX, p.bodyY);
          if (pull > LEASH) {
            p.strain += DT;
            if (p.strain > LEASH_GRACE) {
              this.release(p); p.strain = 0;
              this.ev.push(['ban', 'THE THREAD PULLS TIGHT', 'Too far from his own flesh. Stay near your body.']);
            } else if (p.strain < DT * 2) {
              this.ev.push(['ban', 'TOO FAR FROM HIS BODY', 'Bring him back toward your own, or be torn out of him.']);
            }
          } else p.strain = Math.max(0, p.strain - DT * 2);
          if (p.wornT <= 0) { this.release(p); this.ev.push(['ban', 'HE THROWS YOU OUT', 'Find your own body, or another of theirs.']); }
        }
      } else {
        p.out = Math.min(p.outMax, p.out + OUT_REGEN * DT);
        p.bodyX = p.x; p.bodyY = p.y;
      }
      clearEdges();
    }
  }

  /** Everything in the room a foe might go for.
   *
   *  Three kinds of mark, and the difference is the whole balance of the act:
   *    flesh   — Chaminuka standing in his own body. The ordinary case.
   *    vacant  — his body with nobody home. Takes double, and is what they will
   *              walk across the room to reach once they have lost him.
   *    worn    — one of their own with him inside it. Once he has struck, they
   *              fight the man in front of them: their blows wound the borrowed
   *              body, not him, and when it falls he is spat out into the open.
   *
   *  Without the third kind you could park your body in a corner and butcher the
   *  room from inside one of theirs for free, which is exactly what happened the
   *  first time this was measured. */
  marks() {
    const out = [];
    for (const p of this.players.values()) {
      if (p.dead || !p.connected) continue;
      if (p.form === 'self') { out.push({ p, kind: 'flesh', x: p.x, y: p.y, vacant: false }); continue; }
      out.push({ p, kind: 'vacant', x: p.bodyX, y: p.bodyY, vacant: true });
      // a man being stabbed fights the thing stabbing him
      // A past betrayal cannot expose an unrelated, freshly borrowed guard.
      // Only a strike from the CURRENT borrowed identity reveals that one.
      if (p.form === 'worn' && p.struckWhileWorn) {
        const f = this.foe(p.foeId);
        if (f && !f.dead) out.push({ p, kind: 'worn', foe: f, x: p.x, y: p.y, vacant: false });
      }
    }
    return out;
  }
  /** What a foe is currently going for: the nearest mark it has any business with. */
  pickTarget(f) {
    let best = null, bd = 1e9;
    for (const m of this.marks()) {
      if (m.kind === 'worn' && m.foe.id === f.id) continue;      // not himself
      const d = hyp(f.x, f.y, m.x, m.y);
      const want = m.kind === 'vacant' ? d * 0.6 : d;             // an empty body draws them
      if (want < bd) { bd = want; best = { p: m.p, b: m, d, mark: m }; }
    }
    return best;
  }
  /** A blow landing on a mark. Where it lands decides what it costs. */
  strikeMark(mark, n, from) {
    if (!mark) return;
    if (mark.kind === 'worn') {
      const f = mark.foe;
      if (!f || f.dead) return;
      f.hp -= n; f.hurtT = this.time + 0.2;
      this.ev.push(['hit', rd(f.x), rd(f.y), 0]);
      if (f.hp <= 0) {
        f.dead = true; f.wornBy = 0;
        const p = mark.p;
        p.form = 'spirit'; p.foeId = 0; p.x = f.x; p.y = f.y;
        this.ev.push(['kill', rd(f.x), rd(f.y), f.kind]);
        this.ev.push(['ban', 'THE BODY FAILS', 'They have cut the man out from under you. Find another, fast.']);
      }
      return;
    }
    this.hurt(mark.p, n, from);
  }

  /** A shared path to wherever the flesh was last known to be. */
  pathTo(x, y) {
    const moved = hyp(x, y, this.fieldX, this.fieldY) > TILE;
    if (!this.field || moved || this.time - this.fieldAt > 0.3) {
      this.field = flowField(this.map, { x, y }, 'self');
      this.fieldAt = this.time; this.fieldX = x; this.fieldY = y;
    }
    return this.field;
  }
  updateFoes() {
    const k = (f) => FOES[f.kind];
    for (const f of this.foes) {
      if (f.dead || f.wornBy) continue;
      const spec = k(f);
      if (this.time < f.stunT && f.state !== 'strike') continue;
      const t = this.pickTarget(f);
      if (!t) { f.state = 'watch'; continue; }
      // In his own body he is simply known. Out of it, his flesh must be found.
      const reach = spec.notice * t.p.noticeMult;
      const seen = t.b.vacant
        ? canSee(this.map, f, t.b.x, t.b.y, reach,
            f.state === 'hunt' ? Math.max(SEARCH_HALF_CONE, spec.cone) : spec.cone)
        : (t.d <= reach * AWARE_MULT && los(this.map, f.x, f.y, t.b.x, t.b.y));
      if (seen) {
        f.state = f.state === 'watch' ? 'hunt' : f.state;
        f.lastX = t.b.x; f.lastY = t.b.y; f.lostT = 0;
        if (!t.b.vacant) this.rouseRoom(t.b.x, t.b.y);
      }
      else if (f.state === 'hunt') { f.lostT += DT; if (f.lostT > 4) { f.state = 'watch'; f.lostT = 0; } }

      // --- the swing, telegraphed on purpose so it can be dodged
      if (f.state === 'strike') {
        f.tellT -= DT;
        if (f.tellT <= 0) {
          f.state = 'rest'; f.restT = spec.rest;
          if (spec.ranged && !f.melee) {
            // he does not loose into stone: break his sight and the arrow never comes
            if (los(this.map, f.x, f.y, t.b.x, t.b.y)) {
              this.shots.push({ x: f.x, y: f.y, a: f.aim, sp: 290, dmg: spec.dmg, life: 2.2, from: f.name });
              this.ev.push(['shot', rd(f.x), rd(f.y), +f.aim.toFixed(2)]);
            } else this.ev.push(['held', rd(f.x), rd(f.y)]);
          } else {
            f.melee = false;
            moveBy(this.map, f, Math.cos(f.aim) * LUNGE, Math.sin(f.aim) * LUNGE, 'self');
            this.ev.push(['swipe', rd(f.x), rd(f.y), +f.aim.toFixed(2)]);
            const d2 = hyp(f.x, f.y, t.b.x, t.b.y);
            if (d2 <= spec.reach + 6 && angDiff(Math.atan2(t.b.y - f.y, t.b.x - f.x), f.aim) < 1.0) {
              this.strikeMark(t.mark, spec.dmg, f.name);
            }
          }
        }
        continue;
      }
      if (f.state === 'rest') { f.restT -= DT; if (f.restT <= 0) f.state = 'hunt'; continue; }

      // --- closing, or keeping distance if it throws
      if (f.state === 'hunt' && seen) {
        f.aim = Math.atan2(t.b.y - f.y, t.b.x - f.x);
        const cornered = spec.ranged && t.d < 92;      // too close to draw a bow
        const want = spec.ranged && !cornered ? spec.keep : spec.commit - 24;
        const far = t.d - want;
        if (cornered ? t.d <= 70 : spec.ranged ? Math.abs(far) < 40 && t.d < spec.reach : t.d <= spec.commit) {
          if (cornered) { f.state = 'strike'; f.tellT = 0.3; f.melee = true;
            this.ev.push(['tell', rd(f.x), rd(f.y), +f.aim.toFixed(2), f.kind]); continue; }
          f.state = 'strike'; f.tellT = spec.tell;
          this.ev.push(['tell', rd(f.x), rd(f.y), +f.aim.toFixed(2), f.kind]);
          continue;
        }
        const dir = far > 0 ? 1 : -1;
        const bx = f.x, by = f.y;
        moveBy(this.map, f, Math.cos(f.aim) * spec.speed * dir * DT, Math.sin(f.aim) * spec.speed * dir * DT, 'self');
        if (dir > 0 && hyp(bx, by, f.x, f.y) < spec.speed * 0.25 * DT) {
          const a = flowStep(this.pathTo(t.b.x, t.b.y), f.x, f.y);   // stone in the way: go round
          if (a !== null) moveBy(this.map, f, Math.cos(a) * spec.speed * DT, Math.sin(a) * spec.speed * DT, 'self');
        }
      } else if (this.roused && !f.dead) {
        // can't see him, but knows the fight is on: walk the path to where he was
        const gx = f.lastX || this.lastX || t.b.x, gy = f.lastY || this.lastY || t.b.y;
        if (hyp(f.x, f.y, gx, gy) > 26) {
          const a = flowStep(this.pathTo(gx, gy), f.x, f.y);
          if (a === null) { f.aim += DT * LOOK_SPIN; }
          else {
            f.aim = a;
            moveBy(this.map, f, Math.cos(a) * spec.speed * 0.9 * DT, Math.sin(a) * spec.speed * 0.9 * DT, 'self');
          }
        } else { f.lastX = 0; f.lastY = 0; f.aim += DT * LOOK_SPIN; }
      } else {
        // nothing in sight and nothing happening: drift home and look around
        const d = hyp(f.x, f.y, f.home.x, f.home.y);
        if (d > 12) {
          const a = Math.atan2(f.home.y - f.y, f.home.x - f.x);
          f.aim = a;
          moveBy(this.map, f, Math.cos(a) * spec.speed * 0.5 * DT, Math.sin(a) * spec.speed * 0.5 * DT, 'self');
        } else f.aim += DT * LOOK_SPIN;          // casting about for him
      }
    }
  }

  updateShots() {
    for (const s of this.shots) {
      s.life -= DT;
      const nx = s.x + Math.cos(s.a) * s.sp * DT, ny = s.y + Math.sin(s.a) * s.sp * DT;
      if (blocked(this.map, nx, ny, 3, 'self')) { s.life = 0; continue; }
      s.x = nx; s.y = ny;
      for (const m of this.marks()) {
        if (hyp(s.x, s.y, m.x, m.y) < 14) { this.strikeMark(m, s.dmg, s.from); s.life = 0; break; }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  // ---------------------------------------------------------------- chambers
  /** At the threshold he comes back to himself: a stolen body is let go and a
   *  wandering spirit is put back where it belongs. Nobody walks into the next
   *  chamber wearing somebody else's skin. */
  gather() {
    for (const p of this.players.values()) {
      if (p.form === 'worn') { this.release(p); this.ev.push(['feed', `${p.name} lets the body go at the threshold`]); }
      if (p.form === 'spirit') { p.form = 'self'; p.out = p.outMax; }
    }
  }
  /** Two gifts, never the same two, never one you already hold. */
  rollOffer() {
    const held = new Set();
    for (const p of this.players.values()) for (const g of p.gifts) held.add(g);
    // A heal offered to a party at full health is a dead option — it reads as a
    // choice and is really a wasted pick. Only put it up when somebody is hurt.
    const hurt = [...this.players.values()].some((p) => p.hp < p.hpMax);
    const pool = GIFT_KEYS.filter((g) => (g === 'mend' ? hurt : !held.has(g)));
    const pick = [];
    while (pick.length < 2 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    if (!pick.length) pick.push('mend');
    this.offer = pick.map((g) => ({ key: g, name: GIFTS[g].name, blurb: GIFTS[g].blurb }));
    this.phase = 'gift';
    this.out(null, { t: 'gift', offer: this.offer, chamber: this.chamberN + 1,
      of: require('./shrine').CHAMBERS.length, next: this.map.last ? null : 'The next door is already open.' });
  }
  takeGift(pid, key) {
    if (this.phase !== 'gift' || !this.offer) return;
    const p = this.players.get(pid); if (!p || !p.host) return;
    const g = this.offer.find((o) => o.key === key) || this.offer[0];
    for (const q of this.players.values()) {
      if (!q.gifts.includes(g.key) || g.key === 'mend') {
        if (g.key !== 'mend') q.gifts.push(g.key);
        GIFTS[g.key].apply(q);
      }
    }
    this.offer = null;
    this.ev.push(['feed', `Taken: ${g.name} — ${g.blurb}`]);
    if (this.map.last) this.finish();
    else this.enterChamber(this.chamberN + 1);
  }
  finish() {
    this.phase = 'done';
    const secs = +(this.time - this.runStart).toFixed(1);
    const all = [...this.players.values()];
    const rec = { won: true, act: 2, by: all[0] ? all[0].name : 'Chaminuka', secs,
      deaths: this.deaths, kills: all.reduce((n, q) => n + q.kills, 0),
      gifts: all[0] ? all[0].gifts.slice() : [], boons: this.load.boons.slice(),
      builds: all.map((p) => p.build) };
    if (this.onRun) this.onRun(rec);
    this.lastDone = Object.assign({ t: 'done' }, rec, {
      line: 'The captain of the guard is dead at the inner shrine, and the king knows the boy’s name.',
      next: 'ACT III — THE KING’S HOUSE. Not built yet. This is as far as the road goes.',
      board: this.records ? this.records.top() : null,
      finale: require('./story').scenes('finale'),
    });
    this.out(null, this.lastDone);
  }

  tick() {
    this.time += DT; this.ev = [];
    if (this.phase !== 'run') return;
    this.updatePlayers();
    this.updateFoes();
    this.updateShots();
    // the room is clear: a beat, then the door
    if (!this.hostiles().length && !this.clearAt) {
      this.clearAt = this.time + CLEAR_PAUSE;
      this.ev.push(['ban', 'THE ROOM IS STILL', this.map.last ? 'The inner shrine is yours.' : 'The far door is open.']);
    }
    if (this.clearAt && this.time >= this.clearAt) {
      for (const p of this.players.values()) {
        // wherever he is standing, in whosever body — not the shell he left behind
        if (p.dead) continue;
        if (hyp(p.x, p.y, this.map.door.x, this.map.door.y) >= this.map.door.r) continue;
        this.gather();
        this.rollOffer();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- snapshot
  sharedJSON() {
    return JSON.stringify({
      t: 's2', tm: +this.time.toFixed(2), ph: this.phase, ch: this.chamberN,
      open: this.clearAt && this.time >= this.clearAt ? 1 : 0, betrayed: this.betrayed ? 1 : 0,
      p: [...this.players.values()].map((p) => {
        const b = this.bodyOf(p);
        return { i: p.id, x: rd(p.x), y: rd(p.y), a: +p.aim.toFixed(2),
          f: p.form === 'self' ? 0 : p.form === 'spirit' ? 1 : 2, w: p.foeId,
          bx: rd(b.x), by: rd(b.y), v: b.vacant ? 1 : 0,
          hp: p.hp, hm: p.hpMax, d: p.dead ? 1 : 0, sw: p.swingPhase || '',
          dg: p.dodgeT > 0 ? 1 : 0, iv: this.time < p.hurtT ? 1 : 0 };
      }),
      f: this.foes.filter((f) => !f.dead).map((f) => [f.id, f.kind, rd(f.x), rd(f.y), +f.aim.toFixed(2),
        f.state, f.hp, f.hpMax, f.wornBy, this.time < f.hurtT ? 1 : 0,
        rd(FOES[f.kind].notice), +FOES[f.kind].cone.toFixed(2)]),
      s: this.shots.map((s) => [rd(s.x), rd(s.y)]),
      door: this.map ? [rd(this.map.door.x), rd(this.map.door.y)] : null,
      ev: this.ev,
    });
  }
  meJSON(pid) {
    const p = this.players.get(pid); if (!p) return '{}';
    const t = this.takeTarget(p);
    const f = p.form === 'worn' ? this.foe(p.foeId) : null;
    return JSON.stringify({
      act: 2, build: p.build, buildName: BUILDS[p.build] ? BUILDS[p.build].name : 'Unbound', form: p.form, hp: p.hp, hpMax: p.hpMax, dead: p.dead ? 1 : 0,
      out: +Math.max(0, p.out).toFixed(1), outMax: +p.outMax.toFixed(1),
      wornT: f ? +Math.max(0, p.wornT).toFixed(1) : 0, wornName: f ? f.name : null,
      vacant: p.form === 'self' ? 0 : 1, vacantMult: p.vacant,
      leash: p.form === 'worn' ? Math.round(hyp(p.x, p.y, p.bodyX, p.bodyY)) : 0,
      leashMax: LEASH, strain: +(p.strain || 0).toFixed(1), strainMax: LEASH_GRACE,
      dodgeCd: +Math.max(0, p.dodgeReady - this.time).toFixed(1),
      target: t ? { id: t.id, name: t.name, kind: t.kind } : null,
      canReturn: p.form === 'spirit' && hyp(p.x, p.y, p.bodyX, p.bodyY) < 40 ? 1 : 0,
      left: this.hostiles().length, chamber: this.chamberN + 1,
      gifts: p.gifts.map((g) => ({ key: g, name: GIFTS[g].name, blurb: GIFTS[g].blurb })),
      carried: (p.carried || []).map((a) => ({ key: a, name: CARRIED[a].name, blurb: CARRIED[a].blurb })),
      boons: this.load.boons, refusals: p.refusals, kills: p.kills,
      offer: this.offer,
    });
  }
}

module.exports = { Shrine, BUILDS, GIFTS, CARRIED, FROM_AFFINITY, TICK, DT, SPEAR_REACH, OUT_MAX,
  VACANT_MULT, WORN_TIME, DODGE_TIME, IFRAME, LEASH, LEASH_GRACE, TAKE_SETTLE };
