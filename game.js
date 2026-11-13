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
let state = 'title', paused = false, score = 0, lives = 0, level = 1, time = 0;
let hi = 0; try { hi = +localStorage.getItem('corebreaker.hi') || 0; } catch (e) {}
let shells, core, ship, shots, bolts, drones, parts, droneTimer, clearTimer, respawnTimer, shellSeq;
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
  shots = []; bolts = []; drones = []; droneTimer = 4; clearTimer = 0;
}
function spawnShip() {
  // start already circling the core, nose pointed at it
  ship = { x: CX + SPAWN_R, y: CY, vx: 0, vy: -ORBIT_SPEED, a: Math.PI, alive: true, inv: 2.2, cd: 0, flame: 0 };
}
function newGame() {
  score = 0; lives = 3; level = 1; parts = [];
  buildFortress(); spawnShip(); respawnTimer = 0; state = 'play';
}
function addScore(n) { score += n; if (score > hi) { hi = score; try { localStorage.setItem('corebreaker.hi', hi); } catch (e) {} } }

function burst(x, y, color, n, speed, life = 0.8) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), s = rnd(0.2, 1) * speed;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 1) * life, max: life, color });
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
  if (state !== 'play') { if (pressed.start || pressed.fire) newGame(); return; }

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
    if (ship.alive && r < keepOut) {
      const push = 600 + 900 * (1 - r / keepOut);
      ship.vx += nx * push * dt; ship.vy += ny * push * dt;
    }
    if (clearTimer <= 0) {
      level++; lives++; buildFortress();
      if (ship.alive && r < keepOut) { ship.x = CX + nx * keepOut; ship.y = CY + ny * keepOut; }
    }
  }

  // ship
  if (ship.alive) {
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
  } else if (respawnTimer > 0) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) {
      if (lives <= 0) state = 'over';
      else { spawnShip(); drones = []; bolts = []; droneTimer = 4; }
    }
  }

  // player shots
  for (const b of shots) {
    const pr = Math.hypot(b.x - CX, b.y - CY);
    b.x += b.vx * dt; b.y += b.vy * dt; wrap(b); b.life -= dt;
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
    b.x += b.vx * dt; b.y += b.vy * dt;
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
    const sp = Math.hypot(d.vx, d.vy) || 1;
    if (sp > dSpeed) { d.vx *= dSpeed / sp; d.vy *= dSpeed / sp; }
    d.x += d.vx * dt; d.y += d.vy * dt;
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
let last = 0, acc = 0;
const STEP = 1 / 120;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t;
  if (pressed.pause && state === 'play') paused = !paused;
  if (paused) { for (const k in pressed) pressed[k] = false; }
  else {
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; for (const k in pressed) pressed[k] = false; }
  }
  draw();
  requestAnimationFrame(frame);
}
// the page defines draw() and then calls startLoop()
function startLoop() { parts = []; requestAnimationFrame(frame); }
