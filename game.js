'use strict';
// Corebreaker simulation: input, audio, game state and update loop.
// Shared by the 2D (index.html) and 3D (3d.html) renderers.
const W = 960, H = 720, CX = W / 2, CY = H / 2, TAU = Math.PI * 2;

// ---------- input ----------
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
                 ArrowUp: 'thrust', KeyW: 'thrust', Space: 'fire', Enter: 'start', KeyP: 'pause' };
const keys = {}, pressed = {};
addEventListener('keydown', e => {
  const k = KEYMAP[e.code]; if (!k) return;
  e.preventDefault(); initAudio();
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) { keys[k] = false; e.preventDefault(); } });

// ---------- touch controls ----------
// On-screen buttons that drive the same keys/pressed maps as the keyboard. They stay hidden
// until the device looks touch-first or a finger actually lands on the page.
let touchOn = false;
const touchUI = document.createElement('div');
touchUI.id = 'touch';
{
  const css = document.createElement('style');
  css.textContent = [
    '#touch{display:none}',
    '.touch #touch{display:block}',
    '.touch,.touch body{touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none}',
    '.tbtn{position:fixed;z-index:10;box-sizing:border-box;width:76px;height:76px;border-radius:50%;',
    '  border:2px solid rgba(207,234,255,.45);background:rgba(127,212,255,.10);color:rgba(207,234,255,.85);',
    '  font:600 13px "Trebuchet MS","Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;',
    '  touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;cursor:pointer}',
    '.tbtn.on{background:rgba(127,212,255,.38);border-color:rgba(207,234,255,.9)}',
    '.t-arrow{font-size:26px}',
    '.t-left{left:max(14px,env(safe-area-inset-left));bottom:max(22px,env(safe-area-inset-bottom))}',
    '.t-right{left:calc(max(14px,env(safe-area-inset-left)) + 88px);bottom:max(22px,env(safe-area-inset-bottom))}',
    '.t-fire{right:max(14px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom))}',
    '.t-thrust{right:calc(max(14px,env(safe-area-inset-right)) + 88px);bottom:max(22px,env(safe-area-inset-bottom))}',
    '.t-small{width:46px;height:46px;font-size:11px;right:max(12px,env(safe-area-inset-right))}',
    '.t-pause{top:76px}',
    '.t-cam{top:130px}',
    '.touch #alt{right:auto;left:50%;bottom:auto;top:40px;transform:translateX(-50%)}',
    '.touch.playing #alt{display:none}',     // keep the version link out from under thumbs mid-game
  ].join('\n');
  document.head.appendChild(css);
  document.body.appendChild(touchUI);
}
function enableTouch() {
  if (touchOn) return;
  touchOn = true; document.documentElement.classList.add('touch');
}
// key: an entry of the keys/pressed maps to hold while the button is down; onPress: extra action
function addTouchButton(label, cls, key, onPress) {
  const b = document.createElement('div');
  b.className = 'tbtn ' + cls; b.textContent = label;
  const release = () => { if (key) keys[key] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); initAudio();
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    if (key) { if (!keys[key]) pressed[key] = true; keys[key] = true; }
    if (onPress) onPress();
    b.classList.add('on');
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, release);
  b.addEventListener('contextmenu', e => e.preventDefault());
  touchUI.appendChild(b);
  return b;
}
addTouchButton('◀', 't-arrow t-left', 'left');
addTouchButton('▶', 't-arrow t-right', 'right');
addTouchButton('THRUST', 't-thrust', 'thrust');
addTouchButton('FIRE', 't-fire', 'fire');
addTouchButton('II', 't-small t-pause', 'pause');
if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) enableTouch();
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  enableTouch(); initAudio();
  if (state !== 'play') pressed.start = true;      // tap anywhere to launch
});

// ---------- audio ----------
let ac = null;
function initAudio() {
  if (ac || typeof AudioContext === 'undefined') return;
  try { ac = new AudioContext(); } catch (e) { ac = null; }
}
function beep(f0, f1, dur, type = 'square', vol = 0.08) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  fire: () => beep(880, 220, 0.12, 'square', 0.05),
  hit: () => beep(300, 120, 0.08, 'triangle', 0.09),
  holeOpen: () => beep(110, 45, 0.9, 'sine', 0.14),
  warpIn: () => beep(700, 35, 1.4, 'sawtooth', 0.09),
  warpOut: () => { beep(50, 1100, 0.6, 'sawtooth', 0.09); beep(200, 1600, 0.4, 'triangle', 0.07); },
  crack: () => beep(520, 60, 0.2, 'sawtooth', 0.07),
  boom: () => { beep(160, 30, 0.6, 'sawtooth', 0.12); beep(90, 20, 0.8, 'square', 0.08); },
  bolt: () => beep(140, 700, 0.25, 'sawtooth', 0.08),
  drone: () => beep(1200, 300, 0.15, 'triangle', 0.06),
  win: () => { beep(220, 880, 0.5, 'square', 0.08); beep(330, 1320, 0.7, 'triangle', 0.08); },
};

// ---------- helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const norm = a => ((a % TAU) + TAU) % TAU;
const adiff = (a, b) => { let d = norm(a - b); return d > Math.PI ? d - TAU : d; };
const wrap = o => { o.x = (o.x + W) % W; o.y = (o.y + H) % H; };

// ---------- state ----------
const PAL = ['#ff5fa2', '#ffb347', '#4fe3d0'];   // inner, mid, outer plate tints
let state = 'title', paused = false, score = 0, lives = 0, level = 1, time = 0, overTime = -9;
let hi = 0; try { hi = +localStorage.getItem('corebreaker.hi') || 0; } catch (e) {}
let shells, core, ship, shots, bolts, drones, parts, droneTimer, clearTimer, respawnTimer, shellSeq;
// planets bend everything that flies past; a black hole (hole) swallows the ship and a white hole
// (whiteHole) returns it on the far side of the arena while warp runs and timeScale slows the game
let planets = [], hole = null, whiteHole = null, warp = null, holeTimer = 12, timeScale = 1;
const HOLE_R = 14, HOLE_MU = 2.2e6, LIGHT_BEND = 3;
const PLANET_COLORS = ['#6fa8ff', '#c9a26b', '#9be37a', '#d98cff', '#ff9d6b'];
const stars = Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(0.4, 1.6), p: rnd(0, TAU) }));

const ORBIT_SPEED = 170, GRAV_MAX = 240, SPAWN_R = 290;
const shellRadius = i => 54 + i * 30;
function makeShell(i) {
  shellSeq++;
  const n = [8, 10, 12][shellSeq % 3];
  const dir = shellSeq % 2 ? 1 : -1;
  return { n, seg: new Array(n).fill(2), rot: rnd(0, TAU), r: i === 0 ? 20 : shellRadius(i),
           speed: dir * rnd(0.5, 0.8) * (1 + 0.15 * (level - 1)) };
}
function buildFortress() {
  shellSeq = 0;
  shells = [0, 1, 2].map(makeShell);
  shells[0].r = shellRadius(0);
  core = { ang: 0, cd: 2, alive: true, flash: 0 };
  placePlanets(); hole = null; holeTimer = rnd(8, 14);
  shots = []; bolts = []; drones = []; droneTimer = 4; clearTimer = 0;
}
function spawnShip() {
  // start already circling the core, nose pointed at it
  ship = { x: CX + SPAWN_R, y: CY, vx: 0, vy: -ORBIT_SPEED, a: Math.PI, alive: true, inv: 2.2, cd: 0, flame: 0 };
}
function newGame() {
  score = 0; lives = 3; level = 1; parts = [];
  warp = null; whiteHole = null; timeScale = 1;
  buildFortress(); spawnShip(); respawnTimer = 0; state = 'play';
}
function addScore(n) { score += n; if (score > hi) { hi = score; try { localStorage.setItem('corebreaker.hi', hi); } catch (e) {} } }

function burst(x, y, color, n, speed, life = 0.8) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), s = rnd(0.2, 1) * speed;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 1) * life, max: life, color });
  }
}

// ---------- gravity ----------
function placePlanets() {
  planets = [];
  const want = level >= 3 ? 3 : 2;
  for (let tries = 0; tries < 400 && planets.length < want; tries++) {
    const x = rnd(70, W - 70), y = rnd(70, H - 70);
    if (Math.hypot(x - CX, y - CY) < 240) continue;                    // clear of the fortress
    if (Math.hypot(x - CX - SPAWN_R, y - CY) < 150) continue;          // and of the launch point
    if (planets.some(p => Math.hypot(x - p.x, y - p.y) < 200)) continue;
    const r = rnd(16, 26);
    planets.push({ x, y, r, mu: 1.1e6 * (r / 20) * (r / 20), ring: Math.random() < 0.5,
                   color: PLANET_COLORS[(planets.length + level * 2) % PLANET_COLORS.length] });
  }
}
let GX = 0, GY = 0;     // result of gravityAt
function addPull(x, y, sx, sy, mu, minR, cap) {
  const dx = sx - x, dy = sy - y, d = Math.hypot(dx, dy) || 1, dd = Math.max(d, minR);
  const a = Math.min(cap, mu / (dd * dd));
  GX += dx / d * a; GY += dy / d * a;
}
// inverse-square pull of the planets and the black hole (not the core, which only tugs the ship)
function gravityAt(x, y, cap) {
  GX = GY = 0;
  for (const p of planets) addPull(x, y, p.x, p.y, p.mu, p.r, cap);
  if (hole) addPull(x, y, hole.x, hole.y, HOLE_MU * hole.k, HOLE_R, cap * 1.6);
}
// shots and bolts bend like light: the path curves but the speed never changes
function bend(b, dt) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  gravityAt(b.x, b.y, 2600);
  b.vx += GX * LIGHT_BEND * dt; b.vy += GY * LIGHT_BEND * dt;
  const s2 = Math.hypot(b.vx, b.vy) || 1; b.vx *= sp / s2; b.vy *= sp / s2;
}
function hitBody(o) {
  for (const p of planets) if (Math.hypot(o.x - p.x, o.y - p.y) < p.r) return p;
  if (hole && hole.k > 0.5 && Math.hypot(o.x - hole.x, o.y - hole.y) < HOLE_R) return hole;
  return null;
}
// what dents the space-time fabric, for the renderers: depth > 0 is a well, < 0 a hill
function fabricSources() {
  const out = [];
  if (core && core.alive) out.push({ x: CX, y: CY, depth: 1, size: 110 });
  for (const p of planets) out.push({ x: p.x, y: p.y, depth: 0.75 * p.r / 20, size: 60 });
  if (hole) out.push({ x: hole.x, y: hole.y, depth: 2.2 * hole.k, size: 48 });
  if (whiteHole) out.push({ x: whiteHole.x, y: whiteHole.y, depth: -1.3 * whiteHole.k, size: 48 });
  return out;
}
function spawnHole() {
  for (let tries = 0; tries < 200; tries++) {
    const x = rnd(90, W - 90), y = rnd(90, H - 90);
    if (Math.hypot(x - CX, y - CY) < 230 || Math.hypot(x - ship.x, y - ship.y) < 170) continue;
    if (planets.some(p => Math.hypot(x - p.x, y - p.y) < p.r + 90)) continue;
    hole = { x, y, k: 0, life: 14, spin: 0 }; sfx.holeOpen();
    return;
  }
  holeTimer = 2;
}
function startWarp() {
  // come out on the opposite side of the arena, nudged clear of any planet sitting there
  let tx = 2 * CX - hole.x, ty = 2 * CY - hole.y;
  for (const p of planets) {
    const d = Math.hypot(tx - p.x, ty - p.y) || 1, min = p.r + 70;
    if (d < min) { tx = p.x + (tx - p.x) / d * min; ty = p.y + (ty - p.y) / d * min; }
  }
  const moving = Math.hypot(ship.vx, ship.vy) > 5;
  warp = { phase: 'in', t: 0, sx: ship.x, sy: ship.y, hx: hole.x, hy: hole.y, tx, ty,
           dir: moving ? Math.atan2(ship.vy, ship.vx) : ship.a, stretch: 1, squash: 1, alpha: 1 };
  if (Math.hypot(hole.x - ship.x, hole.y - ship.y) > 1) ship.a = Math.atan2(hole.y - ship.y, hole.x - ship.x);
  ship.vx = ship.vy = 0; ship.flame = 0; ship.inv = 99; hole.life = 99;
  sfx.warpIn();
}
// Runs on real time (the simulation itself is slowed by timeScale while this plays):
// in = stretched into the hole, void = gone while the white hole opens, out = thrown clear.
function updateWarp(rdt) {
  if (!warp) { timeScale = Math.min(1, timeScale + rdt * 2); return; }
  if (!ship.alive) { warp = null; return; }
  warp.t += rdt;
  if (warp.phase === 'in') {
    const u = Math.min(1, warp.t / 1.3), e = u * u;
    timeScale = 1 - 0.8 * u;
    ship.x = warp.sx + (warp.hx - warp.sx) * e; ship.y = warp.sy + (warp.hy - warp.sy) * e;
    warp.stretch = 1 + 7 * e; warp.squash = 1 - 0.88 * e; warp.alpha = 1 - e * e;
    if (u >= 1) {
      burst(warp.hx, warp.hy, '#b98cff', 30, 200, 1);
      hole = null; holeTimer = rnd(12, 22);
      whiteHole = { x: warp.tx, y: warp.ty, k: 0 };
      ship.x = warp.tx; ship.y = warp.ty; ship.a = warp.dir;
      warp.phase = 'void'; warp.t = 0;
    }
  } else if (warp.phase === 'void') {
    timeScale = 0.2; whiteHole.k = Math.min(1, warp.t / 0.5);
    if (warp.t >= 0.75) { warp.phase = 'out'; warp.t = 0; sfx.warpOut(); burst(warp.tx, warp.ty, '#eaf6ff', 40, 260, 1); }
  } else {
    const u = Math.min(1, warp.t / 0.8), e = 1 - (1 - u) * (1 - u);
    timeScale = 0.2 + 0.8 * u;
    ship.x = warp.tx + Math.cos(warp.dir) * 60 * e; ship.y = warp.ty + Math.sin(warp.dir) * 60 * e;
    warp.stretch = 8 - 7 * e; warp.squash = 0.12 + 0.88 * e; warp.alpha = Math.min(1, u * 3);
    if (u >= 1) {
      ship.vx = Math.cos(warp.dir) * 220; ship.vy = Math.sin(warp.dir) * 220; ship.inv = 1.5; ship.cd = 0;
      warp = null;
    }
  }
}

const segIndex = (s, ang) => Math.floor(norm(ang - s.rot) / (TAU / s.n)) % s.n;
const lineClear = ang => shells.every(s => s.seg[segIndex(s, ang)] <= 0);

function killShip() {
  if (!ship.alive) return;
  ship.alive = false; lives--; sfx.boom();
  burst(ship.x, ship.y, '#e8f4ff', 50, 260, 1.2);
  respawnTimer = 2;
}

// ---------- update ----------
function update(dt) {
  time += dt;
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  // a short lockout after game over, so a thumb still mashing FIRE does not restart at once
  if (state !== 'play') { if ((pressed.start || pressed.fire) && time - overTime > 1) newGame(); return; }

  // shells
  shells.forEach((s, i) => { s.rot += s.speed * dt; s.r += (shellRadius(i) - s.r) * Math.min(1, dt * 5); });
  // when the outermost shell is completely gone the fortress regrows from the inside
  if (core.alive && shells[2].seg.every(h => h <= 0)) {
    shells.pop(); shells.unshift(makeShell(0)); sfx.bolt();
  }

  // level clear countdown
  if (clearTimer > 0) {
    clearTimer -= dt;
    // The fortress regrows where it stood: shove the ship out of its footprint first,
    // so nobody can wait at the centre and shoot the new core from inside the shells.
    const keepOut = shellRadius(2) + 45;
    const dx = ship.x - CX, dy = ship.y - CY, r = Math.hypot(dx, dy);
    const nx = r > 0.01 ? dx / r : Math.cos(ship.a), ny = r > 0.01 ? dy / r : Math.sin(ship.a);
    if (ship.alive && !warp && r < keepOut) {
      const push = 600 + 900 * (1 - r / keepOut);
      ship.vx += nx * push * dt; ship.vy += ny * push * dt;
    }
    if (clearTimer <= 0) {
      level++; lives++; buildFortress();
      if (ship.alive && !warp && r < keepOut) { ship.x = CX + nx * keepOut; ship.y = CY + ny * keepOut; }
    }
  }

  // black hole: opens at random while the fight is on, closes after a while
  if (hole) {
    hole.life -= dt; hole.spin += dt;
    hole.k = hole.life > 0 ? Math.min(1, hole.k + dt * 1.6) : hole.k - dt * 2;
    if (hole.k <= 0) { hole = null; holeTimer = rnd(12, 22); }
  } else if (core.alive && ship.alive && !warp) {
    holeTimer -= dt;
    if (holeTimer <= 0) spawnHole();
  }
  if (whiteHole && !warp) { whiteHole.k -= dt * 2; if (whiteHole.k <= 0) whiteHole = null; }

  // ship (frozen in the sim while a warp animates it)
  if (ship.alive && !warp) {
    if (keys.left) ship.a -= 4.2 * dt;
    if (keys.right) ship.a += 4.2 * dt;
    ship.flame = keys.thrust ? Math.min(1, ship.flame + dt * 8) : Math.max(0, ship.flame - dt * 8);
    if (keys.thrust) {
      ship.vx += Math.cos(ship.a) * 300 * dt; ship.vy += Math.sin(ship.a) * 300 * dt;
      if (Math.random() < 0.5) {
        const a = ship.a + Math.PI + rnd(-0.3, 0.3);
        parts.push({ x: ship.x - Math.cos(ship.a) * 12, y: ship.y - Math.sin(ship.a) * 12,
                     vx: Math.cos(a) * 140 + ship.vx, vy: Math.sin(a) * 140 + ship.vy, life: 0.3, max: 0.3, color: '#ffb347' });
      }
    }
    if (core.alive) {
      // The core pulls the ship in. The pull falls off as 1/r, so the speed needed to circle
      // (ORBIT_SPEED) is the same at any distance, and it is capped below thrust so you can always climb out.
      const gx = CX - ship.x, gy = CY - ship.y, gr = Math.hypot(gx, gy) || 1;
      const g = Math.min(GRAV_MAX, ORBIT_SPEED * ORBIT_SPEED / gr);
      ship.vx += gx / gr * g * dt; ship.vy += gy / gr * g * dt;
    }
    gravityAt(ship.x, ship.y, GRAV_MAX);
    ship.vx += GX * dt; ship.vy += GY * dt;
    const drag = Math.pow(0.96, dt); ship.vx *= drag; ship.vy *= drag;
    const sp = Math.hypot(ship.vx, ship.vy), MAX = 400;
    if (sp > MAX) { ship.vx *= MAX / sp; ship.vy *= MAX / sp; }
    ship.x += ship.vx * dt; ship.y += ship.vy * dt; wrap(ship);
    ship.inv = Math.max(0, ship.inv - dt); ship.cd -= dt;
    if ((pressed.fire || (keys.fire && ship.cd <= -0.12)) && ship.cd <= 0 && shots.length < 4) {
      shots.push({ x: ship.x + Math.cos(ship.a) * 16, y: ship.y + Math.sin(ship.a) * 16,
                   vx: Math.cos(ship.a) * 540, vy: Math.sin(ship.a) * 540, life: 1.0 });
      ship.cd = 0.16; sfx.fire();
    }
    // bounce off intact plates, die on the core
    const dx = ship.x - CX, dy = ship.y - CY, r = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
    if (core.alive) {
      for (const s of shells) {
        if (Math.abs(r - s.r) < 13 && s.seg[segIndex(s, ang)] > 0) {
          const side = r >= s.r ? 1 : -1, nx = dx / r, ny = dy / r;
          const vr = ship.vx * nx + ship.vy * ny;
          if (vr * side < 0) { ship.vx -= 1.8 * vr * nx; ship.vy -= 1.8 * vr * ny; if (Math.abs(vr) > 40) sfx.hit(); }
          ship.x = CX + nx * (s.r + side * 13); ship.y = CY + ny * (s.r + side * 13);
          break;
        }
      }
      if (r < 26) killShip();
    }
    for (const p of planets) {                    // planets are solid: glance off them
      const px = ship.x - p.x, py = ship.y - p.y, pd = Math.hypot(px, py) || 1, min = p.r + 11;
      if (pd < min) {
        const nx = px / pd, ny = py / pd, vn = ship.vx * nx + ship.vy * ny;
        if (vn < 0) { ship.vx -= 1.6 * vn * nx; ship.vy -= 1.6 * vn * ny; if (vn < -40) sfx.hit(); }
        ship.x = p.x + nx * min; ship.y = p.y + ny * min;
      }
    }
    if (ship.alive && hole && hole.k > 0.6 && Math.hypot(ship.x - hole.x, ship.y - hole.y) < HOLE_R + 5) startWarp();
  } else if (respawnTimer > 0) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) {
      if (lives <= 0) { state = 'over'; overTime = time; }
      else { spawnShip(); drones = []; bolts = []; droneTimer = 4; }
    }
  }

  // player shots
  for (const b of shots) {
    const pr = Math.hypot(b.x - CX, b.y - CY);
    bend(b, dt);
    b.x += b.vx * dt; b.y += b.vy * dt; wrap(b); b.life -= dt;
    if (hitBody(b)) { b.life = 0; burst(b.x, b.y, '#eaf6ff', 4, 80, 0.3); continue; }
    if (!core.alive) continue;
    const r = Math.hypot(b.x - CX, b.y - CY), ang = Math.atan2(b.y - CY, b.x - CX);
    for (let i = shells.length - 1; i >= 0 && b.life > 0; i--) {
      const s = shells[i];
      if ((pr - s.r) * (r - s.r) <= 0 && Math.abs(pr - r) < 60) {
        const k = segIndex(s, ang);
        if (s.seg[k] > 0) {
          s.seg[k]--; b.life = 0;
          if (s.seg[k] <= 0) { addScore(10 * (3 - i) + 10); sfx.crack(); burst(b.x, b.y, PAL[i], 14, 160); }
          else { addScore(5); sfx.hit(); burst(b.x, b.y, PAL[i], 5, 90, 0.4); }
        }
      }
    }
    if (b.life > 0 && r < 20) {          // core breached
      b.life = 0; core.alive = false; addScore(1000 * level); sfx.boom(); sfx.win();
      burst(CX, CY, '#ffffff', 90, 420, 1.6);
      shells.forEach((s, i) => { for (let k = 0; k < s.n; k++) if (s.seg[k] > 0) {
        const a = s.rot + (k + 0.5) * TAU / s.n; burst(CX + Math.cos(a) * s.r, CY + Math.sin(a) * s.r, PAL[i], 6, 220, 1.2); }
        s.seg.fill(0); });
      drones.forEach(d => burst(d.x, d.y, '#b98cff', 10, 150)); drones = []; bolts = [];
      clearTimer = 2.5;
    }
  }
  shots = shots.filter(b => b.life > 0);

  if (core.alive) {
    // core tracks the ship and fires through any open lane
    core.flash = Math.max(0, core.flash - dt * 3); core.cd -= dt;
    if (ship.alive) {
      const want = Math.atan2(ship.y - CY, ship.x - CX), d = adiff(want, core.ang);
      const rate = (1.6 + 0.25 * level) * dt;
      core.ang += Math.abs(d) < rate ? d : Math.sign(d) * rate;
      if (core.cd <= 0 && Math.abs(d) < 0.07 && ship.inv <= 0 && lineClear(core.ang)) {
        const v = 430 + 25 * level;
        bolts.push({ x: CX + Math.cos(core.ang) * 22, y: CY + Math.sin(core.ang) * 22,
                     vx: Math.cos(core.ang) * v, vy: Math.sin(core.ang) * v });
        core.cd = Math.max(0.7, 1.6 - 0.1 * level); core.flash = 1; sfx.bolt();
      }
      // seeker drones
      droneTimer -= dt;
      if (droneTimer <= 0 && drones.length < Math.min(5, 2 + level)) {
        const a = rnd(0, TAU);
        drones.push({ x: CX + Math.cos(a) * 24, y: CY + Math.sin(a) * 24, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 14, spin: rnd(0, TAU) });
        droneTimer = Math.max(1.5, 4.5 - 0.4 * level);
      }
    }
  }
  for (const b of bolts) {
    bend(b, dt);
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (hitBody(b)) { b.dead = true; burst(b.x, b.y, '#ffd9a0', 8, 120, 0.4); }
    if (ship.alive && ship.inv <= 0 && Math.hypot(b.x - ship.x, b.y - ship.y) < 16) { b.dead = true; killShip(); }
    if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) b.dead = true;
  }
  bolts = bolts.filter(b => !b.dead);

  const dSpeed = 95 + 14 * level;
  for (const d of drones) {
    d.life -= dt; d.spin += dt * 6;
    if (ship.alive) {
      const a = Math.atan2(ship.y - d.y, ship.x - d.x);
      d.vx += Math.cos(a) * 320 * dt; d.vy += Math.sin(a) * 320 * dt;
    }
    // drones fall toward planets too, and may run faster than their engines while they do
    gravityAt(d.x, d.y, 400);
    d.vx += GX * 1.5 * dt; d.vy += GY * 1.5 * dt;
    const sp = Math.hypot(d.vx, d.vy) || 1, top = dSpeed + Math.min(140, Math.hypot(GX, GY) * 0.6);
    if (sp > top) { d.vx *= top / sp; d.vy *= top / sp; }
    d.x += d.vx * dt; d.y += d.vy * dt;
    const body = hitBody(d);
    if (body === hole && hole) { d.life = 0; burst(d.x, d.y, '#b98cff', 8, 60, 0.5); }
    else if (body) {
      const bx = d.x - body.x, by = d.y - body.y, bd = Math.hypot(bx, by) || 1;
      d.x = body.x + bx / bd * body.r; d.y = body.y + by / bd * body.r;
    }
    for (const b of shots) if (Math.hypot(b.x - d.x, b.y - d.y) < 14) {
      b.life = 0; d.life = 0; addScore(50); sfx.drone(); burst(d.x, d.y, '#b98cff', 14, 170);
    }
    if (d.life > 0 && ship.alive && ship.inv <= 0 && Math.hypot(ship.x - d.x, ship.y - d.y) < 18) {
      d.life = 0; burst(d.x, d.y, '#b98cff', 14, 170); killShip();
    }
  }
  drones = drones.filter(d => d.life > 0);
  shots = shots.filter(b => b.life > 0);
}

// ---------- loop ----------
let last = 0, acc = 0, wasPlaying = false;
const STEP = 1 / 120;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t;
  if (pressed.pause && state === 'play') paused = !paused;
  if (paused) { for (const k in pressed) pressed[k] = false; }
  else {
    if (state === 'play') updateWarp(dt); else timeScale = 1;
    acc += dt;
    while (acc >= STEP) { update(STEP * timeScale); acc -= STEP; for (const k in pressed) pressed[k] = false; }
  }
  if (wasPlaying !== (state === 'play')) {
    wasPlaying = state === 'play'; document.documentElement.classList.toggle('playing', wasPlaying);
  }
  draw();
  requestAnimationFrame(frame);
}
// the page defines draw() and then calls startLoop()
function startLoop() { parts = []; requestAnimationFrame(frame); }
