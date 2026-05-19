/**
 * PLINKO DROP — game.js
 * Physics-based Plinko game using Matter.js
 */

'use strict';

// ─────────────────────────────────────────────
// SECTION 1: Constants & Config
// ─────────────────────────────────────────────
const CANVAS_W = 480;
const CANVAS_H = 700;

const SUPER_JACKPOT_VALUE = 2000;
const BASE_SLOT_VALUES = [50, 100, 200, 500, SUPER_JACKPOT_VALUE, 500, 200, 100, 50];
const SLOT_COUNT   = BASE_SLOT_VALUES.length;
const SLOT_HEIGHT  = 52;
const SLOT_Y       = CANVAS_H - SLOT_HEIGHT;

const SUPER_JACKPOT_IDX = 4;

const PEG_ROWS      = 10;
const PEG_SPACING_Y = 42;
const PEG_RADIUS    = 6;
const PEG_START_Y   = 110;

const BALL_RADIUS  = 12;
const BALL_START_Y = 40;
const BALLS_START  = 5;

// ─────────────────────────────────────────────
// SECTION 2: Player Identity
// ─────────────────────────────────────────────
const NAME_ADJ  = ['Neon','Swift','Golden','Lucky','Cosmic','Hyper','Blazing','Sonic','Epic','Cyber','Turbo','Dark','Mega','Ultra'];
const NAME_NOUN = ['Dropper','Plinker','Hunter','Chaser','Striker','Blaster','Wizard','Master','Ace','Pro','King','Star'];

function getPlayerId() {
  let id = localStorage.getItem('plinko_player_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('plinko_player_id', id);
  }
  return id;
}

function generatePlayerName(id) {
  const hash = id.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const adj  = NAME_ADJ [hash % NAME_ADJ.length];
  const noun = NAME_NOUN[Math.floor(hash / NAME_ADJ.length) % NAME_NOUN.length];
  return adj + noun;
}

function getPlayerName() {
  let name = localStorage.getItem('plinko_player_name');
  if (!name) {
    name = generatePlayerName(getPlayerId());
    localStorage.setItem('plinko_player_name', name);
  }
  return name;
}

function setPlayerName(name) {
  const safe = name.trim().slice(0, 20) || generatePlayerName(getPlayerId());
  localStorage.setItem('plinko_player_name', safe);
  return safe;
}

// ─────────────────────────────────────────────
// SECTION 3: Game State
// ─────────────────────────────────────────────
let SLOT_VALUES = [...BASE_SLOT_VALUES];

let state = {
  score: 0,
  highScore: parseInt(localStorage.getItem('plinko_hs') || '0', 10),
  ballsRemaining: BALLS_START,
  ballInPlay: false,
  ballBody: null,
  ballBody2: null,
  ballTrail: [],
  ballTrail2: [],
  ballsInPlay: 0,
  currentDropIsMulti: false,
  floatingTexts: [],
  slotFlash: null,
  comboCount: 0,
  comboTimer: 0,
  bombSlot: -1,
  criticalSlot: -1,
  lastAimX: CANVAS_W / 2,
  isFirstBall: true,
  gameActive: false,
  slotBodies: [],

  multiplier: 1,
  multiplierTimer: 0,
  luckyMode: false,
  luckyBanner: 0,
  slowMotion: 0,
  screenShake: 0,
  nearMissTimer: 0,
  criticalPulse: 0,
  superPulse: 0,

  // Juice
  particles: [],
  impactWaves: [],
  slotBounce: new Array(SLOT_COUNT).fill(0),
  screenFlash: 0,
  screenFlashColor: '255,255,255',
  pegHits: [],

  multiBallOn: false,
  movingBonus: null,
  ambientMotes: [],
  ambientMoteTimer: 0,

  // Daily
  isDailyMode: false,
  dailyConfig: null,
  dailyBallResults: [],
  dailyBonusMult: 1,
};

// ─────────────────────────────────────────────
// SECTION 4: Daily Challenge System
// ─────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDayNumber() {
  const epoch = new Date('2024-01-01T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today - epoch) / 86400000) + 1);
}

function getDailyDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function isDailyPlayed() {
  return localStorage.getItem('plinko_daily_date') === getDailyDateKey();
}

function saveDailyResult(score, emojiStr, target) {
  localStorage.setItem('plinko_daily_date',   getDailyDateKey());
  localStorage.setItem('plinko_daily_score',  score);
  localStorage.setItem('plinko_daily_emojis', emojiStr);
  localStorage.setItem('plinko_daily_target', target);
}

function getDailySavedResult() {
  return {
    score:  parseInt(localStorage.getItem('plinko_daily_score')  || '0', 10),
    emojis: localStorage.getItem('plinko_daily_emojis') || '',
    target: parseInt(localStorage.getItem('plinko_daily_target') || '0', 10),
  };
}

function getDailyConfig() {
  const dayNum = getDayNumber();
  const rng    = mulberry32(dayNum * 1000003);

  const others = BASE_SLOT_VALUES.filter((_, i) => i !== SUPER_JACKPOT_IDX);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const dailySlotValues = [...others];
  dailySlotValues.splice(SUPER_JACKPOT_IDX, 0, SUPER_JACKPOT_VALUE);

  let bombSlot;
  do { bombSlot = Math.floor(rng() * SLOT_COUNT); } while (bombSlot === SUPER_JACKPOT_IDX);

  let critSlot;
  do { critSlot = Math.floor(rng() * SLOT_COUNT); } while (critSlot === SUPER_JACKPOT_IDX || critSlot === bombSlot);

  const target    = 2000 + Math.floor(rng() * 3501);
  const bonusMult = rng() < 0.4 ? 2.0 : 1.5;

  return { dayNum, dailySlotValues, bombSlot, critSlot, target, bonusMult };
}

function getBallResultEmoji(slotIndex, points) {
  if (slotIndex === state.bombSlot)    return '🔴';
  if (slotIndex === SUPER_JACKPOT_IDX) return '🟣';
  if (points >= 500 * state.dailyBonusMult) return '🟡';
  if (points >= 200 * state.dailyBonusMult) return '🔵';
  return '⬜';
}

// ─────────────────────────────────────────────
// SECTION 5: Leaderboard API
// ─────────────────────────────────────────────
async function submitDailyScore(dayNumber, score, target, emojis) {
  try {
    const res = await fetch('/api/daily/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dayNumber,
        playerId:   getPlayerId(),
        playerName: getPlayerName(),
        score, target, emojis,
      }),
    });
    const data = await res.json();
    return data.rank || null;
  } catch (e) {
    console.warn('Submit failed:', e);
    return null;
  }
}

async function fetchLeaderboard(dayNumber) {
  try {
    const res  = await fetch(`/api/daily/leaderboard/${dayNumber}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.warn('Leaderboard fetch failed:', e);
    return { entries: [], total: 0 };
  }
}

// Render leaderboard entries into a container element
function renderLeaderboard(listEl, footerEl, data, highlightPlayerId) {
  const { entries, total } = data;

  if (!entries || entries.length === 0) {
    listEl.innerHTML = '<div class="lb-loading">No scores yet today — be the first to play!</div>';
    if (footerEl) footerEl.textContent = '';
    return;
  }

  const myName = getPlayerName();

  listEl.innerHTML = entries.map(e => {
    const isMe     = highlightPlayerId && e.player_name === myName;
    const rankNum  = parseInt(e.rank, 10);
    const rankCls  = rankNum === 1 ? 'top1' : rankNum === 2 ? 'top2' : rankNum === 3 ? 'top3' : '';
    const beat     = parseInt(e.score, 10) >= parseInt(e.target, 10);
    const medal    = rankNum === 1 ? '🥇' : rankNum === 2 ? '🥈' : rankNum === 3 ? '🥉' : `#${rankNum}`;

    return `<div class="lb-entry${isMe ? ' me' : ''}">
      <span class="lb-rank ${rankCls}">${medal}</span>
      <span class="lb-name">${escapeHtml(e.player_name)}</span>
      <span class="lb-score">${parseInt(e.score, 10).toLocaleString()}</span>
      <span class="lb-beat">${beat ? '✅' : '❌'}</span>
    </div>`;
  }).join('');

  if (footerEl) {
    footerEl.textContent = total > 10 ? `${total} players today` : `${total} player${total !== 1 ? 's' : ''} today`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// SECTION 6: Start Screen UI
// ─────────────────────────────────────────────
function refreshDailyCard() {
  const cfg = getDailyConfig();

  document.getElementById('startDayNum').textContent = cfg.dayNum;
  document.getElementById('startTarget').textContent = cfg.target.toLocaleString();
  document.getElementById('startBonus').textContent  = cfg.bonusMult.toFixed(1);

  // Player name
  document.getElementById('playerNameDisplay').textContent = getPlayerName();

  const alreadySection = document.getElementById('dailyAlreadySection');
  const dailyBtn       = document.getElementById('dailyBtn');

  if (isDailyPlayed()) {
    const saved = getDailySavedResult();
    const beat  = saved.score >= saved.target;

    alreadySection.classList.remove('hidden');
    document.getElementById('dailyPrevEmoji').textContent  = saved.emojis;
    document.getElementById('dailyPrevStatus').textContent =
      beat ? `✅ ${saved.score.toLocaleString()} — BEAT!` : `❌ ${saved.score.toLocaleString()}`;

    dailyBtn.textContent = '🏆 TODAY\'S LEADERBOARD';
    dailyBtn.onclick = () => openLeaderboardOverlay(cfg.dayNum);
  } else {
    alreadySection.classList.add('hidden');
    dailyBtn.textContent = '📅 DAILY CHALLENGE';
    dailyBtn.onclick = () => {
      try { getAudioCtx().resume(); } catch(e) {}
      startGame(true);
    };
  }
}

async function openLeaderboardOverlay(dayNum) {
  document.getElementById('lbOverlayDay').textContent = dayNum;
  document.getElementById('lbOverlayList').innerHTML  = '<div class="lb-loading">Loading...</div>';
  document.getElementById('lbOverlayFooter').textContent = '';
  document.getElementById('lbOverlay').classList.remove('hidden');

  const data = await fetchLeaderboard(dayNum);
  renderLeaderboard(
    document.getElementById('lbOverlayList'),
    document.getElementById('lbOverlayFooter'),
    data,
    getPlayerId()
  );
}

// Update the target progress bar during gameplay
function updateTargetBar() {
  if (!state.isDailyMode) return;
  const bar    = document.getElementById('targetBar');
  const fill   = document.getElementById('targetBarFill');
  const valEl  = document.getElementById('targetBarValue');
  const target = state.dailyConfig.target;
  const pct    = Math.min((state.score / target) * 100, 100);

  fill.style.width = pct + '%';
  valEl.textContent = target.toLocaleString();

  if (state.score >= target) {
    fill.classList.add('beat');
    bar.classList.add('target-beaten');
  } else {
    fill.classList.remove('beat');
    bar.classList.remove('target-beaten');
  }
}

// ─────────────────────────────────────────────
// SECTION 7: Matter.js Setup
// ─────────────────────────────────────────────
const { Engine, Render, Runner, Bodies, Body, World, Events, Composite } = Matter;

let engine, runner, matterRender;
let pegBodies = [];

function initPhysics() {
  if (engine) { Runner.stop(runner); World.clear(engine.world); Engine.clear(engine); }
  engine = Engine.create(); engine.gravity.y = 2.5;
  runner = Runner.create(); Runner.run(runner, engine);
  buildWorld();
}

function buildWorld() {
  World.clear(engine.world);
  pegBodies = []; state.slotBodies = [];

  const wallOpts = { isStatic: true, friction: 0, restitution: 0.3, render: { visible: false } };
  const wallThick = 20;
  World.add(engine.world, [
    Bodies.rectangle(CANVAS_W / 2, CANVAS_H + wallThick / 2, CANVAS_W + 40, wallThick, wallOpts),
    Bodies.rectangle(-wallThick / 2, CANVAS_H / 2, wallThick, CANVAS_H * 2, wallOpts),
    Bodies.rectangle(CANVAS_W + wallThick / 2, CANVAS_H / 2, wallThick, CANVAS_H * 2, wallOpts),
  ]);

  const pegOpts = { isStatic: true, restitution: 0.5, friction: 0, frictionAir: 0, label: 'peg', render: { visible: false } };
  for (let row = 0; row < PEG_ROWS; row++) {
    const pegsInRow = row + 3;
    const startX = (CANVAS_W - (pegsInRow - 1) * PEG_SPACING_Y) / 2;
    const y = PEG_START_Y + row * PEG_SPACING_Y;
    for (let col = 0; col < pegsInRow; col++) {
      const x = startX + col * PEG_SPACING_Y;
      const peg = Bodies.circle(x, y, PEG_RADIUS, pegOpts);
      pegBodies.push({ body: peg, x, y });
      World.add(engine.world, peg);
    }
  }

  const slotWidth = CANVAS_W / SLOT_COUNT;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const cx = slotWidth * i + slotWidth / 2;
    const cy = SLOT_Y + SLOT_HEIGHT / 2;
    const slotBody = Bodies.rectangle(cx, cy, slotWidth - 2, SLOT_HEIGHT, {
      isStatic: true, isSensor: true, label: `slot_${i}`, render: { visible: false },
    });
    state.slotBodies.push(slotBody);
    World.add(engine.world, slotBody);
  }

  const divOpts = { isStatic: true, friction: 0, restitution: 0.2, render: { visible: false } };
  for (let i = 0; i <= SLOT_COUNT; i++) {
    World.add(engine.world, Bodies.rectangle(i * slotWidth, SLOT_Y + SLOT_HEIGHT / 2, 2, SLOT_HEIGHT, divOpts));
  }

  Events.on(engine, 'collisionStart', onCollision);
}

// ─────────────────────────────────────────────
// SECTION 8: Collision Handling
// ─────────────────────────────────────────────
function onCollision(event) {
  if (!state.gameActive) return;
  for (const pair of event.pairs) {
    const { bodyA, bodyB } = pair;
    let landedBall = null, other = null;
    if (state.ballBody && (bodyA === state.ballBody || bodyB === state.ballBody)) {
      landedBall = state.ballBody;
      other = bodyA === state.ballBody ? bodyB : bodyA;
    } else if (state.ballBody2 && (bodyA === state.ballBody2 || bodyB === state.ballBody2)) {
      landedBall = state.ballBody2;
      other = bodyA === state.ballBody2 ? bodyB : bodyA;
    }
    if (!other || !landedBall) continue;

    if (other.label && other.label.startsWith('slot_')) {
      handleSlotLand(parseInt(other.label.split('_')[1], 10), landedBall); break;
    }
    if (other.label === 'peg') {
      playSound('peg');
      const { x, y } = other.position;
      state.pegHits.push({ x, y, timer: 0.14, maxTimer: 0.14 });
      spawnPegParticles(x, y);
    }
  }
}

function handleSlotLand(slotIndex, landedBody) {
  if (state.ballsInPlay === 0) return;
  if (landedBody !== state.ballBody && landedBody !== state.ballBody2) return;

  const isBomb  = slotIndex === state.bombSlot;
  const isCrit  = slotIndex === state.criticalSlot;
  const isSuper = slotIndex === SUPER_JACKPOT_IDX;
  const baseValue = SLOT_VALUES[slotIndex];
  const nearSuper = Math.abs(slotIndex - SUPER_JACKPOT_IDX) === 1;

  let mult = state.multiplier;
  if (state.luckyMode)    mult *= 2;
  if (state.isDailyMode)  mult *= state.dailyBonusMult;
  if (isCrit && !isBomb)  mult *= 3;
  mult += getLuckyBounceMult();

  let timingBonus = false;
  if (state.movingBonus && !isBomb) {
    const bSlot = Math.round(Math.max(0, Math.min(SLOT_COUNT - 1, state.movingBonus.pos)));
    if (bSlot === slotIndex) { timingBonus = true; mult *= 2; }
  }

  const divisor = state.currentDropIsMulti ? getMultiBallDivisor() : 1;
  const points = isBomb ? -300 : Math.round(baseValue * mult / divisor);

  state.score = Math.max(0, state.score + points);
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('plinko_hs', state.highScore);
  }

  if (!isBomb && baseValue >= 200) {
    state.comboCount++;
    if (state.comboCount >= 4)      { state.multiplier = 3; state.multiplierTimer = 2.0; state.comboTimer = 2.0; }
    else if (state.comboCount >= 2) { state.multiplier = 2; state.multiplierTimer = 2.0; state.comboTimer = 2.0; }
  } else if (!isCrit) {
    if (state.comboCount > 0) { state.comboCount = 0; state.multiplier = 1; }
  }

  if (nearSuper && !isSuper && !isBomb) { state.nearMissTimer = 2.2; playSound('nearmiss'); }

  const slotWidth = CANVAS_W / SLOT_COUNT;
  const fx = slotIndex * slotWidth + slotWidth / 2;

  state.slotBounce[slotIndex] = 1.0;

  if (isSuper) {
    spawnJackpotExplosion(fx, SLOT_Y, true);
    state.screenFlash = 0.55; state.screenFlashColor = '200,0,255';
    state.slowMotion = 1.2; state.screenShake = 0.55;
    engine.timing.timeScale = 0.15;
    playSound('superjackpot');
  } else if (baseValue >= 500) {
    spawnJackpotExplosion(fx, SLOT_Y, false);
    state.screenFlash = 0.3; state.screenFlashColor = '255,215,0';
    state.screenShake = 0.28; playSound('jackpot');
  } else if (isBomb) {
    spawnLandingBurst(fx, SLOT_Y, '#ff2060', 14, 160);
    spawnImpactWave(fx, SLOT_Y, '#ff2060', 80, 2.5);
    state.screenFlash = 0.2; state.screenFlashColor = '255,32,96';
    state.screenShake = 0.3; playSound('bomb');
  } else {
    spawnLandingBurst(fx, SLOT_Y, baseValue >= 200 ? '#00f5ff' : '#8888aa', 8, 100);
    spawnImpactWave(fx, SLOT_Y, baseValue >= 200 ? '#00f5ff' : '#6666aa', 55, 1.5);
    playSound('land');
  }

  if (timingBonus && !isSuper) {
    spawnLandingBurst(fx, SLOT_Y, '#00ff88', 14, 150);
    spawnImpactWave(fx, SLOT_Y, '#00ff88', 75, 2.2);
    if (state.screenFlash < 0.3) { state.screenFlash = 0.3; state.screenFlashColor = '0,255,136'; }
    if (state.screenShake < 0.25) state.screenShake = 0.25;
    state.floatingTexts.push({ x: fx, y: SLOT_Y - 32, text: '⏱ TIMING BONUS! x2', color: '#00ff88', life: 1.6, maxLife: 1.6 });
  }

  let label, color;
  if (isBomb)        { label = 'BOMB! -300'; color = '#ff2060'; }
  else if (isSuper && timingBonus)  { label = `⏱★ TIMING SUPER! +${points.toLocaleString()}`; color = '#00ff88'; }
  else if (isSuper)  { label = `★ SUPER! +${points.toLocaleString()}`; color = '#ff00ff'; }
  else if (isCrit && timingBonus)   { label = `⏱ CRIT+TIMING! +${points.toLocaleString()}`; color = '#00ff88'; }
  else if (isCrit)   { label = `CRIT x${Math.round(mult)}! +${points.toLocaleString()}`; color = '#ff6b00'; }
  else if (timingBonus) { label = `⏱ TIMING x2! +${points.toLocaleString()}`; color = '#00ff88'; }
  else if (state.luckyMode) { label = `LUCKY +${points.toLocaleString()}`; color = '#ffe600'; }
  else               { label = `+${points.toLocaleString()}`; color = baseValue >= 500 ? '#ffd700' : '#00f5ff'; }

  state.floatingTexts.push({ x: fx, y: SLOT_Y - 10, text: label, color, life: 1.2, maxLife: 1.2 });
  state.slotFlash = { index: slotIndex, timer: 0.35 };

  if (state.isDailyMode) {
    state.dailyBallResults.push(getBallResultEmoji(slotIndex, points));
  }

  updateHUD(); updateTargetBar();

  if (landedBody === state.ballBody) {
    if (state.ballBody) { World.remove(engine.world, state.ballBody); state.ballBody = null; }
    state.ballTrail = [];
  } else {
    if (state.ballBody2) { World.remove(engine.world, state.ballBody2); state.ballBody2 = null; }
    state.ballTrail2 = [];
  }
  state.ballsInPlay = Math.max(0, state.ballsInPlay - 1);
  state.ballInPlay = state.ballsInPlay > 0;

  if (state.ballsInPlay === 0) {
    if (state.ballsRemaining <= 0) setTimeout(showGameOver, isSuper ? 1400 : 800);
    else enableDropButton(true);
  }
}

// ─────────────────────────────────────────────
// SECTION 9: Ball Dropping
// ─────────────────────────────────────────────
function dropBall(aimX) {
  if (!state.gameActive || state.ballsInPlay > 0 || state.ballsRemaining <= 0) return;

  const isMulti = state.multiBallOn && isMultiBallUnlocked();
  const clamp = v => Math.max(BALL_RADIUS + 10, Math.min(CANVAS_W - BALL_RADIUS - 10, v));
  const spread = getBallSpread();

  let x = aimX;
  if (state.isFirstBall) { x = x + (CANVAS_W / 2 - x) * 0.7; state.isFirstBall = false; }

  const x1 = clamp(x + (Math.random() - 0.5) * spread);
  state.ballBody = Bodies.circle(x1, BALL_START_Y, BALL_RADIUS, {
    restitution: 0.3, friction: 0, frictionAir: 0.01, label: 'ball', render: { visible: false },
  });
  World.add(engine.world, state.ballBody);
  state.ballTrail = [];

  if (isMulti) {
    const x2 = clamp(x + (Math.random() - 0.5) * spread);
    state.ballBody2 = Bodies.circle(x2, BALL_START_Y + 12, BALL_RADIUS, {
      restitution: 0.3, friction: 0, frictionAir: 0.01, label: 'ball2', render: { visible: false },
    });
    World.add(engine.world, state.ballBody2);
    state.ballTrail2 = [];
    state.ballsInPlay = 2;
  } else {
    state.ballBody2 = null; state.ballTrail2 = [];
    state.ballsInPlay = 1;
  }

  state.currentDropIsMulti = isMulti;
  state.ballInPlay = true; state.ballsRemaining--;
  engine.timing.timeScale = 1.0; state.slowMotion = 0;

  if (state.ballsRemaining === 0) { state.luckyMode = true; state.luckyBanner = 2.5; playSound('lucky'); }

  updateHUD(); enableDropButton(false);
}

// ─────────────────────────────────────────────
// SECTION 10: Particle & Wave System
// ─────────────────────────────────────────────
function spawnPegParticles(px, py) {
  for (let i = 0; i < 5 + Math.floor(Math.random() * 3); i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 110;
    state.particles.push({
      x: px, y: py, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20,
      life: 0.18 + Math.random() * 0.12, maxLife: 0.3,
      color: Math.random() < 0.7 ? '#00f5ff' : '#ffffff',
      size: 1.5 + Math.random() * 2, gravity: 180, type: 'spark',
    });
  }
}

function spawnLandingBurst(px, py, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI + Math.random() * Math.PI * 2;
    const spd   = speed * (0.5 + Math.random() * 0.8);
    state.particles.push({
      x: px, y: py, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 30,
      life: 0.35 + Math.random() * 0.25, maxLife: 0.6,
      color, size: 2 + Math.random() * 3.5, gravity: 320, type: 'dot',
    });
  }
}

function spawnImpactWave(px, py, color, maxRadius, lineWidth) {
  state.impactWaves.push({ x: px, y: py, radius: 4, maxRadius, life: 0.45, maxLife: 0.45, color, lineWidth });
}

function spawnJackpotExplosion(px, py, isSuper) {
  const c1 = isSuper ? '#ff00ff' : '#ffd700';
  const c2 = isSuper ? '#ffffff' : '#ff8c00';
  const c3 = isSuper ? '#aa00ff' : '#fff5aa';
  const count = isSuper ? 38 : 22;
  const speed = isSuper ? 230 : 175;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const spd   = speed * (0.5 + Math.random() * 0.8);
    state.particles.push({
      x: px, y: py, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 60,
      life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
      color: [c1, c2, c3][Math.floor(Math.random() * 3)],
      size: 3 + Math.random() * 4.5, gravity: 280, type: 'star',
    });
  }
  for (let i = 0; i < (isSuper ? 16 : 8); i++) {
    const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.9;
    const spd   = (isSuper ? 280 : 200) * (0.6 + Math.random() * 0.5);
    state.particles.push({
      x: px + (Math.random() - 0.5) * 30, y: py,
      vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
      life: 0.6 + Math.random() * 0.45, maxLife: 1.05,
      color: Math.random() < 0.5 ? c1 : c2,
      size: 2.5 + Math.random() * 3, gravity: 350, type: 'star',
    });
  }
  for (let w = 0; w < (isSuper ? 3 : 2); w++) {
    setTimeout(() => spawnImpactWave(px, py, c1, isSuper ? 120 + w * 40 : 90 + w * 25, isSuper ? 3 - w * 0.5 : 2.5 - w * 0.5), w * 80);
  }
}

// ─────────────────────────────────────────────
// SECTION 11: Canvas Rendering
// ─────────────────────────────────────────────
let canvas, ctx;
let lastTime = 0;

function initCanvas() {
  canvas = document.getElementById('gameCanvas');
  canvas.width = CANVAS_W; canvas.height = CANVAS_H;
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchend', onCanvasTouch, { passive: false });
  canvas.addEventListener('mousemove', onMouseMove);
  requestAnimationFrame(renderLoop);
}

function onCanvasClick(e) {
  if (!state.gameActive) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
  state.lastAimX = x; dropBall(x);
}

function onCanvasTouch(e) {
  if (!state.gameActive) return;
  e.preventDefault();
  const touch = e.changedTouches[0];
  const rect  = canvas.getBoundingClientRect();
  const x     = (touch.clientX - rect.left) * (CANVAS_W / rect.width);
  state.lastAimX = x; dropBall(x);
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  state.lastAimX = (e.clientX - rect.left) * (CANVAS_W / rect.width);
}

function renderLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  if (state.gameActive) update(dt);
  draw();
  requestAnimationFrame(renderLoop);
}

// ─────────────────────────────────────────────
// SECTION 12: Update
// ─────────────────────────────────────────────
function update(dt) {
  if (state.slowMotion > 0) {
    state.slowMotion -= dt;
    engine.timing.timeScale = state.slowMotion > 0 ? 0.15 + (1 - state.slowMotion / 1.2) * 0.85 : 1.0;
    if (state.slowMotion <= 0) engine.timing.timeScale = 1.0;
  }
  if (state.screenShake > 0) state.screenShake -= dt;

  // Moving bonus slot
  if (state.movingBonus) {
    const mb = state.movingBonus;
    const ballsDropped = BALLS_START - state.ballsRemaining;
    mb.speed = 1.2 + ballsDropped * 0.45;
    mb.pos += mb.direction * mb.speed * dt;
    if (mb.pos >= SLOT_COUNT - 0.5) { mb.pos = SLOT_COUNT - 0.5; mb.direction = -1; }
    if (mb.pos <= -0.5)             { mb.pos = -0.5;              mb.direction =  1; }
  }

  if (state.ballBody) {
    const { x, y } = state.ballBody.position;
    state.ballTrail.unshift({ x, y });
    if (state.ballTrail.length > 22) state.ballTrail.pop();
    if (y > CANVAS_H + 60) {
      World.remove(engine.world, state.ballBody);
      state.ballBody = null; state.ballTrail = [];
      state.ballsInPlay = Math.max(0, state.ballsInPlay - 1);
      state.ballInPlay = state.ballsInPlay > 0;
      if (state.ballsInPlay === 0) {
        if (state.ballsRemaining <= 0) setTimeout(showGameOver, 400);
        else enableDropButton(true);
      }
    }
  }
  if (state.ballBody2) {
    const { x: x2, y: y2 } = state.ballBody2.position;
    state.ballTrail2.unshift({ x: x2, y: y2 });
    if (state.ballTrail2.length > 22) state.ballTrail2.pop();
    if (y2 > CANVAS_H + 60) {
      World.remove(engine.world, state.ballBody2);
      state.ballBody2 = null; state.ballTrail2 = [];
      state.ballsInPlay = Math.max(0, state.ballsInPlay - 1);
      state.ballInPlay = state.ballsInPlay > 0;
      if (state.ballsInPlay === 0) {
        if (state.ballsRemaining <= 0) setTimeout(showGameOver, 400);
        else enableDropButton(true);
      }
    }
  }

  state.floatingTexts = state.floatingTexts.filter(ft => { ft.y -= 55 * dt; ft.life -= dt; return ft.life > 0; });
  if (state.slotFlash) { state.slotFlash.timer -= dt; if (state.slotFlash.timer <= 0) state.slotFlash = null; }

  if (state.comboTimer > 0)      state.comboTimer      -= dt;
  if (state.multiplierTimer > 0) state.multiplierTimer  -= dt;
  if (state.luckyBanner > 0)     state.luckyBanner      -= dt;
  if (state.nearMissTimer > 0)   state.nearMissTimer    -= dt;

  state.criticalPulse = (state.criticalPulse + dt * 3) % (Math.PI * 2);
  state.superPulse    = (state.superPulse    + dt * 4) % (Math.PI * 2);

  state.particles = state.particles.filter(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt; return p.life > 0;
  });
  state.impactWaves = state.impactWaves.filter(w => {
    w.radius = 4 + (1 - w.life / w.maxLife) * w.maxRadius; w.life -= dt; return w.life > 0;
  });
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (state.slotBounce[i] > 0) state.slotBounce[i] = Math.max(0, state.slotBounce[i] - dt * 2.8);
  }
  if (state.screenFlash > 0) state.screenFlash -= dt;
  state.pegHits = state.pegHits.filter(h => { h.timer -= dt; return h.timer > 0; });

  // Ambient motes rising from reward zone
  state.ambientMoteTimer += dt;
  if (state.ambientMoteTimer > 0.1) {
    state.ambientMoteTimer = 0;
    const mx = Math.random() * CANVAS_W;
    const si = Math.min(SLOT_COUNT - 1, Math.floor(mx / (CANVAS_W / SLOT_COUNT)));
    const v  = SLOT_VALUES[si];
    let mc = si === state.bombSlot ? '255,30,80' : si === SUPER_JACKPOT_IDX ? '200,0,255' : v >= 500 ? '255,210,0' : v >= 200 ? '0,200,240' : '60,60,140';
    const lt = 1.2 + Math.random() * 1.2;
    state.ambientMotes.push({ x: mx + (Math.random()-0.5)*16, y: SLOT_Y - 2, vy: -(18 + Math.random() * 38), life: lt, maxLife: lt, size: 0.8 + Math.random() * 1.8, color: mc });
  }
  state.ambientMotes = state.ambientMotes.filter(m => { m.y += m.vy * dt; m.life -= dt; return m.life > 0; });
}

// ─────────────────────────────────────────────
// SECTION 13: Draw
// ─────────────────────────────────────────────
function draw() {
  ctx = canvas.getContext('2d');
  const shakeX = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 9 : 0;
  const shakeY = state.screenShake > 0 ? (Math.random() - 0.5) * state.screenShake * 9 : 0;
  ctx.save(); ctx.translate(shakeX, shakeY);
  ctx.clearRect(-12, -12, CANVAS_W + 24, CANVAS_H + 24);

  drawBackground(); drawAmbientMotes(); drawImpactWaves();
  if (state.gameActive && state.ballsInPlay === 0 && state.ballsRemaining > 0) drawAimGuide();
  drawSlots(); drawMovingBonus(); drawPegs(); drawBallTrail(); if (state.ballTrail2.length > 1) drawBallTrail2(); drawBall(); if (state.ballBody2) drawBall2(); drawParticles(); drawFloatingTexts();
  if (state.isDailyMode) drawDailyTargetHint();
  if (state.comboTimer > 0 && state.multiplier >= 2) drawMultiplierBanner();
  else if (state.comboTimer > 0) drawComboText();
  if (state.luckyBanner > 0)   drawLuckyBanner();
  if (state.nearMissTimer > 0) drawNearMiss();
  if (state.multiplier > 1)    drawMultiplierHUD();
  if (state.screenFlash > 0)   drawScreenFlash();
  ctx.restore();
}

function drawBackground() {
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bgGrad.addColorStop(0, '#030310'); bgGrad.addColorStop(0.7, '#050514'); bgGrad.addColorStop(1, '#080810');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (state.luckyMode) {
    ctx.fillStyle = `rgba(255,230,0,${0.06 + 0.02 * Math.sin(state.superPulse)})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  if (state.isDailyMode) {
    ctx.fillStyle = `rgba(255,180,0,${0.04 + 0.01 * Math.sin(state.superPulse * 0.5)})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Ultra-faint grid — barely visible infrastructure
  ctx.strokeStyle = 'rgba(0,245,255,0.012)'; ctx.lineWidth = 1;
  for (let x = 0; x <= CANVAS_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SLOT_Y); ctx.stroke(); }
  for (let y = 0; y <= SLOT_Y; y += 40)   { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }
}

function drawAimGuide() {
  const x = Math.max(BALL_RADIUS + 10, Math.min(CANVAS_W - BALL_RADIUS - 10, state.lastAimX));
  ctx.save();
  ctx.strokeStyle = 'rgba(0,245,255,0.22)'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.moveTo(x, BALL_START_Y + BALL_RADIUS); ctx.lineTo(x, 80); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = state.luckyMode ? 'rgba(255,230,0,0.7)' : 'rgba(0,245,255,0.5)';
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, BALL_START_Y, BALL_RADIUS, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawDailyTargetHint() {
  const beat  = state.score >= state.dailyConfig.target;
  const label = beat ? '✅ TARGET BEAT!' : `TARGET ${state.dailyConfig.target.toLocaleString()}`;
  const color = beat ? '#00ff88' : 'rgba(255,215,0,0.55)';
  ctx.save();
  ctx.font = 'bold 10px Orbitron, sans-serif'; ctx.fillStyle = color;
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.shadowBlur = beat ? 8 : 0; ctx.shadowColor = '#00ff88';
  ctx.fillText(label, CANVAS_W - 10, 10);
  ctx.restore();
}

function drawSlots() {
  const sw = CANVAS_W / SLOT_COUNT;
  const sb = SLOT_Y + SLOT_HEIGHT;

  // Dark slot zone base
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, SLOT_Y, CANVAS_W, SLOT_HEIGHT);

  // Pulsing aura rising from reward zone (atmospheric)
  const auraGrad = ctx.createLinearGradient(0, SLOT_Y - 40, 0, SLOT_Y);
  auraGrad.addColorStop(0, 'rgba(0,0,0,0)');
  const sp = state.luckyMode ? `rgba(255,215,0,${0.06 + 0.04 * Math.sin(state.superPulse * 0.7)})`
                              : `rgba(120,0,200,${0.07 + 0.04 * Math.sin(state.superPulse * 0.7)})`;
  auraGrad.addColorStop(1, sp);
  ctx.fillStyle = auraGrad; ctx.fillRect(0, SLOT_Y - 40, CANVAS_W, 40);

  for (let i = 0; i < SLOT_COUNT; i++) {
    const x = i * sw; const val = SLOT_VALUES[i];
    const isBomb = i === state.bombSlot; const isCrit = i === state.criticalSlot;
    const isSuper = i === SUPER_JACKPOT_IDX;
    const isFlashing = state.slotFlash && state.slotFlash.index === i;
    const bounce = state.slotBounce[i];

    ctx.save();
    if (bounce > 0) {
      const t = 1 - bounce;
      const spring = Math.exp(-t * 10) * (-Math.cos(t * 14));
      ctx.translate(x + sw / 2, sb); ctx.scale(1, 1 + 0.38 * spring); ctx.translate(-(x + sw / 2), -sb);
    }

    // Slot gradient fill
    let topRGB, glowColor;
    if (isFlashing) { topRGB = '255,255,255'; glowColor = null; }
    else if (isBomb) { topRGB = `255,20,${60 + 20*Math.abs(Math.sin(state.criticalPulse))}`; glowColor = '#ff2060'; }
    else if (isSuper){ topRGB = `${190 + 20*Math.abs(Math.sin(state.superPulse))},0,255`; glowColor = '#cc00ff'; }
    else if (isCrit) { topRGB = `255,${90 + 30*Math.abs(Math.sin(state.criticalPulse))},0`; glowColor = '#ff6b00'; }
    else if (val >= 500) { topRGB = '255,200,0'; glowColor = '#ffd700'; }
    else if (val >= 200) { topRGB = '0,185,235'; glowColor = '#00c8f0'; }
    else { topRGB = '35,35,80'; glowColor = null; }

    const grad = ctx.createLinearGradient(x, SLOT_Y, x, sb);
    if (isFlashing) { grad.addColorStop(0, 'rgba(255,255,255,0.97)'); grad.addColorStop(1, 'rgba(200,200,200,0.9)'); }
    else { grad.addColorStop(0, `rgba(${topRGB},${isSuper ? 0.88 : 0.78})`); grad.addColorStop(1, 'rgba(0,0,0,0.9)'); }

    if (glowColor) { ctx.shadowBlur = isSuper ? 22 + 8*Math.sin(state.superPulse) : isBomb ? 14 : 12; ctx.shadowColor = glowColor; }
    ctx.fillStyle = grad; ctx.fillRect(x + 1, SLOT_Y, sw - 2, SLOT_HEIGHT);
    ctx.shadowBlur = 0;

    // Super jackpot spike above slot
    if (isSuper && !isFlashing) {
      const spike = ctx.createLinearGradient(x + sw/2, SLOT_Y - 14, x + sw/2, SLOT_Y);
      spike.addColorStop(0, 'rgba(200,0,255,0)'); spike.addColorStop(1, `rgba(200,0,255,${0.6 + 0.2*Math.sin(state.superPulse)})`);
      ctx.shadowBlur = 20; ctx.shadowColor = '#cc00ff';
      ctx.fillStyle = spike;
      ctx.beginPath(); ctx.moveTo(x+2, SLOT_Y); ctx.lineTo(x + sw - 2, SLOT_Y); ctx.lineTo(x + sw/2, SLOT_Y - 14); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Separator lines
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, SLOT_Y); ctx.lineTo(x, sb); ctx.stroke();

    // Labels
    const midY = SLOT_Y + SLOT_HEIGHT / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isFlashing ? '#000' : '#fff';
    if (glowColor && !isFlashing) { ctx.shadowBlur = 10; ctx.shadowColor = glowColor; }
    ctx.font = `bold ${isSuper ? 14 : 12}px Orbitron, sans-serif`;
    ctx.fillText(isBomb ? '💣' : isSuper ? '★' : isCrit ? 'CRIT' : `${val}`, x + sw/2, midY - 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = isFlashing ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.65)';
    ctx.font = `bold ${isSuper ? 10 : 8}px Orbitron, sans-serif`;
    if (isSuper) ctx.fillText('2000', x + sw/2, midY + 9);
    else if (isBomb) ctx.fillText('-300', x + sw/2, midY + 9);
    else if (isCrit) ctx.fillText('×3', x + sw/2, midY + 9);
    else if (val >= 500) ctx.fillText(`${val}`, x + sw/2, midY + 9);

    ctx.restore();
  }

  // Bright separator line (reward zone entrance)
  ctx.save();
  ctx.shadowBlur = 14; ctx.shadowColor = state.luckyMode ? '#ffe600' : '#00c8f0';
  ctx.strokeStyle = state.luckyMode ? 'rgba(255,230,0,0.75)' : 'rgba(0,200,240,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, SLOT_Y); ctx.lineTo(CANVAS_W, SLOT_Y); ctx.stroke();
  ctx.restore();
}

function drawPegs() {
  for (const { x, y } of pegBodies) {
    const hit = state.pegHits.find(h => Math.abs(h.x - x) < 2 && Math.abs(h.y - y) < 2);
    const hi  = hit ? hit.timer / hit.maxTimer : 0;
    ctx.save();
    if (hi > 0) {
      ctx.shadowBlur = 20 + hi * 16; ctx.shadowColor = '#ffffff';
      ctx.fillStyle = `rgba(${Math.round(160 + hi * 95)},230,255,${0.8 + hi * 0.2})`;
      ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS + hi * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = `rgba(255,255,255,${hi * 0.8})`;
      ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(55,90,130,0.55)';
      ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,200,240,0.2)';
      ctx.beginPath(); ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawBallTrail() {
  if (state.ballTrail.length < 2) return;
  const tc = state.luckyMode ? '255,230,0' : '255,200,20';
  for (let i = 0; i < state.ballTrail.length; i++) {
    const t = 1 - i / state.ballTrail.length;
    const { x, y } = state.ballTrail[i];
    ctx.save();
    ctx.shadowBlur = i === 0 ? 12 : 0; ctx.shadowColor = state.luckyMode ? '#ffe600' : '#ffd700';
    ctx.beginPath(); ctx.arc(x, y, Math.max(BALL_RADIUS * t * 0.95, 1.5), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tc},${t * 0.55})`; ctx.fill();
    ctx.restore();
  }
}

function drawBall() {
  if (!state.ballBody) return;
  const { x, y } = state.ballBody.position;
  ctx.save();
  ctx.shadowBlur = state.luckyMode ? 48 : 36; ctx.shadowColor = state.luckyMode ? '#ffe600' : '#ffc500';
  const grad = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, BALL_RADIUS);
  if (state.luckyMode) { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#fff7cc'); grad.addColorStop(0.65,'#ffe600'); grad.addColorStop(1,'#ff8c00'); }
  else                 { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#fff0aa'); grad.addColorStop(0.65,'#ffd700'); grad.addColorStop(1,'#ff5500'); }
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath(); ctx.arc(x - 4, y - 4, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBallTrail2() {
  if (state.ballTrail2.length < 2) return;
  const tc = state.luckyMode ? '255,230,0' : '210,80,255';
  for (let i = 0; i < state.ballTrail2.length; i++) {
    const t = 1 - i / state.ballTrail2.length;
    const { x, y } = state.ballTrail2[i];
    ctx.save();
    ctx.shadowBlur = i === 0 ? 12 : 0; ctx.shadowColor = '#bf00ff';
    ctx.beginPath(); ctx.arc(x, y, Math.max(BALL_RADIUS * t * 0.95, 1.5), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tc},${t * 0.55})`; ctx.fill();
    ctx.restore();
  }
}

function drawBall2() {
  if (!state.ballBody2) return;
  const { x, y } = state.ballBody2.position;
  ctx.save();
  ctx.shadowBlur = state.luckyMode ? 48 : 36; ctx.shadowColor = state.luckyMode ? '#ffe600' : '#cc00ff';
  const grad = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, BALL_RADIUS);
  if (state.luckyMode) { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#fff7cc'); grad.addColorStop(0.65,'#ffe600'); grad.addColorStop(1,'#ff8c00'); }
  else                 { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#f0aaff'); grad.addColorStop(0.65,'#bf00ff'); grad.addColorStop(1,'#6600aa'); }
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath(); ctx.arc(x - 4, y - 4, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMovingBonus() {
  if (!state.movingBonus) return;
  const mb = state.movingBonus;
  const slotWidth = CANVAS_W / SLOT_COUNT;
  const bx = mb.pos * slotWidth + slotWidth / 2;
  const pulse = 0.5 + 0.5 * Math.sin(state.superPulse * 3.5);

  ctx.save();

  // Highlight the slot background
  ctx.fillStyle = `rgba(0,255,136,${0.07 + 0.06 * pulse})`;
  ctx.fillRect(bx - slotWidth / 2, SLOT_Y, slotWidth, SLOT_HEIGHT);

  // Glowing border around the slot
  ctx.strokeStyle = `rgba(0,255,136,${0.5 + 0.4 * pulse})`;
  ctx.lineWidth = 2;
  ctx.shadowBlur = 14 + pulse * 8; ctx.shadowColor = '#00ff88';
  ctx.strokeRect(bx - slotWidth / 2 + 1, SLOT_Y + 1, slotWidth - 2, SLOT_HEIGHT - 2);

  // Downward pointing arrow above the slot
  ctx.shadowBlur = 20 + pulse * 10; ctx.shadowColor = '#00ff88';
  ctx.fillStyle = `rgba(0,255,136,${0.75 + 0.25 * pulse})`;
  ctx.beginPath();
  ctx.moveTo(bx,      SLOT_Y - 5);
  ctx.lineTo(bx - 10, SLOT_Y - 22);
  ctx.lineTo(bx + 10, SLOT_Y - 22);
  ctx.closePath();
  ctx.fill();

  // BONUS label above arrow
  ctx.shadowBlur = 10; ctx.font = 'bold 9px Orbitron, sans-serif';
  ctx.fillStyle = `rgba(0,255,136,${0.85 + 0.15 * pulse})`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BONUS ×2', bx, SLOT_Y - 32);

  ctx.restore();
}

function drawAmbientMotes() {
  for (const m of state.ambientMotes) {
    const alpha = Math.pow(m.life / m.maxLife, 0.7) * 0.55;
    if (alpha < 0.01) continue;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8; ctx.shadowColor = `rgb(${m.color})`;
    ctx.fillStyle = `rgb(${m.color})`;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const alpha = Math.pow(p.life / p.maxLife, 0.6);
    ctx.save(); ctx.globalAlpha = alpha; ctx.shadowBlur = p.type === 'star' ? 8 : 5;
    ctx.shadowColor = p.color; ctx.fillStyle = p.color;
    if (p.type === 'star') {
      ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + alpha * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawImpactWaves() {
  for (const w of state.impactWaves) {
    ctx.save(); ctx.globalAlpha = (w.life / w.maxLife) * 0.75;
    ctx.strokeStyle = w.color; ctx.lineWidth = w.lineWidth * (w.life / w.maxLife);
    ctx.shadowBlur = 14; ctx.shadowColor = w.color;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawScreenFlash() {
  const alpha = Math.pow(state.screenFlash / 0.55, 1.5) * 0.45;
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = `rgb(${state.screenFlashColor})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); ctx.restore();
}

function drawFloatingTexts() {
  for (const ft of state.floatingTexts) {
    ctx.save(); ctx.globalAlpha = Math.min(ft.life / ft.maxLife * 2, 1);
    ctx.font = 'bold 16px Orbitron, sans-serif'; ctx.fillStyle = ft.color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 14; ctx.shadowColor = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
  }
}

function drawComboText() {
  ctx.save(); ctx.globalAlpha = Math.min(state.comboTimer * 2, 1);
  ctx.font = 'bold 26px Orbitron, sans-serif'; ctx.fillStyle = '#ff6b00';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 20; ctx.shadowColor = '#ff6b00';
  ctx.fillText('🔥 ON FIRE!', CANVAS_W / 2, CANVAS_H / 2 - 80); ctx.restore();
}

function drawMultiplierBanner() {
  const alpha = Math.min(state.multiplierTimer * 1.5, 1);
  const label = state.multiplier >= 3 ? '🔥 x3 FRENZY!' : '⚡ x2 COMBO!';
  const color = state.multiplier >= 3 ? '#ff2060' : '#ff6b00';
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 110, CANVAS_H / 2 - 100, 220, 42, 21); ctx.fill();
  ctx.font = 'bold 24px Orbitron, sans-serif'; ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 24; ctx.shadowColor = color;
  ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2 - 79); ctx.restore();
}

function drawLuckyBanner() {
  const alpha = Math.min(state.luckyBanner * 1.2, 1) * Math.min((2.5 - state.luckyBanner) * 4, 1);
  ctx.save(); ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  grad.addColorStop(0, 'rgba(255,230,0,0)'); grad.addColorStop(0.3, 'rgba(255,230,0,0.18)');
  grad.addColorStop(0.7, 'rgba(255,230,0,0.18)'); grad.addColorStop(1, 'rgba(255,230,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, CANVAS_H / 2 - 55, CANVAS_W, 56);
  ctx.font = 'bold 30px Orbitron, sans-serif'; ctx.fillStyle = '#ffe600';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 30; ctx.shadowColor = '#ffe600';
  ctx.fillText('★ LUCKY MODE! ★', CANVAS_W / 2, CANVAS_H / 2 - 27);
  ctx.font = 'bold 12px Orbitron, sans-serif'; ctx.fillStyle = 'rgba(255,230,0,0.8)'; ctx.shadowBlur = 8;
  ctx.fillText('ALL VALUES x2', CANVAS_W / 2, CANVAS_H / 2 - 5); ctx.restore();
}

function drawNearMiss() {
  const alpha = Math.min(state.nearMissTimer * 1.5, 1) * Math.min((2.2 - state.nearMissTimer) * 2, 1);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = 'bold 22px Orbitron, sans-serif'; ctx.fillStyle = '#ff6b00';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 18; ctx.shadowColor = '#ff6b00';
  ctx.fillText('SO CLOSE! 😱', CANVAS_W / 2, 70); ctx.restore();
}

function drawMultiplierHUD() {
  const color = state.multiplier >= 3 ? '#ff2060' : '#ff6b00';
  ctx.save(); ctx.fillStyle = color; ctx.shadowBlur = 12; ctx.shadowColor = color;
  ctx.font = 'bold 14px Orbitron, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`MULT x${state.multiplier}`, CANVAS_W - 10, state.isDailyMode ? 26 : 10); ctx.restore();
}

// ─────────────────────────────────────────────
// SECTION 14: Audio
// ─────────────────────────────────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  try {
    const ac = getAudioCtx();
    switch (type) {
      case 'peg': {
        const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
        o.frequency.setValueAtTime(440 + Math.random() * 200, ac.currentTime); o.type = 'sine';
        g.gain.setValueAtTime(0.06, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
        o.start(ac.currentTime); o.stop(ac.currentTime + 0.08); break;
      }
      case 'land': {
        const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
        o.frequency.setValueAtTime(300, ac.currentTime); o.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.15);
        o.type = 'triangle'; g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
        o.start(ac.currentTime); o.stop(ac.currentTime + 0.2); break;
      }
      case 'jackpot':
        [523, 659, 784, 1047].forEach((f, i) => {
          const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
          o.frequency.value = f; o.type = 'sine';
          g.gain.setValueAtTime(0, ac.currentTime + i * 0.1); g.gain.linearRampToValueAtTime(0.15, ac.currentTime + i * 0.1 + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.1 + 0.3);
          o.start(ac.currentTime + i * 0.1); o.stop(ac.currentTime + i * 0.1 + 0.4);
        }); break;
      case 'superjackpot':
        [261, 330, 392, 523, 659, 784, 1047, 1319].forEach((f, i) => {
          const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
          o.frequency.value = f; o.type = 'sine';
          g.gain.setValueAtTime(0, ac.currentTime + i * 0.07); g.gain.linearRampToValueAtTime(0.18, ac.currentTime + i * 0.07 + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.07 + 0.35);
          o.start(ac.currentTime + i * 0.07); o.stop(ac.currentTime + i * 0.07 + 0.4);
        });
        { const b = ac.createOscillator(), bg = ac.createGain(); b.connect(bg); bg.connect(ac.destination);
          b.frequency.setValueAtTime(80, ac.currentTime); b.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.4);
          b.type = 'sine'; bg.gain.setValueAtTime(0.3, ac.currentTime); bg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
          b.start(ac.currentTime); b.stop(ac.currentTime + 0.5); }
        break;
      case 'bomb': {
        const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
        o.frequency.setValueAtTime(200, ac.currentTime); o.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.3);
        o.type = 'sawtooth'; g.gain.setValueAtTime(0.18, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
        o.start(ac.currentTime); o.stop(ac.currentTime + 0.35); break;
      }
      case 'lucky':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
          const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
          o.frequency.value = f; o.type = 'sine';
          g.gain.setValueAtTime(0, ac.currentTime + i * 0.06); g.gain.linearRampToValueAtTime(0.12, ac.currentTime + i * 0.06 + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.06 + 0.25);
          o.start(ac.currentTime + i * 0.06); o.stop(ac.currentTime + i * 0.06 + 0.3);
        }); break;
      case 'nearmiss': {
        const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
        o.frequency.setValueAtTime(600, ac.currentTime); o.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.3);
        o.type = 'triangle'; g.gain.setValueAtTime(0.1, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
        o.start(ac.currentTime); o.stop(ac.currentTime + 0.35); break;
      }
    }
  } catch (e) { /* audio blocked */ }
}

// ─────────────────────────────────────────────
// SECTION 15: HUD & Game Flow
// ─────────────────────────────────────────────
function updateHUD() {
  document.getElementById('scoreDisplay').textContent     = state.score.toLocaleString();
  document.getElementById('highScoreDisplay').textContent = state.highScore.toLocaleString();
  const ballsEl = document.getElementById('ballsDisplay');
  ballsEl.textContent   = state.ballsRemaining;
  ballsEl.style.color      = state.luckyMode ? '#ffe600' : '';
  ballsEl.style.textShadow = state.luckyMode ? '0 0 10px #ffe600, 0 0 20px #ffe600' : '';
}

function enableDropButton(enabled) {
  const btn = document.getElementById('dropBtn');
  btn.disabled = !enabled;
  const isMulti = state.multiBallOn && isMultiBallUnlocked();
  if (state.luckyMode && enabled) {
    btn.textContent = isMulti ? '★ DROP 2 LUCKY BALLS' : '★ DROP LUCKY BALL';
    btn.style.background = 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)';
  } else if (enabled) {
    btn.textContent = isMulti ? 'DROP 2 BALLS' : 'DROP BALL';
    btn.style.background = '';
  }
}

function pickCriticalSlot(bombSlot) {
  const candidates = [];
  for (let i = 0; i < SLOT_COUNT; i++) { if (i !== bombSlot && i !== SUPER_JACKPOT_IDX) candidates.push(i); }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function startGame(isDaily = false) {
  state.score = 0; state.ballsRemaining = BALLS_START; state.ballInPlay = false;
  state.ballBody = null; state.ballBody2 = null;
  state.ballTrail = []; state.ballTrail2 = [];
  state.ballsInPlay = 0; state.currentDropIsMulti = false;
  state.floatingTexts = [];
  state.slotFlash = null; state.comboCount = 0; state.comboTimer = 0;
  state.isFirstBall = true; state.gameActive = true; state.lastAimX = CANVAS_W / 2;
  state.multiplier = 1; state.multiplierTimer = 0; state.luckyMode = false; state.luckyBanner = 0;
  state.slowMotion = 0; state.screenShake = 0; state.nearMissTimer = 0;
  state.criticalPulse = 0; state.superPulse = 0;
  state.particles = []; state.impactWaves = []; state.slotBounce = new Array(SLOT_COUNT).fill(0);
  state.screenFlash = 0; state.screenFlashColor = '255,255,255'; state.pegHits = [];
  state.ambientMotes = []; state.ambientMoteTimer = 0;
  state.isDailyMode = isDaily; state.dailyBallResults = [];
  state.movingBonus = { pos: SLOT_COUNT / 2, direction: 1, speed: 1.2 };

  if (isDaily) {
    const cfg = getDailyConfig();
    state.dailyConfig    = cfg;
    state.dailyBonusMult = cfg.bonusMult;
    SLOT_VALUES          = cfg.dailySlotValues;
    state.bombSlot       = cfg.bombSlot;
    state.criticalSlot   = cfg.critSlot;
    document.getElementById('targetBar').classList.remove('hidden');
    document.getElementById('dailyBadge').classList.remove('hidden');
    updateTargetBar();
  } else {
    state.dailyConfig    = null;
    state.dailyBonusMult = 1;
    SLOT_VALUES          = [...BASE_SLOT_VALUES];
    state.bombSlot       = Math.floor(Math.random() * SLOT_COUNT);
    state.criticalSlot   = pickCriticalSlot(state.bombSlot);
    document.getElementById('targetBar').classList.add('hidden');
    document.getElementById('dailyBadge').classList.add('hidden');
  }

  if (engine) engine.timing.timeScale = 1.0;
  initPhysics(); updateHUD(); enableDropButton(true);
  showUpgradeIndicators();
  const multiBtn = document.getElementById('multiBtn');
  if (isMultiBallUnlocked()) { multiBtn.classList.remove('hidden'); updateMultiBtn(); }
  else { multiBtn.classList.add('hidden'); }
  const btn = document.getElementById('dropBtn'); btn.textContent = 'DROP BALL'; btn.style.background = '';
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
}

async function showGameOver() {
  state.gameActive = false; enableDropButton(false);
  if (engine) engine.timing.timeScale = 1.0;

  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('plinko_hs', state.highScore);
  }

  document.getElementById('finalScore').textContent = state.score.toLocaleString();
  document.getElementById('finalHigh').textContent  = state.highScore.toLocaleString();

  const earnedCoins = coinsFromScore(state.score);
  addCoins(earnedCoins);
  document.getElementById('startCoinsVal').textContent = getCoins().toLocaleString();
  const coinsEl = document.getElementById('coinsEarnedVal');
  coinsEl.textContent = String.fromCodePoint(0x1FA99) + ' ' + earnedCoins.toLocaleString();
  coinsEl.classList.remove('pop');
  void coinsEl.offsetWidth;
  coinsEl.classList.add('pop');

  const dailyBlock = document.getElementById('dailyResultBlock');

  if (state.isDailyMode) {
    const cfg      = state.dailyConfig;
    const beat     = state.score >= cfg.target;
    const emojiStr = state.dailyBallResults.join('');

    saveDailyResult(state.score, emojiStr, cfg.target);

    document.getElementById('dailyResultHeader').textContent =
      `📅 DAILY #${cfg.dayNum}  ·  ${cfg.bonusMult.toFixed(1)}x BONUS`;
    document.getElementById('dailyResultEmoji').textContent = emojiStr;

    const statusEl = document.getElementById('dailyResultStatus');
    statusEl.textContent  = beat ? `✅ TARGET BEAT! (${cfg.target.toLocaleString()})` : `❌ MISSED TARGET (${cfg.target.toLocaleString()})`;
    statusEl.className    = 'daily-result-status ' + (beat ? 'beat' : 'miss');

    document.getElementById('dailyRankBadge').textContent = '';

    const lbListEl   = document.getElementById('lbGameOverList');
    const lbFooterEl = document.getElementById('lbGameOverFooter');
    lbListEl.innerHTML = '<div class="lb-loading">Submitting score...</div>';

    dailyBlock.classList.remove('hidden');
    document.getElementById('gameOverScreen').classList.remove('hidden');

    // Submit score, then fetch leaderboard
    const rank = await submitDailyScore(cfg.dayNum, state.score, cfg.target, emojiStr);
    if (rank) {
      document.getElementById('dailyRankBadge').textContent = `🏆 YOU RANKED #${rank} TODAY`;
    }

    const lbData = await fetchLeaderboard(cfg.dayNum);
    renderLeaderboard(lbListEl, lbFooterEl, lbData, getPlayerId());

    // Refresh start screen card for next visit
    setTimeout(refreshDailyCard, 100);
  } else {
    dailyBlock.classList.add('hidden');
    document.getElementById('gameOverScreen').classList.remove('hidden');
  }
}

// ─────────────────────────────────────────────
// SECTION 16: Event Wiring
// ─────────────────────────────────────────────

// Upgrade indicators displayed in-game
function showUpgradeIndicators() {
  const el = document.getElementById('upgradeIndicators');
  if (!el) return;
  const badges = [];
  if (getUpgradeLevel('ballWeight') > 0)
    badges.push('<span class="upg-badge">⚙ Lv' + getUpgradeLevel('ballWeight') + '</span>');
  if (getUpgradeLevel('luckyBounce') > 0)
    badges.push('<span class="upg-badge">☘ Lv' + getUpgradeLevel('luckyBounce') + '</span>');
  if (getUpgradeLevel('multiBall') > 0)
    badges.push('<span class="upg-badge">🎱 Lv' + getUpgradeLevel('multiBall') + '</span>');
  if (badges.length > 0) {
    el.innerHTML = badges.join('');
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function updateMultiBtn() {
  const btn = document.getElementById('multiBtn');
  if (!btn) return;
  if (state.multiBallOn) {
    btn.textContent = '🎱 MULTI: ON';
    btn.classList.add('active');
  } else {
    btn.textContent = '🎱 MULTI: OFF';
    btn.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  document.getElementById('highScoreDisplay').textContent = state.highScore.toLocaleString();
  document.getElementById('startCoinsVal').textContent = getCoins().toLocaleString();
  initShop();
  refreshDailyCard();

  document.getElementById('playBtn').addEventListener('click', () => {
    try { getAudioCtx().resume(); } catch(e) {}
    startGame(false);
  });

  // dailyBtn onclick is wired dynamically in refreshDailyCard()

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    try { getAudioCtx().resume(); } catch(e) {}
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
    document.getElementById('startCoinsVal').textContent = getCoins().toLocaleString();
    refreshDailyCard();
  });

  document.getElementById('multiBtn').addEventListener('click', () => {
    state.multiBallOn = !state.multiBallOn;
    updateMultiBtn();
    enableDropButton(state.ballsInPlay === 0 && state.gameActive && state.ballsRemaining > 0);
  });

  document.getElementById('dropBtn').addEventListener('click', () => {
    dropBall(state.lastAimX);
  });

  // Change name button
  document.getElementById('changeNameBtn').addEventListener('click', () => {
    const current = getPlayerName();
    const input   = prompt('Enter your player name (max 20 chars):', current);
    if (input !== null) {
      const saved = setPlayerName(input);
      document.getElementById('playerNameDisplay').textContent = saved;
    }
  });

  // Leaderboard overlay close
  document.getElementById('lbOverlayClose').addEventListener('click', () => {
    document.getElementById('lbOverlay').classList.add('hidden');
  });

  initPhysics();
});
