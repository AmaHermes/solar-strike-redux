# Solar Strike Redux — Design Document

## Inspiration
**Solar Striker** (Nintendo, 1990) — Game Boy vertical SHMUP. 6 stages, single weapon with power-up tiers, dense bullet patterns, bosses at the end of each stage. Famous for being the Game Boy's first 1st-party shooter and for that ripping chiptune soundtrack.

## Creative Direction (Hermes calling the shots, Razz approving)
- **Faithful in spirit**, not pixel-for-pixel. We keep the SHMUP DNA but allow modern polish.
- **"Solar Sunset" palette** — instead of Game Boy's 4 greens, we use 4-5 shades of a warm sunset gradient: deep indigo → magenta → orange → pale yellow → cream. Vibe: flying *into* the sun.
- **Pixel art preserved** at low resolution (160×144 = original Game Boy res, scaled up 4x to 640×576) so it stays crunchy. Color but pixel-faithful.
- **Modern game feel:** screenshake on big hits, particle bursts on kills, hit-pause (a few frames of freeze on impact), satisfying SFX.
- **Chiptune soundtrack** — we'll either compose using a tracker-style synth or commission via an AI music tool later.

## Core Loop
1. Player ship at bottom of vertical playfield.
2. Move 8-directional, fire upward (auto-fire on hold).
3. Enemies spawn in scripted waves from the top.
4. Survive waves, kill the stage boss, advance.
5. 6 stages total. Endless mode unlocked after a clear.

## Player Ship
- 3 lives, no continues in arcade mode.
- One weapon, 3 power-up tiers (single shot → twin shot → triple-spread).
- Power-up tier drops one level on death (Solar Striker style — punishing but fair).
- Brief invulnerability after respawn.

## Enemies (initial roster)
- **Drone** — straight-down flyer, 1 HP, low value.
- **Weaver** — sine-wave path, 2 HP.
- **Diver** — swoops toward player, 2 HP.
- **Turret** — slow, parked at top, shoots aimed bullets, 4 HP.
- **Mini-boss** — appears mid-stage from stage 2 onward.
- **Boss** — one per stage, multi-phase, fills top half of screen.

## Controls
- **Arrow keys / WASD** — move
- **Space / Z** — fire (or auto-fire on hold)
- **Shift / X** — bomb (clears screen, 2 stocks per life — *optional, may cut for purity*)
- **P / Esc** — pause

## Technical Stack
- **p5.js** for rendering, input, game loop.
- **p5.sound** for SFX & music.
- **Plain HTML** entry point — no build tooling. Runs in any browser, drag-and-drop deployable to itch.io.
- Internal resolution: 160×144 (Game Boy native), scaled to viewport with nearest-neighbor.

## Palette (locked for v0.1)
```
#1a0b2e  // deep indigo — sky/space
#7a1e6e  // magenta — midground silhouettes
#e85d2c  // orange — enemy bodies, UI accents
#f5c26b  // pale yellow — player ship, bullets
#fff4dc  // cream — highlights, text
```
Five shades, evoking sunset-into-deep-space.

## Stretch / Future Ideas
- Endless mode with score multiplier
- Daily challenge seed
- Local high-score table
- Co-op mode (2 ships)
- Mobile touch controls
- Itch.io release as v1.0
