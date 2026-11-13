# Corebreaker

Browser arcade shooter: rotate/thrust/fire to cut a lane through rotating shells and hit the core.
An original game in the style of the vector-era fortress shooters, not a clone of any one of them.

- Repo: git@github.com:acsobony/corebreaker.git (public), branch `main`
- Live: https://acsobony.github.io/corebreaker/ (2D) and `/3d.html` (3D), GitHub Pages from `main` / root

## Layout

- `game.js` — the whole simulation, shared by both renderers: input (keyboard + touch buttons), audio,
  state, `update(dt)`, gravity, planets and their generated textures, black hole / warp, Earth's missiles,
  and the frame loop (`startLoop()`). A renderer page defines a global `draw()` and then calls `startLoop()`.
- `index.html` — 2D canvas renderer (inline script).
- `3d.html` — three.js renderer (inline module; sets `window.draw`). Overview and chase cameras, bloom.
- `vendor/` — three.js r187 plus the bloom post-processing addons, loaded through an import map. No build step.
- `assets/earth.jpg` — NASA Blue Marble map (public domain), see `assets/CREDITS.txt`.

## Current focus

Feature work on request; everything asked for so far is shipped and live.

## In progress

Nothing mid-flight.

## Recent decisions

- 2026-11-14 — The simulation stays flat (2D) and only the rendering is 3D. Reason: keeps the same play and
  controls in both versions and lets one `game.js` drive both.
- 2026-11-14 — three.js is vendored rather than loaded from a CDN, so the game works offline and on Pages
  with no install or build.
- 2026-11-14 — Core gravity falls off as 1/r (not 1/r²) and affects only the ship: the orbit speed is then the
  same at any distance (`ORBIT_SPEED`), which makes strafing easy; it is capped below thrust (`GRAV_MAX`) so
  the ship can always climb out. Shots are left straight near the fortress so aiming stays predictable.
- 2026-11-14 — Drag was cut from 25%/s to 4%/s so an orbit lasts (~19 s hands-off).
- 2026-11-14 — Planets and the black hole use 1/r² and pull ship, drones, shots, bolts and missiles. Shots and
  bolts bend "like light": direction changes, speed is renormalised (`bend()`, `LIGHT_BEND`).
- 2026-11-14 — Planets are solid: the ship bounces, shots/bolts are absorbed (cover). Not lethal, because the
  spawn orbit can pass close to one.
- 2026-11-14 — After a core kill the ship is pushed out of the fortress footprint and clamped outside it at
  rebuild. Fixes the exploit of waiting at the centre and one-shotting each new core.
- 2026-11-14 — The warp animation runs on real time (`updateWarp(realDt)`) while the sim is slowed through
  `timeScale`; the exit point is the black hole mirrored through the arena centre.
- 2026-11-14 — Only Earth uses a photo; the other planets' maps are painted from noise in `game.js`. Reason:
  no extra downloads or licences, and they are small on screen.
- 2026-11-14 — Earth's missile blast kills drones but never the ship, and gives no score. Missiles are meant
  to miss sometimes (they can hit the fortress, a planet or the hole).

## Gotchas

- `3d.html` needs HTTP (ES modules + import map): use `python3 -m http.server`, not `file://`.
  `index.html` works from disk.
- `gh` is not installed on this machine and there is no API token; pushing works over SSH. Repo settings
  (Pages, visibility) have to be changed by the user in the GitHub UI.
- The user decides when to commit and push: wait to be asked each time.
- No test suite. Checks so far were ad-hoc: running `game.js` + the 2D script in Node with a Proxy-stubbed
  DOM, and Playwright against a local server. Game state is top-level `let` in a classic script, so
  `page.evaluate(() => { holeTimer = 0 })` can force events (hole, missile, level) for a screenshot.
- Top-level `let`/`const` in `game.js` are visible from the module in `3d.html`, but functions the sim
  calls back into (`draw`) must be put on `window` by the module.
- Tuning has only been checked numerically and by screenshot, never by a person playing: gravity strength,
  black-hole frequency, missile hit rate and phone controls are all untested by hand. Multi-touch and
  iOS Safari are untested.
- In portrait on a phone the playfield is small; the 3D camera and fog scale with a `fit` factor to cope.
- Pages caches for a few minutes; add a `?cb=` query when checking a fresh deploy.

## Conventions

- Anything that changes game rules goes in `game.js` so both versions get it; renderers only draw.
- New things that fly should go through `gravityAt()`; new masses should be added to `fabricSources()` so
  both grids show them.
- Update the help lines on both title screens when adding a mechanic.
