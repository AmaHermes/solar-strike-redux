// Solar Strike Redux — v0.3
// Internal res: 160x144 (Game Boy native), scaled 4x.
// Adds: enemies, waves, enemy bullets, power-ups, boss, particles, screenshake,
// hit-pause, score, lives, game over, restart.

const GB_W = 160;
const GB_H = 144;
const SCALE = 4;

const PAL = {
  sky:    '#1a0b2e',
  mag:    '#7a1e6e',
  orange: '#e85d2c',
  yellow: '#f5c26b',
  cream:  '#fff4dc',
};

// ---------- GLOBAL STATE ----------
let buffer;
let state = 'title';   // 'title' | 'play' | 'gameover' | 'win'
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

const player = {
  x: GB_W / 2,
  y: GB_H - 24,
  w: 8, h: 8,
  speed: 1.3,
  fireCooldown: 0,
  fireRate: 9,
  power: 1, // 1=single, 2=twin, 3=triple-spread
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

  if (state === 'title')    updateTitle();
  if (state === 'play')     updatePlay();
  if (state === 'gameover') updateGameOver();
  if (state === 'win')      updateWin();

  drawScene();
}

function keyPressed() {
  Audio.resume(); // unlock audio context on first input
  if (key === 'm' || key === 'M') { Audio.toggleMusic(); return; }
  if (key === 'n' || key === 'N') { Audio.toggleSFX();   return; }
  if ((state === 'title' || state === 'gameover' || state === 'win') &&
      (key === ' ' || key === 'Enter' || keyCode === 13)) {
    resetGame();
    state = 'play';
    Audio.startMusic();
  }
}

// ---------- INIT / RESET ----------
function initStars() {
  stars.length = 0;
  for (let i = 0; i < 50; i++) {
    stars.push({ x: random(GB_W), y: random(GB_H), speed: random([0.3, 0.6, 1.1]) });
  }
}
function resetGame() {
  score = 0; lives = 3; stageTime = 0; bossSpawned = false;
  boss = null; shake = 0; hitPauseFrames = 0; invuln = 60;
  bullets.length = 0; eBullets.length = 0; enemies.length = 0;
  particles.length = 0; powerups.length = 0;
  player.x = GB_W / 2; player.y = GB_H - 24;
  player.power = 1; player.fireCooldown = 0;
}

// ---------- TITLE / GAMEOVER / WIN UPDATES ----------
function updateTitle()    { updateStars(); }
function updateGameOver() { updateStars(); updateParticles(); }
function updateWin()      { updateStars(); updateParticles(); }

// ---------- MAIN PLAY UPDATE ----------
function updatePlay() {
  stageTime++;
  updateStars();
  updatePlayer();
  updateBullets();
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
    state = 'win';
    Audio.stopMusic();
    Audio.stageClear();
  }
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
    }

    // remove off-bottom
    if (e.y > GB_H + 16 || e.x < -20 || e.x > GB_W + 20) {
      if (e.kind === 'boss') continue;
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
    if (e.kind === 'drone')  drawDrone(g, e);
    if (e.kind === 'weaver') drawWeaver(g, e);
    if (e.kind === 'diver')  drawDiver(g, e);
    if (e.kind === 'boss')   drawBoss(g, e);
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
  if (random() < chance) powerups.push({ x, y, vy: 0.6, t: 0 });
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
    g.fill(pulse ? PAL.cream : PAL.yellow);
    g.rect(Math.floor(p.x - 3), Math.floor(p.y - 3), 6, 6);
    g.fill(PAL.orange);
    g.rect(Math.floor(p.x - 1), Math.floor(p.y - 2), 2, 4);
    g.rect(Math.floor(p.x - 2), Math.floor(p.y - 1), 4, 2);
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
        e.hp -= 1;
        spark(b.x, b.y, PAL.cream, 3);
        if (e.hp <= 0) {
          if (e.kind === 'boss') { e.dead = true; }
          else {
            score += e.value || 50;
            spark(e.x, e.y, PAL.orange, 8);
            spark(e.x, e.y, PAL.yellow, 4);
            maybeDropPowerup(e.x, e.y, e.kind === 'weaver' ? 0.12 : 0.05);
            shake = Math.max(shake, 2);
            hitPauseFrames = 1;
            Audio.enemyExplode();
            enemies.splice(j, 1);
          }
        } else {
          if (e.kind === 'boss') { shake = Math.max(shake, 1.5); Audio.bossHit(); }
          else { Audio.enemyHit(); }
        }
        break;
      }
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
      if (player.power < 3) player.power++;
      else score += 500;
      spark(player.x, player.y, PAL.cream, 10);
      Audio.powerup();
    }
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
  drawStars(buffer);

  if (state === 'play' || state === 'gameover' || state === 'win') {
    drawEnemies(buffer);
    drawPowerups(buffer);
    drawBullets(buffer);
    drawEBullets(buffer);
    if (state !== 'gameover') drawPlayer(buffer);
    drawParticles(buffer);
    drawHUD(buffer);
  }

  if (state === 'title')    drawTitleOverlay(buffer);
  if (state === 'gameover') drawGameOverOverlay(buffer);
  if (state === 'win')      drawWinOverlay(buffer);

  // upscale with screenshake (disabled on victory — pilot deserves a still moment)
  const allowShake = (state !== 'win');
  const sx = (allowShake && shake > 0.1) ? (random(-shake, shake)) : 0;
  const sy = (allowShake && shake > 0.1) ? (random(-shake, shake)) : 0;
  background(PAL.sky);
  image(buffer, sx * SCALE, sy * SCALE, width, height);
}

function drawTitleOverlay(g) {
  g.fill(PAL.cream); g.textFont('monospace');
  g.textSize(14); g.text('SOLAR STRIKE', 28, 50);
  g.fill(PAL.orange);
  g.textSize(8); g.text('STAGE 1: SUNSET RUN', 24, 70);
  g.fill(PAL.yellow);
  if (frameCount % 60 < 40) g.text('PRESS SPACE TO START', 22, 100);
  g.fill(PAL.mag); g.textSize(6);
  g.text('ARROWS/WASD MOVE - AUTOFIRE', 18, 130);
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
  g.fill(PAL.yellow); g.textFont('monospace');
  g.textSize(14); g.text('STAGE 1', 50, 50);
  g.textSize(10); g.text('CLEAR!', 56, 66);
  g.fill(PAL.cream); g.textSize(8);
  g.text('SCORE ' + String(score).padStart(6, '0'), 44, 88);
  g.fill(PAL.orange);
  if (frameCount % 60 < 40) g.text('SPACE TO REPLAY', 36, 110);
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
