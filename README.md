# CHAMINUKA: THE EXILED PROPHET

Three stages, one thread, told with cinematics. **Act I** is the palace: a possession
stealth puzzle with no combat and no way to die. **The road** is three nights north,
three choices that each cost you something. **Act II** is the shrine sixteen years
later: Chaminuka in his own body, with a spear — and still able to step out of it.

What you earn in the palace changes how the shrine plays. What you give up on the
road decides what you arrive with.

```
npm install
npm start
```

Open **http://localhost:3000**, enter a name, **Begin**, share the four-letter code.
Up to four players. Tests: `npm test` (125 including guard tuning, recovery/expiry, mobile input, release and restart tests).

---

## The cinematics

Four clips and five stills, placed on the seams this build has rather than stacked
at the front:

| Seam | What plays |
|---|---|
| before the palace | the kingdom at night (cut to **12s**), then two stills |
| the palace is won | one still, and away north |
| the road is walked | the sanctuary, the sixteen years, what he grows into |
| the shrine is held | a glimpse of the battles still ahead |

The full 41 seconds of the original opening video play before Act I: the original
29-second kingdom sequence and its 12-second continuation are shown in order.
The opening can still be skipped by each player; the multiplayer group waits
for all players to finish or skip (with a longer safety timeout). Video starts
muted so mobile browsers can autoplay when supported. Each video scene has a still behind it, so
a browser that refuses to play still shows you something — a test enforces that.

**The barrier.** A cutscene holds the whole party: the palace is not built until
every player has watched or skipped it, so nobody is loose in the world while the
others are still reading. Nobody can be held hostage either — the barrier lifts
after 110 seconds, and a player who disconnects stops being waited for. A test
proves every barrier in the game comes down on its own.

Video is streamed with HTTP byte ranges (`206`, suffix ranges, `HEAD`, proper `416`s),
so a phone starts playing without downloading the whole clip.

---

## Act I — The Palace of Dzimbahwe

The king has ordered the newborn killed. The child's spirit slips free of his body — **that spirit is
you**. You cannot fight, open a door, or lift a child. You can only wear other people.

Get the infant out of the palace. No single body can do it, and there is more than one way out.

## The whole game in five keys

| Key | |
|---|---|
| `WASD` | Move |
| `E` | Wear the body beside you — or step back out of the one you're in |
| `F` | The one thing this body can do |
| `SPACE` | Pick up or set down the child |
| `SHIFT` | Hurry — faster, but people notice |

`H` for help, `M` to mute. That's everything. There is no combat, no health, no stamina, and **no way
to die**. The worst that happens is you lose a body.

## The three clocks

**Suspicion** — the ring around you. It fills *only while somebody can actually see you*, and the HUD
tells you in plain words why: *a soldier in the nursery*, *carrying the royal child*, *moving too
fast*, *standing about*. Fill it and they work out you aren't who you look like: you're thrown clear
and the wing turns hostile.

**The host** — the bar beneath it. Every body wakes up after 48 seconds. Let it run out and you're
ejected where you stand and he shouts. Press `E` to step out deliberately and he slumps quietly
instead — but a patrol that walks past a slumped man knows something is wrong, so pick your corner.

Two rules keep you moving: **you cannot re-enter the body you just abandoned**, and you cannot take
someone who is already alarmed. Only the calm and unaware.

**The house** — the bar across the top. It is the only thing in the game that can actually end a run,
and it moves *only when something goes wrong*: you are rumbled, somebody finds a man you left slumped,
or the child is found out of his cradle. Nothing else touches it, and it settles again once the search
is over. At 40 it sends two more patrols in. At 70, two more. Fill it and they take the child back and
you start the night over — the only failure state in the game, and it still costs you nothing but the
night.

Unhoused you are invisible and drift through doors, which makes the spirit form the way to scout the
next wing — but the tether pulls you back to the cradle after 28 seconds.

## Why one body is never enough

| Wing | Who belongs | What's there |
|---|---|---|
| The nursery | priests | the child, in his cradle |
| The great hall | anyone | the public spine — you must cross it |
| The barracks | soldiers | the postern gate |
| The service corridor | servants | the servants' door |

A priest can carry the child out of the nursery but can reach **neither** gate. So the run has a shape:
**take a priest, carry the child into the hall, set him down somewhere quiet, shed the priest, find
other arms, come back for him, and walk him out.** Only the captain can walk the whole route — and
everyone watches the captain, so his suspicion never stops climbing.

Carrying the child is damning in anyone's arms but a servant's.

### Two ways out

| Gate | Who can reach it | |
|---|---|---|
| **The servants' door** | servants, the captain | the long safe road — and a servant carries him unremarked |
| **The postern gate** | soldiers, the captain | short, but it lies inside the barracks, and a soldier holding an infant is damning |

The postern trades a shorter walk for a worse disguise. Verified in the tests: a servant cannot reach
the postern, a soldier cannot reach the servants' door, the captain can use either and is watched the
whole way.

## What carries between attempts

Nothing resets the story. Win or lose, each attempt gives you the next line of the prophecy, and your
run is scored against three standing challenges:

| Mastery | | Earns |
|---|---|---|
| **Swift** | out in under four minutes | **Bold** — you can take a body even while its owner is alarmed |
| **Frugal** | wear no more than two bodies | **Quick** — you reach into a body from further away |
| **Unseen** | never let doubt pass halfway, never be rumbled | **Veiled** — suspicion gathers a quarter slower around you |
| **The Postern** | leave by the soldiers' gate | — |

Affinities are permanent: they survive a loss and change how the next attempt actually plays, so the
palace gets easier as you get better at it while the house gets harder the more you are caught. That is
the whole replay loop — Hitman's mastery, Hades' "you keep something" — with no combat layer needed.

## Competing without PvP

Every finished run is written to `data/runs.json` and ranked on three boards: **fastest out**, **fewest
bodies worn**, **least doubted**. Every player on the server shares them, and your own best is quoted
back to you when you join. This is deliberately not player-versus-player: invasions are deferred until
the single-palace loop is worth repeating. Say the word and PvP gets scoped separately.

## The four kinds of body

| Role | `F` does | |
|---|---|---|
| **Priest** | Blessing | wipes suspicion on everyone nearby and calms an alerted wing |
| **Soldier** | Dismiss | orders somebody off their post for 13s, opening a route |
| **Servant** | Summon | calls somebody over to you — useful for luring a watcher out of a room |
| **Captain** | Stand Down | a whole wing returns to post and looks away for 10s |

## Co-op

Up to four spirits in one palace, and **the handover is the point**: one wears a priest and brings the
child out of the nursery while another is already waiting in a servant's body. You meet in the hall,
the child changes hands, and the spent priest can be abandoned somewhere quiet rather than walked all
the way back.

A priest's Blessing clears *everyone's* suspicion in range, not just yours, so bringing one along is
worth spending a body on. And since you can't re-enter a body you've just abandoned, a second spirit
doubles how many bodies the team has in play.

If somebody drops out mid-run their body is released and the child is set down rather than vanishing
with them, so the others can carry on.

---

## The road to Mavambo

Three nights, one choice each, and **every option costs something** — there is no free
way through any of them, and a test enforces that. What you keep arrives as a boon:

| Boon | |
|---|---|
| **The Soldier's Spear** | your strikes land harder |
| **The Priest's Robe** | your spirit holds a body longer |
| **A Name of His Own** | an extra heart — but leaving his body costs more |
| **The Silence** | you are noticed later |
| **A Debt Owed** | once a fight, death is refused |

---

## Act II — The Shrine at Mavambo

Sixteen harvests later. The king's men have come for the boy, and he has a body of his
own at last.

| Key | |
|---|---|
| `WASD` | Move (mouse aims) |
| `J` / click | Thrust |
| `K` / `SHIFT` / right-click | Roll |
| `E` | Step out of your body — or into one of theirs, or back into your own |

**Four hearts. One thrust, one roll. No posture bar, no combos, no stamina, no parry,
no shield.** All of that was in the build that wasn't fun and none of it is coming back;
a test greps the source to keep it out.

### The trade the whole act is built on

He can still leave his body — and the body he leaves keeps standing there, breathing,
with its back to the room.

- **Unhoused** you are fast and invisible, and you can wear one of the king's men. While
  you wear him the others have lost *you* — until you strike, and then every one of them
  turns at once.
- **Your own body takes double while it is empty**, and an empty body is the thing they
  will cross a room to reach. Clear a chamber with your body abandoned in the open and
  you will not clear the next one.
- Once you have struck from inside one of theirs, **their blows wound that borrowed body,
  not you** — and when it falls you are spat out into the open with nothing.
- **The thread**: his spirit is tied to his own flesh. Drag a stolen body too far from it
  and you are torn out. Possession is a knife, not a tour of the room.

### What it costs to swing

A thrust that connects carries you through. **A thrust into air leaves you hanging**, and
you cannot roll out of your own recovery. That is the entire cost of attacking, and it is
what stops holding the button down from being a strategy — see the numbers below.

### Four chambers, four gifts

Clear a room, take one of two gifts, walk on. Falling costs you the chamber, not the
campaign: you rise in the outer court with everything you had earned.

---

## What the automated playtests actually found

The combat was measured, not guessed at: three bots — one that holds the attack button,
one that plays spacing and punishes recovery, one that leans on possession — over fifty
complete four-chamber runs each, health carried from room to room.

| | finishes the act | hearts left |
|---|---|---|
| holds the attack button | **2%** | 1.0 |
| plays spacing and timing | **64%** | 3.3 |

Getting to that point meant finding and fixing eight things that would each have ruined
real play, every one of them caught by a probe rather than by reading the code:

1. The king's men didn't notice a man walking straight at them across an open courtyard.
2. Repeated hits stun-locked a foe out of ever swinging, so mashing won every fight.
3. A thrust cost nothing, so there was never a reason not to be swinging.
4. A chamber was a queue, not a fight — retreat to a far corner and three of four enemies
   never came at all, and the room could be stalled forever.
5. Clearing a room while wearing one of theirs **locked you in it permanently**.
6. A pillar sat on the line between the way in and the way out, reading as a dead end.
7. Chaminuka outran every enemy, so walking backwards forever was a winning strategy.
8. Enemies attacked your abandoned body across the room while you butchered them from
   inside one of their own — possession won 100% of runs and lost nothing.

Each of those is now a named test. Foes also got real pathfinding (a flow field over the
tile grid) rather than walking straight at you and grinding into stone.

## Code map

| File | |
|---|---|
| `vessel.js` | All the rules — possession, suspicion, the host clock, the tether, role actions. No networking. |
| `palace.js` | The palace, authored as an access puzzle: wings, role-gated doors, patrol routes. |
| `server.js` | HTTP + WebSocket rooms, 30Hz snapshots. |
| `public/index.html` | The whole client. |
| `grid.js` | Tiles, collision, line of sight and pathfinding. Both acts share exactly one definition of each. |
| `road.js` | The three nights and what each choice costs, plus the loadout Act II reads. |
| `act2.js` | Act II's rules: the spear, the roll, stepping out, the borrowed body, the thread. |
| `shrine.js` | The four chambers and the three kinds of enemy. |
| `campaign.js` | The joins. Keeps one roster across all three stages and hands the earnings forward. |
| `story.js` | Which clip plays where, and why. The placement argument lives in its header. |
| `records.js` | Run records and the three leaderboards, on disk. A corrupt file never takes the game down. |
| `test/vessel.test.js` | 32 Act I rules tests: the route matrix for both gates, the house waking and sending reinforcements, the loss-and-retry state, mastery, and the affinities actually changing the rules. |
| `test/act2.test.js` | 46 Act II tests, including one per bug in the list above. |
| `test/campaign.test.js` | 13 tests of the seams: the roster, the affinities, the road's prices, the sixteen-year card, and who is allowed to press on. |
| `test/multiplayer.test.js` | 4 tests driving real WebSocket clients through Act I: two spirits sharing a palace, the handover, dropping out mid-run, the room cap, and junk input over the wire. |
| `test/coop2.test.js` | 4 more real-client tests through the joins and into Act II: both players crossing together, one watching the other step out of his body, the host's gift reaching everybody, and junk input over the wire. |
| `test/story.test.js` | 11 tests of the cinematics layer: every clip exists, no scene is unreadable, the prologue is short, no barrier can strand a party, and byte-range streaming behaves on nine kinds of request. |
| `test/records.test.js` | 4 tests: the boards rank correctly, they survive a restart, and junk cannot poison them. |

Server is authoritative; clients only send input. Tuning constants sit at the top of `vessel.js`.

## What this replaces

Earlier versions were a real-time stealth game with posture, combos, heavy attacks, ripostes, shields,
stamina, stones, pings, veils, a crying meter and a global alarm. It tested clean and wasn't fun —
tedious, frustrating, confusing and boring, all at once. Nearly all of it is gone. What's left is one
idea with three clocks against it, and progression that makes the next attempt different rather than
just longer.

## What was merged, and what was left behind

This build is the v0.7.1 rules branch with the v0.6.2 cinematics branch merged
forward into it. Brought across: the footage and stills, byte-range streaming, the
cutscene barrier, subtitles, narration, the preview reel, and `STORY_GUARDRAILS.md`,
which is the project's constitution and arbitrates design arguments well.

Deliberately **not** brought across: the v0.6.2 build-selection screen and
three-seal awakening trial. Act II supersedes both — the road's boons, the chamber
gifts and Act I's affinities are this build's expression of "distinct build
choices" (guardrail 6). If you want the four named builds back as a layer on top of
that, say so and I'll scope it; it is a real feature, not an oversight.

Also not brought across: the Red River montage, because the road now covers that
ground as three playable choices rather than a slideshow.

## Known limits

- One palace. The layout is fixed; what changes between attempts is how awake the house is, which gate
  you take, and what you have earned.
- **Act III does not exist.** The shrine ends pointing at the king's house and stops there.
- The footage is AI-generated concept cinematics supplied by the project owner, at
  910×512. It is not in-engine animation and does not claim historical accuracy.
- No licensed music is in the build; all sound is synthesised in code.
- Act II's chambers are fixed and hand-authored; there is no room generation.
- **No human has played Act II yet.** Sixty-four percent for skilled play is a bot's judgement of
  skilled play, not a person's. The numbers most likely to be wrong are the four-minute Swift
  threshold in Act I, the four hearts, and the captain's reach.
- The Act II bots still occasionally stall in a corner for want of pathfinding of their own; the
  game itself does not, which a test checks, but it means the percentages above are a floor.
- Bodies walk their routes directly rather than pathfinding, so an alerted one can scrape a corner.
- No saves, no accounts; a server restart ends the run.
- Multiplayer is verified by automated clients, not by people on separate machines — two humans on
  separate devices is still untested.
- Art and sound are drawn and synthesised in code.
- **Not yet playtested by a human.** The density of witnesses and the length of both clocks are the
  numbers most likely to need another pass.


---

## v0.9 Release Candidate: builds, reconnect, rankings

The palace rescue still uses **borrowed bodies** rather than class combat. Players
choose a specialization in the **room lobby**, but it applies **only in Act II**
after Chaminuka has grown up:

- **Royal Warrior:** extra heart and longer spear reach.
- **Spirit Vessel:** longer spirit projection and easier possession.
- **Shadow Hunter:** shorter dodge recovery and better protection for the vacant body.
- **Elemental Adept:** stronger spear thrust, fewer hearts.

The three palace rankings are kept separate from the **fastest Act II shrine**
ranking. Act II records now retain kills, deaths, gifts and selected builds.

**Resuming a session:** On first join, the browser stores a 64-character secret
recovery token in localStorage, while the server saves only its SHA-256 hash.
After a disconnect or a server restart, use **RESUME LAST ROOM** on the same
browser to reclaim your character, story checkpoint and selected build.
Different browsers do not automatically share a recovery token. Never publish
recovery tokens. Progress and rooms are saved every 10 seconds, on phase changes,
and on clean server shutdown. Crashes can lose up to the last 10 seconds.

**Important:** The entire party still advances the story together, with shared
road choices and shared between-chamber gifts. Persistent *independent* per-player
campaigns and King's Bounty PvP invasions remain future work. Do not claim those
systems are already implemented.

## Deploying for the Handshake challenge

This is a persistent **Node.js WebSocket** service. It cannot be deployed as a
static website or a serverless function without rewriting the backend. Deploy to
a Node.js host that accepts HTTP plus WebSockets (for example Railway).

1. Upload the contents of `chaminuka/` to a new repository or a connected hosting
   project. Set the service's start command to `npm start` and Node 18+.
2. Bind the service to the host-provided `PORT`; the server already reads `PORT`.
3. For durable progress, attach a persistent volume and set `DATA_DIR` to its
   mounted folder. Without a volume, a redeploy may erase saved rooms and runs.
4. Enable a public HTTPS domain, which will support secure WebSockets (`wss://`).
5. Test on two **separate devices**: create a room, join by code, watch or skip
   cinematics, carry Chaminuka to safety, continue the road, and enter Act II.
6. Verify the public `/health` URL returns `ok` and room reopening works.
7. In Handshake's **Create a Multiplayer Game** mission, submit the public URL,
   title, cover image and description before the official deadline.

See `SUBMISSION.md` for the contest summary and `RELEASE_CHECKLIST.md` for tests.

### Guard balance update (v0.9.1)
The palace patrol pace is 60% of normal walking speed (was 78%); guards
in alert pursuit move at 84% (was 100%). Unalerted palace vision shrinks
from 235 to 180 pixels and from a 0.72 to 0.50 radian half-cone, but
very close proximity can still reveal you. Act II spearmen, hunters and
captains have narrower initial sight cones, shorter spotting range and
14–17% slower movement. Attacks, difficulty progression, cinematics,
multiplayer and story remain unchanged.

### v0.9.3: Safe resume and storage warnings

Invalid recovery keys are refused instead of silently adding duplicate players. If a room
expires on the free hosted demo, the Resume button is cleared and the player sees how to
start over. Room checkpoints and leaderboards continue to use local JSON files and **will
reset** on Render free-tier instance shutdown/replacement. See `PRODUCTION_STORAGE.md`
for limitations and the durable database migration path.

### v0.9.4: Phone/tablet controls

Adapted the touch controls from the uploaded Chaminuka v0.9 package without reverting
v0.9.3 room recovery, individual builds, or guard balance. On a phone, turn to
landscape and use the floating left joystick for movement and the buttons on
the right for actions. In Act I, WEAR/INFANT uses E/Space, ABILITY uses F,
POSSESS uses E, and RUN holds Shift. In Act II use ATTACK (J), DODGE (K),
and SPIRIT (E); drag over the game to aim. The title screen also has a
TOUCH CONTROLS toggle for testing on a laptop.

The uploaded package's experimental Postgres adapter is not enabled on this
service: no durable database is configured and that package did not include
the required pg driver. Scores and checkpoints on Render's free plan remain
temporary. See PRODUCTION_STORAGE.md.

### v0.9.5: Mobile presentation, local patrols, full opening cinematic

- The touchscreen controls now sit in a dedicated translucent bottom dock,
  so they no longer cover characters or the game world. The joystick base is
  visible before the first touch. Landscape mode leaves room for the canvas.
- In the palace, at least ten residents stay at their posts; seven have
  short patrols of no more than two tiles in each direction. When alerted,
  guards can still pursue beyond their normal posts. Guard vision remains
  at the balanced v0.9.1 settings.
- The complete 41-second original opening plays before the palace escape,
  using both existing MP4 segments in order, with no 12-second truncation.
  Later healing and warrior-vision clips still play as the story progresses.
- A PLAY VIDEO button appears if a browser rejects autoplay, especially on
  phones. The synchronized opening cutscene has a 165-second fail-safe.

### v0.9.6: Cinematic controls (phone and desktop)

During each video the story information card appears briefly and fades after
approximately 4.2 seconds of actual playback, leaving the footage unobstructed.
Three permanent buttons on the right side control video volume (or narration
on illustrations), skip the remaining cinematic sequence, and show/hide the
story panel. Restoring details pins the panel until dismissed or the next scene.
If mobile autoplay is blocked, the story panel stays visible with PLAY VIDEO.
Illustrated stills retain their narration text and Continue button, because
those scenes do not advance automatically. The original WebSocket 'seen' flow,
multiplayer waiting, cutscene order and full 41-second prologue are unchanged.

### v0.9.7: Restore the original mobile controls

Reverts ONLY `public/touch-controls.js` to its v0.9.4 layout after
feedback that the v0.9.5 bottom dock made the game difficult to see.
The controls again sit inside the game stage: a floating joystick appears
where you touch the left side, and the original action buttons are overlaid
at the lower right. The stage is no longer shrunk to make room for a dock.
All v0.9.6 cinematic controls, the full opening video, the shorter NPC patrols,
room recovery, multiplayer and character builds remain unchanged.

### v0.9.8: Smaller palace guard sight cones

Regular palace witnesses now detect up to 120 pixels in a 0.30-radian half-cone
(about 34.4 degrees total). Alarmed guards use 150 pixels and a 0.48-radian
half-cone (about 55 degrees total), rather than the old oversized red wedge.
Within 30 pixels, a guard still notices someone even outside the cone.
The renderer uses the server's range and half-angle directly in **both** states,
so the visible cones represent the same detection limits as the game rules.
Alert pursuit and the existing guard movement speed are unchanged.
The overlays have slightly lower opacity to reduce visual clutter.

### v0.9.9: Fix empty Act II shrine after palace escape

The shrine map and each player's personal snapshot are now delivered together
at every Act II chamber entrance, not only on the next 30 Hz broadcast.
The client clears its stale palace snapshot, temporarily displays
"ENTERING THE SHRINE", and does not render the shrine until the first valid
Act II snapshot contains the player's own character and enemies.
If the snapshot does not arrive, the client requests a throttled resync.
The same map+snapshot recovery applies to reconnecting players.
This fixes the empty-arena transition while preserving the full story,
mobile controls and existing guard visibility adjustments.

### v0.9.10: Escape through possession

An earlier strike from a borrowed guard no longer exposes every later guard
that Chaminuka possesses. Detection tracks the **current** borrowed identity,
and a new, unexposed disguise breaks the direct lock on that identity.

Once the room is alerted, ordinary frontal possession of a hunting guard is
still blocked. But an invisible spirit can approach the guard's back within
40px and borrow him; the Bold affinity retains its original advantage. Guards
searching for the abandoned original body now use a wider forward search
arc instead of an omniscient 360-degree view.

The escape is deliberately not invulnerability: the original body remains
unattended and can be attacked if discovered; an already committed blow can
still land; attacking from the new disguise exposes it. Palace stealth and
the v0.9.9 shrine synchronization fixes are unchanged.

### v0.9.11: Clearer role locks and protected infant handoff

The red door by the barracks is a **role-locked doorway**, not an alarm gate:
priests cannot enter the barracks and servants cannot enter it either. Players
carrying the infant in a priest now see the short instructions to set the child
down, possess a servant in the great hall, pick the child up, and exit through
the **east service corridor**. Nearby inaccessible doors display the required
roles. An idle servant is marked while the priest carries the child.

Setting the child down starts a **12-second handoff grace period** so that a
nearby guard cannot instantly return him to the nursery before the player
can switch bodies. The countdown appears on the HUD; after it expires the
normal child-return rules resume. The normal guard spotting, role-specific
doors, suspicion, and chase mechanics are unchanged.

Regression tests cover the red barracks lock, grace timing, a successful
priest-to-servant handoff, and visible on-screen instructions.
