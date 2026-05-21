# Session Log

## Session 1 — 2026-05-17 (Sunday)
**Done:**
- Project initialized at `~/Projects/solar-strike-redux/`
- Design doc, roadmap, palette locked (solar sunset)
- v0.1 scaffolding: starfield, player ship, auto-fire

## Session 2 — 2026-05-17 (Sunday) — *Big jump!*
**Done (skipped straight to v0.3):**
- **3 enemy types**:
  - **Drones** — straight descenders, occasional aimed shots, 1 HP
  - **Weavers** — sine-wave path, more aggressive, 2 HP (drop power-ups 12% of the time)
  - **Divers** — descend then lock onto player position and dive, 2 HP
- **Wave system** — drones from start, weavers at 8s, V-formations every 6s, divers from 20s
- **Power-up system** — orange/yellow pulsing pickups upgrade weapon:
  - Tier 1: single shot
  - Tier 2: twin shot
  - Tier 3: triple-spread
  - Death drops you 1 tier (Solar Striker tradition)
- **Stage 1 Boss** — "The Sunblade", arrives at ~50s
  - 80 HP, HP bar at top of screen
  - Phase 1: side-to-side, 3-way spread shots
  - Phase 2 (below half HP): faster, 4-way spread + aimed shots, core flickers
- **Game feel**: particles on every hit & death, screenshake, hit-pause frames, invuln flicker
- **States**: title screen, gameplay, game over, stage clear — Space restarts
- **HUD**: score, lives (hearts), power tier dots, boss HP bar

**Known stuff to tweak next:**
- No SFX or music yet (v0.4)
- No pause menu yet
- Stage 1 only — stages 2-3 coming in v0.4
- Boss could use a more dramatic death animation
- Difficulty curve untested — may need tuning after playthroughs

**To resume:** Say "load solar strike" — Hermes reads this log.

## Session 4 — 2026-05-21 (Thursday) — *v0.4 "Bombs Away"*
**Done:**
- **Auto-bomb on max-tier power-up** — picking up any power-up at max tier
  (spread=3, homing=2, or plasma=1) instantly detonates a screen bomb.
  Mobile-friendly: no button, no inventory, no extra HUD.
- **Bomb effect:** clears all on-screen enemies + every enemy bullet, awards
  2× score for bomb kills (gold/orange burst instead of cream), and chips
  the boss for 5 HP (so it stays useful in boss fights without trivialising them).
- **VFX:** white screen flash (6f), expanding cream+orange shockwave ring
  from player (~28f), extra hit-pause for weight, brief screenshake.
- **First-bomb tutorial flash** ("BOMB!" toast) — only on first detonation per session.
- **State hygiene:** `bombFlash` and `bombRing` reset in `resetGame()` so the
  effect doesn't bleed across runs.

**Files touched:** `src/sketch.js` only — collision handler, new `triggerBomb()`
+ `drawBombFX(g)` functions, render slot in `drawScene()`, reset in `resetGame()`.
