'use strict';

// ─────────────────────────────────────────────
// META PROGRESSION — upgrades.js
// ─────────────────────────────────────────────

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
  const def   = UPGRADE_DEFS.find(d => d.id === id);
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

// ── Effect helpers called by game.js ──

function getBallSpread() {
  return [16, 12, 8, 4, 2, 0][getUpgradeLevel('ballWeight')];
}

function getLuckyBounceMult() {
  return [0, 0.10, 0.25, 0.50, 0.80, 1.50][getUpgradeLevel('luckyBounce')];
}

// Multi Ball: per-ball score divisor when active
function getMultiBallDivisor() {
  return [1, 2.0, 1.75, 1.5][getUpgradeLevel('multiBall')];
}

function isMultiBallUnlocked() {
  return getUpgradeLevel('multiBall') > 0;
}

// Coins earned from a game score
function coinsFromScore(score) {
  return Math.min(200, Math.floor(score / 50));
}

// ── Shop UI rendering ──

function renderShop() {
  const coins = getCoins();
  document.getElementById('shopCoinsVal').textContent = coins.toLocaleString();

  UPGRADE_DEFS.forEach(def => {
    const level  = getUpgradeLevel(def.id);
    const maxed  = level >= def.maxLevel;
    const cost   = maxed ? null : def.costs[level];
    const afford = !maxed && coins >= cost;

    const cardEl = document.getElementById('upg-' + def.id);
    if (!cardEl) return;
    const levEl  = cardEl.querySelector('.upg-level');
    const barEl  = cardEl.querySelector('.upg-bar');
    const statEl = cardEl.querySelector('.upg-stat');
    const costEl = cardEl.querySelector('.upg-cost');
    const btnEl  = cardEl.querySelector('.upg-btn');

    levEl.innerHTML = Array.from({ length: def.maxLevel }, (_, i) =>
      `<span class="pip${i < level ? ' filled' : ''}"></span>`
    ).join('');

    barEl.style.width = ((level / def.maxLevel) * 100) + '%';
    barEl.className   = 'upg-bar' + (maxed ? ' maxed' : '');
    statEl.textContent = def.statLabels[level];

    if (maxed) {
      costEl.textContent = 'MAXED';
      costEl.className   = 'upg-cost maxed';
      btnEl.disabled     = true;
      btnEl.textContent  = '✓';
    } else {
      costEl.textContent = String.fromCodePoint(0x1FA99) + ' ' + cost.toLocaleString();
      costEl.className   = 'upg-cost';
      btnEl.disabled     = !afford;
      btnEl.textContent  = 'UPGRADE';
    }

    // Special note for multiBall once unlocked
    const noteEl = cardEl.querySelector('.upg-note');
    if (noteEl) {
      noteEl.style.display = level > 0 ? 'block' : 'none';
    }
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

  UPGRADE_DEFS.forEach(def => {
    const card = document.getElementById('upg-' + def.id);
    if (card) card.querySelector('.upg-btn').addEventListener('click', () => handleUpgradeClick(def.id));
  });
}
