'use strict';
/* THE CINEMATICS — what plays, where, and for how long.
 *
 * The footage is the project owner's. What this file decides is placement, and
 * placement is the whole argument: in the branch these clips came from there was
 * no sixteen-year jump and no Act II, so every clip had to be stacked at the
 * front — seventy-one seconds of watching before anybody pressed a key. This
 * build has real seams, so the clips go on them:
 *
 *   prologue   before the palace        a short look at the kingdom, then two stills
 *   escape     the palace is won        one still, and away north
 *   jump       the road is walked       the sanctuary, sixteen years, what he becomes
 *   finale     the shrine is held       a glimpse of the battles still ahead
 *
 * Twelve seconds of video stand between a new player and the first decision. The
 * full twenty-nine second cut lives in the preview reel on the title screen,
 * where somebody who wants to watch it can, and nobody else has to.
 */

/** A scene is either a video (with an optional `to` to cut it short) or a still. */
const SCENES = {
  prologue: [
    { video: 'kingdom-at-night', to: 12, still: 'birth', title: 'The Kingdom Before the Prophecy',
      text: 'Dzimbahwe, under a restless night sky. The royal city sleeps beneath the same stars that '
        + 'foretell the birth of a child the king will come to fear.' },
    { still: 'birth', title: 'The Night of the Prophecy',
      text: 'The mediums name him before he can open his eyes. By morning the king has given the order, '
        + 'and the order is simple: the child does not live to see another night.' },
    { still: 'possession', title: 'A Spirit Without a Sword',
      text: 'His spirit slips its body. He cannot fight, he cannot open a door, he cannot lift himself. '
        + 'He can only wear other people — and tonight that will have to be enough.' },
  ],
  escape: [
    { still: 'escape', title: 'Beyond the Gate',
      text: 'The child is out of the house. Behind him the palace wakes to find a cradle empty and three '
        + 'men on the floor who will swear they remember nothing. Mavambo lies three days north.' },
  ],
  jump: [
    { still: 'sanctuary', title: 'The Sanctuary of Mavambo',
      text: 'The mediums take him in. They have been waiting at the gate since before he was born, and '
        + 'they do not ask where the spirit went when it let him go.' },
    { video: 'sixteen-years-later', still: 'awakening', title: 'Sixteen Harvests',
      text: 'The hunted infant has grown. His connection to the spirit realm wakes with him, and the king '
        + 'has never once stopped looking for the child he was told was dead.' },
    { video: 'healing-vision', still: 'awakening', title: 'A Gift for Life',
      text: 'The same strangeness that carried him out of the palace can mend as well as borrow. What '
        + 'saved him may yet save others — if he lives long enough to learn it.' },
  ],
  finale: [
    { video: 'warrior-vision', still: 'awakening', title: 'Visions of Battles to Come',
      text: 'The shrine holds, and the king knows the boy’s name at last. What waits beyond Mavambo '
        + 'is a vision of what lies ahead, not a power he has been given yet.' },
  ],
};

/** The title-screen reel: everything, at full length, in story order. */
function reel() {
  const all = [];
  for (const key of ['prologue', 'escape', 'jump', 'finale']) {
    for (const s of SCENES[key]) all.push(Object.assign({}, s, { to: undefined }));
  }
  return all;
}

const scenes = (key) => (SCENES[key] || []).map((s) => Object.assign({}, s));

/** Longest a barrier will wait on somebody who has stopped answering. */
const STORY_TIMEOUT = 110;

/** Every media file a scene can ask for, so a test can prove they all exist. */
function mediaUsed() {
  const videos = new Set(), stills = new Set();
  for (const key of Object.keys(SCENES)) {
    for (const s of SCENES[key]) { if (s.video) videos.add(s.video); if (s.still) stills.add(s.still); }
  }
  return { videos: [...videos], stills: [...stills] };
}

module.exports = { SCENES, scenes, reel, mediaUsed, STORY_TIMEOUT };
