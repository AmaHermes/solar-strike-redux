// Solar Strike Redux — v0.3
// Internal res: 160x144 (Game Boy native), scaled 4x.
// Adds: enemies, waves, enemy bullets, power-ups, boss, particles, screenshake,
// hit-pause, score, lives, game over, restart.

const GB_W = 160;
const GB_H = 144;
const SCALE = 4;

// Stage-aware palettes. PAL is a live reference to the current stage's colors,
// reassigned at stage transitions so all drawing code stays palette-agnostic.
const PALETTES = {
  // Stage 1 — Sunset Run
  1: {
    sky:    '#1a0b2e',
    mag:    '#7a1e6e',
    orange: '#e85d2c',
    yellow: '#f5c26b',
    cream:  '#fff4dc',
  },
  // Stage 2 — Aurora Run (polar night, bioluminescent ribbons)
  2: {
    sky:    '#03050d',    // void black
    mag:    '#0f3d3e',    // deep teal (replaces magenta as accent dark)
    orange: '#9d6dff',    // aurora violet (replaces orange)
    yellow: '#5dffa0',    // aurora green (replaces yellow)
    cream:  '#e8f9ff',    // cool cream
  },
  // Stage 3 — Corona Inferno (inside the sun)
  3: {
    sky:    '#3a0a05',    // deep crimson — burning sky
    mag:    '#8c1e08',    // dark red ember
    orange: '#ff7722',    // bright plasma orange
    yellow: '#ffd84a',    // hot yellow
    cream:  '#fff6dc',    // white-hot core
  },
  // Stage 4 — Event Horizon (the singularity)
  4: {
    sky:    '#06030f',    // void black with violet undertone
    mag:    '#3a1078',    // deep purple
    orange: '#c084fc',    // lilac violet (replaces orange)
    yellow: '#7df9ff',    // electric cyan (replaces yellow)
    cream:  '#fdf4ff',    // pale starlight
  },
};
let PAL = PALETTES[1];

// ---------- GLOBAL STATE ----------
let buffer;
let state = 'title';   // 'title' | 'play' | 'stagecard' | 'gameover' | 'win'
let stage = 1;
let stageCardTimer = 0; // frames for the "STAGE 2" intro card
let score = 0;
let lives = 3;
let stageTime = 0;     // frames since stage start
let bossSpawned = false;
let boss = null;
let shake = 0;
let hitPauseFrames = 0;
let invuln = 0;        // frames of player invulnerability after hit

const stars = [];
const bullets = [];        // player bullets
const eBullets = [];       // enemy bullets
const enemies = [];
const particles = [];
const powerups = [];
const homingShots = [];    // player homing missiles (Stage 2 weapon)
const plasmaShots = [];    // player plasma orbs (Stage 2 weapon)
const auroras = [];        // animated aurora curtain bands (Stage 2 BG)
const iceShards = [];      // drifting ice shards (Stage 2 BG)
const comets = [];         // occasional comets streaking (Stage 2 BG)

// Stage 3 — Corona Inferno BG state
const heatBands = [];      // distorted horizontal heat-wave bands
const embers   = [];       // ember particles drifting UPWARD (convection)
const sunArcs  = [];       // plasma arcs flickering across screen
const flare = {            // solar flare warning + sweep system
  active: false,           // beam currently sweeping
  warning: 0,              // frames remaining of warning blink (before beam fires)
  y: 0,                    // y-position of the beam center
  height: 16,              // beam thickness
  sweepT: 0,               // frames since beam started
  sweepDur: 40,            // total frames the beam is on screen
  cooldown: 480,           // frames until next warning (8s at 60fps)
};

const player = {
  x: GB_W / 2,
  y: GB_H - 24,
  w: 8, h: 8,
  speed: 1.3,
  fireCooldown: 0,
  fireRate: 9,
  power: 1,            // 1=single, 2=twin, 3=triple-spread
  homing: 0,           // # of homing missile launchers (0-2). Each adds one missile every fireRateHoming frames.
  plasma: 0,           // # of plasma orb launchers (0-1). Slow heavy AOE.
  homingCooldown: 0,
  plasmaCooldown: 0,
};

// ---------- p5 LIFECYCLE ----------
function setup() {
  const cnv = createCanvas(GB_W * SCALE, GB_H * SCALE);
  cnv.parent('game');
  buffer = createGraphics(GB_W, GB_H);
  buffer.noSmooth();
  noSmooth();
  frameRate(60);
  initStars();
}

function draw() {
  if (hitPauseFrames > 0) { hitPauseFrames--; drawScene(); return; }

  if (state === 'title')     updateTitle();
  if (state === 'play')      updatePlay();
  if (state === 'stagecard') updateStageCard();
  if (state === 'gameover')  updateGameOver();
  if (state === 'win')       updateWin();

  drawScene();
}

function keyPressed() {
  Audio.resume(); // unlock audio context on first input
  if (key === 'm' || key === 'M') { Audio.toggleMusic(); return; }
  if (key === 'n' || key === 'N') { Audio.toggleSFX();   return; }
  // Stage card: any keypress skips it
  if (state === 'stagecard' && stageCardTimer > 20) {
    state = 'play';
    Audio.startMusic();
    return;
  }
  // Stage select from title / gameover / win: press 1 or 2 to start that stage
  // with full kit. Useful for demos. Stage 1 still defaults to SPACE.
  if (state === 'title' || state === 'gameover' || state === 'win') {
    if (key === '1') {
      resetGame();
      state = 'play';
      Audio.startMusic();
      return;
    }
    if (key === '2') {
      resetGame();
      setStage(2);
      // Loadout: max spread + both new weapons so the demo is loud
      player.power = 3;
      player.homing = 2;
      player.plasma = 1;
      state = 'play';
      Audio.startMusic();
      return;
    }
    if (key === '3') {
      resetGame();
      setStage(3);
      // Full kit — corona is brutal, you'll need everything
      player.power = 3;
      player.homing = 2;
      player.plasma = 1;
      state = 'play';
      Audio.startMusic();
      return;
    }
    if (key === '4') {
      resetGame();
      setStage(4);
      // Full kit — this is the finale, you came to surf the event horizon
      player.power = 3;
      player.homing = 2;
      player.plasma = 1;
      state = 'play';
      Audio.startMusic();
      return;
    }
    if (key === ' ' || key === 'Enter' || keyCode === 13) {
      resetGame();
      state = 'play';
      Audio.startMusic();
    }
  }
}

// ---------- INIT / RESET ----------
function initStars() {
  stars.length = 0;
  for (let i = 0; i < 50; i++) {
    stars.push({ x: random(GB_W), y: random(GB_H), speed: random([0.3, 0.6, 1.1]) });
  }
}
function initAuroraBG() {
  auroras.length = 0;
  // 3 horizontal aurora ribbon bands with different phases / colors / heights
  for (let i = 0; i < 3; i++) {
    auroras.push({
      y: 20 + i * 35 + random(-6, 6),
      phase: random(TWO_PI),
      speed: random(0.012, 0.025),
      amp: random(8, 14),
      color: i === 0 ? PAL.yellow : (i === 1 ? PAL.orange : PAL.cream),
      alpha: 90 + i * 20,
    });
  }
  iceShards.length = 0;
  for (let i = 0; i < 12; i++) {
    iceShards.push({
      x: random(GB_W),
      y: random(GB_H),
      vy: random(0.4, 0.9),
      rot: random([0, 1, 2, 3]),
      size: random([2, 3]),
    });
  }
  comets.length = 0;
}
function setStage(n) {
  stage = n;
  PAL = PALETTES[n];
  stageTime = 0;
  bossSpawned = false;
  boss = null;
  if (n === 1)      initStars();
  else if (n === 2) initAuroraBG();
  else if (n === 3) initCoronaBG();
  else              initVoidBG();
}
function resetGame() {
  score = 0; lives = 3;
  shake = 0; hitPauseFrames = 0; invuln = 60;
  bullets.length = 0; eBullets.length = 0; enemies.length = 0;
  particles.length = 0; powerups.length = 0;
  homingShots.length = 0; plasmaShots.length = 0;
  player.x = GB_W / 2; player.y = GB_H - 24;
  player.power = 1; player.homing = 0; player.plasma = 0;
  player.fireCooldown = 0; player.homingCooldown = 0; player.plasmaCooldown = 0;
  bombFlash = 0; bombRing = null;
  setStage(1);
}

// ---------- TITLE / GAMEOVER / WIN UPDATES ----------
function updateTitle()    { updateStars(); }
function updateGameOver() { updateStars(); updateParticles(); }
function updateWin()      { updateStars(); updateParticles(); }

// ---------- MAIN PLAY UPDATE ----------
function updatePlay() {
  stageTime++;
  if (stage === 2)      updateAuroraBG();
  else if (stage === 3) updateCoronaBG();
  else if (stage === 4) updateVoidBG();
  else                  updateStars();
  updatePlayer();
  updateBullets();
  updateHomingShots();
  updatePlasmaShots();
  updateEnemies();
  updateEBullets();
  updatePowerups();
  updateParticles();
  spawnLogic();
  collisions();
  if (shake > 0) shake *= 0.85;
  if (invuln > 0) invuln--;

  // win condition: boss dead
  if (boss && boss.dead) {
    // Victory: big celebratory burst but NO screenshake — the pilot earned calm.
    spark(boss.x, boss.y, PAL.yellow, 24);
    spark(boss.x, boss.y, PAL.orange, 24);
    spark(boss.x, boss.y, PAL.cream,  16);
    shake = 0;
    score += 5000;
    boss = null;
    if (stage === 1) {
      // Advance to Stage 2 — short transition card, then auto-resume
      state = 'stagecard';
      stageCardTimer = 0;
      Audio.stopMusic();
      Audio.stageClear();
      setStage(2);
      // Keep player power/upgrades between stages — feels like progression.
      // Clear projectiles / enemies for clean slate.
      bullets.length = 0; eBullets.length = 0;
      enemies.length = 0; powerups.length = 0;
      homingShots.length = 0; plasmaShots.length = 0;
      player.x = GB_W / 2; player.y = GB_H - 24;
      invuln = 90;
    } else if (stage === 2) {
      // Advance to Stage 3 — into the sun
      state = 'stagecard';
      stageCardTimer = 0;
      Audio.stopMusic();
      Audio.stageClear();
      setStage(3);
      bullets.length = 0; eBullets.length = 0;
      enemies.length = 0; powerups.length = 0;
      homingShots.length = 0; plasmaShots.length = 0;
      player.x = GB_W / 2; player.y = GB_H - 24;
      invuln = 90;
    } else if (stage === 3) {
      // Advance to Stage 4 — Event Horizon (final stage)
      state = 'stagecard';
      stageCardTimer = 0;
      Audio.stopMusic();
      Audio.stageClear();
      setStage(4);
      bullets.length = 0; eBullets.length = 0;
      enemies.length = 0; powerups.length = 0;
      homingShots.length = 0; plasmaShots.length = 0;
      player.x = GB_W / 2; player.y = GB_H - 24;
      invuln = 90;
    } else {
      state = 'win';
      Audio.stopMusic();
      Audio.stageClear();
    }
  }
}

// ---------- STAGE CARD (transition between stages) ----------
function updateStageCard() {
  stageCardTimer++;
  // After ~150 frames (2.5s) auto-advance to play
  if (stageCardTimer > 150) {
    state = 'play';
    Audio.startMusic();
  }
  // Animate background even on transition card
  if (stage === 2)      updateAuroraBG();
  else if (stage === 3) updateCoronaBG();
  else if (stage === 4) updateVoidBG();
  else                  updateStars();
}

// ---------- STARFIELD ----------
function updateStars() {
  for (const s of stars) {
    s.y += s.speed;
    if (s.y > GB_H) { s.y = 0; s.x = random(GB_W); }
  }
}
function drawStars(g) {
  g.noStroke();
  for (const s of stars) {
    g.fill(s.speed > 0.7 ? PAL.cream : PAL.yellow);
    g.rect(Math.floor(s.x), Math.floor(s.y), 1, 1);
  }
}

// ---------- PLAYER ----------
function updatePlayer() {
  let dx = 0, dy = 0;
  if (keyIsDown(LEFT_ARROW)  || keyIsDown(65)) dx -= 1;
  if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) dx += 1;
  if (keyIsDown(UP_ARROW)    || keyIsDown(87)) dy -= 1;
  if (keyIsDown(DOWN_ARROW)  || keyIsDown(83)) dy += 1;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  player.x += dx * player.speed;
  player.y += dy * player.speed;

  // Touch input: drag-offset model.
  // While finger is down, ship tracks finger movement (in game-space units)
  // since the last frame. This means the finger can rest anywhere on screen —
  // it doesn't have to be on the ship — and feels great on mobile shmups.
  if (Touch.active) {
    player.x += Touch.dx;
    player.y += Touch.dy;
    Touch.dx = 0; Touch.dy = 0;
  }

  player.x = constrain(player.x, player.w/2, GB_W - player.w/2);
  player.y = constrain(player.y, player.h/2, GB_H - player.h/2);

  if (player.fireCooldown <= 0) {
    firePlayer();
    Audio.shoot();
    player.fireCooldown = player.fireRate;
  } else player.fireCooldown--;

  // ====== NEW WEAPONS (Stage 2 unlocks) ======
  // Homing missiles — fire every 45 frames per launcher, alternating sides
  if (player.homing > 0) {
    if (player.homingCooldown <= 0) {
      const side = (frameCount >> 4) & 1 ? 1 : -1;
      homingShots.push({
        x: player.x + side * 3, y: player.y - 2,
        vx: side * 0.6, vy: -1.2,
        life: 180, t: 0,
      });
      if (player.homing >= 2) {
        homingShots.push({
          x: player.x - side * 3, y: player.y - 2,
          vx: -side * 0.6, vy: -1.2,
          life: 180, t: 0,
        });
      }
      player.homingCooldown = 45;
      if (Audio.missile) Audio.missile();
    } else player.homingCooldown--;
  }
  // Plasma orbs — slow, heavy, every 80 frames
  if (player.plasma > 0) {
    if (player.plasmaCooldown <= 0) {
      plasmaShots.push({ x: player.x, y: player.y - 5, vy: -1.4, t: 0, life: 160 });
      player.plasmaCooldown = 80;
      if (Audio.plasma) Audio.plasma();
    } else player.plasmaCooldown--;
  }
}
function firePlayer() {
  const y = player.y - 4;
  if (player.power === 1) {
    bullets.push({ x: player.x, y, vx: 0, vy: -3.2 });
  } else if (player.power === 2) {
    bullets.push({ x: player.x - 2, y, vx: 0, vy: -3.2 });
    bullets.push({ x: player.x + 2, y, vx: 0, vy: -3.2 });
  } else {
    bullets.push({ x: player.x, y, vx: 0,    vy: -3.4 });
    bullets.push({ x: player.x - 2, y, vx: -0.8, vy: -3.0 });
    bullets.push({ x: player.x + 2, y, vx:  0.8, vy: -3.0 });
  }
}
function drawPlayer(g) {
  if (invuln > 0 && frameCount % 4 < 2) return; // flicker
  const px = Math.floor(player.x - player.w/2);
  const py = Math.floor(player.y - player.h/2);
  g.noStroke();
  g.fill(PAL.yellow); g.rect(px + 2, py + 1, 4, 6);
  g.fill(PAL.orange); g.rect(px, py + 4, 8, 2);
  g.fill(PAL.cream);  g.rect(px + 3, py + 2, 2, 2);
  if (frameCount % 6 < 3) {
    g.fill(PAL.orange);
    g.rect(px + 2, py + 7, 1, 1);
    g.rect(px + 5, py + 7, 1, 1);
  }
}

// ---------- BULLETS ----------
function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx; b.y += b.vy;
    if (b.y < -4 || b.x < -2 || b.x > GB_W + 2) bullets.splice(i, 1);
  }
}
function drawBullets(g) {
  g.noStroke(); g.fill(PAL.cream);
  for (const b of bullets) g.rect(Math.floor(b.x), Math.floor(b.y), 1, 3);
}
function updateEBullets() {
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    b.x += b.vx; b.y += b.vy;
    if (b.y > GB_H + 4 || b.y < -4 || b.x < -4 || b.x > GB_W + 4) eBullets.splice(i, 1);
  }
}
function drawEBullets(g) {
  g.noStroke(); g.fill(PAL.orange);
  for (const b of eBullets) g.rect(Math.floor(b.x - 1), Math.floor(b.y - 1), 2, 2);
}

// ---------- ENEMIES ----------
function spawnLogic() {
  if (bossSpawned) return;

  if (stage === 1) {
    // Boss arrives after ~50 seconds of stage time (3000 frames)
    if (stageTime > 3000) {
      bossSpawned = true;
      spawnBoss();
      return;
    }
    // Drones — frequent, easy
    if (stageTime % 70 === 0) {
      const x = random(16, GB_W - 16);
      enemies.push(makeDrone(x, -8));
    }
    // Weavers — after 8s
    if (stageTime > 480 && stageTime % 140 === 0) {
      const x = random(20, GB_W - 20);
      enemies.push(makeWeaver(x, -8));
    }
    // Drone V-formation every 6s
    if (stageTime % 360 === 120) {
      const cx = random(30, GB_W - 30);
      for (let k = -2; k <= 2; k++) {
        enemies.push(makeDrone(cx + k * 12, -8 - Math.abs(k) * 6));
      }
    }
    // Divers — after 20s
    if (stageTime > 1200 && stageTime % 200 === 0) {
      enemies.push(makeDiver(random(20, GB_W - 20), -8));
    }
  } else if (stage === 2) {
    // ---------- STAGE 2: AURORA RUN ----------
    // Boss "Iceheart" after 50s
    if (stageTime > 3000) {
      bossSpawned = true;
      spawnIceheart();
      return;
    }
    // Ice fighters — frequent, leave brief frozen trails
    if (stageTime % 65 === 0) {
      enemies.push(makeIceFighter(random(16, GB_W - 16), -8));
    }
    // Crystal turrets latch onto screen edges — after 6s
    if (stageTime > 360 && stageTime % 280 === 0) {
      const side = random() < 0.5 ? 'left' : 'right';
      const y = random(20, GB_H * 0.55);
      enemies.push(makeCrystalTurret(side === 'left' ? -4 : GB_W + 4, y, side));
    }
    // Shard splitters — after 12s; rare but dangerous
    if (stageTime > 720 && stageTime % 240 === 0) {
      enemies.push(makeShardSplitter(random(24, GB_W - 24), -8));
    }
    // Ice fighter pairs swooping
    if (stageTime % 400 === 200) {
      const cx = random(30, GB_W - 30);
      enemies.push(makeIceFighter(cx - 10, -8));
      enemies.push(makeIceFighter(cx + 10, -8));
    }
  } else if (stage === 3) {
    // ---------- STAGE 3: CORONA INFERNO ----------
    // Boss "Eye of Sol" after 55s — slightly longer build-up
    if (stageTime > 3300) {
      bossSpawned = true;
      spawnEyeOfSol();
      return;
    }
    // Pyrons — heat-wave swimmers, frequent
    if (stageTime % 70 === 0) {
      enemies.push(makePyron(random(16, GB_W - 16), -8));
    }
    // Sunspots — appear in the playfield, bloom into ring-burst
    if (stageTime > 240 && stageTime % 220 === 0) {
      enemies.push(makeSunspot(random(24, GB_W - 24), random(20, GB_H * 0.45)));
    }
    // Helix bombers — paired enemies linked by a beam, after 10s
    if (stageTime > 600 && stageTime % 340 === 0) {
      const cx = random(40, GB_W - 40);
      const a = makeHelixBomber(cx - 12, -8);
      const b = makeHelixBomber(cx + 12, -8);
      a.partner = b; b.partner = a;
      enemies.push(a); enemies.push(b);
    }
    // Pyron school
    if (stageTime % 480 === 240) {
      const cx = random(30, GB_W - 30);
      for (let k = -1; k <= 1; k++) {
        enemies.push(makePyron(cx + k * 14, -8 - Math.abs(k) * 8));
      }
    }
  } else if (stage === 4) {
    // ---------- STAGE 4: EVENT HORIZON ----------
    // Final boss "The Singularity" after 60s — the longest build-up.
    if (stageTime > 3600) {
      bossSpawned = true;
      spawnSingularity();
      return;
    }
    // Voidlings — drift in, then suck toward the black hole centre. Frequent.
    if (stageTime % 60 === 0) {
      enemies.push(makeVoidling(random(16, GB_W - 16), -8));
    }
    // Quantum twins — pair that mirror each other across the screen
    if (stageTime > 360 && stageTime % 320 === 0) {
      const sx = random(20, GB_W * 0.45);
      enemies.push(makeQuantumTwin(sx, -8, 1));
      enemies.push(makeQuantumTwin(GB_W - sx, -8, -1));
    }
    // Phantom — teleports, briefly visible, fires a single sharp shot
    if (stageTime > 600 && stageTime % 240 === 0) {
      enemies.push(makePhantom(random(20, GB_W - 20), random(20, GB_H * 0.5)));
    }
    // Voidling cluster — V-formation pulled inward
    if (stageTime % 420 === 210) {
      const cx = random(30, GB_W - 30);
      for (let k = -2; k <= 2; k++) {
        enemies.push(makeVoidling(cx + k * 11, -8 - Math.abs(k) * 6));
      }
    }
  }
}

function makeDrone(x, y) {
  return { kind: 'drone', x, y, w: 8, h: 8, hp: 1, vy: 0.8, vx: 0,
           t: 0, fireT: 0, value: 100 };
}
function makeWeaver(x, y) {
  return { kind: 'weaver', x, y, w: 8, h: 8, hp: 2, vy: 0.7,
           t: random(TWO_PI), amp: 18, baseX: x, fireT: 0, value: 200 };
}
function makeDiver(x, y) {
  return { kind: 'diver', x, y, w: 8, h: 8, hp: 2, vy: 0.5, vx: 0,
           t: 0, locked: false, value: 250 };
}
function spawnBoss() {
  Audio.bossAppear();
  boss = {
    kind: 'boss',
    x: GB_W / 2, y: -30,
    w: 48, h: 24,
    hp: 80, hpMax: 80,
    t: 0, vx: 0.6, phase: 1,
    fireT: 0, dead: false,
  };
  enemies.push(boss);
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t = (e.t || 0) + 1;

    if (e.kind === 'drone') {
      e.y += e.vy;
      if (e.t % 90 === 0 && e.y > 8 && e.y < GB_H * 0.6 && random() < 0.4) {
        fireAtPlayer(e.x, e.y + 4, 1.4);
      }
    } else if (e.kind === 'weaver') {
      e.y += e.vy;
      e.x = e.baseX + Math.sin(e.t * 0.07) * e.amp;
      if (e.t % 70 === 0 && e.y > 8) fireAtPlayer(e.x, e.y + 4, 1.6);
    } else if (e.kind === 'diver') {
      // descends slowly, then dives toward player position
      if (!e.locked) {
        e.y += e.vy;
        if (e.y > 40) {
          e.locked = true;
          const dx = player.x - e.x;
          const dy = player.y - e.y;
          const m = Math.max(1, Math.hypot(dx, dy));
          e.vx = (dx / m) * 1.8;
          e.vy = (dy / m) * 1.8;
        }
      } else {
        e.x += e.vx; e.y += e.vy;
      }
    } else if (e.kind === 'boss') {
      updateBoss(e);
    } else if (e.kind === 'iceheart') {
      updateIceheart(e);
    } else if (e.kind === 'iceFighter') {
      e.y += e.vy;
      // slight sideways drift
      e.x += Math.sin(e.t * 0.05) * 0.3;
      // leave a frozen trail blip behind
      if (e.t % 8 === 0 && e.y > 0 && e.y < GB_H) {
        particles.push({ x: e.x, y: e.y + 2, vx: 0, vy: 0.2, life: 18, color: PAL.cream });
      }
      if (e.t % 80 === 0 && e.y > 8) fireAtPlayer(e.x, e.y + 4, 1.5);
    } else if (e.kind === 'crystalTurret') {
      // hovers at a fixed edge, fires aimed shots periodically
      if (e.locked) {
        // slow vertical drift
        e.y += Math.sin(e.t * 0.03) * 0.3;
      } else {
        // glide in from off-screen to anchor position
        const targetX = e.side === 'left' ? 6 : GB_W - 6;
        e.x += (targetX - e.x) * 0.08;
        if (Math.abs(e.x - targetX) < 0.5) { e.x = targetX; e.locked = true; }
      }
      if (e.locked && e.t % 100 === 0) {
        fireAtPlayer(e.x, e.y, 1.7);
      }
    } else if (e.kind === 'shardSplitter') {
      e.y += e.vy;
      e.x += Math.sin(e.t * 0.04) * 0.4;
    } else if (e.kind === 'shardlet') {
      e.x += e.vx; e.y += e.vy;
      // gentle gravity toward bottom so they don't loiter forever
      e.vy = Math.min(e.vy + 0.012, 1.4);
    } else if (e.kind === 'pyron') {
      // Sinusoidal swim — like a heat-wave fish
      e.y += e.vy;
      e.x = e.baseX + Math.sin(e.t * 0.08) * e.amp;
      // breathes plasma forward every so often
      if (e.t % 75 === 0 && e.y > 8 && e.y < GB_H * 0.7) {
        // small spread of 2 aimed-at-player shots
        const sp = 1.5;
        fireAtPlayer(e.x, e.y + 4, sp);
      }
    } else if (e.kind === 'sunspot') {
      // Grows in place, then bursts. Stationary.
      // Stages: 0..60 birth (grow w 2→10), 60..120 hold, 120 burst.
      if (e.t === 120) {
        // Ring burst
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4 });
        }
        spark(e.x, e.y, PAL.cream, 12);
        Audio.enemyExplode();
        e.hp = 0; // mark for removal via collision-effect path
        // Manually remove (no points)
        enemies.splice(i, 1);
        continue;
      }
      // visual size for collision uses e.w which scales over birth
      const grow = Math.min(1, e.t / 60);
      e.w = 4 + Math.floor(grow * 8);
      e.h = e.w;
    } else if (e.kind === 'helixBomber') {
      e.y += e.vy;
      // mild side drift opposite to partner if partner alive
      if (e.partner && enemies.indexOf(e.partner) !== -1) {
        // Maintain a target distance via spring; pulls them in slightly
        const targetDist = 24;
        const dx = e.partner.x - e.x;
        const d = Math.abs(dx);
        if (d > targetDist) e.x += Math.sign(dx) * 0.3;
        else if (d < 16)    e.x -= Math.sign(dx) * 0.2;
      } else {
        // Lost partner — go berserk: fast dive + rapid fire
        e.vy = Math.min(e.vy + 0.02, 2.4);
        if (e.t % 30 === 0 && e.y > 8) fireAtPlayer(e.x, e.y + 4, 2.2);
      }
      // Linked-beam tick fire (only while partnered)
      if (e.partner && enemies.indexOf(e.partner) !== -1 && e.t % 110 === 0 && e.y > 8) {
        // Each bomber drops a slow plasma bomb downward
        eBullets.push({ x: e.x, y: e.y + 4, vx: 0, vy: 1.4 });
      }
    } else if (e.kind === 'eyeofsol') {
      updateEyeOfSol(e);
    } else if (e.kind === 'voidling') {
      updateVoidling(e);
    } else if (e.kind === 'quantumtwin') {
      updateQuantumTwin(e);
    } else if (e.kind === 'phantom') {
      updatePhantom(e);
    } else if (e.kind === 'singularity') {
      updateSingularity(e);
    }

    // remove off-bottom
    if (e.y > GB_H + 16 || e.x < -20 || e.x > GB_W + 20) {
      if (e.kind === 'boss' || e.kind === 'iceheart' || e.kind === 'eyeofsol' ||
          e.kind === 'singularity' || e.kind === 'phantom' ||
          e.kind === 'crystalTurret' || e.kind === 'sunspot') continue;
      enemies.splice(i, 1);
    }
  }
}

function updateBoss(b) {
  // Entry: glide in
  if (b.y < 24) { b.y += 0.5; return; }

  // Side-to-side
  b.x += b.vx;
  if (b.x < 28)         { b.x = 28;         b.vx = Math.abs(b.vx); }
  if (b.x > GB_W - 28)  { b.x = GB_W - 28;  b.vx = -Math.abs(b.vx); }

  // Phase 2 below half HP — faster + more fire
  if (b.hp < b.hpMax / 2 && b.phase === 1) {
    b.phase = 2;
    b.vx *= 1.4;
    shake = 6;
  }

  // Fire patterns
  b.fireT++;
  const rate = b.phase === 1 ? 45 : 28;
  if (b.fireT % rate === 0) {
    // 3-way spread
    const angles = b.phase === 1 ? [-0.35, 0, 0.35] : [-0.5, -0.2, 0.1, 0.4];
    for (const a of angles) {
      eBullets.push({ x: b.x, y: b.y + 10, vx: Math.sin(a) * 1.8, vy: Math.cos(a) * 1.8 });
    }
  }
  if (b.phase === 2 && b.fireT % 70 === 0) {
    // aimed shot
    fireAtPlayer(b.x, b.y + 10, 2.0);
  }
}

function fireAtPlayer(x, y, speed) {
  const dx = player.x - x;
  const dy = player.y - y;
  const m = Math.max(1, Math.hypot(dx, dy));
  eBullets.push({ x, y, vx: (dx / m) * speed, vy: (dy / m) * speed });
}

function drawEnemies(g) {
  g.noStroke();
  for (const e of enemies) {
    if (e.kind === 'drone')         drawDrone(g, e);
    if (e.kind === 'weaver')        drawWeaver(g, e);
    if (e.kind === 'diver')         drawDiver(g, e);
    if (e.kind === 'boss')          drawBoss(g, e);
    if (e.kind === 'iceFighter')    drawIceFighter(g, e);
    if (e.kind === 'crystalTurret') drawCrystalTurret(g, e);
    if (e.kind === 'shardSplitter') drawShardSplitter(g, e);
    if (e.kind === 'shardlet')      drawShardlet(g, e);
    if (e.kind === 'iceheart')      drawIceheart(g, e);
    if (e.kind === 'pyron')         drawPyron(g, e);
    if (e.kind === 'sunspot')       drawSunspot(g, e);
    if (e.kind === 'helixBomber')   drawHelixBomber(g, e);
    if (e.kind === 'eyeofsol')      drawEyeOfSol(g, e);
    if (e.kind === 'voidling')      drawVoidling(g, e);
    if (e.kind === 'quantumtwin')   drawQuantumTwin(g, e);
    if (e.kind === 'phantom')       drawPhantom(g, e);
    if (e.kind === 'singularity')   drawSingularity(g, e);
  }
}
function drawDrone(g, e) {
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  g.fill(PAL.orange); g.rect(x + 1, y + 2, 6, 4);
  g.fill(PAL.mag);    g.rect(x,     y + 3, 8, 2);
  g.fill(PAL.cream);  g.rect(x + 3, y + 3, 2, 1);
}
function drawWeaver(g, e) {
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  g.fill(PAL.mag);    g.rect(x,     y + 2, 8, 4);
  g.fill(PAL.orange); g.rect(x + 2, y + 1, 4, 6);
  g.fill(PAL.cream);  g.rect(x + 3, y + 3, 2, 2);
}
function drawDiver(g, e) {
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  g.fill(PAL.orange); g.rect(x + 2, y, 4, 8);
  g.fill(PAL.mag);    g.rect(x, y + 3, 8, 3);
  g.fill(PAL.yellow); g.rect(x + 3, y + 5, 2, 1);
}
function drawBoss(g, e) {
  const x = Math.floor(e.x - e.w/2), y = Math.floor(e.y - e.h/2);
  // hull
  g.fill(PAL.mag);    g.rect(x + 4,  y + 4,  40, 14);
  g.fill(PAL.orange); g.rect(x + 8,  y + 8,  32, 10);
  g.fill(PAL.orange); g.rect(x,      y + 8,  6,  6);
  g.fill(PAL.orange); g.rect(x + 42, y + 8,  6,  6);
  // core
  const core = (e.phase === 2 && frameCount % 6 < 3) ? PAL.cream : PAL.yellow;
  g.fill(core); g.rect(x + 20, y + 10, 8, 6);
  // turrets
  g.fill(PAL.cream);
  g.rect(x + 10, y + 16, 2, 4);
  g.rect(x + 36, y + 16, 2, 4);
  g.rect(x + 22, y + 18, 4, 4);
}

// ---------- POWERUPS ----------
function maybeDropPowerup(x, y, chance = 0.06) {
  if (random() >= chance) return;
  // Stage 2 introduces 'homing' and 'plasma' powerups alongside the spread one.
  let kind = 'spread';
  if (stage === 2) {
    const r = random();
    if (r < 0.34)      kind = 'homing';
    else if (r < 0.55) kind = 'plasma';
    else               kind = 'spread';
  }
  powerups.push({ x, y, vy: 0.6, t: 0, kind });
}
function updatePowerups() {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += p.vy; p.t++;
    if (p.y > GB_H + 8) powerups.splice(i, 1);
  }
}
function drawPowerups(g) {
  g.noStroke();
  for (const p of powerups) {
    const pulse = (frameCount % 12 < 6);
    if (p.kind === 'homing') {
      // Cyan-ish diamond, with "M" cue
      g.fill(pulse ? PAL.cream : PAL.yellow);
      g.rect(Math.floor(p.x - 3), Math.floor(p.y - 3), 6, 6);
      g.fill(PAL.mag);
      g.rect(Math.floor(p.x - 2), Math.floor(p.y - 2), 4, 4);
      g.fill(PAL.cream);
      g.rect(Math.floor(p.x), Math.floor(p.y - 2), 1, 1);
      g.rect(Math.floor(p.x - 1), Math.floor(p.y - 1), 3, 1);
    } else if (p.kind === 'plasma') {
      // Round-ish glow with O cue
      g.fill(pulse ? PAL.cream : PAL.orange);
      g.rect(Math.floor(p.x - 3), Math.floor(p.y - 3), 6, 6);
      g.fill(PAL.yellow);
      g.rect(Math.floor(p.x - 2), Math.floor(p.y - 1), 4, 2);
      g.rect(Math.floor(p.x - 1), Math.floor(p.y - 2), 2, 4);
      g.fill(PAL.cream);
      g.rect(Math.floor(p.x), Math.floor(p.y), 1, 1);
    } else {
      g.fill(pulse ? PAL.cream : PAL.yellow);
      g.rect(Math.floor(p.x - 3), Math.floor(p.y - 3), 6, 6);
      g.fill(PAL.orange);
      g.rect(Math.floor(p.x - 1), Math.floor(p.y - 2), 2, 4);
      g.rect(Math.floor(p.x - 2), Math.floor(p.y - 1), 4, 2);
    }
  }
}

// ---------- PARTICLES ----------
function spark(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = random(TWO_PI), s = random(0.5, 1.8);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: random(12, 24), color
    });
  }
}
function explodeBig(x, y) {
  spark(x, y, PAL.yellow, 18);
  spark(x, y, PAL.orange, 18);
  spark(x, y, PAL.cream, 10);
  shake = 8;
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles(g) {
  g.noStroke();
  for (const p of particles) {
    g.fill(p.color);
    g.rect(Math.floor(p.x), Math.floor(p.y), 1, 1);
  }
}

// ---------- COLLISIONS ----------
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(ax - bx) * 2 < (aw + bw) && Math.abs(ay - by) * 2 < (ah + bh);
}

function collisions() {
  // player bullets → enemies
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const ew = e.w || 8, eh = e.h || 8;
      if (aabb(b.x, b.y + 1, 1, 3, e.x, e.y, ew, eh)) {
        bullets.splice(i, 1);
        damageEnemy(e, j, 1, b.x, b.y);
        break;
      }
    }
  }

  // homing missiles → enemies
  for (let i = homingShots.length - 1; i >= 0; i--) {
    const m = homingShots[i];
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const ew = e.w || 8, eh = e.h || 8;
      if (aabb(m.x, m.y, 3, 3, e.x, e.y, ew, eh)) {
        homingShots.splice(i, 1);
        spark(m.x, m.y, PAL.yellow, 6);
        damageEnemy(e, j, 2, m.x, m.y);
        break;
      }
    }
  }

  // plasma orbs → enemies (AOE explode on hit)
  for (let i = plasmaShots.length - 1; i >= 0; i--) {
    const p = plasmaShots[i];
    let detonated = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const ew = e.w || 8, eh = e.h || 8;
      if (aabb(p.x, p.y, 6, 6, e.x, e.y, ew, eh)) {
        detonated = true;
        break;
      }
    }
    if (detonated) {
      // AOE: damage all enemies within radius 18
      explodeBig(p.x, p.y);
      Audio.enemyExplode();
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 18) damageEnemy(e, j, 3, p.x, p.y);
      }
      plasmaShots.splice(i, 1);
    }
  }

  // enemy bullets → player
  if (invuln <= 0) {
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      if (aabb(b.x, b.y, 2, 2, player.x, player.y, player.w - 2, player.h - 2)) {
        eBullets.splice(i, 1);
        playerHit();
        break;
      }
    }
  }

  // enemy bodies → player
  if (invuln <= 0) {
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const ew = e.w || 8, eh = e.h || 8;
      if (aabb(player.x, player.y, player.w - 2, player.h - 2, e.x, e.y, ew - 2, eh - 2)) {
        if (e.kind !== 'boss') {
          spark(e.x, e.y, PAL.orange, 8);
          enemies.splice(j, 1);
        }
        playerHit();
        break;
      }
    }
  }

  // powerups → player
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    if (aabb(p.x, p.y, 6, 6, player.x, player.y, player.w, player.h)) {
      powerups.splice(i, 1);
      let detonate = false;
      if (p.kind === 'homing') {
        if (player.homing < 2) player.homing++;
        else detonate = true;
      } else if (p.kind === 'plasma') {
        if (player.plasma < 1) player.plasma++;
        else detonate = true;
      } else {
        // default: spread power
        if (player.power < 3) player.power++;
        else detonate = true;
      }
      if (detonate) {
        triggerBomb();
      } else {
        spark(player.x, player.y, PAL.cream, 10);
        Audio.powerup();
      }
    }
  }
}

// ---------- Screen-clearing bomb ----------
// Triggered when a power-up is collected at max tier. Wipes on-screen enemies
// (excluding boss) and all enemy bullets, awards 2× score for bomb kills,
// chips boss for fixed HP. Solar Strike v0.4 "Bombs Away".
let bombFlash = 0;       // white screen flash frames remaining
let bombRing = null;     // expanding shockwave: {x, y, r, life}
const BOMB_BOSS_CHIP = 5;

function triggerBomb() {
  bombFlash = 6;
  bombRing = { x: player.x, y: player.y, r: 4, life: 28 };
  Audio.powerup();
  // Heavy hit-pause for impact
  hitPauseFrames = Math.max(hitPauseFrames, 6);
  // Wipe enemy bullets
  eBullets.length = 0;
  // Pop every non-boss enemy on screen, 2× score, gold popups
  for (let j = enemies.length - 1; j >= 0; j--) {
    const e = enemies[j];
    if (e.kind === 'boss') {
      // Boss takes chip damage instead of dying
      e.hp = Math.max(0, e.hp - BOMB_BOSS_CHIP);
      spark(e.x, e.y, PAL.yellow, 6);
      continue;
    }
    const val = (e.value || 200) * 2;
    score += val;
    // Gold-tinted burst (cream → yellow for the 2× kill feel)
    spark(e.x, e.y, PAL.yellow, 10);
    spark(e.x, e.y, PAL.orange, 6);
    enemies.splice(j, 1);
  }
  // Tutorial flash — first bomb only
  if (!window._bombSeen) {
    window._bombSeen = true;
    if (typeof showToast === 'function') showToast('BOMB!');
  }
}

// Render bomb VFX: white screen flash + expanding shockwave ring.
function drawBombFX(g) {
  if (bombFlash > 0) {
    g.noStroke();
    g.fill(255, 255, 255, 180 * (bombFlash / 6));
    g.rect(0, 0, GB_W, GB_H);
    bombFlash--;
  }
  if (bombRing) {
    bombRing.life--;
    bombRing.r += 4;
    const a = Math.max(0, bombRing.life / 28);
    g.noFill();
    g.stroke(PAL.cream); g.strokeWeight(2);
    g.ellipse(bombRing.x, bombRing.y, bombRing.r * 2);
    g.stroke(PAL.orange); g.strokeWeight(1);
    g.ellipse(bombRing.x, bombRing.y, bombRing.r * 2 - 4);
    g.noStroke();
    if (bombRing.life <= 0) bombRing = null;
    // brief screenshake on bomb
    if (a > 0.5) shake = Math.max(shake, 2);
  }
}

function playerHit() {
  lives--;
  if (player.power > 1) player.power--;
  explodeBig(player.x, player.y);
  Audio.playerDie();
  invuln = 90;
  hitPauseFrames = 4;
  if (lives <= 0) {
    state = 'gameover';
    Audio.stopMusic();
    Audio.gameOver();
  } else {
    player.x = GB_W / 2; player.y = GB_H - 24;
  }
}

// ---------- HUD ----------
function drawHUD(g) {
  g.fill(PAL.cream);
  g.textFont('monospace');
  g.textSize(8);
  g.text('SCORE ' + String(score).padStart(6, '0'), 3, 9);
  // lives
  g.text('LIFE', GB_W - 50, 9);
  for (let i = 0; i < lives; i++) {
    g.fill(PAL.orange);
    g.rect(GB_W - 26 + i * 7, 4, 5, 5);
    g.fill(PAL.yellow);
    g.rect(GB_W - 25 + i * 7, 5, 3, 3);
  }
  // power tier dots
  g.fill(PAL.cream); g.text('PWR', 3, GB_H - 3);
  for (let i = 0; i < 3; i++) {
    g.fill(i < player.power ? PAL.yellow : PAL.mag);
    g.rect(20 + i * 5, GB_H - 8, 3, 3);
  }
  // boss HP bar
  if (boss && boss.y > 0) {
    const w = 100;
    const h = 3;
    const bx = (GB_W - w) / 2;
    const by = 14;
    g.fill(PAL.mag); g.rect(bx - 1, by - 1, w + 2, h + 2);
    g.fill(PAL.sky); g.rect(bx, by, w, h);
    g.fill(boss.phase === 2 ? PAL.orange : PAL.yellow);
    g.rect(bx, by, w * (boss.hp / boss.hpMax), h);
  }
}

// ---------- SCENE COMPOSE ----------
function drawScene() {
  buffer.background(PAL.sky);
  if (stage === 2)      drawAuroraBG(buffer);
  else if (stage === 3) drawCoronaBG(buffer);
  else if (stage === 4) drawVoidBG(buffer);
  else                  drawStars(buffer);

  if (state === 'play' || state === 'stagecard' || state === 'gameover' || state === 'win') {
    drawEnemies(buffer);
    drawPowerups(buffer);
    drawBullets(buffer);
    drawHomingShots(buffer);
    drawPlasmaShots(buffer);
    drawEBullets(buffer);
    if (state !== 'gameover') drawPlayer(buffer);
    drawParticles(buffer);
    drawBombFX(buffer);
    drawHUD(buffer);
  }

  if (state === 'title')     drawTitleOverlay(buffer);
  if (state === 'stagecard') drawStageCardOverlay(buffer);
  if (state === 'gameover')  drawGameOverOverlay(buffer);
  if (state === 'win')       drawWinOverlay(buffer);

  // upscale with screenshake (disabled on victory — pilot deserves a still moment)
  const allowShake = (state !== 'win');
  const sx = (allowShake && shake > 0.1) ? (random(-shake, shake)) : 0;
  const sy = (allowShake && shake > 0.1) ? (random(-shake, shake)) : 0;
  background(PAL.sky);
  image(buffer, sx * SCALE, sy * SCALE, width, height);
}

function drawTitleOverlay(g) {
  g.fill(PAL.cream); g.textFont('monospace');
  g.textSize(14); g.text('SOLAR STRIKE', 28, 38);
  g.fill(PAL.orange);
  g.textSize(6); g.text('STAGE SELECT', 50, 52);
  // Stage 1 option
  g.fill(PAL.yellow); g.textSize(7);
  g.text('[1] SUNSET RUN',  38, 68);
  // Stage 2 option (loaded out for demo)
  g.fill(PAL.cream); g.textSize(7);
  g.text('[2] AURORA RUN',  38, 80);
  // Stage 3 option — new!
  g.fill(PAL.yellow); g.textSize(7);
  g.text('[3] CORONA INFERNO', 26, 92);
  // Stage 4 option — FINALE
  g.fill(PAL.cream); g.textSize(7);
  g.text('[4] EVENT HORIZON', 28, 104);
  g.fill(PAL.mag); g.textSize(6);
  g.text('(the finale)', 56, 114);
  // Default action
  g.fill(PAL.yellow); g.textSize(7);
  if (frameCount % 60 < 40) g.text('SPACE = STAGE 1', 32, 128);
  g.fill(PAL.mag); g.textSize(6);
  g.text('ARROWS/WASD - AUTOFIRE', 24, 142);
}
function drawGameOverOverlay(g) {
  // Black-out backdrop for that XCOPY "death TV" mood
  g.noStroke();
  g.fill(0, 0, 0, 180);
  g.rect(0, 0, GB_W, GB_H);

  // Glitch scanlines across the whole screen
  if (frameCount % 7 < 2) {
    g.fill(PAL.mag);
    const ys = [random(GB_H), random(GB_H), random(GB_H)];
    for (const yy of ys) g.rect(0, Math.floor(yy), GB_W, 1);
  }

  // The skull, with glitch + chromatic aberration
  drawXcopySkull(g, GB_W / 2, 56);

  // Text
  g.fill(PAL.orange); g.textFont('monospace');
  g.textSize(14); g.text('GAME OVER', 38, 105);
  g.fill(PAL.cream);  g.textSize(8);
  g.text('SCORE ' + String(score).padStart(6, '0'), 44, 122);
  g.fill(PAL.yellow);
  if (frameCount % 60 < 40) g.text('SPACE TO RETRY', 38, 138);
}

// ---------- XCOPY-INSPIRED GLITCH SKULL ----------
// Original pixel art, inspired by the asymmetric, glitchy aesthetic of XCOPY's
// work (crooked teeth, one glowing eye, chromatic aberration, scanline noise).
// Not a copy of any specific piece — credit as "inspired by XCOPY".
function drawXcopySkull(g, cx, cy) {
  // Periodic glitch state — every ~50f, a 4f burst of distortion
  const cycle = frameCount % 50;
  const glitching = cycle < 4;
  const glitchSliceY = glitching ? Math.floor(random(28)) : -1;
  const glitchOffset = glitching ? Math.floor(random(-3, 4)) : 0;

  // Chromatic aberration ghost copies (orange left, magenta right)
  drawSkullSilhouette(g, cx - 1, cy, PAL.orange, glitchSliceY, glitchOffset);
  drawSkullSilhouette(g, cx + 1, cy, PAL.mag,    glitchSliceY, glitchOffset);
  // Main skull on top
  drawSkullFull(g, cx, cy, glitchSliceY, glitchOffset);
}

function drawSkullSilhouette(g, cx, cy, color, sliceY, sliceOff) {
  g.noStroke(); g.fill(color);
  const x0 = cx - 13, y0 = cy - 14;
  // Just the outline boxes — fast ghost copy
  const slice = (yy) => (yy === sliceY ? sliceOff : 0);
  g.rect(x0 + 6 + slice(0),  y0,      14, 2);
  g.rect(x0 + 4 + slice(2),  y0 + 2,  18, 2);
  g.rect(x0 + 2 + slice(4),  y0 + 4,  22, 4);
  g.rect(x0     + slice(8),  y0 + 8,  26, 8);
  g.rect(x0 + 1 + slice(16), y0 + 16, 24, 2);
  g.rect(x0 + 3 + slice(18), y0 + 18, 20, 2);
  g.rect(x0 + 4 + slice(20), y0 + 20, 18, 4);
  g.rect(x0 + 5 + slice(24), y0 + 24, 16, 1);
  g.rect(x0 + 7 + slice(25), y0 + 25, 12, 1);
}

function drawSkullFull(g, cx, cy, sliceY, sliceOff) {
  g.noStroke();
  const x = cx - 13, y = cy - 14;
  const sh = (yy) => (yy === sliceY ? sliceOff : 0);

  // Skull bone (cream)
  g.fill(PAL.cream);
  g.rect(x + 6 + sh(0),  y,      14, 2);
  g.rect(x + 4 + sh(2),  y + 2,  18, 2);
  g.rect(x + 2 + sh(4),  y + 4,  22, 4);
  g.rect(x     + sh(8),  y + 8,  26, 8);
  g.rect(x + 1 + sh(16), y + 16, 24, 2);
  g.rect(x + 3 + sh(18), y + 18, 20, 2);

  // Yellow underline shading
  g.fill(PAL.yellow);
  g.rect(x + 2 + sh(15), y + 15, 22, 1);

  // LEFT eye socket — large, asymmetric
  g.fill(0);
  g.rect(x + 3 + sh(9),  y + 9,  8, 5);
  // RIGHT eye socket — smaller, lower
  g.rect(x + 15 + sh(10), y + 10, 8, 4);

  // The signature XCOPY-style glowing eye (orange, in left socket)
  // Flickers occasionally for that broken-monitor feel
  if (frameCount % 90 > 6) {
    g.fill(PAL.orange);
    g.rect(x + 5 + sh(10), y + 10, 4, 3);
    g.fill(PAL.cream);
    g.rect(x + 6, y + 11, 1, 1); // pupil highlight
  }
  // Tiny pinprick in right socket
  g.fill(PAL.cream);
  g.rect(x + 18, y + 11, 1, 1);

  // Crooked nose cutout
  g.fill(0);
  g.rect(x + 12, y + 15, 2, 3);
  g.rect(x + 11, y + 17, 4, 1);

  // JAW + crooked teeth
  g.fill(PAL.cream);
  g.rect(x + 4 + sh(20), y + 20, 18, 4);
  g.fill(0); // gaps
  g.rect(x + 6  + sh(20), y + 20, 1, 4);
  g.rect(x + 9  + sh(20), y + 20, 1, 4);
  g.rect(x + 12 + sh(20), y + 20, 1, 4);
  g.rect(x + 15 + sh(20), y + 20, 1, 4);
  g.rect(x + 18 + sh(20), y + 20, 1, 4);

  // Crooked jaw shadow (magenta)
  g.fill(PAL.mag);
  g.rect(x + 5 + sh(24), y + 24, 16, 1);
  g.rect(x + 7 + sh(25), y + 25, 12, 1);

  // Occasional "data corruption" pixels around the skull
  if (frameCount % 11 < 2) {
    g.fill(PAL.orange);
    for (let i = 0; i < 6; i++) {
      g.rect(x + random(-4, 30), y + random(-2, 30), 1, 1);
    }
  }
}
function drawWinOverlay(g) {
  // Stage 3 victory = final game complete with credits
  // (Stage 1 and 2 use the stagecard transition, so reaching 'win' means S3 cleared.)
  g.fill(PAL.cream); g.textFont('monospace');
  g.textSize(12); g.text('GAME', 60, 36);
  g.text('COMPLETE', 44, 52);
  // Animated sun above the text
  const cx = GB_W / 2, cy = 78;
  const r = 8 + Math.sin(frameCount * 0.08) * 1.5;
  g.fill(PAL.yellow);
  g.ellipse(cx, cy, r * 2, r * 2);
  g.fill(PAL.cream);
  g.ellipse(cx, cy, r, r);
  // Solar rays
  g.fill(PAL.orange);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + frameCount * 0.01;
    const rx = cx + Math.cos(a) * (r + 4);
    const ry = cy + Math.sin(a) * (r + 4);
    g.rect(Math.floor(rx), Math.floor(ry), 2, 2);
  }
  // Score + credits
  g.fill(PAL.cream); g.textSize(7);
  g.text('SCORE ' + String(score).padStart(6, '0'), 38, 102);
  g.fill(PAL.yellow); g.textSize(6);
  g.text('A HERMES & RAZZ JOINT', 26, 118);
  g.fill(PAL.orange); g.textSize(6);
  if (frameCount % 60 < 40) g.text('SPACE TO REPLAY', 38, 134);
}

// ---------- TOUCH INPUT ----------
// Drag-offset model: tracks delta movement between frames and feeds it
// into updatePlayer(). Works for landscape + portrait, any screen size,
// because we convert CSS pixels → game-space units using the canvas's
// own bounding box. So a 1 cm drag is roughly the same nudge whether
// the player is on a 4" phone or a desktop monitor.
const Touch = {
  active: false,
  lastX: 0, lastY: 0,
  dx: 0, dy: 0,
  // Sensitivity multiplier — drag distance in game pixels per CSS pixel of finger travel.
  // Game is 160 wide; canvas might be ~400 CSS px on phones, so 160/400 ≈ 0.4 native.
  // We compute this dynamically from canvas size, with a 1.2× boost for snappy feel.
  sens: 1.0,
};

function recomputeTouchSens() {
  const cnv = document.querySelector('#game canvas');
  if (!cnv) return;
  const rect = cnv.getBoundingClientRect();
  if (rect.width <= 0) return;
  Touch.sens = (GB_W / rect.width) * 1.2;
}

function touchStarted(event) {
  Audio.resume();
  // Stage card: tap advances
  if (state === 'stagecard' && stageCardTimer > 20) {
    state = 'play';
    Audio.startMusic();
    Touch.active = false;
    return false;
  }
  // First tap on title/gameover/win = start, like SPACE does on keyboard
  if (state === 'title' || state === 'gameover' || state === 'win') {
    resetGame();
    state = 'play';
    Audio.startMusic();
    // Don't drag the player on the same tap that started the game
    Touch.active = false;
    return false;
  }
  if (touches && touches.length > 0) {
    recomputeTouchSens();
    Touch.active = true;
    Touch.lastX = touches[0].x;
    Touch.lastY = touches[0].y;
    Touch.dx = 0;
    Touch.dy = 0;
  }
  // returning false prevents the browser default (scroll, zoom, etc.)
  return false;
}

function touchMoved(event) {
  if (!Touch.active || !touches || touches.length === 0) return false;
  const nx = touches[0].x;
  const ny = touches[0].y;
  // touches[].x/.y are in canvas CSS pixels; convert to game-space delta.
  Touch.dx += (nx - Touch.lastX) * Touch.sens;
  Touch.dy += (ny - Touch.lastY) * Touch.sens;
  Touch.lastX = nx;
  Touch.lastY = ny;
  return false;
}

function touchEnded(event) {
  if (!touches || touches.length === 0) {
    Touch.active = false;
    Touch.dx = 0; Touch.dy = 0;
  }
  return false;
}

// Recompute sensitivity when the viewport changes (rotate, resize)
window.addEventListener('resize', recomputeTouchSens);
window.addEventListener('orientationchange', () => setTimeout(recomputeTouchSens, 100));

// ============================================================
// STAGE 2 — AURORA RUN: enemies, boss, projectiles, background
// ============================================================

// ----- Shared damage handler (used by all player projectiles) -----
function damageEnemy(e, j, dmg, fx, fy) {
  e.hp -= dmg;
  if (fx != null) spark(fx, fy, PAL.cream, 3);
  if (e.hp <= 0) {
    if (e.kind === 'boss' || e.kind === 'iceheart' || e.kind === 'eyeofsol' || e.kind === 'singularity') {
      e.dead = true;
    } else if (e.kind === 'shardSplitter') {
      // Split into 3 shardlets that fan outward
      for (let k = -1; k <= 1; k++) {
        enemies.push(makeShardlet(e.x, e.y, k * 0.9, 0.5 + Math.abs(k) * 0.2));
      }
      score += e.value || 200;
      spark(e.x, e.y, PAL.cream, 6);
      spark(e.x, e.y, PAL.yellow, 6);
      Audio.enemyExplode();
      shake = Math.max(shake, 2);
      enemies.splice(j, 1);
    } else {
      score += e.value || 50;
      spark(e.x, e.y, PAL.orange, 8);
      spark(e.x, e.y, PAL.yellow, 4);
      // Crystal turret drops powerup more often (it's a longer kill)
      const dropChance = e.kind === 'weaver' ? 0.12
                       : e.kind === 'crystalTurret' ? 0.18
                       : 0.05;
      maybeDropPowerup(e.x, e.y, dropChance);
      shake = Math.max(shake, 2);
      hitPauseFrames = 1;
      Audio.enemyExplode();
      enemies.splice(j, 1);
    }
  } else {
    if (e.kind === 'boss' || e.kind === 'iceheart' || e.kind === 'eyeofsol') {
      shake = Math.max(shake, 1.5);
      Audio.bossHit();
    } else {
      Audio.enemyHit();
    }
  }
}

// ----- AURORA BACKGROUND -----
function updateAuroraBG() {
  // Aurora bands sway via sin phase
  for (const a of auroras) {
    a.phase += a.speed;
  }
  // Ice shards drift downward, wrap
  for (const s of iceShards) {
    s.y += s.vy;
    if (s.y > GB_H + 4) {
      s.y = -4;
      s.x = random(GB_W);
      s.rot = floor(random(4));
    }
  }
  // Occasional comet — spawn every ~3 seconds, streaks diagonally
  if (frameCount % 180 === 0 && random() < 0.6) {
    comets.push({
      x: random(GB_W * 0.3, GB_W * 0.9),
      y: -8,
      vx: -random(1.2, 1.8),
      vy: random(1.4, 2.0),
      life: 90,
    });
  }
  for (let i = comets.length - 1; i >= 0; i--) {
    const c = comets[i];
    c.x += c.vx; c.y += c.vy; c.life--;
    if (c.life <= 0 || c.x < -10 || c.y > GB_H + 10) comets.splice(i, 1);
  }
}
function drawAuroraBG(g) {
  // 1. Aurora ribbons — thin wavy HORIZONTAL bands.
  // For each x, compute the wave y for this band and paint a few pixels tall.
  // Use dither alternation between band color and dark teal to fake transparency
  // without expensive per-pixel alpha. The result reads as a flowing curtain.
  for (const a of auroras) {
    for (let x = 0; x < GB_W; x++) {
      const yWave = a.y + Math.sin(x * 0.12 + a.phase) * a.amp;
      const ribbonH = 3 + (Math.sin(x * 0.27 + a.phase * 1.5) > 0 ? 1 : 0);
      // dithered fill — every 2nd column gets the bright color, others get teal seam
      if ((x + Math.floor(a.phase * 8)) % 2 === 0) {
        g.fill(a.color);
        g.rect(x, Math.floor(yWave), 1, ribbonH);
      } else {
        g.fill(PAL.mag);
        g.rect(x, Math.floor(yWave + 1), 1, 1);
      }
    }
  }
  // 2. Ice shards — small pixels drifting downward
  for (const s of iceShards) {
    g.fill(PAL.cream);
    g.rect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
    if (s.size >= 3) {
      g.fill(PAL.yellow);
      g.rect(Math.floor(s.x) + 1, Math.floor(s.y) + 1, 1, 1);
    }
  }
  // 3. Comets — bright head + cream trail
  for (const c of comets) {
    g.fill(PAL.cream);
    g.rect(Math.floor(c.x), Math.floor(c.y), 2, 2);
    for (let t = 1; t < 6; t++) {
      g.fill(t % 2 ? PAL.yellow : PAL.orange);
      g.rect(Math.floor(c.x - c.vx * t * 0.5),
             Math.floor(c.y - c.vy * t * 0.5),
             1, 1);
    }
  }
}

// ----- ENEMIES (Stage 2) -----
function makeIceFighter(x, y) {
  return { kind: 'iceFighter', x, y, w: 8, h: 8, hp: 1, vy: 1.0, vx: 0,
           t: 0, value: 120 };
}
function makeCrystalTurret(x, y, side) {
  return { kind: 'crystalTurret', x, y, w: 10, h: 10, hp: 3,
           t: 0, locked: false, side, value: 300 };
}
function makeShardSplitter(x, y) {
  return { kind: 'shardSplitter', x, y, w: 10, h: 10, hp: 2, vy: 0.5,
           t: 0, value: 200 };
}
function makeShardlet(x, y, vx, vy) {
  return { kind: 'shardlet', x, y, w: 4, h: 4, hp: 1, vx, vy,
           t: 0, value: 50 };
}

function drawIceFighter(g, e) {
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  // crystalline body
  g.fill(PAL.mag);    g.rect(x + 1, y + 2, 6, 4);
  g.fill(PAL.yellow); g.rect(x + 2, y + 1, 4, 6);  // green aurora hull
  g.fill(PAL.cream);  g.rect(x + 3, y + 3, 2, 2);
  // ice wing tips
  g.fill(PAL.cream); g.rect(x,     y + 4, 1, 1);
  g.fill(PAL.cream); g.rect(x + 7, y + 4, 1, 1);
}
function drawCrystalTurret(g, e) {
  const x = Math.floor(e.x - 5), y = Math.floor(e.y - 5);
  // Hexagonal-ish crystal turret
  g.fill(PAL.mag);    g.rect(x + 2, y,     6, 1);
  g.fill(PAL.mag);    g.rect(x + 1, y + 1, 8, 1);
  g.fill(PAL.orange); g.rect(x,     y + 2, 10, 6);  // violet core
  g.fill(PAL.mag);    g.rect(x + 1, y + 8, 8, 1);
  g.fill(PAL.mag);    g.rect(x + 2, y + 9, 6, 1);
  // pulsing core
  const core = (frameCount % 14 < 7) ? PAL.cream : PAL.yellow;
  g.fill(core); g.rect(x + 4, y + 4, 2, 2);
}
function drawShardSplitter(g, e) {
  const x = Math.floor(e.x - 5), y = Math.floor(e.y - 5);
  // Big jagged crystal cluster
  g.fill(PAL.mag);    g.rect(x + 2, y + 1, 6, 8);
  g.fill(PAL.cream);  g.rect(x,     y + 3, 10, 4);
  g.fill(PAL.yellow); g.rect(x + 3, y + 2, 4, 6);
  g.fill(PAL.cream);  g.rect(x + 4, y + 4, 2, 2);
  // points
  g.fill(PAL.cream); g.rect(x + 4, y,     2, 1);
  g.fill(PAL.cream); g.rect(x + 4, y + 9, 2, 1);
}
function drawShardlet(g, e) {
  const x = Math.floor(e.x - 2), y = Math.floor(e.y - 2);
  g.fill(PAL.cream);  g.rect(x, y, 4, 4);
  g.fill(PAL.yellow); g.rect(x + 1, y + 1, 2, 2);
}

// ----- ICEHEART BOSS -----
// 6 orbiting facets shield a central core. Destroy facets to expose core.
// Phase 2: when all facets dead, core glows and chases the player.
function spawnIceheart() {
  Audio.bossAppear();
  boss = {
    kind: 'iceheart',
    x: GB_W / 2, y: -30,
    w: 24, h: 24,
    hp: 40, hpMax: 40,
    t: 0, phase: 1,
    facets: [],
    fireT: 0, dead: false,
  };
  // 6 facets in a hexagon orbit
  for (let i = 0; i < 6; i++) {
    boss.facets.push({
      angle: i * Math.PI * 2 / 6,
      dist: 20,
      hp: 4,
      alive: true,
      pulse: i * 10,
    });
  }
  enemies.push(boss);
}
function updateIceheart(b) {
  b.t++;
  // Entry: glide in to top-center
  if (b.y < 36) { b.y += 0.5; return; }

  // Phase 1: facets orbit and protect core. Boss drifts side to side gently.
  const allFacetsDown = b.facets.every(f => !f.alive);
  if (allFacetsDown && b.phase === 1) {
    b.phase = 2;
    shake = 8;
    Audio.bossAppear(); // ominous re-cue
  }

  if (b.phase === 1) {
    // Gentle horizontal sway
    b.x = GB_W / 2 + Math.sin(b.t * 0.015) * 28;
    // Slow orbital rotation
    for (const f of b.facets) {
      if (f.alive) f.angle += 0.018;
    }
  } else {
    // Phase 2: chase player slowly
    const dx = player.x - b.x;
    const dy = (player.y - 40) - b.y;
    b.x += Math.sign(dx) * Math.min(Math.abs(dx) * 0.02, 0.55);
    b.y += Math.sign(dy) * Math.min(Math.abs(dy) * 0.02, 0.40);
    b.y = Math.max(20, Math.min(GB_H * 0.55, b.y));
  }

  // Firing pattern
  b.fireT++;
  const rate = b.phase === 1 ? 60 : 35;
  if (b.fireT % rate === 0) {
    if (b.phase === 1) {
      // 4-way + cross
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + b.t * 0.005;
        eBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 1.3, vy: Math.sin(a) * 1.3 });
      }
    } else {
      // Phase 2: aimed shot + ring burst
      fireAtPlayer(b.x, b.y, 2.0);
      if (b.fireT % 90 === 0) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          eBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2 });
        }
      }
    }
  }
}
function drawIceheart(g, b) {
  // Core
  const x = Math.floor(b.x - b.w / 2), y = Math.floor(b.y - b.h / 2);
  // Outer ring of core
  const coreFlash = (b.phase === 2 && frameCount % 8 < 4) ? PAL.cream : PAL.mag;
  g.fill(coreFlash); g.rect(x + 4,  y + 4,  16, 16);
  g.fill(PAL.orange); g.rect(x + 6,  y + 6,  12, 12);   // violet inner
  // Hex facets cut into the core
  g.fill(PAL.yellow); g.rect(x + 8,  y + 8,  8, 8);     // aurora-green pulse
  const coreCenter = (frameCount % 10 < 5) ? PAL.cream : PAL.yellow;
  g.fill(coreCenter); g.rect(x + 10, y + 10, 4, 4);
  // Dark hexagonal seam
  g.fill(PAL.sky);
  g.rect(x + 11, y + 4,  2, 2);  // top
  g.rect(x + 11, y + 18, 2, 2);  // bot
  g.rect(x + 4,  y + 11, 2, 2);  // L
  g.rect(x + 18, y + 11, 2, 2);  // R

  // Facets orbiting the core
  for (const f of b.facets) {
    if (!f.alive) continue;
    const fx = b.x + Math.cos(f.angle) * f.dist;
    const fy = b.y + Math.sin(f.angle) * f.dist;
    const fxi = Math.floor(fx - 3), fyi = Math.floor(fy - 3);
    const facetFlash = ((frameCount + f.pulse) % 16 < 8) ? PAL.cream : PAL.mag;
    g.fill(facetFlash); g.rect(fxi,     fyi + 1, 6, 4);
    g.fill(PAL.orange); g.rect(fxi + 1, fyi,     4, 6);
    g.fill(PAL.cream);  g.rect(fxi + 2, fyi + 2, 2, 2);
    // tiny hp dots
    if (f.hp <= 1) {
      g.fill(PAL.yellow); g.rect(fxi + 2, fyi + 4, 2, 1);
    }
  }
}
// Custom collision: facets intercept bullets before they reach the core
// Insert into the bullets→enemies loop by overriding the boss collision check.
// Simpler approach: pre-process at start of each frame in updatePlay — but the
// cleanest way without re-architecting is a helper that gets called from
// damageEnemy for iceheart specifically. So: if a bullet hits iceheart's bbox,
// route to a facet if any are alive within proximity.
function icehearBulletIntercept(b, hit) {
  // hit is {x, y} of bullet impact. Returns the alive facet within range, or null.
  if (!boss || boss.kind !== 'iceheart') return null;
  let best = null, bestD = Infinity;
  for (const f of boss.facets) {
    if (!f.alive) continue;
    const fx = boss.x + Math.cos(f.angle) * f.dist;
    const fy = boss.y + Math.sin(f.angle) * f.dist;
    const d = Math.hypot(hit.x - fx, hit.y - fy);
    if (d < 6 && d < bestD) { best = f; bestD = d; }
  }
  return best;
}

// ----- HOMING MISSILES -----
function updateHomingShots() {
  for (let i = homingShots.length - 1; i >= 0; i--) {
    const m = homingShots[i];
    m.t++; m.life--;
    // Find nearest enemy
    let target = null, bestD = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d < bestD) { bestD = d; target = e; }
    }
    if (target) {
      const dx = target.x - m.x, dy = target.y - m.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      const desiredVx = (dx / len) * 1.8;
      const desiredVy = (dy / len) * 1.8;
      // ease toward desired
      m.vx += (desiredVx - m.vx) * 0.10;
      m.vy += (desiredVy - m.vy) * 0.10;
    }
    m.x += m.vx; m.y += m.vy;
    // Smoke trail
    if (m.t % 3 === 0) {
      particles.push({
        x: m.x, y: m.y, vx: -m.vx * 0.2, vy: -m.vy * 0.2,
        life: 12, color: PAL.orange,
      });
    }
    if (m.life <= 0 || m.x < -4 || m.x > GB_W + 4 || m.y < -4 || m.y > GB_H + 4) {
      homingShots.splice(i, 1);
    }
  }
}
function drawHomingShots(g) {
  g.noStroke();
  for (const m of homingShots) {
    const x = Math.floor(m.x - 1), y = Math.floor(m.y - 1);
    g.fill(PAL.yellow); g.rect(x, y, 3, 3);
    g.fill(PAL.cream);  g.rect(x + 1, y + 1, 1, 1);
    // tiny flame at back
    g.fill(PAL.orange);
    g.rect(Math.floor(m.x - m.vx), Math.floor(m.y - m.vy), 1, 1);
  }
}

// ----- PLASMA ORBS -----
function updatePlasmaShots() {
  for (let i = plasmaShots.length - 1; i >= 0; i--) {
    const p = plasmaShots[i];
    p.y += p.vy; p.t++; p.life--;
    if (p.life <= 0 || p.y < -10) plasmaShots.splice(i, 1);
  }
}
function drawPlasmaShots(g) {
  g.noStroke();
  for (const p of plasmaShots) {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    const pulse = (frameCount + p.t) % 6 < 3;
    // outer halo
    g.fill(PAL.orange); g.rect(x - 3, y - 3, 6, 6);
    g.fill(pulse ? PAL.cream : PAL.yellow);
    g.rect(x - 2, y - 2, 4, 4);
    g.fill(PAL.cream);  g.rect(x - 1, y - 1, 2, 2);
    // wispy trail
    if (p.t % 2 === 0) {
      particles.push({
        x: p.x + random(-2, 2), y: p.y + 3,
        vx: 0, vy: 0.3,
        life: 10, color: PAL.yellow,
      });
    }
  }
}

// ----- ICEHEART BULLET ROUTING -----
// Patch bullet/missile/plasma collisions to route through facets first.
// We do this by wrapping damageEnemy when the target is iceheart.
const _origDamageEnemy = damageEnemy;
damageEnemy = function (e, j, dmg, fx, fy) {
  if (e && e.kind === 'iceheart' && boss && boss.phase === 1) {
    // try to route to a facet
    const facet = icehearBulletIntercept(null, { x: fx, y: fy });
    if (facet) {
      facet.hp -= dmg;
      spark(fx, fy, PAL.cream, 4);
      Audio.bossHit();
      if (facet.hp <= 0) {
        facet.alive = false;
        const fxw = boss.x + Math.cos(facet.angle) * facet.dist;
        const fyw = boss.y + Math.sin(facet.angle) * facet.dist;
        spark(fxw, fyw, PAL.cream, 12);
        spark(fxw, fyw, PAL.yellow, 8);
        shake = Math.max(shake, 3);
        Audio.enemyExplode();
      }
      return; // facet absorbed the damage
    }
    // No facet in the way → bullet still hits the core (rare in P1, glancing shot)
  }
  return _origDamageEnemy(e, j, dmg, fx, fy);
};

// ----- STAGE CARD OVERLAY -----
function drawStageCardOverlay(g) {
  // Dim backdrop
  g.fill(0, 0, 0, 140);
  g.rect(0, 0, GB_W, GB_H);
  // Banner
  g.fill(PAL.mag);    g.rect(8, GB_H/2 - 28, GB_W - 16, 56);
  g.fill(PAL.orange); g.rect(8, GB_H/2 - 28, GB_W - 16, 2);
  g.fill(PAL.orange); g.rect(8, GB_H/2 + 26, GB_W - 16, 2);
  // Text — name depends on current stage
  const stageName = stage === 2 ? 'AURORA RUN'
                  : stage === 3 ? 'CORONA INFERNO'
                  : stage === 4 ? 'EVENT HORIZON'
                  : 'SUNSET RUN';
  const nameX = stage === 3 ? 27 : (stage === 4 ? 28 : 47);
  g.fill(PAL.cream); g.textFont('monospace');
  g.textSize(14); g.text('STAGE ' + stage, 48, GB_H/2 - 8);
  g.fill(PAL.yellow); g.textSize(8);
  g.text(stageName, nameX, GB_H/2 + 8);
  // Blinking "go" hint
  if (stageCardTimer > 60 && frameCount % 30 < 18) {
    g.fill(PAL.cream); g.textSize(6);
    g.text('TAP / SPACE TO ADVANCE', 22, GB_H/2 + 22);
  }
}

// ============================================================
// STAGE 3 — CORONA INFERNO: enemies, boss, projectiles, background
// ============================================================

// ----- CORONA BACKGROUND -----
function initCoronaBG() {
  heatBands.length = 0;
  // 3 thinner heat bands at varying depths — distortion shimmer.
  // Lower count + thinner profile so enemies/bullets read clearly.
  for (let i = 0; i < 3; i++) {
    heatBands.push({
      y: 24 + i * 44 + random(-4, 4),
      phase: random(TWO_PI),
      speed: random(0.025, 0.05),
      amp: random(2, 5),
    });
  }
  embers.length = 0;
  for (let i = 0; i < 14; i++) {
    embers.push({
      x: random(GB_W),
      y: random(GB_H),
      vy: -random(0.4, 1.1),
      size: 1,
      hue: random() < 0.5 ? PAL.yellow : PAL.orange,
    });
  }
  sunArcs.length = 0;
  // reset flare state
  flare.active = false;
  flare.warning = 0;
  flare.sweepT = 0;
  flare.cooldown = 360; // first flare ~6s in
}

function updateCoronaBG() {
  for (const b of heatBands) b.phase += b.speed;
  for (const e of embers) {
    e.y += e.vy;
    e.x += Math.sin((e.y + frameCount * 0.5) * 0.06) * 0.18;
    if (e.y < -2) {
      e.y = GB_H + 2;
      e.x = random(GB_W);
    }
  }
  // Occasional plasma arc — flickering streak between two random points
  if (frameCount % 90 === 0 && random() < 0.6) {
    sunArcs.push({
      x1: random(GB_W * 0.2, GB_W * 0.8),
      y1: random(20, GB_H - 20),
      x2: random(GB_W * 0.2, GB_W * 0.8),
      y2: random(20, GB_H - 20),
      life: 8,
    });
  }
  for (let i = sunArcs.length - 1; i >= 0; i--) {
    sunArcs[i].life--;
    if (sunArcs[i].life <= 0) sunArcs.splice(i, 1);
  }
  // ---- Solar flare beam (gameplay-affecting BG element) ----
  if (state === 'play' && stage === 3 && !(boss && boss.kind === 'eyeofsol')) {
    // Don't spawn flares during boss fight — boss has its own attacks
    if (flare.active) {
      flare.sweepT++;
      // Beam damages player if in band
      if (invuln <= 0 &&
          Math.abs(player.y - flare.y) < flare.height / 2 + 2) {
        playerHit();
      }
      if (flare.sweepT >= flare.sweepDur) {
        flare.active = false;
        flare.cooldown = 360 + Math.floor(random(120));
      }
    } else if (flare.warning > 0) {
      flare.warning--;
      if (flare.warning === 0) {
        flare.active = true;
        flare.sweepT = 0;
        shake = Math.max(shake, 6);
        Audio.bossHit && Audio.bossHit();
      }
    } else {
      flare.cooldown--;
      if (flare.cooldown <= 0) {
        flare.warning = 90; // 1.5s warning
        // Pick y away from current player position so it's a real dodge
        let candY;
        let tries = 0;
        do {
          candY = random(24, GB_H - 24);
          tries++;
        } while (Math.abs(candY - player.y) < 24 && tries < 5);
        flare.y = candY;
        flare.height = 14 + Math.floor(random(6));
      }
    }
  }
}

function drawCoronaBG(g) {
  // 1. Heat-band distortion: each band is a single-pixel shimmer line
  // with sparse dither — keeps the playfield readable while still evoking heat haze.
  for (const b of heatBands) {
    for (let x = 0; x < GB_W; x++) {
      const yWave = b.y + Math.sin(x * 0.18 + b.phase) * b.amp;
      // alternate orange/mag dither — sparse, low-contrast against deep crimson sky
      if ((x + Math.floor(b.phase * 6)) % 3 === 0) {
        g.fill(PAL.orange);
        g.rect(x, Math.floor(yWave), 1, 1);
      } else if ((x + Math.floor(b.phase * 6)) % 3 === 1) {
        g.fill(PAL.mag);
        g.rect(x, Math.floor(yWave + 1), 1, 1);
      }
    }
  }
  // 2. Embers — small pixels drifting upward
  for (const e of embers) {
    g.fill(e.hue);
    g.rect(Math.floor(e.x), Math.floor(e.y), e.size, e.size);
  }
  // 3. Sun arcs — bright crackling lines drawn as a chain of pixels
  for (const a of sunArcs) {
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x1 + (a.x2 - a.x1) * t + random(-2, 2);
      const y = a.y1 + (a.y2 - a.y1) * t + random(-2, 2);
      g.fill(i % 2 ? PAL.cream : PAL.yellow);
      g.rect(Math.floor(x), Math.floor(y), 1, 1);
    }
  }
  // 4. Solar flare beam + warning
  if (flare.warning > 0) {
    // Pulsing warning band (blinking outline)
    if (frameCount % 8 < 4) {
      g.fill(PAL.cream);
      g.rect(0, Math.floor(flare.y - flare.height / 2) - 1, GB_W, 1);
      g.rect(0, Math.floor(flare.y + flare.height / 2),     GB_W, 1);
    }
    // Warning text "!!!"
    if (frameCount % 12 < 6) {
      g.fill(PAL.cream); g.textFont('monospace'); g.textSize(7);
      g.text('!FLARE!', 56, flare.y + 2);
    }
  }
  if (flare.active) {
    // Bright beam — fully-saturated horizontal band with bright core
    const top = Math.floor(flare.y - flare.height / 2);
    g.fill(PAL.orange);
    g.rect(0, top, GB_W, flare.height);
    g.fill(PAL.yellow);
    g.rect(0, top + 2, GB_W, flare.height - 4);
    g.fill(PAL.cream);
    g.rect(0, Math.floor(flare.y) - 1, GB_W, 2);
    // Crackle particles along the beam
    if (frameCount % 2 === 0) {
      for (let i = 0; i < 3; i++) {
        particles.push({
          x: random(GB_W), y: flare.y + random(-flare.height / 2, flare.height / 2),
          vx: random(-0.5, 0.5), vy: random(-0.5, 0.5),
          life: 10, color: PAL.cream,
        });
      }
    }
  }
}

// ----- ENEMIES (Stage 3) -----
function makePyron(x, y) {
  return { kind: 'pyron', x, y, w: 8, h: 8, hp: 2, vy: 0.85,
           t: random(TWO_PI), amp: 20, baseX: x, value: 150 };
}
function makeSunspot(x, y) {
  return { kind: 'sunspot', x, y, w: 4, h: 4, hp: 2, t: 0, value: 250 };
}
function makeHelixBomber(x, y) {
  return { kind: 'helixBomber', x, y, w: 8, h: 8, hp: 3, vy: 0.7,
           t: 0, partner: null, value: 220 };
}

function drawPyron(g, e) {
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  // Tear-drop plasma fish, bright trail
  g.fill(PAL.orange); g.rect(x + 1, y + 2, 6, 5);
  g.fill(PAL.yellow); g.rect(x + 2, y + 1, 4, 6);
  g.fill(PAL.cream);  g.rect(x + 3, y + 3, 2, 2);
  // tail flicker
  if (frameCount % 6 < 3) {
    g.fill(PAL.orange);
    g.rect(x + 3, y + 7, 2, 1);
  }
}
function drawSunspot(g, e) {
  // Dark core, hot rim — visible "warning" cue before burst
  const r = e.w;
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  // Rim color brightens as it nears burst
  const rim = (e.t < 60) ? PAL.mag
             : (e.t < 100) ? PAL.orange
             : (frameCount % 4 < 2 ? PAL.cream : PAL.yellow);
  g.fill(rim);
  g.rect(cx - r/2,     cy - r/2,     r, r);
  g.fill(PAL.sky); // dark cool spot in middle
  const ir = Math.max(1, r - 2);
  g.rect(cx - ir/2,    cy - ir/2,    ir, ir);
  // Pre-burst sparkles
  if (e.t > 90 && frameCount % 3 === 0) {
    g.fill(PAL.cream);
    g.rect(cx + random(-r, r), cy + random(-r, r), 1, 1);
  }
}
function drawHelixBomber(g, e) {
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  // Boxy bomber w/ glowing underside
  g.fill(PAL.mag);    g.rect(x,     y + 2, 8, 4);
  g.fill(PAL.orange); g.rect(x + 1, y + 1, 6, 6);
  g.fill(PAL.cream);  g.rect(x + 2, y + 2, 4, 2);
  // pulsing belly
  g.fill(frameCount % 8 < 4 ? PAL.yellow : PAL.cream);
  g.rect(x + 3, y + 5, 2, 2);
  // Beam between partners (visual + damage)
  if (e.partner && enemies.indexOf(e.partner) !== -1 && e.x < e.partner.x) {
    // only the left bomber draws the beam to avoid double-draw
    const p = e.partner;
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bx = e.x + (p.x - e.x) * t;
      const by = e.y + (p.y - e.y) * t + Math.sin(frameCount * 0.18 + t * Math.PI * 2) * 1.2;
      g.fill(i % 2 ? PAL.yellow : PAL.cream);
      g.rect(Math.floor(bx), Math.floor(by), 1, 1);
    }
  }
}
// Damage the beam between live helix bombers if the player flies into it
function helixBeamPlayerCheck() {
  if (invuln > 0) return;
  // collect alive pairs (process each pair once)
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.kind !== 'helixBomber') continue;
    const b = a.partner;
    if (!b || enemies.indexOf(b) === -1) continue;
    if (a.x > b.x) continue; // only one direction
    // distance from player point to segment a-b
    const px = player.x, py = player.y;
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = px - a.x,  wy = py - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) continue;
    const c2 = vx * vx + vy * vy;
    if (c1 >= c2) continue;
    const t = c1 / c2;
    const cx = a.x + t * vx, cy = a.y + t * vy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < 3) {
      playerHit();
      return;
    }
  }
}

// ----- EYE OF SOL BOSS -----
// 3 phases:
//  P1 — closed iris: sweeping eyelid lasers (horizontal cones)
//  P2 — open iris (core exposed), spawns sunspot adds, fires aimed bursts
//  P3 — fractured: lasers + ring bursts, fast aimed shots
function spawnEyeOfSol() {
  Audio.bossAppear();
  boss = {
    kind: 'eyeofsol',
    x: GB_W / 2, y: -40,
    w: 56, h: 32,
    hp: 110, hpMax: 110,
    t: 0, phase: 1,
    fireT: 0, dead: false,
    blink: 0,            // eyelid open-state 0..1
    addCooldown: 0,
    laserState: 0,       // 0 idle, 1 warning, 2 firing
    laserT: 0,
    laserAngle: 0,
  };
  enemies.push(boss);
}
function updateEyeOfSol(b) {
  b.t++;
  // Entry glide
  if (b.y < 28) { b.y += 0.5; return; }

  // Phase transitions by HP
  if (b.hp < b.hpMax * 0.65 && b.phase === 1) {
    b.phase = 2;
    shake = 8;
    Audio.bossAppear();
  } else if (b.hp < b.hpMax * 0.30 && b.phase === 2) {
    b.phase = 3;
    shake = 10;
    Audio.bossAppear();
  }

  // Eyelid blink (visual): open more in P2, fully open + fractured in P3
  const targetBlink = b.phase === 1 ? 0.2 : (b.phase === 2 ? 0.85 : 1.0);
  b.blink += (targetBlink - b.blink) * 0.04;

  // Movement: drift side to side, faster as phases progress
  const sway = b.phase === 1 ? 36 : (b.phase === 2 ? 42 : 50);
  const speed = b.phase === 1 ? 0.015 : (b.phase === 2 ? 0.025 : 0.04);
  b.x = GB_W / 2 + Math.sin(b.t * speed) * sway;
  b.y = 32 + Math.sin(b.t * speed * 0.6) * 4;

  // Firing patterns
  b.fireT++;
  if (b.phase === 1) {
    // Sweeping eyelid laser every ~3s
    if (b.laserState === 0 && b.fireT % 180 === 0) {
      b.laserState = 1;
      b.laserT = 0;
      // aim toward player at time of warning
      b.laserAngle = Math.atan2(player.y - b.y, player.x - b.x);
    }
    if (b.laserState === 1) {
      b.laserT++;
      if (b.laserT >= 60) {
        b.laserState = 2;
        b.laserT = 0;
        shake = Math.max(shake, 4);
        // fire a fast aimed bullet salvo in a cone
        for (let i = -2; i <= 2; i++) {
          const a = b.laserAngle + i * 0.12;
          eBullets.push({
            x: b.x, y: b.y + 4,
            vx: Math.cos(a) * 2.4,
            vy: Math.sin(a) * 2.4,
          });
        }
      }
    }
    if (b.laserState === 2) {
      b.laserT++;
      if (b.laserT >= 20) b.laserState = 0;
    }
    // Mild ambient fire
    if (b.fireT % 70 === 0) {
      fireAtPlayer(b.x, b.y + 8, 1.5);
    }
  } else if (b.phase === 2) {
    // Spawn sunspot adds + aimed double-shot
    if (b.addCooldown <= 0) {
      b.addCooldown = 220;
      const sx = b.x + random(-20, 20);
      const sy = b.y + 24 + random(0, 16);
      enemies.push(makeSunspot(sx, sy));
    } else b.addCooldown--;
    if (b.fireT % 50 === 0) {
      // Spread of 3
      for (let i = -1; i <= 1; i++) {
        const a = Math.atan2(player.y - b.y, player.x - b.x) + i * 0.22;
        eBullets.push({ x: b.x, y: b.y + 6, vx: Math.cos(a) * 1.9, vy: Math.sin(a) * 1.9 });
      }
    }
  } else {
    // Phase 3 chaos — fast aimed + ring bursts
    if (b.fireT % 28 === 0) {
      fireAtPlayer(b.x, b.y + 6, 2.3);
    }
    if (b.fireT % 90 === 0) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + b.t * 0.01;
        eBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 });
      }
    }
    // Occasional add
    if (b.fireT % 200 === 0) {
      enemies.push(makeSunspot(b.x + random(-30, 30), b.y + 26 + random(0, 12)));
    }
  }
}
function drawEyeOfSol(g, b) {
  const cx = b.x, cy = b.y;
  // Outer eye-socket (dark crimson ring)
  g.fill(PAL.mag);
  g.ellipse(cx, cy, 56, 36);
  // Eyeball (cream)
  g.fill(PAL.cream);
  g.ellipse(cx, cy, 48, 28);
  // Iris size grows with phase / blink
  const irisR = 8 + b.blink * 6;
  g.fill(PAL.orange);
  g.ellipse(cx, cy, irisR * 2, irisR * 2);
  // Pupil — pulses
  const pup = (frameCount % 10 < 5) ? PAL.yellow : PAL.cream;
  g.fill(pup);
  g.ellipse(cx, cy, irisR, irisR);
  // Dark pupil center
  g.fill(PAL.sky);
  g.ellipse(cx, cy, irisR * 0.5, irisR * 0.5);

  // Eyelids — closed amount = 1 - blink
  const lidH = (1 - b.blink) * 14;
  if (lidH > 0.5) {
    g.fill(PAL.mag);
    g.rect(Math.floor(cx - 24), Math.floor(cy - 14), 48, lidH);
    g.rect(Math.floor(cx - 24), Math.floor(cy + 14 - lidH), 48, lidH);
    // lash line
    g.fill(PAL.orange);
    g.rect(Math.floor(cx - 24), Math.floor(cy - 14 + lidH), 48, 1);
    g.rect(Math.floor(cx - 24), Math.floor(cy + 14 - lidH - 1), 48, 1);
  }

  // Phase 3: fractures (crack lines)
  if (b.phase === 3) {
    g.fill(PAL.sky);
    g.rect(Math.floor(cx - 18), Math.floor(cy - 1), 12, 1);
    g.rect(Math.floor(cx + 4),  Math.floor(cy - 6), 10, 1);
    g.rect(Math.floor(cx - 8),  Math.floor(cy + 6), 14, 1);
    // chips fly occasionally
    if (frameCount % 6 === 0) {
      particles.push({
        x: cx + random(-20, 20), y: cy + random(-8, 8),
        vx: random(-1, 1), vy: random(-1.5, -0.5),
        life: 30, color: PAL.cream,
      });
    }
  }

  // Phase 1 laser warning / firing visual
  if (b.laserState === 1) {
    // Telegraph line from eye toward laser angle (blinking)
    if (frameCount % 6 < 3) {
      const len = 80;
      const steps = 30;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const lx = cx + Math.cos(b.laserAngle) * (irisR + 2 + t * len);
        const ly = cy + Math.sin(b.laserAngle) * (irisR + 2 + t * len);
        g.fill(PAL.cream);
        g.rect(Math.floor(lx), Math.floor(ly), 1, 1);
      }
    }
  }
  if (b.laserState === 2) {
    // Brief bright glow
    g.fill(PAL.cream);
    g.ellipse(cx, cy, irisR * 2.2, irisR * 2.2);
  }
}

// ----- Integrate helix-beam damage check into update loop -----
// We hook into updatePlay via a small wrapper: append a frame-end check.
// (Defined here so it can call into stage-3 specific code.)
const _origCollisions = collisions;
collisions = function () {
  _origCollisions();
  if (stage === 3) helixBeamPlayerCheck();
};

// ============================================================
// STAGE 4 — EVENT HORIZON
// ============================================================
// Theme: you've fallen into a black hole. Stars spiral inward toward
// a central singularity. Enemies are warped echoes pulled by gravity.
// Palette: violet + electric cyan over void black.

let voidStars = [];
let voidRipples = [];
let singularityAngle = 0;

function initVoidBG() {
  voidStars.length = 0;
  // ~80 stars distributed across the field; each spirals inward at varying rates
  for (let i = 0; i < 80; i++) {
    const r = random(20, GB_W);
    const a = random(TWO_PI);
    voidStars.push({
      r, a,
      speed: random(0.004, 0.014),   // angular spiral speed
      pull:  random(0.05, 0.18),     // radial inward pull
      bright: random() < 0.35,
    });
  }
  voidRipples.length = 0;
  singularityAngle = 0;
}

function voidCenter() {
  return { x: GB_W / 2, y: GB_H * 0.35 };
}

function updateVoidBG() {
  const c = voidCenter();
  for (const s of voidStars) {
    s.a += s.speed;
    s.r -= s.pull;
    if (s.r < 3) {
      // respawned at the edge with random angle
      s.r = GB_W * 1.1;
      s.a = random(TWO_PI);
    }
  }
  // emit a slow accretion ripple
  if (frameCount % 60 === 0) {
    voidRipples.push({ x: c.x, y: c.y, r: 4, life: 60 });
  }
  for (let i = voidRipples.length - 1; i >= 0; i--) {
    voidRipples[i].r += 0.7;
    voidRipples[i].life--;
    if (voidRipples[i].life <= 0) voidRipples.splice(i, 1);
  }
  singularityAngle += 0.04;
}

function drawVoidBG(g) {
  const c = voidCenter();
  // Spiralling starfield
  g.noStroke();
  for (const s of voidStars) {
    const x = c.x + Math.cos(s.a) * s.r;
    const y = c.y + Math.sin(s.a) * s.r * 0.85;
    if (x < 0 || x >= GB_W || y < 0 || y >= GB_H) continue;
    g.fill(s.bright ? PAL.cream : PAL.yellow);
    g.rect(Math.floor(x), Math.floor(y), 1, 1);
  }
  // Accretion ripples
  g.noFill();
  for (const r of voidRipples) {
    const a = r.life / 60;
    g.stroke(PAL.orange); g.strokeWeight(1);
    g.ellipse(r.x, r.y, r.r * 2, r.r * 1.6);
  }
  g.noStroke();
  // The black hole itself — a void disc with a violet event horizon
  // (only when boss not active; once boss spawns it draws itself)
  if (!(boss && boss.kind === 'singularity')) {
    g.fill(PAL.mag);
    g.ellipse(c.x, c.y, 14, 10);
    g.fill(0);
    g.ellipse(c.x, c.y, 8, 6);
    // photon ring — single pixel highlight that rotates
    g.fill(PAL.cream);
    const rx = c.x + Math.cos(singularityAngle) * 6;
    const ry = c.y + Math.sin(singularityAngle) * 4;
    g.rect(Math.floor(rx), Math.floor(ry), 1, 1);
  }
}

// --------- Stage 4 enemy: Voidling ---------
// Drifts down, then gets pulled toward singularity centre.
function makeVoidling(x, y) {
  return { kind: 'voidling', x, y, w: 7, h: 7, hp: 1,
           vy: 0.7, vx: 0, t: 0, fireT: 0, value: 150 };
}
function updateVoidling(e) {
  const c = voidCenter();
  e.y += e.vy;
  // After entering the field, slight gravitational tug toward centre
  if (e.y > 16) {
    const dx = c.x - e.x;
    const dy = c.y - e.y;
    const d = Math.max(8, Math.hypot(dx, dy));
    e.x += (dx / d) * 0.15;
    e.y += (dy / d) * 0.05;
  }
  if (e.t % 80 === 0 && e.y > 8 && random() < 0.5) {
    fireAtPlayer(e.x, e.y + 3, 1.5);
  }
}
function drawVoidling(g, e) {
  const x = Math.floor(e.x - 3), y = Math.floor(e.y - 3);
  g.fill(PAL.mag);    g.rect(x, y, 7, 7);
  g.fill(PAL.orange); g.rect(x + 1, y + 1, 5, 5);
  g.fill(PAL.cream);  g.rect(x + 3, y + 3, 1, 1);
}

// --------- Stage 4 enemy: Quantum Twin ---------
// Pair mirrored across the screen — fire synchronised shots toward player.
function makeQuantumTwin(x, y, sign) {
  return { kind: 'quantumtwin', x, y, w: 8, h: 8, hp: 2,
           vy: 0.5, t: 0, sign, baseX: x, value: 220 };
}
function updateQuantumTwin(e) {
  e.y += e.vy;
  e.x = e.baseX + Math.sin(e.t * 0.05) * 14 * e.sign;
  if (e.t % 110 === 60 && e.y > 8 && e.y < GB_H - 30) {
    fireAtPlayer(e.x, e.y + 4, 1.7);
  }
}
function drawQuantumTwin(g, e) {
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  g.fill(PAL.yellow); g.rect(x, y, 8, 8);
  g.fill(PAL.mag);    g.rect(x + 2, y + 2, 4, 4);
  g.fill(PAL.cream);  g.rect(x + 3, y + 3, 2, 2);
}

// --------- Stage 4 enemy: Phantom ---------
// Teleports periodically. Fires one shot per appearance.
function makePhantom(x, y) {
  return { kind: 'phantom', x, y, w: 8, h: 8, hp: 2,
           t: 0, alpha: 0, state: 'fade-in', stateT: 0, fired: false, value: 350 };
}
function updatePhantom(e) {
  e.stateT++;
  if (e.state === 'fade-in') {
    e.alpha = Math.min(255, e.alpha + 14);
    if (e.stateT > 24) { e.state = 'visible'; e.stateT = 0; e.fired = false; }
  } else if (e.state === 'visible') {
    if (!e.fired && e.stateT > 18) {
      fireAtPlayer(e.x, e.y + 4, 2.0);
      e.fired = true;
    }
    if (e.stateT > 50) { e.state = 'fade-out'; e.stateT = 0; }
  } else if (e.state === 'fade-out') {
    e.alpha = Math.max(0, e.alpha - 14);
    if (e.alpha <= 0) {
      e.x = random(20, GB_W - 20);
      e.y = random(20, GB_H * 0.6);
      e.state = 'fade-in';
      e.stateT = 0;
    }
  }
}
function drawPhantom(g, e) {
  if (e.alpha <= 0) return;
  // Approximate alpha via dither — draw only some pixels based on alpha
  const a = e.alpha / 255;
  const x = Math.floor(e.x - 4), y = Math.floor(e.y - 4);
  // Outer violet shell
  if (a > 0.3) { g.fill(PAL.orange); g.rect(x, y, 8, 8); }
  if (a > 0.6) { g.fill(PAL.mag);    g.rect(x + 1, y + 1, 6, 6); }
  if (a > 0.85){ g.fill(PAL.cream);  g.rect(x + 3, y + 3, 2, 2); }
}

// --------- Stage 4 final boss: The Singularity ---------
// A pulsating black hole at the centre. Phases:
//   P1 (HP > 60): pulls player toward centre, fires spiral shot pattern.
//   P2 (HP <=60): faster pull, 5-way spread on a beat.
//   P3 (HP <=30): erratic — random teleport-jumps + double spiral.
function spawnSingularity() {
  Audio.bossAppear();
  const c = voidCenter();
  boss = {
    kind: 'singularity',
    x: c.x, y: c.y,
    w: 22, h: 22,
    hp: 100, hpMax: 100,
    t: 0, phase: 1, fireT: 0, dead: false,
  };
  enemies.push(boss);
}
function updateSingularity(e) {
  e.t++;
  // Phase transitions
  if (e.hp <= 30) e.phase = 3;
  else if (e.hp <= 60) e.phase = 2;
  else e.phase = 1;

  // Wobble in place
  const c = voidCenter();
  e.x = c.x + Math.sin(e.t * 0.04) * 6;
  e.y = c.y + Math.cos(e.t * 0.05) * 3;

  // Gravitational pull on player — stronger each phase
  if (invuln <= 0) {
    const pullStrength = e.phase === 1 ? 0.12 : (e.phase === 2 ? 0.20 : 0.28);
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const d = Math.max(12, Math.hypot(dx, dy));
    player.x += (dx / d) * pullStrength;
    player.y += (dy / d) * pullStrength * 0.5;
  }

  // Fire patterns
  e.fireT++;
  if (e.phase === 1 && e.fireT % 24 === 0) {
    // Single spiral shot
    const a = e.t * 0.18;
    eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, life: 240 });
  } else if (e.phase === 2 && e.fireT % 60 === 0) {
    // 5-way spread aimed at player
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    for (let k = -2; k <= 2; k++) {
      const a = ang + k * 0.22;
      eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, life: 240 });
    }
  } else if (e.phase === 3) {
    if (e.fireT % 12 === 0) {
      const a = e.t * 0.22;
      eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 240 });
      eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a + Math.PI) * 1.5, vy: Math.sin(a + Math.PI) * 1.5, life: 240 });
    }
    // Occasional teleport-jump
    if (e.fireT % 240 === 0) {
      shake = Math.max(shake, 3);
      // brief implode/explode particles
      spark(e.x, e.y, PAL.cream, 16);
    }
  }
}
function drawSingularity(g, e) {
  // Pulse scale
  const pulse = 1 + Math.sin(e.t * 0.12) * 0.08;
  const rx = 11 * pulse, ry = 11 * pulse;
  // Outer violet halo
  g.noStroke();
  g.fill(PAL.mag);
  g.ellipse(e.x, e.y, rx * 2.2, ry * 2.2);
  // Accretion disc — cyan
  g.fill(PAL.yellow);
  g.ellipse(e.x, e.y, rx * 1.7, ry * 1.3);
  // Event horizon — pure black
  g.fill(0);
  g.ellipse(e.x, e.y, rx * 1.1, ry * 1.0);
  // Photon ring sparkle — rotates
  g.fill(PAL.cream);
  for (let i = 0; i < 3; i++) {
    const ang = singularityAngle + (i * TWO_PI / 3);
    const px = e.x + Math.cos(ang) * (rx + 1);
    const py = e.y + Math.sin(ang) * (ry + 1);
    g.rect(Math.floor(px), Math.floor(py), 1, 1);
  }
  // HP indicator: cracks form on the horizon as HP drops
  if (e.hp < e.hpMax * 0.6) {
    g.fill(PAL.orange);
    g.rect(Math.floor(e.x - 4), Math.floor(e.y), 8, 1);
  }
  if (e.hp < e.hpMax * 0.3) {
    g.fill(PAL.cream);
    g.rect(Math.floor(e.x), Math.floor(e.y - 4), 1, 8);
  }
}
