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
