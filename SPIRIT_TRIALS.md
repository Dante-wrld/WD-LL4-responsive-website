# Act II — The Spirit Trials

After clearing the four-room Shrine at Mavambo, the host can choose one of two optional continuations:

- **TRAIN SPIRIT TRANSFORMATIONS (ACT II):** three extra rooms, two guardian bosses, three new active spirit arts and a choice of equipment after each room.
- **ENTER THE ANCESTRAL DUNGEON (ACT III):** the existing six-room dungeon with the Tomb Warden, Ash Warlord, loot and XP, playable immediately or after the spirit trials.

The training branch is optional. It does not alter the prologue, the Shrine, the original dungeon indices, any character class, or the six-room dungeon boss fights. Party progression continues together: the host starts the quest and selects equipment, while every participating player learns their own spirit arts.

## Training rooms

| Room | Encounter | Guaranteed transformation | Treasure choice |
| --- | --- | --- | --- |
| Pool of Reflections | Spearman and Hunter | **Panther Aspect**: +30% move speed | Bronze Spear or Leather Vest |
| Hall of Breath | **Echo of the Hunter** boss | **Eagle Aspect**: faster astral movement, +36 possession reach and +90 leash | Spirit Beads or Iron Spear |
| Ancestors' Circle | **Ancestral Sentinel** boss | **Ancestor Aspect**: +0.65 strike damage and one less incoming damage per hit (minimum 1) | Warded Armor or Moon Charm |

The transformation is granted by completing the room, regardless of which equipment reward the host selects. Gear remains one item per slot and stronger equipment replaces weaker equipment without stacking its stats.

## Controls and tradeoffs

**F** on desktop, **ASPECT** on touch, activates the next learned transformation for **8 seconds**, followed by a **15-second cooldown** measured from activation. As more forms are learned, each activation cycles to the next available form. A violet, blue or green aura is visible to everyone in the room, and the HUD reports the current form and cooldown.

Spirit forms are earned through play, not at character creation. They are a separate mastery system from Royal Warrior, Spirit Vessel, Shadow Hunter and Elemental Adept, so all builds can unlock them.

Possession and body vulnerability remain fundamental. Spirit forms do not grant permanent invulnerability, infinite spirit time or limitless possession. Death ends an active transformation but preserves learned forms and earned gear. A full team defeat retries the current training room; completing all three rooms unlocks the Ancestral Dungeon entrance and retains learned transformations for that quest.

## State and deployment

Training progress, equipment, XP, learned aspects, aspect cooldown and current room use the existing session checkpoint format. The existing Render free-hosting storage limitation still applies: data may disappear on an instance replacement or redeploy. See PRODUCTION_STORAGE.md.

## Validation

See `test/spirit-trials.test.js` plus the existing dungeon, Act II, campaign, multiplayer and camera-shake suites. Run `npm test` before merging or deploying.
