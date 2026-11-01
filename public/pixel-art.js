/* Chaminuka: a shared, resolution-independent 16-bit visual vocabulary.
 * All canvas sprites and map tiles use solid, grid-aligned pixels.
 * This is presentation only. It does not alter server-authoritative gameplay.
 */
(function (root) {
  'use strict';
  const PAL = Object.freeze({
    ink: '#10101f', edge: '#090b17', stone: '#303047', light: '#57536d',
    moon: '#99cbff', spirit: '#c6a6ff', gold: '#f2c466',
    ember: '#fa854d', leaf: '#68e1b2', red: '#e85a78', pale: '#f8dfac'
  });
  function rect(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }
  function hash(x, y) { return ((x * 374761393 ^ y * 668265263) >>> 0); }
  function tile(ctx, ch, i, j, sx, sy, size, zone, chapter, roomName, tick, doorOpen) {
    const h = hash(i, j);
    const act2 = chapter === 'shrine' || chapter === 'dungeon' || chapter === 'trials';
    const mood = chapter === 'trials' ? (roomName.indexOf('BREATH') >= 0 ? 'sky' :
        roomName.indexOf('REFLECTION') >= 0 ? 'forest' : 'ancestor') :
      chapter === 'dungeon' ? (roomName.indexOf('EMBER') >= 0 || roomName.indexOf('ASH') >= 0 ? 'ash' : 'crypt') :
        act2 ? 'shrine' : 'palace';
    const floor = {
      palace: ['#29243a', '#332c46', '#3b3150'],
      shrine: ['#29243b', '#322c4a', '#3b3152'],
      crypt: ['#25273b', '#303046', '#3b3951'],
      ash: ['#382834', '#45303a', '#50383b'],
      sky: ['#202f49', '#2b3c56', '#344967'],
      forest: ['#203e3b', '#2b4742', '#36554a'],
      ancestor: ['#332840', '#3f3252', '#4b3860']
    }[mood];
    const wall = mood === 'ash' ? ['#442936', '#623b3b', '#775047'] :
      mood === 'sky' ? ['#273a56', '#3c5773', '#53768d'] :
      mood === 'forest' ? ['#28443c', '#345e51', '#54806b'] :
      mood === 'ancestor' ? ['#352b4b', '#53406d', '#776090'] :
      ['#2d2b42', '#444057', '#63596d'];

    // 32-unit authored tile: every decoration is aligned to a 2 or 4-unit grid.
    if (ch === '#') {
      rect(ctx, sx, sy, size, size, wall[0]);
      rect(ctx, sx, sy, size, 4, wall[2]);
      rect(ctx, sx + 2, sy + 6, size - 4, 10, wall[1]);
      rect(ctx, sx + 2, sy + 18, size - 4, 10, wall[1]);
      rect(ctx, sx, sy + 16, size, 2, PAL.edge);
      rect(ctx, sx + ((j % 2) ? 10 : 22), sy + 4, 2, 12, PAL.edge);
      rect(ctx, sx + ((j % 2) ? 22 : 10), sy + 18, 2, 10, PAL.edge);
      if ((h % 5) === 0) rect(ctx, sx + 4, sy + 8, 6, 2, wall[2]);
      rect(ctx, sx, sy + 28, size, 4, wall[0]);
      return;
    }

    rect(ctx, sx, sy, size, size, floor[(h % 3)]);
    // Sparse stone joints instead of a checkerboard.
    if ((h % 5) < 2) rect(ctx, sx, sy + 30, size, 2, '#201c2e');
    if ((h % 7) < 2) rect(ctx, sx + 30, sy, 2, size, '#201c2e');
    // Hand-cut flagstones and sparse leaf/petal sparks instead of a flat fill.
    rect(ctx, sx + 2, sy + 2, 15, 2, floor[2]);
    rect(ctx, sx + 20, sy + 20, 8, 2, floor[0]);
    if ((h % 4) === 0) rect(ctx, sx + 7, sy + 18, 4, 2, floor[2]);
    if ((h % 9) === 0) {
      const accent = mood === 'ash' ? '#df7147' :
        mood === 'forest' ? '#65bd93' : mood === 'sky' ? '#71a8d6' : '#a48a79';
      rect(ctx, sx + 12, sy + 11, 2, 2, accent);
      rect(ctx, sx + 14, sy + 13, 2, 2, floor[1]);
    }

    // Bespoke environmental clustering: vegetation, broken masonry, bones,
    // glowing mineral shards. Clumps are seeded by tile, not random per frame,
    // so camera motion never makes details shimmer or jump.
    const a = (h >>> 5) % 23, b = (h >>> 12) % 19;
    if (mood === 'forest') {
      if (h % 3 === 0) {
        rect(ctx, sx + a, sy + 18 + (b % 5), 3, 8, '#294e3f');
        rect(ctx, sx + a - 4, sy + 16 + (b % 5), 9, 3, '#48856b');
        rect(ctx, sx + a, sy + 10 + (b % 5), 3, 9, '#63ad7d');
        rect(ctx, sx + a + 4, sy + 13 + (b % 4), 5, 3, '#397659');
      }
      if (h % 11 === 0) {
        rect(ctx, sx + b, sy + 4, 3, 3, '#9ccfbb');
        rect(ctx, sx + b - 3, sy + 7, 3, 3, '#64b0a5');
      }
    } else if (mood === 'ash') {
      if (h % 3 === 0) {
        rect(ctx, sx + a, sy + b, 6, 3, '#251c29');
        rect(ctx, sx + a + 2, sy + b - 2, 3, 2, '#7b4c3a');
      }
      if (h % 7 === 0) rect(ctx, sx + a, sy + b, 2, 2, '#fa9251');
    } else if (mood === 'sky' || mood === 'ancestor') {
      if (h % 4 === 0) {
        rect(ctx, sx + a, sy + b, 4, 8, mood === 'sky' ? '#45668c' : '#795794');
        rect(ctx, sx + a + 1, sy + b - 3, 2, 4, mood === 'sky' ? '#80b6de' : '#c39de4');
      }
    } else if (h % 4 === 0) {
      rect(ctx, sx + a, sy + b, 9, 3, floor[0]);
      rect(ctx, sx + a + 2, sy + b - 2, 5, 2, floor[2]);
    }
    if (h % 19 === 0) {
      rect(ctx, sx + (a % 18), sy + (b % 22), 4, 3, '#8f867a');
      rect(ctx, sx + (a % 18) + 3, sy + (b % 22) + 2, 4, 2, '#2a2531');
    }

    if (ch === 'T') {
      // Carved pillar with squared highlights and ancestral runes.
      rect(ctx, sx + 5, sy + 27, 24, 4, '#171626');
      rect(ctx, sx + 6, sy + 5, 20, 23, '#50485a');
      rect(ctx, sx + 8, sy + 7, 16, 19, '#71687b');
      rect(ctx, sx + 4, sy + 3, 24, 6, '#aaa0a0');
      rect(ctx, sx + 6, sy + 1, 20, 2, '#e4cfa8');
      rect(ctx, sx + 22, sy + 9, 4, 17, '#393344');
      rect(ctx, sx + 13, sy + 12, 6, 2, PAL.gold);
      rect(ctx, sx + 15, sy + 10, 2, 8, '#c49a56');
      rect(ctx, sx + 10, sy + 26, 12, 2, '#c1ae99');
    } else if (ch === 'o') {
      rect(ctx, sx + 9, sy + 16, 14, 12, '#1a1826');
      rect(ctx, sx + 7, sy + 14, 18, 4, '#918397');
      rect(ctx, sx + 11, sy + 18, 10, 4, '#493b4b');
      const f = Math.sin(tick * 9 + i * 2) > 0 ? 0 : 2;
      rect(ctx, sx + 13, sy + 6 + f, 6, 10, '#fe883d');
      rect(ctx, sx + 15, sy + 2 + f, 2, 13, '#ffdf7f');
      rect(ctx, sx + 9, sy + 12 + f, 4, 4, '#d75246');
      rect(ctx, sx + 20, sy + 11 - f, 3, 4, '#f7ba63');
    } else if (ch === 'D') {
      const c = doorOpen ? '#92e0bd' : '#de6980';
      rect(ctx, sx + 1, sy + 2, 3, size - 4, c);
      rect(ctx, sx + 6, sy + 5, 2, 5, c);
      rect(ctx, sx + 7, sy + 16, 3, 2, c);
      rect(ctx, sx + 6, sy + 23, 2, 5, c);
    }
  }

  // Silhouettes are narrower than collision diameter, with rich vertical detail.
  // All variations share the same animation origin (feet at y=0).
  function person(ctx, opts) {
    const o = opts || {}, kind = String(o.kind || 'hero');
    const boss = /^(echo|sentinel|warden|warlord)$/.test(kind);
    const walk = (Math.floor(Math.abs(o.walk || 0) * 0.07) & 1) ? 2 : 0;
    const facing = !!o.flip;
    ctx.save();
    ctx.translate(Math.round(o.x || 0), Math.round(o.y || 0));
    if (facing) ctx.scale(-1, 1);
    ctx.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    // A 1x horizontal pixel grid keeps ordinary bodies within their 11-unit
    // collision radius. Height stays 2x so faces and boss silhouettes read.
    // Never use fractional canvas scaling: it blurs small sprite pixels.
    const PX = 1, PY = 2;
    const r = (x, y, w, h, c) => rect(ctx, x * PX, y * PY, w * PX, h * PY, c);
    const primary = o.color || PAL.gold;
    const dark = '#171425', skin = '#94593d', gleam = '#f4c48d';
    const armor = kind === 'warlord' ? '#963d35' :
      kind === 'sentinel' ? '#69519a' :
      kind === 'echo' ? '#496e97' :
      kind === 'warden' ? '#787280' : primary;
    const cloak = kind === 'hero' ? '#aa3e5a' :
      kind === 'priest' ? '#ede1b3' :
      kind === 'servant' ? '#6b8468' :
      kind === 'warlord' ? '#8c272c' :
      kind === 'echo' ? '#37749c' :
      kind === 'sentinel' ? '#554080' :
      kind === 'warden' ? '#554a54' : dark;
    // Shadow, boots and animated two-frame walking legs.
    r(-7, -1, 14, 2, '#14131e');
    r(-5, -5 + walk, 4, 5, dark);
    r(1, -5 + (walk ? -2 : 2), 4, 5, dark);
    r(-6, -2 + walk, 5, 2, '#242337');
    r(1, -2 + (walk ? -2 : 2), 5, 2, '#242337');
    // Cloak and layered chest armor.
    r(-8, -17, 16, 12, cloak);
    r(-6, -16, 12, 10, armor);
    r(-8, -16, 3, 9, '#261c2d');
    r(5, -16, 3, 9, '#261c2d');
    r(-6, -10, 12, 2, '#231a2b');
    r(-3, -10, 6, 2, PAL.gold);
    r(-7, -16, 4, 5, cloak);
    r(3, -16, 4, 5, cloak);
    r(-9, -15, 3, 7, skin);
    r(6, -15, 3, 7, skin);
    // Face, hair, forehead mark, eyes.
    r(-5, -25, 10, 9, skin);
    r(-5, -26, 10, 3, '#17141f');
    r(-5, -23, 2, 2, '#402f2c');
    r(1, -23, 2, 2, '#f7ecc4');
    r(0, -21, 4, 2, '#4b302d');
    if (kind === 'hero') {
      r(-9, -17, 3, 10, '#a52e43'); r(-11, -13, 3, 9, '#dd6c52');
      r(-4, -16, 8, 2, PAL.gold);
      r(-2, -20, 4, 2, PAL.gold);
      r(-5, -28, 10, 2, '#25202b');
    } else if (kind === 'priest') {
      r(-6, -29, 12, 4, '#dfd4a8'); r(-8, -17, 16, 2, PAL.gold);
    } else if (kind === 'soldier' || kind === 'captain') {
      r(-7, -28, 14, 4, '#73667b'); r(-4, -30, 8, 3, PAL.gold);
      r(8, -20, 2, 13, '#a6a6b2'); r(7, -27, 4, 9, '#d2c2a5');
      if (kind === 'captain') r(-9, -18, 3, 12, '#c95568');
    } else if (kind === 'servant') {
      r(-5, -27, 10, 2, '#53715c'); r(-7, -11, 14, 5, '#467e65');
    } else if (kind === 'hunter') {
      r(-8, -25, 3, 12, '#678366'); r(8, -20, 2, 16, '#d7bd83');
      r(8, -25, 4, 5, '#c0da8f');
    } else if (kind === 'spearman') {
      r(8, -27, 2, 24, '#b99774'); r(7, -30, 4, 7, '#c7d0c2');
      r(-7, -26, 14, 4, '#5f5360');
    }
    if (boss) {
      // Boss silhouettes: double pauldrons, masks and identifiable relic gear.
      r(-10, -18, 5, 7, armor); r(5, -18, 5, 7, armor);
      r(-9, -19, 4, 2, '#ddbd84'); r(5, -19, 4, 2, '#ddbd84');
      r(-5, -26, 10, 9, kind === 'echo' ? '#c9d5db' :
        kind === 'sentinel' ? '#a89bbc' : kind === 'warden' ? '#aa9c91' : '#573b3b');
      r(-5, -29, 10, 4, kind === 'warlord' ? '#d47541' : '#a899ad');
      r(-3, -24, 2, 2, kind === 'warlord' ? '#ffd98d' : PAL.moon);
      r(2, -24, 2, 2, kind === 'warlord' ? '#ffd98d' : PAL.moon);
      r(-3, -12, 6, 2, PAL.gold);
      // The four guardian bosses are visually distinct even at 2x output.
      if (kind === 'echo') {
        r(-8, -33, 3, 8, '#89c7f6'); r(-3, -35, 3, 7, '#d4effb');
        r(3, -32, 3, 6, '#74b5e5');
        r(9, -28, 2, 19, PAL.moon);
        r(8, -30, 4, 4, '#cce9ff');
        r(-11, -12, 3, 10, '#5ec9de');
      } else if (kind === 'sentinel') {
        r(-8, -33, 16, 2, '#a686ea'); r(-12, -30, 3, 12, '#8969c7');
        r(9, -30, 3, 12, '#8969c7');
        r(9, -29, 2, 23, '#d1b7ef'); r(7, -32, 6, 5, '#a888ef');
        r(-12, -14, 5, 12, '#6b558c'); r(-11, -16, 5, 2, '#d8b4ff');
      } else if (kind === 'warden') {
        r(-9, -31, 18, 3, '#6e655e');
        r(-11, -16, 3, 16, '#8b7468');
        r(9, -31, 2, 27, '#b2a292');
        r(7, -33, 6, 5, '#d7c0a4');
        r(-2, -19, 4, 2, '#dfc69b');
      } else if (kind === 'warlord') {
        r(-8, -33, 3, 7, '#ffb24e'); r(-4, -36, 3, 9, '#f35e36');
        r(1, -34, 3, 7, '#ffb24e'); r(5, -31, 3, 5, '#ef633c');
        r(-11, -18, 3, 15, '#ae3036');
        r(9, -31, 3, 29, '#da8247'); r(7, -35, 7, 8, '#ffb24e');
        r(9, -34, 3, 4, '#ffe99b');
      }
    }
    // Fine costume pixels are deterministic, maintaining visual clarity as
    // motion shifts the pose. Gold trim, clothing folds and cheekbone glint
    // add volume without enlarging the collision silhouette.
    r(-5, -13, 2, 3, '#3b2634');
    r(4, -12, 1, 4, '#191424');
    r(-5, -7, 3, 2, '#ae7754');
    r(2, -7, 2, 2, '#e1ad72');
    r(-3, -20, 1, 3, '#c88358');
    r(4, -22, 1, 4, '#583627');
    r(-3, -15, 3, 2, gleam);
    ctx.restore();
  }
  function spirit(ctx, opts) {
    ctx.save();
    ctx.translate(Math.round(opts.x), Math.round(opts.y));
    ctx.globalAlpha *= opts.alpha === undefined ? 1 : opts.alpha;
    const rise = Math.round(Math.sin((opts.tick || 0) * 5) * 2);
    rect(ctx, -9, -21 + rise, 18, 17, '#5564ac');
    rect(ctx, -7, -25 + rise, 14, 17, '#a4c3ed');
    rect(ctx, -5, -22 + rise, 10, 14, '#c3b3fc');
    rect(ctx, -3, -19 + rise, 2, 3, '#1d2953');
    rect(ctx, 3, -19 + rise, 2, 3, '#1d2953');
    rect(ctx, -9, -6 + rise, 4, 4, '#7689dc');
    rect(ctx, 4, -4 + rise, 4, 5, '#758de3');
    const t = opts.tick || 0;
    for (let n = 0; n < 3; n++) {
      const x = Math.round(Math.cos(t * 2 + n * 2.1) * 14);
      const y = Math.round(Math.sin(t * 2 + n * 2.1) * 9) - 15;
      rect(ctx, x, y, 3, 3, n === 1 ? '#f3d9ff' : PAL.moon);
    }
    ctx.restore();
  }
  function mark(ctx, kind, x, y, t) {
    const colors = { panther: '#69e8bc', eagle: '#8fcfff', ancestor: '#cda2ff' };
    const col = colors[kind] || PAL.spirit;
    ctx.save();
    ctx.globalAlpha *= 0.82;
    const xx = Math.round(x), yy = Math.round(y);
    const wave = Math.floor((Math.sin(t * 5) + 1) * 2);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.strokeRect(xx - 17 - wave, yy - 30 - wave, 34 + 2 * wave, 31 + 2 * wave);
    rect(ctx, xx - 16, yy - 34 - wave, 6, 2, col);
    rect(ctx, xx + 12, yy - 34 - wave, 6, 2, col);
    rect(ctx, xx - 2, yy - 39 - wave, 4, 4, col);
    ctx.restore();
  }
  // Children of Morta-inspired lighting principle: textured pixel art
  // remains sharp while translucent warm/cool light falls across the scene.
  // Original procedural effects only: no third-party art assets are copied.
  function atmosphere(ctx, map, camera, zoom, width, height, t) {
    if (!map || !map.rows || typeof ctx.createRadialGradient !== 'function') return;
    const x0 = Math.max(0, Math.floor(camera.x / 32) - 1);
    const y0 = Math.max(0, Math.floor(camera.y / 32) - 1);
    const x1 = Math.min(map.w - 1, Math.ceil((camera.x + width / zoom) / 32) + 1);
    const y1 = Math.min(map.h - 1, Math.ceil((camera.y + height / zoom) / 32) + 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Layering rather than blur: strong localized contrast, dim ambient space.
    ctx.fillStyle = 'rgba(9, 8, 23, 0.12)';
    ctx.fillRect(0, 0, width, height);
    let count = 0;
    for (let j = y0; j <= y1 && count < 12; j++) {
      for (let i = x0; i <= x1 && count < 12; i++) {
        if (map.rows[j][i] !== 'o') continue;
        const x = Math.round((i * 32 + 16 - camera.x) * zoom);
        const y = Math.round((j * 32 + 11 - camera.y) * zoom);
        const radius = 105 * zoom + Math.sin(t * 7 + i) * 5;
        const g = ctx.createRadialGradient(x, y, 6, x, y, radius);
        g.addColorStop(0, 'rgba(255,188,109,0.26)');
        g.addColorStop(0.32, 'rgba(226,130,82,0.15)');
        g.addColorStop(1, 'rgba(255,140,100,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
        count++;
      }
    }
    // The ancestral glow is distinct from palace firelight. Keep this
    // behind UI and never obscure player text, indicators or health bars.
    if (map.chapter === 'trials') {
      const x = width / 2, y = height / 2, radius = Math.min(width, height) * 0.7;
      const g = ctx.createRadialGradient(x,y,25,x,y,radius);
      g.addColorStop(0,'rgba(112,91,175,0.10)');
      g.addColorStop(1,'rgba(112,91,175,0)');
      ctx.fillStyle = g; ctx.fillRect(x-radius,y-radius,2*radius,2*radius);
    }
    ctx.restore();
  }
  function heart(ctx, x, y, on, low) {
    const color = on ? (low ? '#f36d6b' : '#ff9a87') : '#3a2a4c';
    const shine = on ? '#ffe1ae' : '#594666';
    const unit = 3;
    const squares = [
      [1,0],[2,0],[4,0],[5,0],
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
      [1,3],[2,3],[3,3],[4,3],[5,3],
      [2,4],[3,4],[4,4],[3,5]
    ];
    for(const [px,py] of squares) rect(ctx, x+px*unit, y+py*unit,unit,unit,color);
    rect(ctx,x+unit*1,y+unit,unit*2,unit,shine);
    rect(ctx,x+unit*4,y+unit,unit,unit,shine);
  }
  function frame(ctx, width, height) {
    // Gameplay stays visible behind thin, highly readable RPG status rails.
    rect(ctx, 0, 0, width, 43, 'rgba(10,10,23,0.84)');
    rect(ctx, 0, 42, width, 3, '#a77e45');
    rect(ctx, 0, height - 83, width, 83, 'rgba(10,10,23,0.79)');
    rect(ctx, 0, height - 83, width, 3, '#75609a');
    rect(ctx, 7, 7, 5, 5, PAL.gold);
    rect(ctx, width - 12, 7, 5, 5, PAL.gold);
    rect(ctx, 8, height - 9, 5, 5, PAL.gold);
    rect(ctx, width - 13, height - 9, 5, 5, PAL.gold);
  }
  function gauge(ctx, x, y, w, h, amount, color, bg) {
    const xx = Math.round(x), yy = Math.round(y), ww = Math.round(w), hh = Math.round(h);
    rect(ctx, xx - 2, yy - 2, ww + 4, hh + 4, PAL.edge);
    rect(ctx, xx, yy, ww, hh, bg || '#282338');
    const total = Math.max(0, Math.min(1, Number(amount) || 0));
    const filled = Math.floor(total * ww / 4) * 4;
    if (filled > 0) {
      rect(ctx, xx, yy, filled, hh, color);
      rect(ctx, xx, yy, filled, 2, '#f6dba0');
    }
    rect(ctx, xx - 2, yy - 2, ww + 4, 2, '#9780a1');
  }
  root.ChamPixelArt = Object.freeze({ tile, person, spirit, mark, frame, gauge, heart, atmosphere, palette: PAL });
})(window);
