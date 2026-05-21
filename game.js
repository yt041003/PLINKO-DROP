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

// ── Event System ──────────────────────────────
const ROUND_EVENTS = [
  { id: 'gold_rush',   label: '💰 GOLD RUSH',   desc: 'All slot values +75%',    color: '#ffd700' },
  { id: 'chaos',       label: '🌀 CHAOS MODE',  desc: 'Pegs push balls sideways', color: '#bf00ff' },
  { id: 'danger',      label: '💀 DANGER MODE', desc: 'Extra bomb slots!',        color: '#ff2060' },
  { id: 'low_gravity', label: '🌙 LOW GRAVITY', desc: 'Balls fall in slow motion',color: '#00f5ff' },
  { id: 'none',        label: '',               desc: '',                         color: '' },
  { id: 'none',        label: '',               desc: '',                         color: '' },
];

function pickRoundEvent() {
  return ROUND_EVENTS[Math.floor(Math.random() * ROUND_EVENTS.length)];
}

// ── Special Peg Types ─────────────────────────
// normal (most), gold (x2 bonus), red (explosion), green (slow-mo), purple (teleport)
const PEG_TYPE_WEIGHTS = [
  { type: 'gold',   weight: 6  },
  { type: 'red',    weight: 4  },
  { type: 'green',  weight: 3  },
  { type: 'purple', weight: 2  },
  { type: 'normal', weight: 85 },
];
function randomPegType() {
  let r = Math.random() * 100;
  for (const { type, weight } of PEG_TYPE_WEIGHTS) { r -= weight; if (r <= 0) return type; }
  return 'normal';
}
const PEG_COLORS = {
  normal: { base: 'rgba(55,90,130,0.55)',  glow: '#00f5ff', hit: '160,230,255' },
  gold:   { base: 'rgba(200,160,0,0.7)',   glow: '#ffd700', hit: '255,230,80'  },
  red:    { base: 'rgba(180,40,20,0.7)',   glow: '#ff4400', hit: '255,120,60'  },
  green:  { base: 'rgba(20,160,60,0.7)',   glow: '#00ff88', hit: '100,255,160' },
  purple: { base: 'rgba(120,20,200,0.7)',  glow: '#cc44ff', hit: '210,120,255' },
};

// ── Rolling Score ─────────────────────────────
let displayScore = 0;   // animated display value
let targetScore  = 0;   // real score (snaps instantly in logic)

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

  // Round event
  roundEvent: null,
  eventBannerTimer: 0,
  extraBombSlot: -1,

  // Moving launcher
  launcher: { x: CANVAS_W / 2, dir: 1, speed: 180 },
  launcherActive: false,

  // Hit-stop
  hitStopTimer: 0,

  // Special pegs
  goldenPegBonus: 0,

  // Build system state
  critChargeCount: 0,
  critChargeReady: false,
  buildFiredCritCharge: false,
  pegHitBonusAccum: 0,
  rouletteSlotIndex: -1,
  rouletteSlotMult: 1,
  wildEventActive: null,
};

// ─────────────────────────────────────────────
// SECTION 4: Matter.js Setup
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
      const type = randomPegType();
      const peg = Bodies.circle(x, y, PEG_RADIUS, { ...pegOpts, label: `peg_${type}` });
      pegBodies.push({ body: peg, x, y, type });
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
      handleSlotLand(parseInt(other.label.split('_')[1], 10), landedBall); continue;
    }
    if (other.label && other.label.startsWith('peg')) {
      playSound('peg');
      const { x, y } = other.position;
      const pegData = pegBodies.find(p => p.body === other);
      const pegType = pegData ? pegData.type : 'normal';
      const col = PEG_COLORS[pegType];
      const imp = getPegImpactScale();
      state.pegHits.push({ x, y, timer: 0.22 + imp * 0.04, maxTimer: 0.22 + imp * 0.04, pegType });
      spawnPegParticles(x, y, col.glow);
      if (imp > 1) spawnImpactWave(x, y, col.glow, 18 + imp * 10, 1 + imp * 0.4);

      // Build: Explosive Peg (Chaos)
      if (getActiveBuild() === 'chaos') {
        const expChance = getChaosExplosivePegChance();
        if (expChance > 0 && Math.random() < expChance) {
          Body.setVelocity(landedBall, { x: (Math.random() - 0.5) * 9, y: -(1 + Math.random() * 3.5) });
          spawnPegParticles(x, y, '#ff4d4d');
          spawnImpactWave(x, y, '#ff4d4d', 28, 2.5);
          state.floatingTexts.push({ x, y: y - 18, text: '💥 CHAOS!', color: '#ff4d4d', life: 0.75, maxLife: 0.75, size: 12 });
        }
      }
      // Build: Crush Impact (Heavy)
      if (getActiveBuild() === 'heavy') {
        const crushBonus = getHeavyCrushImpactBonus();
        if (crushBonus > 0) state.pegHitBonusAccum += crushBonus;
      }

      if (pegType === 'gold') {
        state.goldenPegBonus += 1;
        state.floatingTexts.push({ x, y: y - 12, text: '+x2 GOLD', color: '#ffd700', life: 0.9, maxLife: 0.9, size: 13 });
        spawnImpactWave(x, y, '#ffd700', 28, 2);
      } else if (pegType === 'red') {
        state.screenShake = Math.max(state.screenShake, 0.22);
        spawnLandingBurst(x, y, '#ff4400', 10, 130);
        spawnImpactWave(x, y, '#ff4400', 32, 2.5);
        state.floatingTexts.push({ x, y: y - 12, text: '💥 BOOM', color: '#ff6633', life: 0.8, maxLife: 0.8, size: 12 });
      } else if (pegType === 'green') {
        if (state.slowMotion <= 0) {
          state.slowMotion = 1.4;
          state.floatingTexts.push({ x, y: y - 12, text: '🌿 SLOW', color: '#00ff88', life: 0.9, maxLife: 0.9, size: 12 });
          spawnImpactWave(x, y, '#00ff88', 28, 2);
        }
      } else if (pegType === 'purple') {
        const ball = landedBall;
        if (ball) {
          const newX = BALL_RADIUS + 20 + Math.random() * (CANVAS_W - BALL_RADIUS * 2 - 40);
          spawnLandingBurst(x, y, '#cc44ff', 12, 140);
          spawnImpactWave(x, y, '#cc44ff', 30, 2);
          Body.setPosition(ball, { x: newX, y: ball.position.y });
          Body.setVelocity(ball, { x: (Math.random() - 0.5) * 3, y: Math.abs(ball.velocity.y) });
          state.floatingTexts.push({ x, y: y - 12, text: '✨ WARP', color: '#cc44ff', life: 0.85, maxLife: 0.85, size: 12 });
        }
      }
    }
  }
}

function handleSlotLand(slotIndex, landedBody) {
  if (state.ballsInPlay === 0) return;
  if (landedBody !== state.ballBody && landedBody !== state.ballBody2) return;

  const isBomb  = slotIndex === state.bombSlot || slotIndex === state.extraBombSlot;
  const isCrit  = slotIndex === state.criticalSlot;
  const isSuper = slotIndex === SUPER_JACKPOT_IDX;
  const baseValue = SLOT_VALUES[slotIndex];
  const nearSuper = Math.abs(slotIndex - SUPER_JACKPOT_IDX) === 1;

  let mult = state.multiplier;
  if (state.luckyMode)    mult *= 2;
  if (isCrit && !isBomb)  mult *= 3;
  mult += getLuckyBounceMult();
  // Gold peg bonus: each gold peg hit doubles effective multiplier
  if (state.goldenPegBonus > 0 && !isBomb) mult *= Math.pow(2, state.goldenPegBonus);
  state.goldenPegBonus = 0;
  // Gold Rush event: +75% to all positive slots
  if (state.roundEvent && state.roundEvent.id === 'gold_rush' && !isBomb) mult *= 1.75;

  let timingBonus = false;
  if (state.movingBonus && !isBomb) {
    const bSlot = Math.round(Math.max(0, Math.min(SLOT_COUNT - 1, state.movingBonus.pos)));
    if (bSlot === slotIndex) { timingBonus = true; mult *= 2; }
  }

  // ── Build: mult-phase effects ──
  let _buildCritFired = false, _buildRouletteFired = false, _buildRouletteHitMult = 1, _buildWildBall = false, _buildCrushBonus = 0;
  if (!isBomb) {
    const _b = getActiveBuild();
    if (_b === 'lucky') {
      const ccLvl = getUpgradeLevel('lucky_critCharge');
      if (ccLvl > 0) {
        const needed = getLuckyCritChargeNeeded();
        if (state.critChargeReady && !isCrit) {
          mult *= 3; _buildCritFired = true;
          state.critChargeReady = false; state.critChargeCount = 0;
        } else if (!isCrit) {
          state.critChargeCount++;
          if (state.critChargeCount >= needed) { state.critChargeReady = true; state.critChargeCount = 0; }
        } else { state.critChargeCount = 0; state.critChargeReady = false; }
      }
    } else if (_b === 'chaos') {
      if (state.wildEventActive === 'score_boost') { mult *= 1.5; state.wildEventActive = null; }
      else if (state.wildEventActive === 'free_ball') { _buildWildBall = true; state.wildEventActive = null; }
      else { state.wildEventActive = null; }
      if (state.rouletteSlotIndex === slotIndex) {
        _buildRouletteFired = true; _buildRouletteHitMult = state.rouletteSlotMult;
        mult *= state.rouletteSlotMult; state.rouletteSlotIndex = -1;
      }
    }
  }

  const divisor = state.currentDropIsMulti ? getMultiBallDivisor() : 1;
  let points = isBomb ? -300 : Math.round(baseValue * mult / divisor);

  // ── Build: post-points adjustments ──
  if (!isBomb) {
    if (getActiveBuild() === 'heavy') {
      const floor = getHeavyBonusFloor();
      if (floor > 0 && points < floor) points = floor;
      const crushAcc = state.pegHitBonusAccum;
      if (crushAcc > 0) { _buildCrushBonus = crushAcc; points += crushAcc; state.pegHitBonusAccum = 0; }
    }
    if (_buildWildBall) state.ballsRemaining++;
  }

  state.score = Math.max(0, state.score + points);
  targetScore  = state.score;
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

  if (isBomb) {
    spawnLandingBurst(fx, SLOT_Y, '#ff2060', 14, 160);
    spawnImpactWave(fx, SLOT_Y, '#ff2060', 80, 2.5);
    state.screenFlash = 0.2; state.screenFlashColor = '255,32,96';
    state.screenShake = 0.3; playSound('bomb');
    hapticVibrate([60, 30, 60]);
  } else if (isSuper) {
    spawnJackpotExplosion(fx, SLOT_Y, true);
    // Extra burst rings for super jackpot
    for (let r = 0; r < 3; r++) {
      setTimeout(() => spawnImpactWave(fx, SLOT_Y, '#cc00ff', 100 + r * 30, 3), r * 120);
    }
    spawnLandingBurst(fx, SLOT_Y, '#ff00ff', 30, 260);
    state.screenFlash = 0.75; state.screenFlashColor = '200,0,255';
    state.slowMotion = 1.2; state.screenShake = 0.85;
    state.hitStopTimer = 0.09;
    engine.timing.timeScale = 0.15;
    playSound('superjackpot');
    hapticVibrate([30, 60, 30, 60, 80]);
  } else if (baseValue >= 500) {
    spawnJackpotExplosion(fx, SLOT_Y, false);
    spawnImpactWave(fx, SLOT_Y, '#ffd700', 90, 2.8);
    state.screenFlash = 0.45; state.screenFlashColor = '255,215,0';
    state.screenShake = 0.45; state.hitStopTimer = 0.05;
    playSound('jackpot');
    hapticVibrate([20, 40, 30]);
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

  // Lucky Bounce: extra golden burst on every non-bomb land
  const luckyBounceLevel = getUpgradeLevel('luckyBounce');
  if (luckyBounceLevel > 0 && !isBomb) {
    const lbCount = 6 + luckyBounceLevel * 4;
    const lbSpeed = 80 + luckyBounceLevel * 20;
    spawnLandingBurst(fx, SLOT_Y, '#ffd700', lbCount, lbSpeed);
    spawnImpactWave(fx, SLOT_Y, '#ffd700', 40 + luckyBounceLevel * 12, 1.2 + luckyBounceLevel * 0.3);
  }

  state.floatingTexts.push({ x: fx, y: SLOT_Y - 10, text: label, color, life: 1.2, maxLife: 1.2 });

  // ── Build: special floating texts & effects ──
  if (!isBomb) {
    if (_buildCritFired) {
      state.floatingTexts.push({ x: fx, y: SLOT_Y - 52, text: '⚡ CHARGED CRIT!', color: '#ffe600', life: 1.3, maxLife: 1.3 });
      spawnLandingBurst(fx, SLOT_Y, '#ffe600', 12, 165);
      state.screenFlash = Math.max(state.screenFlash, 0.25); state.screenFlashColor = '255,230,0';
    } else if (state.critChargeReady && getActiveBuild() === 'lucky') {
      state.floatingTexts.push({ x: fx, y: SLOT_Y - 35, text: '⚡ CHARGE READY', color: '#ffaa00', life: 0.95, maxLife: 0.95 });
    }
    if (_buildWildBall) {
      state.floatingTexts.push({ x: fx, y: SLOT_Y - 50, text: '🌀 FREE BALL!', color: '#ff4d4d', life: 1.2, maxLife: 1.2 });
      spawnLandingBurst(fx, SLOT_Y, '#ff4d4d', 10, 145);
    }
    if (_buildRouletteFired) {
      state.floatingTexts.push({ x: fx, y: SLOT_Y - 50, text: `🎰 ROULETTE x${_buildRouletteHitMult}!`, color: '#ff4d4d', life: 1.4, maxLife: 1.4 });
      spawnLandingBurst(fx, SLOT_Y, '#ff4d4d', 16, 180);
      spawnImpactWave(fx, SLOT_Y, '#ff4d4d', 72, 2.6);
      state.screenFlash = Math.max(state.screenFlash, 0.3); state.screenFlashColor = '255,77,77';
    }
    if (_buildCrushBonus > 0) {
      state.floatingTexts.push({ x: fx, y: SLOT_Y - 45, text: `💪 +${_buildCrushBonus} CRUSH`, color: '#00c8f0', life: 1.0, maxLife: 1.0 });
    }
    const chainExt = getLuckyFortuneChainExt();
    if (chainExt > 0 && (isCrit || isSuper) && getActiveBuild() === 'lucky') {
      state.multiplierTimer = Math.min((state.multiplierTimer || 0) + chainExt, 6.0);
      state.floatingTexts.push({ x: fx, y: SLOT_Y - 46, text: `🔗 +${chainExt}s CHAIN`, color: '#ffd700', life: 1.0, maxLife: 1.0 });
    }
  }

  state.slotFlash = { index: slotIndex, timer: 0.35 };

  updateHUD();

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
    else { enableDropButton(true); state.launcherActive = true; }
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

  // Use launcher position instead of aim
  let x = state.launcherActive ? state.launcher.x : aimX;
  if (state.isFirstBall) { x = x + (CANVAS_W / 2 - x) * 0.7; state.isFirstBall = false; }

  // Low gravity event
  const gravityMod = state.roundEvent && state.roundEvent.id === 'low_gravity' ? 0.4 : 1.0;
  engine.gravity.y = 2.5 * gravityMod;

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
  state.launcherActive = false;
  state.goldenPegBonus = 0;
  state.buildFiredCritCharge = false;

  // ── Build drop setup ──
  const _buildDrop = getActiveBuild();
  if (_buildDrop === 'lucky') {
    const magnetChance = getLuckyJackpotMagnetChance();
    if (magnetChance > 0 && Math.random() < magnetChance) {
      const centerX = CANVAS_W / 2;
      const newX1 = clamp(x + (centerX - x) * 0.55);
      Body.setPosition(state.ballBody, { x: newX1, y: BALL_START_Y });
      if (state.ballBody2) Body.setPosition(state.ballBody2, { x: clamp(newX1 + (Math.random() - 0.5) * spread), y: BALL_START_Y + 12 });
      state.floatingTexts.push({ x: CANVAS_W / 2, y: CANVAS_H * 0.35, text: '🧲 MAGNET!', color: '#ffd700', life: 1.1, maxLife: 1.1, size: 13 });
    }
  } else if (_buildDrop === 'chaos') {
    const wildLvl = getChaosWildEventLevel();
    if (wildLvl > 0) {
      const pool = ['score_boost', 'free_ball', 'double_slot'].slice(0, wildLvl);
      state.wildEventActive = pool[Math.floor(Math.random() * pool.length)];
      const evLabel = { score_boost: '🌀 SCORE BOOST!', free_ball: '🌀 FREE BALL!', double_slot: '🌀 WILD SLOT!' };
      state.floatingTexts.push({ x: CANVAS_W / 2, y: CANVAS_H * 0.35, text: evLabel[state.wildEventActive], color: '#ff4d4d', life: 1.2, maxLife: 1.2, size: 13 });
    } else {
      state.wildEventActive = null;
    }
    const rouletteMult = getChaosRouletteMultiplier();
    if (rouletteMult > 1) {
      state.rouletteSlotIndex = Math.floor(Math.random() * SLOT_COUNT);
      state.rouletteSlotMult = rouletteMult;
    } else {
      state.rouletteSlotIndex = -1;
    }
  } else if (_buildDrop === 'heavy') {
    state.pegHitBonusAccum = 0;
  }

  if (state.ballsRemaining === 0) { state.luckyMode = true; state.luckyBanner = 2.5; playSound('lucky'); }

  updateHUD(); enableDropButton(false);
}

// ─────────────────────────────────────────────
// SECTION 10: Particle & Wave System
// ─────────────────────────────────────────────
function spawnPegParticles(px, py, color = '#00f5ff') {
  const imp = getPegImpactScale();
  const count = Math.round((color === '#00f5ff' ? 5 + Math.floor(Math.random() * 3) : 7 + Math.floor(Math.random() * 4)) * imp);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 130;
    state.particles.push({
      x: px, y: py, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20,
      life: 0.18 + Math.random() * 0.14, maxLife: 0.32,
      color: Math.random() < 0.65 ? color : '#ffffff',
      size: 1.5 + Math.random() * 2.5, gravity: 180, type: 'spark',
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

function resizeGame() {
  if (!canvas) return;
  const wrapper = document.getElementById('canvasContainer');
  const scale = Math.min(
    wrapper.clientWidth  / CANVAS_W,
    wrapper.clientHeight / CANVAS_H
  );
  canvas.style.width  = `${CANVAS_W * scale}px`;
  canvas.style.height = `${CANVAS_H * scale}px`;
}

function initCanvas() {
  canvas = document.getElementById('gameCanvas');
  canvas.width = CANVAS_W; canvas.height = CANVAS_H;
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchend', onCanvasTouch, { passive: false });
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', resizeGame);
  window.addEventListener('orientationchange', resizeGame);
  resizeGame();
  requestAnimationFrame(renderLoop);
}

function onCanvasClick(e) {
  if (!state.gameActive) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
  state.lastAimX = x;
  if (state.launcherActive) dropBall(state.launcher.x);
  else dropBall(x);
}

function onCanvasTouch(e) {
  if (!state.gameActive) return;
  e.preventDefault();
  const touch = e.changedTouches[0];
  const rect  = canvas.getBoundingClientRect();
  const x     = (touch.clientX - rect.left) * (CANVAS_W / rect.width);
  state.lastAimX = x;
  if (state.launcherActive) dropBall(state.launcher.x);
  else dropBall(x);
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
  // Hit-stop: freeze everything briefly on super jackpot
  if (state.hitStopTimer > 0) {
    state.hitStopTimer -= dt;
    engine.timing.timeScale = 0;
    return;
  }

  if (state.slowMotion > 0) {
    state.slowMotion -= dt;
    engine.timing.timeScale = state.slowMotion > 0 ? 0.15 + (1 - state.slowMotion / 1.2) * 0.85 : 1.0;
    if (state.slowMotion <= 0) engine.timing.timeScale = 1.0;
  }
  if (state.screenShake > 0) state.screenShake -= dt;
  if (state.eventBannerTimer > 0) state.eventBannerTimer -= dt;

  // Rolling score animation
  if (displayScore !== targetScore) {
    const diff = targetScore - displayScore;
    const step = Math.ceil(Math.abs(diff) * Math.min(dt * 8, 1));
    displayScore += diff > 0 ? Math.min(step, diff) : Math.max(-step, diff);
    document.getElementById('scoreDisplay').textContent = Math.round(displayScore).toLocaleString();
  }

  // Stuck-ball detection: if a ball hasn't moved >3px in 1.5s, kick it downward
  if (!state._stuckTrack) state._stuckTrack = {};
  for (const [key, ball] of [['b1', state.ballBody], ['b2', state.ballBody2]]) {
    if (!ball) { delete state._stuckTrack[key]; continue; }
    const t = state._stuckTrack[key];
    const { x, y } = ball.position;
    if (!t) { state._stuckTrack[key] = { x, y, timer: 0 }; continue; }
    const moved = Math.hypot(x - t.x, y - t.y);
    if (moved > 3) { t.x = x; t.y = y; t.timer = 0; }
    else {
      t.timer += dt;
      if (t.timer > 1.5) {
        Body.setVelocity(ball, { x: (Math.random() - 0.5) * 3, y: 6 });
        t.timer = 0; t.x = x; t.y = y;
      }
    }
  }

  // Moving launcher when ready to drop
  if (state.launcherActive && state.ballsInPlay === 0 && state.ballsRemaining > 0) {
    const l = state.launcher;
    l.x += l.dir * l.speed * dt;
    if (l.x >= CANVAS_W - BALL_RADIUS - 10) { l.x = CANVAS_W - BALL_RADIUS - 10; l.dir = -1; }
    if (l.x <= BALL_RADIUS + 10)            { l.x = BALL_RADIUS + 10;             l.dir =  1; }
  }

  // Orphan guard: ballsInPlay positive but no bodies exist → immediate recovery
  if (state.gameActive && state.ballsInPlay > 0 && !state.ballBody && !state.ballBody2) {
    state.ballsInPlay = 0; state.ballInPlay = false;
    if (state.ballsRemaining <= 0) setTimeout(showGameOver, 400);
    else { enableDropButton(true); state.launcherActive = true; }
  }

  // Moving bonus slot
  if (state.movingBonus) {
    const mb = state.movingBonus;
    const ballsDropped = BALLS_START - state.ballsRemaining;
    mb.speed = 1.2 + ballsDropped * 0.45;
    mb.pos += mb.direction * mb.speed * dt;
    if (mb.pos >= SLOT_COUNT - 0.5) { mb.pos = SLOT_COUNT - 0.5; mb.direction = -1; }
    if (mb.pos <= -0.5)             { mb.pos = -0.5;              mb.direction =  1; }
  }

  // CHAOS MODE: nudge balls sideways on peg hit
  const isChaos = state.roundEvent && state.roundEvent.id === 'chaos';

  function updateBallPhysics(ball) {
    if (!ball) return;
    const { x, y } = ball.position;
    // Ball acceleration in lower half
    if (y > CANVAS_H * 0.5 && ball.velocity.y > 0) {
      Body.setVelocity(ball, { x: ball.velocity.x, y: Math.min(ball.velocity.y + 0.2, 20) });
    }
    // Chaos: random sideways nudges
    if (isChaos && Math.random() < 0.015) {
      Body.setVelocity(ball, { x: ball.velocity.x + (Math.random() - 0.5) * 4, y: ball.velocity.y });
    }

    // ── Near-Miss Psychology ────────────────────────────────────────
    // Secretly bias ball toward jackpot edge when in lower half —
    // creates rim-bouncing "SO CLOSE!" moments that drive replays.
    // Forces are tiny and imperceptible; aggregate effect is dramatic.
    if (y > CANVAS_H * 0.56) {
      const slotW   = CANVAS_W / SLOT_COUNT;
      const jcx     = (SUPER_JACKPOT_IDX + 0.5) * slotW; // jackpot centre X
      const dx      = x - jcx;
      const absDx   = Math.abs(dx);

      // Zone 1: 0.38–2.0 slots away — gentle drift toward jackpot edge
      if (absDx > slotW * 0.38 && absDx < slotW * 2.0) {
        const depth = 1 - absDx / (slotW * 2.0); // stronger closer in
        if (Math.random() < 0.024 * depth) {
          const edgeBias = -Math.sign(dx) * (0.28 + depth * 0.22);
          Body.setVelocity(ball, { x: ball.velocity.x + edgeBias, y: ball.velocity.y });
        }
      }

      // Zone 2: 0.5–1.15 slots away — rim-tease micro-nudge inward
      if (absDx > slotW * 0.5 && absDx < slotW * 1.15 && Math.random() < 0.016) {
        const rimNudge = -Math.sign(dx) * 0.2;
        Body.setVelocity(ball, { x: ball.velocity.x + rimNudge, y: ball.velocity.y });
      }

      // Zone 3: inside jackpot (< 0.38 slots from centre) — occasional
      // slight outward push so ball bounces rim instead of auto-winning
      if (absDx < slotW * 0.38 && Math.random() < 0.009) {
        const rimEject = Math.sign(dx || 1) * 0.32;
        Body.setVelocity(ball, { x: ball.velocity.x + rimEject, y: ball.velocity.y });
      }
    }
  }

  if (state.ballBody) {
    updateBallPhysics(state.ballBody);
    const { x, y } = state.ballBody.position;
    state.ballTrail.unshift({ x, y });
    if (state.ballTrail.length > 22) state.ballTrail.pop();
    if (y > CANVAS_H - 5) {
      World.remove(engine.world, state.ballBody);
      state.ballBody = null; state.ballTrail = [];
      state.ballsInPlay = Math.max(0, state.ballsInPlay - 1);
      state.ballInPlay = state.ballsInPlay > 0;
      if (state.ballsInPlay === 0) {
        if (state.ballsRemaining <= 0) setTimeout(showGameOver, 400);
        else { enableDropButton(true); state.launcherActive = true; }
      }
    }
  }
  if (state.ballBody2) {
    updateBallPhysics(state.ballBody2);
    const { x: x2, y: y2 } = state.ballBody2.position;
    state.ballTrail2.unshift({ x: x2, y: y2 });
    if (state.ballTrail2.length > 22) state.ballTrail2.pop();
    if (y2 > CANVAS_H - 5) {
      World.remove(engine.world, state.ballBody2);
      state.ballBody2 = null; state.ballTrail2 = [];
      state.ballsInPlay = Math.max(0, state.ballsInPlay - 1);
      state.ballInPlay = state.ballsInPlay > 0;
      if (state.ballsInPlay === 0) {
        if (state.ballsRemaining <= 0) setTimeout(showGameOver, 400);
        else { enableDropButton(true); state.launcherActive = true; }
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
  const isGoldRushActive = state.roundEvent && state.roundEvent.id === 'gold_rush';
  state.ambientMoteTimer += dt;
  const moteRate = isGoldRushActive ? 0.025 : 0.1;
  if (state.ambientMoteTimer > moteRate) {
    state.ambientMoteTimer = 0;
    const mx = Math.random() * CANVAS_W;
    const si = Math.min(SLOT_COUNT - 1, Math.floor(mx / (CANVAS_W / SLOT_COUNT)));
    const v  = SLOT_VALUES[si];
    const mc = isGoldRushActive ? (Math.random() < 0.7 ? '255,200,0' : '255,140,0')
             : si === state.bombSlot ? '255,30,80' : si === SUPER_JACKPOT_IDX ? '200,0,255' : v >= 500 ? '255,210,0' : v >= 200 ? '0,200,240' : '60,60,140';
    const lt = 1.2 + Math.random() * 1.2;
    const sz = isGoldRushActive ? 1.2 + Math.random() * 3.0 : 0.8 + Math.random() * 1.8;
    state.ambientMotes.push({ x: mx + (Math.random()-0.5)*16, y: SLOT_Y - 2, vy: -(22 + Math.random() * 48), life: lt, maxLife: lt, size: sz, color: mc });
    // Gold Rush: also rain gold down from the top
    if (isGoldRushActive && Math.random() < 0.45) {
      const lt2 = 1.5 + Math.random() * 1.4;
      state.ambientMotes.push({
        x: Math.random() * CANVAS_W, y: -6,
        vy: 55 + Math.random() * 90,
        life: lt2, maxLife: lt2,
        size: 0.9 + Math.random() * 2.2,
        color: Math.random() < 0.55 ? '255,215,0' : '255,170,0'
      });
    }
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

  drawBackground();
  if (state.roundEvent && state.roundEvent.id === 'gold_rush') drawGoldRushAura();
  drawAmbientMotes(); drawImpactWaves();
  if (state.gameActive && state.ballsInPlay === 0 && state.ballsRemaining > 0) drawAimGuide();
  drawSlots(); drawMovingBonus(); drawPegs(); drawBallTrail(); if (state.ballTrail2.length > 1) drawBallTrail2(); drawBall(); if (state.ballBody2) drawBall2(); drawParticles(); drawFloatingTexts();
  if (state.comboTimer > 0 && state.multiplier >= 2) drawMultiplierBanner();
  else if (state.comboTimer > 0) drawComboText();
  if (state.luckyBanner > 0)        drawLuckyBanner();
  if (state.nearMissTimer > 0)      drawNearMiss();
  if (state.multiplier > 1)         drawMultiplierHUD();
  if (state.eventBannerTimer > 0)   drawEventBanner();
  if (state.gameActive)             drawActiveEventHUD();
  if (state.screenFlash > 0)        drawScreenFlash();
  ctx.restore();
}

function drawBackground() {
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bgGrad.addColorStop(0, '#030310'); bgGrad.addColorStop(0.7, '#050514'); bgGrad.addColorStop(1, '#080810');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (state.luckyMode) {
    ctx.fillStyle = `rgba(255,230,0,${0.06 + 0.02 * Math.sin(state.superPulse)})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // Ultra-faint grid — barely visible infrastructure
  ctx.strokeStyle = 'rgba(0,245,255,0.012)'; ctx.lineWidth = 1;
  for (let x = 0; x <= CANVAS_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SLOT_Y); ctx.stroke(); }
  for (let y = 0; y <= SLOT_Y; y += 40)   { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }
}

function drawAimGuide() {
  if (state.launcherActive) {
    drawLauncher();
    return;
  }
  const x = Math.max(BALL_RADIUS + 10, Math.min(CANVAS_W - BALL_RADIUS - 10, state.lastAimX));
  ctx.save();
  ctx.strokeStyle = 'rgba(0,245,255,0.22)'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.moveTo(x, BALL_START_Y + BALL_RADIUS); ctx.lineTo(x, 80); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = state.luckyMode ? 'rgba(255,230,0,0.7)' : 'rgba(0,245,255,0.5)';
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, BALL_START_Y, BALL_RADIUS, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawLauncher() {
  const lx = state.launcher.x;
  const ly = BALL_START_Y;
  const pulse = 0.5 + 0.5 * Math.sin(state.superPulse * 3);
  const color = state.luckyMode ? '#ffe600' : '#00f5ff';
  const colorRGB = state.luckyMode ? '255,230,0' : '0,245,255';

  ctx.save();

  // Dashed drop line
  ctx.strokeStyle = `rgba(${colorRGB},0.25)`; ctx.lineWidth = 1; ctx.setLineDash([5, 7]);
  ctx.beginPath(); ctx.moveTo(lx, ly + BALL_RADIUS + 2); ctx.lineTo(lx, CANVAS_H * 0.45); ctx.stroke();
  ctx.setLineDash([]);

  // Outer glow ring
  ctx.shadowBlur = 18 + pulse * 10; ctx.shadowColor = color;
  ctx.strokeStyle = `rgba(${colorRGB},${0.55 + pulse * 0.35})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(lx, ly, BALL_RADIUS + 6, 0, Math.PI * 2); ctx.stroke();

  // Ball inside launcher (reflects Ball Weight visual size)
  const vr = getBallVisualRadius();
  const aura = getLuckyAura();
  if (aura > 0 && !state.luckyMode) {
    ctx.shadowBlur = 14 + pulse * 10; ctx.shadowColor = '#ffd700';
    ctx.strokeStyle = `rgba(255,215,0,${aura * (0.45 + pulse * 0.35)})`;
    ctx.lineWidth = 1.5 + aura * 3;
    ctx.beginPath(); ctx.arc(lx, ly, vr + 3 + aura * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  const grad = ctx.createRadialGradient(lx - 3, ly - 3, 1, lx, ly, vr);
  if (state.luckyMode) {
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.4, '#fff7cc');
    grad.addColorStop(0.7, '#ffe600'); grad.addColorStop(1, '#ff8c00');
  } else {
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, '#aaeeff');
    grad.addColorStop(0.7, '#00b4d8'); grad.addColorStop(1, '#004488');
  }
  ctx.shadowBlur = 22 + pulse * 8; ctx.shadowColor = color;
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(lx, ly, vr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const hiOff = vr * 0.33;
  ctx.beginPath(); ctx.arc(lx - hiOff, ly - hiOff, 3.5 + vr * 0.1, 0, Math.PI * 2); ctx.fill();

  // "TAP TO DROP" label
  ctx.font = 'bold 10px Orbitron, sans-serif';
  ctx.fillStyle = `rgba(${colorRGB},${0.7 + pulse * 0.25})`;
  ctx.shadowBlur = 8; ctx.shadowColor = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('TAP TO DROP', CANVAS_W / 2, ly - BALL_RADIUS - 10);

  ctx.restore();
}

function drawEventBanner() {
  const ev = state.roundEvent;
  if (!ev || ev.id === 'none' || state.eventBannerTimer <= 0) return;
  const alpha = Math.min(state.eventBannerTimer * 1.5, 1) * Math.min((3.5 - state.eventBannerTimer) * 3, 1);
  ctx.save();
  ctx.globalAlpha = alpha;

  // Background strip
  const bx = 20, by = CANVAS_H / 2 - 44, bw = CANVAS_W - 40, bh = 64;
  const bgGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
  bgGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bgGrad.addColorStop(0.2, 'rgba(0,0,0,0.82)');
  bgGrad.addColorStop(0.8, 'rgba(0,0,0,0.82)');
  bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bgGrad;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();

  // Border glow
  ctx.strokeStyle = ev.color; ctx.lineWidth = 1.5;
  ctx.shadowBlur = 16; ctx.shadowColor = ev.color;
  ctx.beginPath(); ctx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, 13); ctx.stroke();

  // Label
  ctx.shadowBlur = 20; ctx.shadowColor = ev.color;
  ctx.fillStyle = ev.color;
  ctx.font = 'bold 22px Orbitron, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ev.label, CANVAS_W / 2, by + bh / 2 - 9);

  // Desc
  ctx.shadowBlur = 6; ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.fillText(ev.desc, CANVAS_W / 2, by + bh / 2 + 14);

  ctx.restore();
}

function drawSlots() {
  const sw = CANVAS_W / SLOT_COUNT;
  const sb = SLOT_Y + SLOT_HEIGHT;
  const isGoldRush = state.roundEvent && state.roundEvent.id === 'gold_rush';

  // Dark slot zone base
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, SLOT_Y, CANVAS_W, SLOT_HEIGHT);

  // Gold Rush: golden shimmer base over entire slot zone
  if (isGoldRush) {
    const gp = 0.5 + 0.5 * Math.sin(state.superPulse * 1.5);
    ctx.fillStyle = `rgba(255,150,0,${0.08 + gp * 0.06})`; ctx.fillRect(0, SLOT_Y, CANVAS_W, SLOT_HEIGHT);
  }

  // Pulsing aura rising from reward zone (atmospheric)
  const auraGrad = ctx.createLinearGradient(0, SLOT_Y - 55, 0, SLOT_Y);
  auraGrad.addColorStop(0, 'rgba(0,0,0,0)');
  const sp = isGoldRush     ? `rgba(255,170,0,${0.16 + 0.08 * Math.sin(state.superPulse * 1.4)})`
           : state.luckyMode ? `rgba(255,215,0,${0.06 + 0.04 * Math.sin(state.superPulse * 0.7)})`
                              : `rgba(120,0,200,${0.07 + 0.04 * Math.sin(state.superPulse * 0.7)})`;
  auraGrad.addColorStop(1, sp);
  ctx.fillStyle = auraGrad; ctx.fillRect(0, SLOT_Y - 55, CANVAS_W, 55);

  for (let i = 0; i < SLOT_COUNT; i++) {
    const x = i * sw; const val = SLOT_VALUES[i];
    const isBomb = i === state.bombSlot || i === state.extraBombSlot;
    const isCrit = i === state.criticalSlot;
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
    else if (isGoldRush) {
      const gv = 170 + 55 * Math.abs(Math.sin(state.superPulse * 1.7 + i * 0.45));
      if (isSuper) { topRGB = `255,${Math.round(gv)},0`; glowColor = '#ffcc00'; }
      else if (isCrit) { topRGB = `255,${Math.round(gv * 0.7)},0`; glowColor = '#ffaa00'; }
      else if (val >= 500) { topRGB = `255,${Math.round(gv)},10`; glowColor = '#ffd700'; }
      else if (val >= 200) { topRGB = `255,${Math.round(gv * 0.62)},0`; glowColor = '#ffa500'; }
      else { topRGB = `${110 + Math.round(gv * 0.5)},${65 + Math.round(gv * 0.3)},0`; glowColor = '#cc7700'; }
    } else {
      if (isSuper){ topRGB = `${190 + 20*Math.abs(Math.sin(state.superPulse))},0,255`; glowColor = '#cc00ff'; }
      else if (isCrit) { topRGB = `255,${90 + 30*Math.abs(Math.sin(state.criticalPulse))},0`; glowColor = '#ff6b00'; }
      else if (val >= 500) { topRGB = '255,200,0'; glowColor = '#ffd700'; }
      else if (val >= 200) { topRGB = '0,185,235'; glowColor = '#00c8f0'; }
      else { topRGB = '35,35,80'; glowColor = null; }
    }

    const grad = ctx.createLinearGradient(x, SLOT_Y, x, sb);
    if (isFlashing) { grad.addColorStop(0, 'rgba(255,255,255,0.97)'); grad.addColorStop(1, 'rgba(200,200,200,0.9)'); }
    else { grad.addColorStop(0, `rgba(${topRGB},${isSuper ? 0.88 : 0.78})`); grad.addColorStop(1, 'rgba(0,0,0,0.9)'); }

    if (glowColor) { ctx.shadowBlur = isSuper ? 22 + 8*Math.sin(state.superPulse) : isBomb ? 14 : 12; ctx.shadowColor = glowColor; }
    ctx.fillStyle = grad; ctx.fillRect(x + 1, SLOT_Y, sw - 2, SLOT_HEIGHT);
    ctx.shadowBlur = 0;

    // Super jackpot spike above slot
    if (isSuper && !isFlashing) {
      const spikeH = isGoldRush ? 26 : 14;
      const spikeRGB = isGoldRush ? '255,200,0' : '200,0,255';
      const spikeShadow = isGoldRush ? '#ffcc00' : '#cc00ff';
      const spike = ctx.createLinearGradient(x + sw/2, SLOT_Y - spikeH, x + sw/2, SLOT_Y);
      spike.addColorStop(0, `rgba(${spikeRGB},0)`);
      spike.addColorStop(1, `rgba(${spikeRGB},${0.75 + 0.2*Math.sin(state.superPulse)})`);
      ctx.shadowBlur = isGoldRush ? 32 : 20; ctx.shadowColor = spikeShadow;
      ctx.fillStyle = spike;
      ctx.beginPath(); ctx.moveTo(x+2, SLOT_Y); ctx.lineTo(x + sw - 2, SLOT_Y); ctx.lineTo(x + sw/2, SLOT_Y - spikeH); ctx.closePath(); ctx.fill();
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
  const sepGlow  = isGoldRush ? '#ffcc00' : state.luckyMode ? '#ffe600' : '#00c8f0';
  const sepStroke = isGoldRush ? `rgba(255,200,0,${0.9 + 0.08*Math.sin(state.superPulse*2)})` : state.luckyMode ? 'rgba(255,230,0,0.75)' : 'rgba(0,200,240,0.6)';
  ctx.shadowBlur = isGoldRush ? 22 : 14; ctx.shadowColor = sepGlow;
  ctx.strokeStyle = sepStroke; ctx.lineWidth = isGoldRush ? 3 : 2;
  ctx.beginPath(); ctx.moveTo(0, SLOT_Y); ctx.lineTo(CANVAS_W, SLOT_Y); ctx.stroke();
  ctx.restore();
}

function drawPegs() {
  for (const { x, y, type } of pegBodies) {
    const hit = state.pegHits.find(h => Math.abs(h.x - x) < 2 && Math.abs(h.y - y) < 2);
    const hi  = hit ? hit.timer / hit.maxTimer : 0;
    const col = PEG_COLORS[type] || PEG_COLORS.normal;
    const isSpecial = type !== 'normal';

    ctx.save();

    // Scale-up animation on hit
    const scale = 1 + hi * 0.35;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);

    if (hi > 0) {
      // Hit flash — always bright
      const [r, g, b] = col.hit.split(',').map(Number);
      ctx.shadowBlur = 24 + hi * 20; ctx.shadowColor = col.glow;
      ctx.fillStyle = `rgba(${Math.round(r + (255-r)*hi*0.6)},${Math.round(g + (255-g)*hi*0.4)},${Math.round(b + (255-b)*hi*0.3)},${0.85 + hi * 0.15})`;
      ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS + (isSpecial ? 1.5 : 0), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = `rgba(255,255,255,${hi * 0.9})`;
      ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (isSpecial) {
      // Special peg idle: glowing + pulsing ring
      const pulse = 0.55 + 0.2 * Math.sin(state.superPulse * 1.8 + x * 0.05 + y * 0.03);
      ctx.shadowBlur = 10 + pulse * 8; ctx.shadowColor = col.glow;
      ctx.fillStyle = col.base;
      ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS + 1, 0, Math.PI * 2); ctx.fill();
      // Inner bright centre
      ctx.shadowBlur = 0;
      ctx.fillStyle = col.glow + '99';
      ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS * 0.55, 0, Math.PI * 2); ctx.fill();
      // Outer ring
      ctx.strokeStyle = col.glow + Math.round(pulse * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS + 2.8, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Normal peg idle
      const grPeg = state.roundEvent && state.roundEvent.id === 'gold_rush';
      if (grPeg) {
        const pulse = 0.42 + 0.32 * Math.sin(state.superPulse * 1.9 + x * 0.04 + y * 0.028);
        ctx.shadowBlur = 6 + pulse * 10; ctx.shadowColor = '#ffaa00';
        ctx.fillStyle = `rgba(200,135,0,${0.52 + pulse * 0.22})`;
        ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255,175,0,${0.28 + pulse * 0.38})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS + 2.4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(255,220,100,${0.18 + pulse * 0.12})`;
        ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = col.base;
        ctx.beginPath(); ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(160,200,240,0.2)';
        ctx.beginPath(); ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();
  }
}

function drawBallTrail() {
  if (state.ballTrail.length < 2) return;
  const tc = state.luckyMode ? '255,230,0' : '255,200,20';
  const ts = getTrailScale();
  const vr = getBallVisualRadius();
  for (let i = 0; i < state.ballTrail.length; i++) {
    const t = 1 - i / state.ballTrail.length;
    const { x, y } = state.ballTrail[i];
    ctx.save();
    ctx.shadowBlur = i === 0 ? 12 + ts * 8 : 0; ctx.shadowColor = state.luckyMode ? '#ffe600' : '#ffd700';
    ctx.beginPath(); ctx.arc(x, y, Math.max(vr * t * 0.95 * ts, 1.5), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tc},${t * 0.55})`; ctx.fill();
    ctx.restore();
  }
}

function drawBall() {
  if (!state.ballBody) return;
  const { x, y } = state.ballBody.position;
  const vr = getBallVisualRadius();
  const glowStr = getBallGlowStrength();
  const aura = getLuckyAura();
  ctx.save();

  // Lucky Bounce aura ring
  if (aura > 0 && !state.luckyMode) {
    const pulse = 0.5 + 0.5 * Math.sin(state.superPulse * 2.5);
    ctx.shadowBlur = 18 + pulse * 14; ctx.shadowColor = '#ffd700';
    ctx.strokeStyle = `rgba(255,215,0,${aura * (0.5 + pulse * 0.4)})`;
    ctx.lineWidth = 1.5 + aura * 3;
    ctx.beginPath(); ctx.arc(x, y, vr + 3 + aura * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.shadowBlur = state.luckyMode ? glowStr + 20 : glowStr;
  ctx.shadowColor = state.luckyMode ? '#ffe600' : '#ffc500';
  const grad = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, vr);
  if (state.luckyMode) { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#fff7cc'); grad.addColorStop(0.65,'#ffe600'); grad.addColorStop(1,'#ff8c00'); }
  else                 { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#fff0aa'); grad.addColorStop(0.65,'#ffd700'); grad.addColorStop(1,'#ff5500'); }
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, vr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const hiOff = vr * 0.33;
  ctx.beginPath(); ctx.arc(x - hiOff, y - hiOff, 3.5 + vr * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBallTrail2() {
  if (state.ballTrail2.length < 2) return;
  const tc = state.luckyMode ? '255,230,0' : '210,80,255';
  const ts = getTrailScale();
  const vr = getBallVisualRadius();
  for (let i = 0; i < state.ballTrail2.length; i++) {
    const t = 1 - i / state.ballTrail2.length;
    const { x, y } = state.ballTrail2[i];
    ctx.save();
    ctx.shadowBlur = i === 0 ? 12 + ts * 8 : 0; ctx.shadowColor = '#bf00ff';
    ctx.beginPath(); ctx.arc(x, y, Math.max(vr * t * 0.95 * ts, 1.5), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tc},${t * 0.55})`; ctx.fill();
    ctx.restore();
  }
}

function drawBall2() {
  if (!state.ballBody2) return;
  const { x, y } = state.ballBody2.position;
  const vr = getBallVisualRadius();
  const glowStr = getBallGlowStrength();
  const aura = getLuckyAura();
  ctx.save();

  if (aura > 0 && !state.luckyMode) {
    const pulse = 0.5 + 0.5 * Math.sin(state.superPulse * 2.5);
    ctx.shadowBlur = 18 + pulse * 14; ctx.shadowColor = '#bf00ff';
    ctx.strokeStyle = `rgba(191,0,255,${aura * (0.5 + pulse * 0.4)})`;
    ctx.lineWidth = 1.5 + aura * 3;
    ctx.beginPath(); ctx.arc(x, y, vr + 3 + aura * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.shadowBlur = state.luckyMode ? glowStr + 20 : glowStr;
  ctx.shadowColor = state.luckyMode ? '#ffe600' : '#cc00ff';
  const grad = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, vr);
  if (state.luckyMode) { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#fff7cc'); grad.addColorStop(0.65,'#ffe600'); grad.addColorStop(1,'#ff8c00'); }
  else                 { grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.25,'#f0aaff'); grad.addColorStop(0.65,'#bf00ff'); grad.addColorStop(1,'#6600aa'); }
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, vr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const hiOff = vr * 0.33;
  ctx.beginPath(); ctx.arc(x - hiOff, y - hiOff, 3.5 + vr * 0.1, 0, Math.PI * 2); ctx.fill();
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
  const shake = alpha > 0.5 ? (Math.random() - 0.5) * 5 : 0;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = 'bold 26px Orbitron, sans-serif'; ctx.fillStyle = '#ff6b00';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowBlur = 24; ctx.shadowColor = '#ff4400';
  ctx.fillText('SO CLOSE! 😱', CANVAS_W / 2 + shake, 68 + shake * 0.4);
  ctx.shadowBlur = 0;
  ctx.font = 'bold 11px Orbitron, sans-serif'; ctx.fillStyle = 'rgba(255,140,0,0.7)';
  ctx.fillText('JACKPOT WAS RIGHT THERE', CANVAS_W / 2, 92);
  ctx.restore();
}

function drawGoldRushAura() {
  const gp = 0.5 + 0.5 * Math.sin(state.superPulse * 1.3);
  // Subtle full-canvas golden overlay — transforms entire scene colour temperature
  ctx.fillStyle = `rgba(255,150,0,${0.025 + gp * 0.018})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Vignette from corners in warm amber
  const vg = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, CANVAS_W*0.3, CANVAS_W/2, CANVAS_H/2, CANVAS_W*0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(180,90,0,${0.12 + gp * 0.07})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawActiveEventHUD() {
  const ev = state.roundEvent;
  if (!ev || ev.id === 'none') return;
  ctx.save();
  const pulse = 0.55 + 0.45 * Math.sin(state.superPulse * 2.3);
  ctx.globalAlpha = 0.72 + pulse * 0.18;
  // Pill background
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath(); ctx.roundRect(6, 6, 122, 22, 9); ctx.fill();
  // Glowing border
  ctx.strokeStyle = ev.color; ctx.lineWidth = 1.2;
  ctx.shadowBlur = 7 + pulse * 7; ctx.shadowColor = ev.color;
  ctx.beginPath(); ctx.roundRect(6, 6, 122, 22, 9); ctx.stroke();
  // Label
  ctx.shadowBlur = 4; ctx.fillStyle = ev.color;
  ctx.font = 'bold 8.5px Orbitron, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(ev.label, 15, 17);
  ctx.restore();
}

function drawMultiplierHUD() {
  const color = state.multiplier >= 3 ? '#ff2060' : '#ff6b00';
  ctx.save(); ctx.fillStyle = color; ctx.shadowBlur = 12; ctx.shadowColor = color;
  ctx.font = 'bold 14px Orbitron, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`MULT x${state.multiplier}`, CANVAS_W - 10, 10); ctx.restore();
}

// ─────────────────────────────────────────────
// SECTION 13b: Haptics
// ─────────────────────────────────────────────
function hapticVibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* not supported */ }
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
  // Score display is driven by rolling animation in update(); only snap on reset
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

function startGame() {
  state.score = 0; state.ballsRemaining = BALLS_START; state.ballInPlay = false;
  state.ballBody = null; state.ballBody2 = null;
  state.ballTrail = []; state.ballTrail2 = [];
  state.ballsInPlay = 0; state.currentDropIsMulti = false;
  state.floatingTexts = [];
  state.slotFlash = null; state.comboCount = 0; state.comboTimer = 0;
  state.isFirstBall = true; state.gameActive = true; state.lastAimX = CANVAS_W / 2;
  state.multiplier = 1; state.multiplierTimer = 0; state.luckyMode = false; state.luckyBanner = 0;
  state.critChargeCount = 0; state.critChargeReady = false; state.buildFiredCritCharge = false;
  state.pegHitBonusAccum = 0; state.rouletteSlotIndex = -1; state.rouletteSlotMult = 1; state.wildEventActive = null;
  state.slowMotion = 0; state.screenShake = 0; state.nearMissTimer = 0;
  state.criticalPulse = 0; state.superPulse = 0;
  state.particles = []; state.impactWaves = []; state.slotBounce = new Array(SLOT_COUNT).fill(0);
  state.screenFlash = 0; state.screenFlashColor = '255,255,255'; state.pegHits = [];
  state.ambientMotes = []; state.ambientMoteTimer = 0;
  state.movingBonus = { pos: SLOT_COUNT / 2, direction: 1, speed: 1.2 };
  state.hitStopTimer = 0;

  // Reset rolling score
  displayScore = 0; targetScore = 0;
  document.getElementById('scoreDisplay').textContent = '0';

  // Moving launcher — starts active
  state.launcher = { x: CANVAS_W / 2, dir: 1, speed: 180 };
  state.launcherActive = true;

  // Pick round event
  state.roundEvent = pickRoundEvent();
  if (state.roundEvent.id !== 'none') {
    state.eventBannerTimer = 3.5;
  }

  SLOT_VALUES = [...BASE_SLOT_VALUES];
  do { state.bombSlot = Math.floor(Math.random() * SLOT_COUNT); } while (state.bombSlot === SUPER_JACKPOT_IDX);
  state.criticalSlot = pickCriticalSlot(state.bombSlot);
  // Danger mode: add extra bomb slot (exclude bomb, super jackpot, and crit)
  if (state.roundEvent && state.roundEvent.id === 'danger') {
    let extra;
    do { extra = Math.floor(Math.random() * SLOT_COUNT); }
    while (extra === state.bombSlot || extra === SUPER_JACKPOT_IDX || extra === state.criticalSlot);
    state.extraBombSlot = extra;
  } else { state.extraBombSlot = -1; }

  if (engine) engine.timing.timeScale = 1.0;
  engine.gravity.y = 2.5;
  initPhysics(); updateHUD(); enableDropButton(true);
  showUpgradeIndicators();
  const multiBtn = document.getElementById('multiBtn');
  if (isMultiBallUnlocked()) { multiBtn.classList.remove('hidden'); updateMultiBtn(); }
  else { multiBtn.classList.add('hidden'); }
  const btn = document.getElementById('dropBtn'); btn.textContent = 'DROP BALL'; btn.style.background = '';
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
}

function showGameOver() {
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

  document.getElementById('gameOverScreen').classList.remove('hidden');
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

  document.getElementById('playBtn').addEventListener('click', () => {
    try { getAudioCtx().resume(); } catch(e) {}
    startGame();
  });

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    try { getAudioCtx().resume(); } catch(e) {}
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
    document.getElementById('startCoinsVal').textContent = getCoins().toLocaleString();
  });

  document.getElementById('multiBtn').addEventListener('click', () => {
    state.multiBallOn = !state.multiBallOn;
    updateMultiBtn();
    enableDropButton(state.ballsInPlay === 0 && state.gameActive && state.ballsRemaining > 0);
  });

  document.getElementById('dropBtn').addEventListener('click', () => {
    if (state.launcherActive) dropBall(state.launcher.x);
    else dropBall(state.lastAimX);
  });

  initPhysics();
});
