'use strict';
/* Safe, durable room checkpoints. Save only gameplay data, never websocket
 * objects, callbacks, or the un-hashed reconnect credentials. A new process
 * reconstructs the real Session/Room/Shrine prototypes so the rules still run.
 * Atomic rename protects the existing save if the process stops mid-write. */
const fs = require('fs');
const path = require('path');
const { Session } = require('./campaign');
const { Shrine } = require('./act2');

const OMIT = new Set(['out', 'relay', 'clients', 'records', 'onRun', 'field', 'story', 'room', 'shrine', 'players']);
function stageState(stage) {
  if (!stage) return null;
  const out = {};
  for (const [k, v] of Object.entries(stage)) if (!OMIT.has(k)) out[k] = v;
  out.players = [...stage.players.entries()].map(([id, p]) => [id, {
    ...p, connected: false,
    usedBodies: p.usedBodies instanceof Set ? [...p.usedBodies] : p.usedBodies,
  }]);
  return out;
}
function pack(session) {
  const story = session.story && { key: session.story.key,
    extra: session.story.extra, ready: [...session.story.ready],
    remaining: Math.max(0, session.story.until - session.clock()) };
  return { code: session.code, roster: session.roster.map((r) => ({ ...r, connected: false })),
    nextId: session.nextId, stage: session.stage, choices: session.choices,
    nightN: session.nightN, carried: session.carried, story,
    room: stageState(session.room), shrine: stageState(session.shrine),
    savedAt: Date.now() };
}
function stageRestore(target, data, stage) {
  if (!data) return;
  for (const [k, v] of Object.entries(data)) if (k !== 'players' && !OMIT.has(k)) target[k] = v;
  target.players = new Map((data.players || []).map(([id, p]) => [Number(id), {
    ...p, connected: false,
    usedBodies: stage === 'act1' ? new Set(p.usedBodies || []) : p.usedBodies,
    // A thrust cannot survive a restart. act2.js tracks what a swing has already
    // hit in a Set, JSON turns a Set into {}, and the next tick calls .has() on
    // it and throws. server.js catches that, so nothing looks broken — but the
    // throw lands before the block that would clear the swing, so swingPhase
    // stays 'swing' for the rest of the session. act2.js then reads that as
    // permanently mid-thrust: no dodge ever again (!p.swingPhase gates it) and
    // 35% movement speed. Measured: dodge yes -> no, 150px/s -> 53px/s.
    // Cancel the swing instead; a blow that was in the air when the process
    // stopped should not land a minute later anyway.
    ...(stage === 'act2' ? { swingHit: null, swingT: 0, swingPhase: '', recover: 0 } : {}),
  }]));
  target.field = null; // flow-fields are ephemeral and can be rebuilt
}
function restore(data, out) {
  if (!data || !/^[A-HJ-NP-Z]{4}$/.test(data.code) || !Array.isArray(data.roster)) return null;
  const s = new Session(data.code, out);
  s.roster = data.roster.map((r) => ({ ...r, connected: false }));
  s.nextId = data.nextId; s.stage = data.stage;
  s.choices = data.choices || {}; s.nightN = data.nightN || 0;
  s.carried = data.carried || { affinities: [], boons: [] };
  stageRestore(s.room, data.room, 'act1');
  if (data.shrine) {
    s.shrine = new Shrine(s.code, s.relay);
    stageRestore(s.shrine, data.shrine, 'act2');
    s.shrine.clients = s.room.clients;
  }
  if (data.story) {
    const key = data.story.key;
    const then = key === 'prologue' ? () => s.room.begin()
      : key === 'escape' ? () => s.toRoad()
      : key === 'jump' ? () => s.toAct2() : null;
    if (then) s.story = { key, then, extra: data.story.extra || null,
      ready: new Set(data.story.ready || []), until: s.clock() + Math.max(8, data.story.remaining || 0) };
  }
  return s;
}
class SessionStore {
  constructor(file) { this.file = file || path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'sessions.json'); }
  load() {
    try { const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed.rooms) ? parsed.rooms.slice(0, 100) : [];
    } catch (_) { return []; }
  }
  save(rooms) {
    const list = [...rooms.values()].map(pack);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ version: 1, rooms: list }));
    fs.renameSync(temp, this.file);
  }
}
module.exports = { SessionStore, pack, restore };
