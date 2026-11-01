# Chaminuka Art Direction: Narrative Pixel Action RPG

## Reference

**Visual benchmark:** Children of Morta, Dead Mage / 11 bit studios.
Its postmortem describes detailed high-resolution hand-drawn pixel sprites, varied background palettes,
frame-by-frame animations and a separate modern lighting/rendering pipeline. We are borrowing
**design principles**, not copying characters, pixel art, UI assets, textures, or branded elements.

Source: https://www.gamedeveloper.com/design/postmortem-children-of-morta
Official description: https://store.steampowered.com/app/330020/Children_of_Morta/

## Chaminuka's own identity

Ancient and medieval Southern-African-inspired fantasy rather than European forest fantasy:
carved stone ancestor figures, braided fiber/copper ornaments, terracotta braziers,
mopane/miombo foliage, moonlit granite, ancestral spirit blue-violet and ember-orange ritual magic.

| Feature | Direction | First implementation |
| --- | --- | --- |
| Camera | overhead action combat, wider room visibility, integer world zoom | ZOOM 1, 30 x 17 visible tiles at 960x540 |
| Player/foes | original asymmetrical silhouettes with layered cloth/armor | narrower procedural sprite shapes aligned to 11-unit collider |
| Floors | organic clutter and broken masonry, not repeating checkerboard | deterministic seeded clusters by environment |
| Illumination | sharp pixel art under soft dynamic torch and ancestral glow | gradient light overlay after world draw, before crisp HUD |
| Boss appearances | large, readable silhouettes with atmospheric reveal | nonblocking pixel boss portrait and short lore banner |
| User interface | practical readable RPG equipment/skills, no intrusive blur | preserves existing gameplay HUD and inputs |
| Cinematics | atmospheric narrative panels | existing pixel-sampled stills/videos remain |
| Future production | hand-authored sprite sheets, keyframe action animation, original environment paintings | **NOT yet implemented** |

## What this branch actually improves

- Removes the smoothed downsample/upscale function that blurred game pixels each frame.
- Changes the world camera from 1.35x fractional zoom to 1x integer zoom, which expands visible space without touching collision.
- Narrows render-only sprite width, preserving network-authoritative collision radius and combat pacing.
- Adds tile-specific environmental clutter, additional fabric/face details and a mild light overlay.
- Adds an original nonblocking boss arrival card using each procedural boss sprite.
- Adds tests for new visual behavior and existing mechanics.

## What remains to reach the intended benchmark

This is a **first art-quality pass**, not genuine Children of Morta-level art production.
Reaching that visual detail requires carefully drawn original environmental tilesets,
fully animated player and enemy sprite sheets (idle/run/attack/dodge/hit/death by direction),
secondary effects (cast lights and particles), authored boss portraits and a small animation
pipeline with asset loading, transparent image compositing, collision-safe sprite origins
and mobile performance budgets. The current UI retains large battle information rails
and is not yet identical in layout to the reference.

Changes in this branch should stay in a draft PR until the automated suite and
hands-on desktop/phone smoke tests pass; the live Render game is not updated
by this branch alone.
