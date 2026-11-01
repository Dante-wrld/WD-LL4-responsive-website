'use strict';
/* THE CAMPAIGN — one party, three stages, one thread running through them.
 *
 *   ACT I     the palace. Possession, suspicion, two gates. (vessel.js)
 *   THE ROAD  three nights north, three choices that each cost. (road.js)
 *   ACT II    the shrine, sixteen years on. (act2.js)
 *
 * What crosses the joins is the point of having them: the affinities earned in
 * the palace change how Act II plays, and what you gave up on the road decides
 * what you arrive with. This object is only the join — it holds no rules of its
 * own, it just keeps the roster stable and hands the right things forward.
 */
const { Room } = require('./vessel');
const { Shrine, BUILDS } = require('./act2');
const { NIGHTS, resolve, night } = require('./road');
const { scenes, reel, STORY_TIMEOUT } = require('./story');

class Session {
  /** @param out (pid|null, msg) => void */
  constructor(code, out) {
    this.code = code;
    this.out = out || (() => {});
    this.roster = [];              // [{ id, name, host }] — stable across all three stages
    this.nextId = 1;
    this.stage = 'act1';           // 'act1' | 'road' | 'act2'
    this.choices = {};             // the road, as answered so far
    this.nightN = 0;
    this.story = null;             // a cinematic barrier, if one is up
    this.carried = { affinities: [], boons: [] };
    this.records = null;
    this.onRun = null;
    this.relay = (pid, m) => {
      if (m && m.t === 'lobby') {
        m.stage = this.stage;
        m.phase = this.phase;
        m.players = this.roster.map((r) => ({ id: r.id, n: r.name, host: r.host, build: r.build, online: !!r.connected }));
      }
      this.out(pid, m);
      // Deliver the first Act II state immediately after its map. Without this,
      // a client can briefly render the shrine using stale Act I state while
      // waiting for the next 30 Hz broadcast. Each seat receives its own me.
      if (m && m.t === 'map2') this.sendShrineSnapshot(pid);
    };
    this.room = new Room(code, this.relay);
    this.shrine = null;
    this.room.clients = new Map();
  }

  // ---------------------------------------------------------------- plumbing
  /** Whichever stage is currently running the game. */
  get active() { return this.stage === 'act2' ? this.shrine : this.room; }
  get players() { return this.active ? this.active.players : new Map(); }
  get phase() {
    if (this.story) return 'prologue';      // any cinematic barrier, wherever it sits
    if (this.stage === 'road') return 'road';
    return this.active ? this.active.phase : 'lobby';
  }
  get bodies() { return this.room.bodies; }
  get infant() { return this.room.infant; }
  get map() { return this.active ? this.active.map : null; }
  body(id) { return this.room.body(id); }

  /** Rebuild a stage's player list from the roster, in order, so ids line up. */
  seat(stage) {
    for (const r of this.roster) {
      const p = stage.newPlayer(r.name);
      p.id = r.id; p.host = r.host; p.connected = !!r.connected; p.build = r.build || 'royal';
    }
    stage.players = new Map([...stage.players.values()].map((p) => [p.id, p]));
    stage.nextPid = this.nextId;
  }

  newPlayer(name) {
    const seat = { id: this.nextId++, name: String(name || 'Spirit'), host: this.roster.length === 0,
      connected: true, build: 'royal', tokenHash: null };
    this.roster.push(seat);
    const p = this.active.newPlayer(name);
    p.id = seat.id; p.host = seat.host; p.build = seat.build;
    this.active.players = new Map([...this.active.players.values()].map((q) => [q.id, q]));
    this.active.nextPid = this.nextId;
    this.sendLobby();
    return p;
  }
  // Rejoining preserves this seat, XP/build and chapter, not another player's slot.
  reconnect(id) {
    const r = this.roster.find((x) => x.id === id); if (!r) return null;
    r.connected = true;
    const p = this.players.get(id); if (p) { p.connected = true; p.inp && Object.keys(p.inp).forEach((k) => { if (typeof p.inp[k] === 'boolean') p.inp[k] = false; }); }
    this.sendLobby(); return p;
  }
  disconnect(id) {
    const r = this.roster.find((x) => x.id === id); if (r) r.connected = false;
    const p = this.players.get(id);
    if (r && r.host) {
      const next = this.roster.find((x) => x.id !== id && x.connected);
      if (next) { r.host = false; next.host = true; const recipient = this.players.get(next.id); if (recipient) recipient.host = true; if (p) p.host = false; }
    }
    if (p) {
      if (this.stage === 'act1') {
        if (p.carrying) this.room.dropInfant(p);
        if (p.form === 'worn') this.room.leaveBody(p, 'slump');
      } else if (this.stage === 'act2' && p.form === 'worn') this.shrine.release(p);
      p.connected = false;
      if (p.inp) for (const k of Object.keys(p.inp)) if (typeof p.inp[k] === 'boolean') p.inp[k] = false;
    }
    if (this.story) this.maybeEndStory();
    this.sendLobby();
  }
  chooseBuild(pid, key) {
    if (!Object.hasOwn(BUILDS, key)) return false;
    // No build swaps in a live fight. The sanctuary is a safe checkpoint.
    if (this.stage === 'act2' && this.shrine.phase === 'run') return false;
    const r = this.roster.find((x) => x.id === pid); if (!r) return false;
    r.build = key;
    const p = this.players.get(pid); if (p) p.build = key;
    this.sendLobby(); return true;
  }
  removePlayer(id) {
    const i = this.roster.findIndex((r) => r.id === id);
    const wasHost = i >= 0 && this.roster[i].host;
    if (i >= 0) this.roster.splice(i, 1);
    if (wasHost && this.roster.length) {
      this.roster[0].host = true;
      const p = this.players.get(this.roster[0].id); if (p) p.host = true;
    }
    if (this.active) this.active.removePlayer(id);
    if (this.story) { this.story.ready.delete(id); this.maybeEndStory(); }
    this.sendLobby();
  }
  setInput(id, m) { if (this.active) this.active.setInput(id, m); }
  isHost(id) { const r = this.roster.find((x) => x.id === id); return !!(r && r.host); }

  sendLobby() { this.relay(null, { t: 'lobby', code: this.code }); }

  sendShrineSnapshot(pid) {
    if (this.stage !== 'act2' || !this.shrine || !this.shrine.map) return;
    const shared = JSON.parse(this.shrine.sharedJSON());
    const sendSeat = (id) => {
      if (!this.shrine.players.has(id)) return;
      this.out(id, { ...shared, me: JSON.parse(this.shrine.meJSON(id)) });
    };
    if (pid != null) return sendSeat(pid);
    for (const r of this.roster) if (r.connected) sendSeat(r.id);
  }
  syncTo(pid) {
    this.sendLobby();
    // somebody arriving mid-cinematic watches it too, rather than standing in a
    // palace that has not been built
    if (this.story) return this.out(pid, Object.assign({ t: 'story', key: this.story.key,
      scenes: scenes(this.story.key), wait: true }, this.story.extra || {}));
    if (this.stage === 'road') return this.out(pid, this.roadMsg());
    if (this.active && this.active.phase !== 'lobby') {
      this.out(pid, this.active.mapMsg());
      if (this.stage === 'act2') this.sendShrineSnapshot(pid);
    }
    if (this.stage === 'act2' && this.shrine) {
      const sh = this.shrine;
      if (sh.phase === 'gift' && sh.offer) this.out(pid, { t: 'gift', offer: sh.offer,
        chapter: sh.chapter, chamber: sh.map?.step || sh.chamberN + 1,
        of: sh.map?.total || require('./shrine').CHAMBERS.length });
      if (sh.phase === 'down' && sh.lastDown) this.out(pid, sh.lastDown);
      if (sh.phase === 'done' && sh.lastDone) this.out(pid, sh.lastDone);
    }
  }

  /** Hold everybody on a cinematic until each of them has finished or skipped it.
   *  The whole party waits, because a player who skips while the others watch
   *  would otherwise be loose in the palace alone. Somebody who stops answering
   *  cannot hold the rest hostage: the barrier lifts on its own after
   *  STORY_TIMEOUT, and a player who disconnects stops being waited for. */
  playStory(key, then, extra) {
    const list = scenes(key);
    if (!list.length) return then();
    this.story = { key, then, extra: extra || null, ready: new Set(), until: this.clock() + STORY_TIMEOUT };
    this.out(null, Object.assign({ t: 'story', key, scenes: list, wait: true }, extra || {}));
    this.sendLobby();
  }
  /** Seconds, monotonic enough for a barrier. */
  clock() { return Date.now() / 1000; }
  /** "I have watched it." */
  seen(pid) {
    const s = this.story;
    if (!s || !this.players.has(pid) && !this.roster.some((r) => r.id === pid)) return;
    s.ready.add(pid);
    this.out(null, { t: 'storyseen', ready: s.ready.size, of: this.roster.length });
    this.maybeEndStory();
  }
  maybeEndStory() {
    const s = this.story;
    if (!s) return;
    const waiting = this.roster.filter((r) => r.connected && !s.ready.has(r.id)).length;
    const over = this.clock() > s.until || !this.roster.length;
    if (waiting && !over) return;
    this.story = null;
    s.then();
    this.sendLobby();
  }
  /** The host asking to begin: the prologue first, then the palace. */
  start(id) {
    if (!this.isHost(id) || this.stage !== 'act1' || this.story) return;
    if (this.room.phase !== 'lobby') return;
    this.playStory('prologue', () => this.room.start(id));
  }

  // ---------------------------------------------------------------- act one
  /** Called when the palace is won: gather what was earned and take the road. */
  toRoad() {
    const first = this.players.get(this.roster[0] ? this.roster[0].id : 0);
    const aff = new Set();
    for (const p of this.players.values()) for (const a of p.affinities || []) aff.add(a);
    this.carried.affinities = [...aff];
    this.stage = 'road';
    this.nightN = 0; this.choices = {};
    this.out(null, this.roadMsg());
  }
  roadMsg() {
    const n = night(this.nightN);
    return { t: 'road', stage: 'road', nightN: this.nightN, of: NIGHTS.length,
      night: n && { id: n.id, title: n.title, text: n.text,
        options: n.options.map((o) => ({ key: o.key, label: o.label, detail: o.detail, lose: o.lose })) },
      affinities: this.carried.affinities, chosen: this.choices };
  }
  /** The host answers for the party; three nights and then sixteen years. */
  choose(pid, key) {
    if (this.stage !== 'road' || !this.isHost(pid)) return;
    const n = night(this.nightN);
    if (!n) return;
    const opt = n.options.find((o) => o.key === key);
    if (!opt) return;
    this.choices[n.id] = key;
    this.out(null, { t: 'roadpick', night: n.id, key, label: opt.label, lose: opt.lose });
    this.nightN++;
    if (this.nightN < NIGHTS.length) return this.out(null, this.roadMsg());
    const r = resolve(this.choices);
    this.carried.boons = r.boons;
    // The sixteen-year jump is the biggest beat in the game and it is where the
    // footage actually belongs: the sanctuary, the years passing, what he grows
    // into. Act II waits behind the same barrier as everything else.
    this.playStory('jump', () => this.toAct2(), {
      jump: { years: 16, boons: r.boons, costs: r.costs,
        line: 'Sixteen harvests. The boy they call Chaminuka grows up at the shrine, and the king does not forget.',
        next: 'ACT II — THE SHRINE AT MAVAMBO' },
    });
  }

  // ---------------------------------------------------------------- act two
  toAct2() {
    this.stage = 'act2';
    this.shrine = new Shrine(this.code, this.relay);
    this.shrine.records = this.records;
    this.shrine.onRun = this.onRun;
    this.shrine.clients = this.room.clients;
    this.shrine.nextPid = 1;
    this.seat(this.shrine);
    this.shrine.begin({ affinities: this.carried.affinities, boons: this.carried.boons });
    this.sendLobby();
  }

  /** Enter the optional dungeon only after completing the original shrine.
   *  Host-authorized, shared for all seats, with each player's gear preserved. */
  enterDungeon(pid) {
    if (this.stage !== 'act2' || !this.isHost(pid) || !this.shrine) return false;
    return this.shrine.beginDungeon();
  }

  /** Kept as the old name for "I have read it"; the barrier does the rest. */
  go(pid) { this.seen(pid); }
  /** Go again at whatever stage we are on, keeping what was earned. */
  again(pid) {
    if (!this.isHost(pid)) return;
    if (this.stage === 'act2') {
      if (this.shrine.chapter === 'dungeon' && this.shrine.phase === 'down') {
        // Losing a boss fight costs the room, not the equipment earned so far.
        for (const p of this.shrine.players.values()) { p.hp = p.hpMax; p.dead = false; }
        this.shrine.enterChamber(this.shrine.chamberN);
      } else this.shrine.begin({ affinities: this.carried.affinities, boons: this.carried.boons });
    } else if (this.stage === 'act1') this.room.begin();
  }
  /** Skip straight to the shrine — for anybody who has already done the palace. */
  skipTo(pid, what) {
    if (!this.isHost(pid)) return;
    if (what === 'act2' && this.stage !== 'act2') {
      if (this.stage === 'act1') { this.carried.affinities = []; }
      this.carried.boons = resolve(this.choices).boons;
      this.toAct2();
    }
  }

  tick() {
    if (this.story) { this.maybeEndStory(); return; }
    if (this.stage === 'road') return;
    const before = this.active.phase;
    this.active.tick();
    // the palace is won: the road opens of its own accord
    if (this.stage === 'act1' && before !== 'won' && this.room.phase === 'won') {
      this.wonAt = this.room.time;
    }
    if (this.stage === 'act1' && this.room.phase === 'won' && this.room.time - (this.wonAt || 0) > 4) {
      this.playStory('escape', () => this.toRoad());
    }
  }

  sharedJSON() { return this.active ? this.active.sharedJSON() : '{"t":"s"}'; }
  meJSON(pid) { return this.active ? this.active.meJSON(pid) : '{}'; }
}

module.exports = { Session, reel };
