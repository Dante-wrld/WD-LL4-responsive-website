# ACT III — THE ANCESTRAL DUNGEON (v0.10.0)

The shrine remains four chambers long. Winning that existing story offers the host a new
**ENTER THE ANCESTRAL DUNGEON** button, so players are never forced into Act III.
The dungeon is a shared six-room quest built onto the same real-time multiplayer engine.

## Rooms and boss fights

1. **Forsaken Armory:** first weapon/armor choice.
2. **Hollow Caves:** fight for stronger equipment.
3. **First Prophet's Tomb:** **Tomb Warden** boss.
4. **Whispering Treasury:** higher-tier equipment.
5. **Ember Forge:** veteran enemies, powerful spear/relic upgrades.
6. **Throne of Ash:** final **Ash Warlord** boss.

Each room uses a distinct pillar layout with traversable, tested routes. Bosses have
unique HP, movement, strike ranges and telegraphs. When the room is clear, walk to
the exit and choose one of two item rewards.

## Equipment and character growth

Each player holds one weapon, one armor, and one relic. The host chooses rewards on
behalf of the cooperative party, and the server equips the selected item to all
players. Weapons increase attack damage/reach; armor protects HP; relics strengthen
spirit duration/possession or damage. Better tiers **replace** the previous
item in that slot and remove the old bonus rather than stacking with it.

Combat kills grant XP to the player who lands the final hit. Each level grants one
heart and a small additional damage increase, up to level 10.

All equipment, XP, levels, and current dungeon room are in the regular session
checkpoint model; these survive a reconnect while the session save is still available.
The free Render service filesystem is **ephemeral** on restart and redeploy, so
these are not permanent cloud saves.

## Multiplayer and recovery

- Each player keeps their own XP, level, and equipment.
- The host starts Act III and chooses post-room treasure for the party.
- A full-party wipe retries the **current dungeon room**, keeping rewards earned
  before that room. The original four-chamber shrine remains intact.
- Rejoining players receive the current Act III map and their restored stats.

## Validation

The Node.js test suite covers all six map paths, boss definitions, slot upgrades,
XP gains, shared treasure/host authorization, checkpoint restoration, full dungeon
completion and the mobile combat HUD. See `test/dungeon-quest.test.js`.
