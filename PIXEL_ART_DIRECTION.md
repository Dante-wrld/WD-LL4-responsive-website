# Chaminuka — Whole-Game Pixel Art Direction

## Goal

A single dark-fantasy 16-bit visual language throughout the **palace escape (Act I)**, **road/lobby/menus**, **four-room shrine (Act II)**, **three spirit trials**, **six-room Ancestral Dungeon**, **boss fights**, **combat HUD**, **mobile controls**, and **story panels**.

The game remains top-down and multiplayer. This is an art and presentation revision, **not** a remake of the game into the side-view perspective shown in the cinematic boss mockups.

## Visual system

- **Native screen:** existing 960×540 game canvas. The gameplay world is rendered at its original coordinates, then sampled to 480×270 and nearest-neighbor upscaled to produce deliberately blocky pixels without changing movement, collision, camera or input geometry.
- **Tiles:** custom 32-unit flagstones, staggered wall bricks, rune-carved columns, braziers, role-gated doors and chapter-specific palettes. Tiles and sprite decorations use square 2-unit grid details rather than gradients.
- **Characters:** bespoke pixel silhouettes for Chaminuka, servant, priest, soldier, captain, hunter, spearman and the four named bosses: Echo of the Hunter, Ancestral Sentinel, Tomb Warden and Ash Warlord.
- **Spirit and transformation:** a distinct ghost body, floating sparks and color-coded squared auras for Panther (green), Eagle (blue) and Ancestor (violet). All connected players see the active art.
- **HUD:** squared hearts, segmented health and cooldown bars, dark bordered status rails, readable gold RPG title text and boss labels.
- **Menus:** pixel-inspired lettering, squared ornament borders, room-code blocks, choice cards, action buttons, contrast-safe text and focus states.
- **Cinematics:** original story video and still images are sampled into a 320×180 canvas and scaled as pixel art. The original media remains intact and visible as a fallback if a platform refuses a canvas frame; narration, skipping and synchronized multiplayer story barriers are unchanged.

### Palette reference

| Role | Hex |
| --- | --- |
| Ink | #10101f |
| Stone | #303047 |
| Stone highlight | #57536d |
| Gold / reward | #f2c466 |
| Astral blue | #99cbff |
| Ancestor violet | #c6a6ff |
| Panther green | #68e1b2 |
| Ember orange | #fa854d |
| Warning red | #e85a78 |

### Art implementation

`public/pixel-art.js` contains reusable procedural pixel sprites, environment drawing, hearts, gauges and transformation effects.

`public/pixel-theme.css` provides the matching user interface, responsive styling and pixel-framed cinematics.

`public/index.html` connects those graphics to the existing authoritative snapshots and story player. No additional game dependencies, server API changes, gameplay rules or asset licenses are required.

## Validation and limits

`test/pixel-art.test.js` verifies sprite diversity, floor/wall/door rendering, forms, hearts, cross-act integration and UI wiring. The full suite is run through `npm test`.

The look is faithful **pixel treatment** inspired by the earlier concept sheet, not a one-to-one recreation of those detailed painted side-view bosses. Enemy animations currently use short two-frame procedural movement and static weapon poses, not full separately drawn 8–16 frame sprite sheets. Boss telegraphs, collision and gameplay remain as in the tested release. This update doesn't change Render deployment or permanent progress storage.

## Release safety

Built from `feature/act2-spirit-awakening` to retain the three new training rooms and existing dungeon. Keep visual changes on their own pull request until CI and real-device playtesting are complete; the release branch remains untouched. 
