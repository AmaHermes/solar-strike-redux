// Solar Strike Redux — audio engine
// Pure Web Audio API. Chiptune SFX + a looping background track inspired by
// Solar Striker's driving, melodic vibe. No external samples.

const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let musicOn = true;
  let sfxOn = true;
  let musicTimer = null;
  let musicStep = 0;
  let musicStartTime = 0;
  let unlocked = false;       // true once iOS has truly unlocked audio
  let pendingMusic = false;   // queued music start while waiting for unlock

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.35;
    musicGain.connect(masterGain);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(masterGain);
  }

  // The canonical iOS Safari unlock pattern:
  // (1) call ctx.resume() during a user gesture, AND
  // (2) actually PLAY a tiny silent buffer source within that same gesture.
  // Without (2), some iOS versions keep audio muted even though ctx.state === 'running'.
  function resume() {
    ensure();
    if (unlocked) {
      // Even if already unlocked, a backgrounded tab may have suspended us — kick again.
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    // (1) resume the context
    if (ctx.state === 'suspended') {
      ctx.resume().then(checkUnlocked).catch(() => {});
    }
    // (2) play a 1-sample silent buffer to fully unlock iOS audio
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      if (src.start) src.start(0); else src.noteOn(0); // .noteOn is Safari < 6
    } catch (e) { /* shrug — best-effort */ }
    checkUnlocked();
  }

  function checkUnlocked() {
    if (unlocked) return;
    if (ctx && ctx.state === 'running') {
      unlocked = true;
      // If music was requested before we unlocked, start it now.
      if (pendingMusic) {
        pendingMusic = false;
        startMusic();
      }
    }
  }


  // ---------- LOW-LEVEL SYNTH ----------
  // A retro-style "voice": oscillator + amp envelope, optional pitch sweep.
  function voice({
    type = 'square',     // 'square' | 'sawtooth' | 'triangle' | 'sine'
    freq = 440,
    freqEnd = null,      // if set, linear ramp to this freq over duration
    duration = 0.1,
    attack = 0.005,
    decay = 0,
    sustain = 1.0,
    release = 0.05,
    gain = 0.3,
    when = 0,
    dest = sfxGain,
  } = {}) {
    ensure();
    const t0 = (when || ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) {
      osc.frequency.linearRampToValueAtTime(freqEnd, t0 + duration);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    const sustainLevel = gain * sustain;
    g.gain.linearRampToValueAtTime(sustainLevel, t0 + attack + decay);
    g.gain.setValueAtTime(sustainLevel, t0 + duration);
    g.gain.linearRampToValueAtTime(0, t0 + duration + release);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + duration + release + 0.02);
    return { osc, g };
  }

  // Noise burst (for explosions / hits)
  function noiseBurst({
    duration = 0.2,
    gain = 0.4,
    when = 0,
    filterStart = 4000,
    filterEnd = 200,
    dest = sfxGain,
  } = {}) {
    ensure();
    const t0 = (when || ctx.currentTime);
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterStart, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(50, filterEnd), t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter); filter.connect(g); g.connect(dest);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  // ---------- SFX ----------
  function shoot() {
    if (!sfxOn) return;
    voice({ type: 'square', freq: 1400, freqEnd: 800, duration: 0.05, gain: 0.12, release: 0.03 });
  }
  function enemyHit() {
    if (!sfxOn) return;
    voice({ type: 'square', freq: 220, freqEnd: 110, duration: 0.05, gain: 0.18 });
  }
  function enemyExplode() {
    if (!sfxOn) return;
    noiseBurst({ duration: 0.25, gain: 0.35, filterStart: 3000, filterEnd: 200 });
    voice({ type: 'sawtooth', freq: 200, freqEnd: 40, duration: 0.18, gain: 0.18 });
  }
  function playerDie() {
    if (!sfxOn) return;
    noiseBurst({ duration: 0.6, gain: 0.5, filterStart: 5000, filterEnd: 80 });
    voice({ type: 'sawtooth', freq: 400, freqEnd: 30, duration: 0.6, gain: 0.25 });
    voice({ type: 'square',   freq: 600, freqEnd: 60, duration: 0.5, gain: 0.15, when: ctx.currentTime + 0.05 });
  }
  function powerup() {
    if (!sfxOn) return;
    const t = ctx.currentTime;
    voice({ type: 'square', freq: 660,  duration: 0.06, gain: 0.18, when: t });
    voice({ type: 'square', freq: 880,  duration: 0.06, gain: 0.18, when: t + 0.06 });
    voice({ type: 'square', freq: 1100, duration: 0.06, gain: 0.18, when: t + 0.12 });
    voice({ type: 'square', freq: 1320, duration: 0.10, gain: 0.20, when: t + 0.18 });
  }
  function bossAppear() {
    if (!sfxOn) return;
    noiseBurst({ duration: 1.0, gain: 0.4, filterStart: 800, filterEnd: 60 });
    voice({ type: 'sawtooth', freq: 80, freqEnd: 50, duration: 1.0, gain: 0.3 });
  }
  function bossHit() {
    if (!sfxOn) return;
    voice({ type: 'square', freq: 120, freqEnd: 80, duration: 0.06, gain: 0.22 });
  }
  function stageClear() {
    if (!sfxOn) return;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319]; // C E G C E (up an octave)
    notes.forEach((f, i) => {
      voice({ type: 'square', freq: f, duration: 0.18, gain: 0.22, when: t + i * 0.10, release: 0.08 });
    });
  }
  function gameOver() {
    if (!sfxOn) return;
    const t = ctx.currentTime;
    const notes = [392, 349, 311, 262]; // G F D# C — sad descent
    notes.forEach((f, i) => {
      voice({ type: 'square', freq: f, duration: 0.25, gain: 0.22, when: t + i * 0.18, release: 0.1 });
    });
  }

  // ---------- MUSIC ----------
  // Driving chiptune in A minor, ~140 BPM. Lead arp + bass + light kick.
  // Pattern is 16 sixteenth-notes per bar, 4 bars per loop.
  const BPM = 140;
  const SIXTEENTH = 60 / BPM / 4; // seconds per 16th

  // Note frequencies (A minor pentatonic-ish + tension notes)
  const N = {
    A3: 220.00, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
    A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
    G5: 783.99, A5: 880.00,
    A2: 110.00, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
  };

  // Lead: 64 sixteenths. '.' = rest.  A driving, soaring melody.
  // Inspired by the Solar Striker stage 1 vibe — fast 16ths over a minor key.
  const LEAD = [
    'A4','E5','A4','E5', 'C5','E5','A4','E5',  'B4','E5','B4','E5', 'D5','F5','B4','E5',
    'A4','E5','A4','E5', 'C5','E5','A4','E5',  'G4','D5','G4','D5', 'B4','D5','G4','D5',
    'A4','E5','A4','E5', 'C5','E5','A4','E5',  'F4','C5','F4','C5', 'A4','C5','F4','C5',
    'E5','G5','E5','G5', 'A5','G5','E5','G5',  'D5','F5','D5','F5', 'B4','D5','G5','E5',
  ];
  // Bass: 16 quarter-notes (every 4 sixteenths).
  const BASS = ['A2','A2','E3','E3', 'A2','A2','G3','G3', 'F3','F3','C3','C3', 'E3','E3','A2','E3'];
  // Kick: hits on every quarter note (sixteenths 0,4,8,12 of each bar).
  // Snare-ish hat: on every 2nd & 4th quarter.

  function startMusic() {
    if (!musicOn || musicTimer) return;
    ensure();
    // On mobile, the context may not be unlocked yet on the very first tap.
    // Queue the start so it kicks off the moment ctx hits 'running'.
    if (!unlocked) {
      pendingMusic = true;
      return;
    }
    musicStartTime = ctx.currentTime + 0.1;
    musicStep = 0;
    scheduleAhead();
    musicTimer = setInterval(scheduleAhead, 100);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // Look-ahead scheduler: schedule notes for the next ~0.3s
  function scheduleAhead() {
    if (!ctx) return;
    const now = ctx.currentTime;
    while (musicStartTime + musicStep * SIXTEENTH < now + 0.3) {
      const t = musicStartTime + musicStep * SIXTEENTH;
      const stepInLoop = musicStep % LEAD.length;

      // Lead
      const leadNote = LEAD[stepInLoop];
      if (leadNote !== '.') {
        voice({
          type: 'square', freq: N[leadNote],
          duration: SIXTEENTH * 0.85, gain: 0.10,
          attack: 0.003, release: 0.02, when: t, dest: musicGain,
        });
        // octave-up shimmer every other beat
        if (stepInLoop % 4 === 0) {
          voice({
            type: 'triangle', freq: N[leadNote] * 2,
            duration: SIXTEENTH * 0.6, gain: 0.04,
            attack: 0.005, release: 0.02, when: t, dest: musicGain,
          });
        }
      }

      // Bass every quarter (every 4 sixteenths)
      if (stepInLoop % 4 === 0) {
        const bassIdx = Math.floor(stepInLoop / 4) % BASS.length;
        const bassNote = BASS[bassIdx];
        voice({
          type: 'triangle', freq: N[bassNote],
          duration: SIXTEENTH * 3.5, gain: 0.20,
          attack: 0.005, release: 0.05, when: t, dest: musicGain,
        });
      }

      // Kick on every quarter
      if (stepInLoop % 4 === 0) {
        voice({
          type: 'sine', freq: 110, freqEnd: 40,
          duration: 0.06, gain: 0.30,
          attack: 0.001, release: 0.03, when: t, dest: musicGain,
        });
      }
      // Hi-hat-ish noise on the off-beats (8 & 12)
      if (stepInLoop % 4 === 2) {
        noiseBurst({ duration: 0.04, gain: 0.06, filterStart: 8000, filterEnd: 4000, when: t, dest: musicGain });
      }

      musicStep++;
    }
  }

  // ---------- CONTROLS ----------
  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn) startMusic(); else stopMusic();
    return musicOn;
  }
  function toggleSFX() {
    sfxOn = !sfxOn;
    return sfxOn;
  }

  return {
    resume, shoot, enemyHit, enemyExplode, playerDie, powerup,
    bossAppear, bossHit, stageClear, gameOver,
    startMusic, stopMusic, toggleMusic, toggleSFX,
    get musicOn() { return musicOn; },
    get sfxOn()   { return sfxOn;   },
  };
})();

// ===== iOS / Mobile audio unlock — belt & braces =====
// Attach one-shot unlock handlers at document level so we catch the FIRST
// real user gesture regardless of where it lands (touchstart, touchend,
// mousedown, keydown, click). Once unlocked, listeners self-remove.
(function attachAudioUnlock() {
  const events = ['touchstart', 'touchend', 'mousedown', 'click', 'keydown'];
  function unlock() {
    if (typeof Audio !== 'undefined') Audio.resume();
    // give iOS one tick to actually flip ctx.state, then unbind
    setTimeout(() => {
      events.forEach(ev => document.removeEventListener(ev, unlock, true));
    }, 0);
  }
  events.forEach(ev => document.addEventListener(ev, unlock, true));

  // Also re-resume audio if the tab comes back from background (iOS suspends
  // the context when you switch apps; without this, audio just dies silently).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && typeof Audio !== 'undefined') {
      Audio.resume();
    }
  });
})();
