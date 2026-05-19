/**
 * PLINKO DROP — game.js
 * Physics-based Plinko game using Matter.js
 * Canvas: 480 x 700, scales with CSS for mobile
 */

'use strict';

// ─────────────────────────────────────────────
// SECTION 1: Constants & Config
// ─────────────────────────────────────────────
const CANVAS_W = 480;
const CANVAS_H = 700;

const SLOT_VALUES  = [50, 100, 200, 500, 1000, 500, 200, 100, 50];
const SLOT_COUNT   = SLOT_VALUES.length;
const SLOT_HEIGHT  = 52;
const SLOT_Y       = CANVAS_H - SLOT_HEIGHT;

const PEG_ROWS      = 10;
const PEG_SPACING_Y = 42;
const PEG_RADIUS    = 6;
const PEG_START_Y   = 110;

const BALL_RADIUS   = 12;
const BALL_START_Y  = 40;
const BALLS_START   = 5;

// ─────────────────────────────────────────────
// SECTION 2: Game State
// ─────────────────────────────────────────────
let state = {
  score: 0,
  highScore: parseInt(localStorage.getItem('plinko_hs') || '0', 10),
  ballsRemaining: BALLS_START,
  ballInPlay: false,
  ballBody: null,
  ballTrail: [],          // [{x, y}]
  floatingTexts: [],      // {x, y, text, color, life, maxLife}
  slotFlash: null,        // {index, timer}
  comboCount: 0,
  comboTimer: 0,
  bombSlot: -1,
  lastAimX: CANVAS_W / 2,
  isFirstBall: true,
  gameActive: false,
  slotBodies: [],         // Matter.js sensor bodies, parallel to SLOT_VALUES
};

// ─────────────────────────────────────────────
// SECTION 3: Matter.js Setup
// ─────────────────────────────────────────────
const { Engine, Render, Runner, Bodies, Body, World, Events, Composite } = Matter;

let engine, runner, matterRender;
let pegBodies = [];

function initPhysics() {
  // Destroy existing engine/runner if restarting
  if (engine) {
    Runner.stop(runner);
    World.clear(engine.world);
    Engine.clear(engine);
  }

  engine = Engine.create();
  engine.gravity.y = 2.5;

  runner = Runner.create();
  Runner.run(runner, engine);

  buildWorld();
}

function buildWorld() {
  World.clear(engine.world);
  pegBodies = [];
  state.slotBodies = [];

  // ── Walls ──
  const wallOpts = { isStatic: true, friction: 0, restitution: 0.3, render: { visible: false } };
  const wallThick = 20;
  World.add(engine.world, [
    Bodies.rectangle(CANVAS_W / 2, CANVAS_H + wallThick / 2, CANVAS_W + 40, wallThick, wallOpts), // floor
    Bodies.rectangle(-wallThick / 2, CANVAS_H / 2, wallThick, CANVAS_H * 2, wallOpts),             // left
    Bodies.rectangle(CANVAS_W + wallThick / 2, CANVAS_H / 2, wallThick, CANVAS_H * 2, wallOpts),   // right
  ]);

  // ── Pegs ──
  const pegOpts = {
    isStatic: true,
    restitution: 0.5,
    friction: 0,
    frictionAir: 0,
    label: 'peg',
    render: { visible: false },
  };

  for (let row = 0; row < PEG_ROWS; row++) {
    const pegsInRow = row + 3;
    const totalWidth = (pegsInRow - 1) * PEG_SPACING_Y;
    const startX = (CANVAS_W - totalWidth) / 2;
    const y = PEG_START_Y + row * PEG_SPACING_Y;

    for (let col = 0; col < pegsInRow; col++) {
      const x = startX + col * PEG_SPACING_Y;
      const peg = Bodies.circle(x, y, PEG_RADIUS, pegOpts);
      pegBodies.push({ body: peg, x, y });
      World.add(engine.world, peg);
    }
  }

  // ── Scoring Slots (sensors) ──
  const slotWidth = CANVAS_W / SLOT_COUNT;

  for (let i = 0; i < SLOT_COUNT; i++) {
    const cx = slotWidth * i + slotWidth / 2;
    const cy = SLOT_Y + SLOT_HEIGHT / 2;
    const slotBody = Bodies.rectangle(cx, cy, slotWidth - 2, SLOT_HEIGHT, {
      isStatic: true,
      isSensor: true,
      label: `slot_${i}`,
      render: { visible: false },
    });
    state.slotBodies.push(slotBody);
    World.add(engine.world, slotBody);
  }

  // ── Slot dividers (solid walls between slots) ──
  const slotDivOpts = { isStatic: true, friction: 0, restitution: 0.2, render: { visible: false } };
  for (let i = 0; i <= SLOT_COUNT; i++) {
    const x = i * slotWidth;
    World.add(engine.world, Bodies.rectangle(x, SLOT_Y + SLOT_HEIGHT / 2, 2, SLOT_HEIGHT, slotDivOpts));
  }

  // ── Collision Events ──
  Events.on(engine, 'collisionStart', onCollision);
}

// ─────────────────────────────────────────────
// SECTION 4: Collision Handling
// ─────────────────────────────────────────────
function onCollision(event) {
  if (!state.ballBody || !state.gameActive) return;

  const pairs = event.pairs;
  for (const pair of pairs) {
    const { bodyA, bodyB } = pair;
    const other = bodyA === state.ballBody ? bodyB : (bodyB === state.ballBody ? bodyA : null);
    if (!other) continue;

    // Ball hit a slot sensor
    if (other.label && other.label.startsWith('slot_')) {
      const idx = parseInt(other.label.split('_')[1], 10);
      handleSlotLand(idx);
      break;
    }

    // Ball hit a peg — play sound
    if (other.label === 'peg') {
      playSound('peg');
    }
  }
}

function handleSlotLand(slotIndex) {
  if (!state.ballInPlay) return;

  const isBomb = slotIndex === state.bombSlot;
  const baseValue = SLOT_VALUES[slotIndex];
  const isJackpot = baseValue === 1000;
  const points = isBomb ? -300 : baseValue;

  state.score = Math.max(0, state.score + points);
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('plinko_hs', state.highScore);
  }

  // Combo system
  if (points > 200 && !isBomb) {
    state.comboCount++;
    if (state.comboCount >= 3) {
      state.comboTimer = 1.5;
    }
  } else {
    state.comboCount = 0;
  }

  // Floating score text
  const slotWidth = CANVAS_W / SLOT_COUNT;
  const fx = slotIndex * slotWidth + slotWidth / 2;
  const fy = SLOT_Y - 10;
  const label = isBomb ? 'BOMB! -300' : (isJackpot ? '⭐ JACKPOT!' : `+${baseValue}`);
  const color = isBomb ? '#ff2060' : (isJackpot ? '#ffd700' : '#00f5ff');

  state.floatingTexts.push({ x: fx, y: fy, text: label, color, life: 1.0, maxLife: 1.0 });

  // Slot flash
  state.slotFlash = { index: slotIndex, timer: 0.3 };

  // Update HUD
  updateHUD();
  playSound(isBomb ? 'bomb' : (isJackpot ? 'jackpot' : 'land'));

  // Remove ball
  if (state.ballBody) {
    World.remove(engine.world, state.ballBody);
    state.ballBody = null;
  }
  state.ballInPlay = false;
  state.ballTrail = [];

  // Check game over
  if (state.ballsRemaining <= 0) {
    setTimeout(showGameOver, 800);
  } else {
    enableDropButton(true);
  }
}

// ─────────────────────────────────────────────
// SECTION 5: Ball Dropping
// ─────────────────────────────────────────────
function dropBall(aimX) {
  if (!state.gameActive || state.ballInPlay || state.ballsRemaining <= 0) return;

  // First-ball assist: bias toward center jackpot slot
  let x = aimX;
  if (state.isFirstBall) {
    x = x + (CANVAS_W / 2 - x) * 0.7;
    state.isFirstBall = false;
  }

  // Small random offset
  x += (Math.random() - 0.5) * 16;
  x = Math.max(BALL_RADIUS + 10, Math.min(CANVAS_W - BALL_RADIUS - 10, x));

  const ballOpts = {
    restitution: 0.3,
    friction: 0,
    frictionAir: 0.01,
    label: 'ball',
    render: { visible: false },
  };

  state.ballBody = Bodies.circle(x, BALL_START_Y, BALL_RADIUS, ballOpts);
  World.add(engine.world, state.ballBody);

  state.ballInPlay = true;
  state.ballTrail = [];
  state.ballsRemaining--;

  updateHUD();
  enableDropButton(false);
}

// ─────────────────────────────────────────────
// SECTION 6: Canvas Rendering
// ─────────────────────────────────────────────
let canvas, ctx;
let lastTime = 0;

function initCanvas() {
  canvas = document.getElementById('gameCanvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // Input events
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchend', onCanvasTouch, { passive: false });
  canvas.addEventListener('mousemove', onMouseMove);

  requestAnimationFrame(renderLoop);
}

function onCanvasClick(e) {
  if (!state.gameActive) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const x = (e.clientX - rect.left) * scaleX;
  state.lastAimX = x;
  dropBall(x);
}

function onCanvasTouch(e) {
  if (!state.gameActive) return;
  e.preventDefault();
  const touch = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const x = (touch.clientX - rect.left) * scaleX;
  state.lastAimX = x;
  dropBall(x);
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  state.lastAimX = (e.clientX - rect.left) * scaleX;
}

function renderLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;

  if (state.gameActive) {
    update(dt);
  }

  draw();
  requestAnimationFrame(renderLoop);
}

function update(dt) {
  // Update ball trail
  if (state.ballBody) {
    const { x, y } = state.ballBody.position;
    state.ballTrail.unshift({ x, y });
    if (state.ballTrail.length > 12) state.ballTrail.pop();

    // Safety: remove if ball falls below canvas
    if (y > CANVAS_H + 60) {
      World.remove(engine.world, state.ballBody);
      state.ballBody = null;
      state.ballInPlay = false;
      state.ballTrail = [];
      if (state.ballsRemaining <= 0) {
        setTimeout(showGameOver, 400);
      } else {
        enableDropButton(true);
      }
    }
  }

  // Floating texts
  state.floatingTexts = state.floatingTexts.filter(ft => {
    ft.y -= 55 * dt;
    ft.life -= dt;
    return ft.life > 0;
  });

  // Slot flash timer
  if (state.slotFlash) {
    state.slotFlash.timer -= dt;
    if (state.slotFlash.timer <= 0) state.slotFlash = null;
  }

  // Combo timer
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
  }
}

function draw() {
  ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 1. Background
  drawBackground();

  // 2. Aim guide
  if (state.gameActive && !state.ballInPlay && state.ballsRemaining > 0) {
    drawAimGuide();
  }

  // 3. Slot rectangles
  drawSlots();

  // 4. Pegs with glow
  drawPegs();

  // 5. Ball trail
  drawBallTrail();

  // 6. Ball
  drawBall();

  // 7. Floating score texts
  drawFloatingTexts();

  // 8. Combo text
  if (state.comboTimer > 0) {
    drawComboText();
  }
}

// ── Draw Helpers ──

function drawBackground() {
  // Dark fill
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(0,245,255,0.04)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x <= CANVAS_W; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SLOT_Y); ctx.stroke();
  }
  for (let y = 0; y <= SLOT_Y; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }
}

function drawAimGuide() {
  const x = Math.max(BALL_RADIUS + 10, Math.min(CANVAS_W - BALL_RADIUS - 10, state.lastAimX));
  ctx.save();
  ctx.strokeStyle = 'rgba(0,245,255,0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(x, BALL_START_Y + BALL_RADIUS);
  ctx.lineTo(x, 80);
  ctx.stroke();
  ctx.setLineDash([]);

  // Aim circle
  ctx.strokeStyle = 'rgba(0,245,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, BALL_START_Y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSlots() {
  const slotWidth = CANVAS_W / SLOT_COUNT;

  for (let i = 0; i < SLOT_COUNT; i++) {
    const x = i * slotWidth;
    const val = SLOT_VALUES[i];
    const isBomb = i === state.bombSlot;
    const isJackpot = val === 1000;
    const isFlashing = state.slotFlash && state.slotFlash.index === i;

    // Slot background color
    let fillColor;
    if (isFlashing) {
      fillColor = 'rgba(255,255,255,0.9)';
    } else if (isBomb) {
      fillColor = 'rgba(255,32,96,0.7)';
    } else if (isJackpot) {
      fillColor = 'rgba(255,215,0,0.7)';
    } else if (val >= 200) {
      fillColor = 'rgba(0,180,216,0.65)';
    } else {
      fillColor = 'rgba(30,30,60,0.8)';
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(x + 1, SLOT_Y, slotWidth - 2, SLOT_HEIGHT);

    // Slot border glow
    if (isJackpot) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ffd700';
    } else if (isBomb) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff2060';
    } else {
      ctx.shadowBlur = 0;
    }

    // Slot label
    const label = isBomb ? 'BOMB' : (isJackpot ? '★' : `${val}`);
    ctx.shadowBlur = 0;
    ctx.fillStyle = isFlashing ? '#000' : '#fff';
    ctx.font = `bold ${isJackpot ? 13 : 11}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + slotWidth / 2, SLOT_Y + SLOT_HEIGHT / 2 - 6);

    // Value sub-label
    if (!isBomb && !isJackpot) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.fillText(`${val}`, x + slotWidth / 2, SLOT_Y + SLOT_HEIGHT / 2 + 10);
    }
    if (isJackpot) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.fillText('1000', x + slotWidth / 2, SLOT_Y + SLOT_HEIGHT / 2 + 11);
    }

    // Divider lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, SLOT_Y);
    ctx.lineTo(x, SLOT_Y + SLOT_HEIGHT);
    ctx.stroke();
  }

  // Top border of slot area
  ctx.strokeStyle = 'rgba(0,245,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, SLOT_Y);
  ctx.lineTo(CANVAS_W, SLOT_Y);
  ctx.stroke();
}

function drawPegs() {
  for (const { x, y } of pegBodies) {
    ctx.save();
    // Outer glow
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00f5ff';
    // Peg fill
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    // Inner highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBallTrail() {
  if (state.ballTrail.length < 2) return;
  for (let i = 0; i < state.ballTrail.length; i++) {
    const { x, y } = state.ballTrail[i];
    const alpha = (1 - i / state.ballTrail.length) * 0.3;
    const radius = BALL_RADIUS * (1 - i / state.ballTrail.length) * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(radius, 2), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,215,0,${alpha})`;
    ctx.fill();
  }
}

function drawBall() {
  if (!state.ballBody) return;
  const { x, y } = state.ballBody.position;

  ctx.save();
  // Outer glow
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#ffd700';

  // Gold gradient
  const grad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, BALL_RADIUS);
  grad.addColorStop(0, '#ffe066');
  grad.addColorStop(0.5, '#ffd700');
  grad.addColorStop(1, '#ff8c00');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Shine
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x - 3, y - 3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFloatingTexts() {
  for (const ft of state.floatingTexts) {
    const alpha = Math.min(ft.life / ft.maxLife * 2, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 16px Orbitron, sans-serif';
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 12;
    ctx.shadowColor = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

function drawComboText() {
  const alpha = Math.min(state.comboTimer * 2, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 28px Orbitron, sans-serif';
  ctx.fillStyle = '#ff6b00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#ff6b00';
  ctx.fillText('🔥 ON FIRE!', CANVAS_W / 2, CANVAS_H / 2 - 60);
  ctx.restore();
}

// ─────────────────────────────────────────────
// SECTION 7: Audio (Web Audio API)
// ─────────────────────────────────────────────
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'peg':
        osc.frequency.setValueAtTime(440 + Math.random() * 200, ctx.currentTime);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
        break;
      case 'land':
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;
      case 'jackpot': {
        const freqs = [523, 659, 784, 1047];
        freqs.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = f;
          o.type = 'sine';
          g.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
          g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.1 + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
          o.start(ctx.currentTime + i * 0.1);
          o.stop(ctx.currentTime + i * 0.1 + 0.4);
        });
        break;
      }
      case 'bomb':
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.3);
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
        break;
    }
  } catch (e) {
    // Audio not supported or blocked — silently ignore
  }
}

// ─────────────────────────────────────────────
// SECTION 8: HUD & UI Updates
// ─────────────────────────────────────────────
function updateHUD() {
  document.getElementById('scoreDisplay').textContent   = state.score.toLocaleString();
  document.getElementById('highScoreDisplay').textContent = state.highScore.toLocaleString();
  document.getElementById('ballsDisplay').textContent   = state.ballsRemaining;
}

function enableDropButton(enabled) {
  const btn = document.getElementById('dropBtn');
  btn.disabled = !enabled;
}

// ─────────────────────────────────────────────
// SECTION 9: Game Flow
// ─────────────────────────────────────────────
function startGame() {
  // Reset state
  state.score          = 0;
  state.ballsRemaining = BALLS_START;
  state.ballInPlay     = false;
  state.ballBody       = null;
  state.ballTrail      = [];
  state.floatingTexts  = [];
  state.slotFlash      = null;
  state.comboCount     = 0;
  state.comboTimer     = 0;
  state.isFirstBall    = true;
  state.gameActive     = true;
  state.lastAimX       = CANVAS_W / 2;

  // Pick random bomb slot
  state.bombSlot = Math.floor(Math.random() * SLOT_COUNT);

  // Rebuild physics world
  initPhysics();

  updateHUD();
  enableDropButton(true);

  // Hide overlays
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
}

function showGameOver() {
  state.gameActive = false;
  enableDropButton(false);

  // Save high score
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('plinko_hs', state.highScore);
  }

  document.getElementById('finalScore').textContent = state.score.toLocaleString();
  document.getElementById('finalHigh').textContent  = state.highScore.toLocaleString();
  document.getElementById('gameOverScreen').classList.remove('hidden');
}

// ─────────────────────────────────────────────
// SECTION 10: Event Wiring
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();

  // High score init
  document.getElementById('highScoreDisplay').textContent = state.highScore.toLocaleString();

  document.getElementById('playBtn').addEventListener('click', () => {
    // Unlock AudioContext on first user gesture
    try { getAudioCtx().resume(); } catch(e) {}
    startGame();
  });

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    try { getAudioCtx().resume(); } catch(e) {}
    startGame();
  });

  document.getElementById('dropBtn').addEventListener('click', () => {
    dropBall(state.lastAimX);
  });

  // Init physics silently (no game active yet)
  initPhysics();
});
