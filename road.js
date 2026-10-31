'use strict';
/* THE FLIGHT TO MAVAMBO — the handoff between the two acts.
 *
 * Three nights on the road north. Each night is one choice, and every choice
 * costs something: there is no free option anywhere in here. What you spend and
 * what you keep decides how Act II opens, so the interlude is not a cutscene
 * with buttons — it is the character sheet you arrive with.
 *
 * It is deliberately small. A minute, read and chosen, between two levels that
 * each take ten. Nobody wants a second game in the gap.
 */

/** What you can be carrying when you reach the shrine. */
const BOONS = {
  spear: { name: 'The Soldier’s Spear', blurb: 'You arrive armed. Your strikes land harder.' },
  robe: { name: 'The Priest’s Robe', blurb: 'You arrive known to the spirits. The host clock runs longer.' },
  name: { name: 'A Name of His Own', blurb: 'Mavambo named him. He is harder to put down.' },
  silence: { name: 'The Silence', blurb: 'You arrive unlooked-for. Enemies notice you later.' },
  debt: { name: 'A Debt Owed', blurb: 'Somebody died for him. Once per fight, death is refused.' },
};

/** Each night: a situation, and two ways through it that both cost.
 *  `keep` is what you gain; `lose` is the price, named plainly. */
const NIGHTS = [
  {
    id: 'river',
    title: 'THE FIRST NIGHT — THE RUNDE CROSSING',
    text: 'The river is high and the ford is watched. The soldier whose body carried the child this far '
      + 'is still breathing, and still yours. He will not last the crossing.',
    options: [
      { key: 'carry', label: 'Carry him across in the soldier’s arms',
        detail: 'The body gives out on the far bank. You keep his spear.',
        keep: ['spear'], lose: 'The soldier does not get up again.' },
      { key: 'leave', label: 'Step out and let the soldier go home',
        detail: 'He wakes on the near bank believing he dreamt it. You cross unhoused, alone, slowly.',
        keep: ['silence'], lose: 'Two days lost. The king’s riders gain on you.' },
    ],
  },
  {
    id: 'riders',
    title: 'THE SECOND NIGHT — THE KING’S RIDERS',
    text: 'Four riders on the north road, and a herder’s family asleep in a hut beside it. '
      + 'You can be in one of those riders before they reach the door.',
    options: [
      { key: 'turn', label: 'Wear a rider and turn the search west',
        detail: 'The riders ride away from the child and from the hut. The man you wore is hanged for it.',
        keep: ['debt'], lose: 'A rider dies in your place.' },
      { key: 'hide', label: 'Hide the child and let them pass',
        detail: 'Nobody is harmed. The child lies in the cold reeds until dawn.',
        keep: [], lose: 'He takes a fever that never fully leaves him.' },
    ],
  },
  {
    id: 'shrine',
    title: 'THE THIRD NIGHT — THE SHRINE AT MAVAMBO',
    text: 'The spirit mediums are waiting at the gate; they have been waiting since before you left the '
      + 'palace. They will take him in. They want to know what you intend to do with him.',
    options: [
      { key: 'stay', label: 'Stay in him. Grow up inside the boy',
        detail: 'Sixteen years of being a child again, and his body will be yours to use.',
        keep: ['name'], lose: 'You will not be able to leave him easily. Stepping out costs more.' },
      { key: 'go', label: 'Give him to the mediums and wait outside',
        detail: 'They raise him properly. You watch from the dark for sixteen years.',
        keep: ['robe'], lose: 'He grows up a stranger to you. You arrive knowing him less.' },
    ],
  },
];

/** Resolve a set of choices into what Act II starts with.
 *  Unanswered nights resolve to the first option, so an abandoned interlude
 *  still produces a playable character rather than an empty one. */
function resolve(choices) {
  const picked = [];
  const boons = [];
  const costs = [];
  for (const night of NIGHTS) {
    const key = (choices && choices[night.id]) || night.options[0].key;
    const opt = night.options.find((o) => o.key === key) || night.options[0];
    picked.push({ night: night.id, key: opt.key, label: opt.label });
    for (const b of opt.keep) if (!boons.includes(b)) boons.push(b);
    costs.push(opt.lose);
  }
  return { picked, boons, costs };
}

/** The numbers Act II actually reads, derived from the boons. One place, so a
 *  boon can never claim something the rules do not honour. */
function loadout(boons) {
  const has = (k) => boons.includes(k);
  return {
    boons: boons.slice(),
    damage: has('spear') ? 1.35 : 1,
    hostMult: has('robe') ? 1.5 : 1,
    maxHp: has('name') ? 5 : 4,
    noticeMult: has('silence') ? 0.78 : 1,
    deathsRefused: has('debt') ? 1 : 0,
    // The price of staying inside the boy: his body is yours, but leaving it hurts.
    exitCost: has('name') ? 2 : 1,
  };
}

const night = (i) => NIGHTS[i] || null;

module.exports = { NIGHTS, BOONS, resolve, loadout, night };
