'use strict';

// ─────────────────────────────────────────────
// META PROGRESSION — upgrades.js
// ─────────────────────────────────────────────

// ── Core upgrades (always available) ──
const UPGRADE_DEFS = [
  {
    id: 'ballWeight',
    name: 'Ball Weight',
    icon: '⚙️',
    desc: 'Stabilises the ball path, reducing random drift.',
    maxLevel: 5,
    costs: [50, 150, 350, 700, 1500],
    statLabels: ['±16', '±12', '±8', '±4', '±2', 'Locked In'],
  },
  {
    id: 'luckyBounce',
    name: 'Lucky Bounce',
    icon: '🍀',
    desc: 'Adds a permanent score multiplier to every landing.',
    maxLevel: 5,
    costs: [75, 200, 450, 900, 2000],
    statLabels: ['+0%', '+10%', '+25%', '+50%', '+80%', '+150%'],
  },
  {
    id: 'multiBall',
    name: 'Multi Ball',
    icon: '🎱',
    desc: 'Unlock 2-ball drops. Toggle ON/OFF during gameplay. Score is shared.',
    maxLevel: 3,
    costs: [100, 300, 700],
    statLabels: ['Locked', '÷2.0', '÷1.75', '÷1.5'],
  },
];

// ── Build definitions ──
const BUILD_DEFS = [
  {
    id: 'lucky',
    name: 'Fortune Hunter',
    icon: '🍀',
    tagline: 'Jackpots · Crits · Chains',
    color: '#ffd700',
    rgb: '255,215,0',
    upgrades: ['lucky_jackpotMagnet', 'lucky_critCharge', 'lucky_fortuneChain'],
  },
  {
    id: 'chaos',
    name: 'Gambler',
    icon: '🎲',
    tagline: 'Volatile · Wild · Explosive',
    color: '#ff4d4d',
    rgb: '255,77,77',
    upgrades: ['chaos_explosivePeg', 'chaos_wildEvent', 'chaos_rouletteSlot'],
  },
  {
    id: 'heavy',
    name: 'Iron Core',
    icon: '⚙️',
    tagline: 'Stable · Deep · Crushing',
    color: '#00c8f0',
    rgb: '0,200,240',
    upgrades: ['heavy_ironCore', 'heavy_bonusFloor', 'heavy_crushImpact'],
  },
];

// ── Build-exclusive upgrades ──
const BUILD_UPGRADE_DEFS = [
  // Lucky build
  {
    id: 'lucky_jackpotMagnet',
    name: 'Jackpot Magnet',
    icon: '🧲',
    desc: 'Each drop nudges ball toward the jackpot lane.',
    maxLevel: 3,
    costs: [200, 500, 1200],
    statLabels: ['0%', '20%', '40%', '65%'],
  },
  {
    id: 'lucky_critCharge',
    name: 'Crit Charge',
    icon: '⚡',
    desc: 'Non-crit hits charge a gauge — full charge = guaranteed crit.',
    maxLevel: 3,
    costs: [250, 600, 1400],
    statLabels: ['OFF', '4 hits', '3 hits', '2 hits'],
  },
  {
    id: 'lucky_fortuneChain',
    name: 'Fortune Chain',
    icon: '🔗',
    desc: 'Jackpot or crit landings extend your score multiplier timer.',
    maxLevel: 3,
    costs: [300, 700, 1600],
    statLabels: ['+0s', '+0.8s', '+1.5s', '+2.5s'],
  },
  // Chaos build
  {
    id: 'chaos_explosivePeg',
    name: 'Explosive Peg',
    icon: '💥',
    desc: 'Peg hits have a chance to wildly scatter the ball.',
    maxLevel: 3,
    costs: [150, 400, 1000],
    statLabels: ['0%', '15%', '25%', '40%'],
  },
  {
    id: 'chaos_wildEvent',
    name: 'Wild Event',
    icon: '🌀',
    desc: 'Each drop triggers a random mini-bonus event.',
    maxLevel: 3,
    costs: [200, 500, 1200],
    statLabels: ['OFF', 'Basic', 'Rare', 'Epic'],
  },
  {
    id: 'chaos_rouletteSlot',
    name: 'Roulette',
    icon: '🎰',
    desc: 'One hidden slot each drop is secretly a big multiplier.',
    maxLevel: 3,
    costs: [250, 650, 1500],
    statLabels: ['OFF', 'x3', 'x5', 'x10'],
  },
  // Heavy build
  {
    id: 'heavy_ironCore',
    name: 'Iron Core',
    icon: '🔩',
    desc: 'Extra drift reduction beyond Ball Weight — near-zero spread.',
    maxLevel: 3,
    costs: [300, 700, 1600],
    statLabels: ['+0', '-2', '-4', '-6'],
  },
  {
    id: 'heavy_bonusFloor',
    name: 'Bonus Floor',
    icon: '🛡️',
    desc: 'Sets a minimum score guaranteed per non-bomb landing.',
    maxLevel: 3,
    costs: [200, 500, 1200],
    statLabels: ['OFF', 'min 50', 'min 100', 'min 200'],
  },
  {
    id: 'heavy_crushImpact',
    name: 'Crush Impact',
    icon: '💪',
    desc: 'Each peg hit accumulates flat bonus added to landing score.',
    maxLevel: 3,
    costs: [250, 600, 1400],
    statLabels: ['+0', '+10/peg', '+25/peg', '+50/peg'],
  },
];

const ALL_UPGRADE_DEFS = [...UPGRADE_DEFS, ...BUILD_UPGRADE_DEFS];
const ACTIVE_BUILD_KEY = 'plinko_build';

// ── Build helpers ──
function getActiveBuild() {
  return localStorage.getItem(ACTIVE_BUILD_KEY) || 'lucky';
}
function setActiveBuild(id) {
  localStorage.setItem(ACTIVE_BUILD_KEY, id);
}

// ── Currency ──
function getCoins() {
  return parseInt(localStorage.getItem('plinko_coins') || '0', 10);
}
function addCoins(n) {
  const current = getCoins();
  localStorage.setItem('plinko_coins', Math.max(0, current + n));
}

// ── Upgrades ──
function getUpgradeLevel(id) {
  return parseInt(localStorage.getItem('plinko_upg_' + id) || '0', 10);
}
function getUpgradeCost(id) {
  const def   = ALL_UPGRADE_DEFS.find(d => d.id === id);
  const level = getUpgradeLevel(id);
  if (level >= def.maxLevel) return Infinity;
  return def.costs[level];
}
function purchaseUpgrade(id) {
  const cost = getUpgradeCost(id);
  if (getCoins() < cost) return false;
  addCoins(-cost);
  localStorage.setItem('plinko_upg_' + id, getUpgradeLevel(id) + 1);
  return true;
}

// ── Core effect helpers ──
function getBallSpread() {
  const base = [16, 12, 8, 4, 2, 0][getUpgradeLevel('ballWeight')];
  const ironBonus = getActiveBuild() === 'heavy' ? [0, 2, 4, 6][getUpgradeLevel('heavy_ironCore')] : 0;
  return Math.max(0, base - ironBonus);
}
function getBallVisualRadius() {
  return [12, 13, 14, 15, 16, 18][getUpgradeLevel('ballWeight')];
}
function getBallGlowStrength() {
  return [36, 44, 52, 62, 74, 90][getUpgradeLevel('ballWeight')];
}
function getTrailScale() {
  return [1.0, 1.2, 1.45, 1.7, 2.0, 2.5][getUpgradeLevel('ballWeight')];
}
function getPegImpactScale() {
  return [1.0, 1.3, 1.6, 2.0, 2.5, 3.2][getUpgradeLevel('ballWeight')];
}
function getLuckyAura() {
  return [0, 0.18, 0.38, 0.58, 0.78, 1.0][getUpgradeLevel('luckyBounce')];
}
function getLuckyBounceMult() {
  return [0, 0.10, 0.25, 0.50, 0.80, 1.50][getUpgradeLevel('luckyBounce')];
}
function getMultiBallDivisor() {
  return [1, 2.0, 1.75, 1.5][getUpgradeLevel('multiBall')];
}
function isMultiBallUnlocked() {
  return getUpgradeLevel('multiBall') > 0;
}

// ── Build-specific effect helpers ──
function getLuckyJackpotMagnetChance() {
  return [0, 0.20, 0.40, 0.65][getUpgradeLevel('lucky_jackpotMagnet')];
}
function getLuckyCritChargeNeeded() {
  return [99, 4, 3, 2][getUpgradeLevel('lucky_critCharge')];
}
function getLuckyFortuneChainExt() {
  return [0, 0.8, 1.5, 2.5][getUpgradeLevel('lucky_fortuneChain')];
}
function getChaosExplosivePegChance() {
  return [0, 0.15, 0.25, 0.40][getUpgradeLevel('chaos_explosivePeg')];
}
function getChaosWildEventLevel() {
  return getUpgradeLevel('chaos_wildEvent');
}
function getChaosRouletteMultiplier() {
  return [1, 3, 5, 10][getUpgradeLevel('chaos_rouletteSlot')];
}
function getHeavyBonusFloor() {
  return [0, 50, 100, 200][getUpgradeLevel('heavy_bonusFloor')];
}
function getHeavyCrushImpactBonus() {
  return [0, 10, 25, 50][getUpgradeLevel('heavy_crushImpact')];
}

// ── Coins ──
function coinsFromScore(score) {
  return Math.min(200, Math.floor(score / 50));
}

// ── Shop UI rendering ──
function _renderUpgCard(def, el) {
  if (!el) return;
  const coins  = getCoins();
  const level  = getUpgradeLevel(def.id);
  const maxed  = level >= def.maxLevel;
  const cost   = maxed ? null : def.costs[level];
  const afford = !maxed && coins >= cost;

  const levEl  = el.querySelector('.upg-level');
  const barEl  = el.querySelector('.upg-bar');
  const statEl = el.querySelector('.upg-stat');
  const costEl = el.querySelector('.upg-cost');
  const btnEl  = el.querySelector('.upg-btn');

  levEl.innerHTML = Array.from({ length: def.maxLevel }, (_, i) =>
    `<span class="pip${i < level ? ' filled' : ''}"></span>`
  ).join('');
  barEl.style.width = ((level / def.maxLevel) * 100) + '%';
  barEl.className   = 'upg-bar' + (maxed ? ' maxed' : '');
  statEl.textContent = def.statLabels[level];

  if (maxed) {
    costEl.textContent = 'MAXED'; costEl.className = 'upg-cost maxed';
    btnEl.disabled = true; btnEl.textContent = '✓';
  } else {
    costEl.textContent = String.fromCodePoint(0x1FA99) + ' ' + cost.toLocaleString();
    costEl.className = 'upg-cost'; btnEl.disabled = !afford;
    btnEl.textContent = 'UPGRADE';
  }

  const noteEl = el.querySelector('.upg-note');
  if (noteEl) noteEl.style.display = level > 0 ? 'block' : 'none';
}

function renderShop() {
  const activeBuild = getActiveBuild();
  const coins = getCoins();
  document.getElementById('shopCoinsVal').textContent = coins.toLocaleString();

  // Build tabs
  document.querySelectorAll('.build-tab').forEach(tab => {
    const isActive = tab.dataset.build === activeBuild;
    tab.classList.toggle('active', isActive);
    const buildDef = BUILD_DEFS.find(b => b.id === tab.dataset.build);
    if (buildDef) {
      tab.style.setProperty('--build-color', buildDef.color);
      tab.style.setProperty('--build-rgb', buildDef.rgb);
    }
  });

  // Show/hide build upgrade cards
  document.querySelectorAll('.build-upg').forEach(el => {
    el.style.display = el.dataset.build === activeBuild ? '' : 'none';
  });

  // Render all upgrade cards
  ALL_UPGRADE_DEFS.forEach(def => {
    const el = document.getElementById('upg-' + def.id);
    _renderUpgCard(def, el);
  });
}

function openShop() {
  renderShop();
  document.getElementById('shopOverlay').classList.remove('hidden');
}
function closeShop() {
  document.getElementById('shopOverlay').classList.add('hidden');
  document.getElementById('startCoinsVal').textContent = getCoins().toLocaleString();
}
function handleUpgradeClick(id) {
  if (!purchaseUpgrade(id)) return;
  renderShop();
}

// ── Init ──
function initShop() {
  document.getElementById('shopBtn').addEventListener('click', openShop);
  document.getElementById('shopClose').addEventListener('click', closeShop);

  // Build tab selection
  document.querySelectorAll('.build-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setActiveBuild(tab.dataset.build);
      renderShop();
    });
  });

  // Core upgrade buttons
  UPGRADE_DEFS.forEach(def => {
    const card = document.getElementById('upg-' + def.id);
    if (card) card.querySelector('.upg-btn').addEventListener('click', () => handleUpgradeClick(def.id));
  });

  // Build upgrade buttons
  BUILD_UPGRADE_DEFS.forEach(def => {
    const card = document.getElementById('upg-' + def.id);
    if (card) card.querySelector('.upg-btn').addEventListener('click', () => handleUpgradeClick(def.id));
  });
}
