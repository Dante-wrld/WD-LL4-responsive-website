'use strict';
/* Every finished run, written to disk. This is the competitive layer: not player
 * against player in the palace, but your run against everyone else's — fastest
 * out, fewest bodies worn, never doubted. The same thing Hitman does with its
 * leaderboards, and it needs no combat to work.
 *
 * Deliberately boring on purpose: one small JSON file, written atomically, and a
 * failed write never takes the game down with it. */
const fs = require('fs');
const path = require('path');

const KEEP = 400;        // runs kept on disk
const TOP = 8;           // rows shown on each board

class Records {
  constructor(file) {
    this.file = file || path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'runs.json');
    this.runs = [];
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const j = JSON.parse(raw);
      if (Array.isArray(j.runs)) this.runs = j.runs.slice(-KEEP);
    } catch (e) { this.runs = []; }      // no file yet, or a corrupt one: start clean
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ runs: this.runs.slice(-KEEP) }));
      fs.renameSync(tmp, this.file);    // atomic, so a crash mid-write can't shred it
    } catch (e) { /* records are a nice-to-have, never load-bearing */ }
  }

  /** A finished run, won or lost. */
  add(rec) {
    const r = {
      by: String(rec.by || 'Spirit').slice(0, 14),
      won: !!rec.won,
      act: rec.act === 2 ? 2 : 1, // palace and shrine records never share rankings
      secs: Number.isFinite(rec.secs) ? +rec.secs.toFixed(1) : 0,
      bodies: rec.bodies | 0,
      worst: rec.worst | 0,
      burns: rec.burns | 0,
      gate: rec.gate || null,
      mastery: Array.isArray(rec.mastery) ? rec.mastery.slice(0, 6) : [],
      deaths: Math.max(0, rec.deaths | 0),
      kills: Math.max(0, rec.kills | 0),
      gifts: Array.isArray(rec.gifts) ? rec.gifts.slice(0, 8).filter((x) => typeof x === 'string') : [],
      boons: Array.isArray(rec.boons) ? rec.boons.slice(0, 8).filter((x) => typeof x === 'string') : [],
      builds: Array.isArray(rec.builds) ? rec.builds.slice(0, 4).filter((x) => typeof x === 'string') : [],
      players: rec.players | 0 || 1,
      at: Date.now(),
    };
    this.runs.push(r);
    if (this.runs.length > KEEP) this.runs = this.runs.slice(-KEEP);
    this.save();
    return r;
  }

  /** The three boards, plus how the house has gone overall. */
  top() {
    const won = this.runs.filter((r) => r.won && r.act !== 2);
    const shrineWon = this.runs.filter((r) => r.won && r.act === 2);
    const by = (cmp) => won.slice().sort(cmp).slice(0, TOP)
      .map((r) => ({ by: r.by, secs: r.secs, bodies: r.bodies, worst: r.worst, gate: r.gate }));
    const shrineRows = shrineWon.slice().sort((a, b) => a.secs - b.secs).slice(0, TOP).map((r) => ({
      by: r.by, secs: r.secs, kills: r.kills, deaths: r.deaths, builds: r.builds || [],
    }));
    return {
      shrineFastest: shrineRows, shrineWins: shrineWon.length,
      fastest: by((a, b) => a.secs - b.secs),
      fewest: by((a, b) => a.bodies - b.bodies || a.secs - b.secs),
      quietest: by((a, b) => a.worst - b.worst || a.secs - b.secs),
      runs: this.runs.length,
      wins: won.length,
      postern: won.filter((r) => r.gate === 'postern').length,
    };
  }

  /** What one name has managed, for the "your best" line. */
  best(name) {
    const mine = this.runs.filter((r) => r.won && r.act !== 2 && r.by === name);
    if (!mine.length) return null;
    return {
      runs: this.runs.filter((r) => r.by === name).length,
      wins: mine.length,
      secs: Math.min(...mine.map((r) => r.secs)),
      bodies: Math.min(...mine.map((r) => r.bodies)),
      worst: Math.min(...mine.map((r) => r.worst)),
    };
  }
}

module.exports = { Records, KEEP, TOP };
