# Production data retention (v0.9.3)

## Verified configuration

- Leaderboards: `records.js` writes `data/runs.json` (or `DATA_DIR/runs.json`).
- Rooms and checkpoints: `session-store.js` writes `data/sessions.json` and `server.js` reloads them on startup.
- The official free Render web service does **not** preserve these files through a spin-down, restart, or redeployment. Files do survive application-level reconnects **within the same still-running instance**.
- The Resume Last Room button holds only a local browser recovery credential, not a copy of the saved game. It cannot reconstruct a room after the server loses `sessions.json`.

## v0.9.3 change

The browser now explains temporary retention, discards unusable saved-room credentials when the server explicitly reports expiration/invalid recovery, and guides the player to start a new room. The server rejects invalid recovery tokens rather than adding duplicate participants. A client switching to a new WebSocket connection ignores late messages/close callbacks from the previous socket.

## Durable production solution (not yet implemented)

Choose a persistent database, provision and maintain it, and migrate **both** `runs.json` and `sessions.json` to durable storage. Ensure the new `Records.add/top/best` API and SessionStore load/save operations are tested with a real database, including transactional writes and reconnect after service restart. Backups and capacity limits are separate decisions.

Render's current free Postgres service expires after **30 days**; free Key Value data is lost on instance restart, and persistent disks require a paid web service. Thus neither the free web instance's filesystem nor free Key Value is a permanent competition leaderboard.

Reference: https://render.com/docs/free ; https://render.com/docs/disks
