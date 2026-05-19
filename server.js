'use strict';

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── POST /api/daily/submit ──────────────────
// Body: { dayNumber, playerId, playerName, score, target, emojis }
app.post('/api/daily/submit', async (req, res) => {
  const { dayNumber, playerId, playerName, score, target, emojis } = req.body;

  if (!dayNumber || !playerId || !playerName || score == null || !target) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Sanitize: alphanumeric + spaces/hyphens, max 24 chars
  const safeName   = String(playerName).replace(/[^\w\s\-]/g, '').trim().slice(0, 24) || 'Anonymous';
  const safeEmojis = String(emojis || '').slice(0, 20);
  const safeScore  = Math.max(0, Math.floor(Number(score)));
  const safeTarget = Math.max(0, Math.floor(Number(target)));
  const safeDayNum = Math.floor(Number(dayNumber));

  if (isNaN(safeScore) || isNaN(safeTarget) || isNaN(safeDayNum)) {
    return res.status(400).json({ error: 'Invalid numeric fields' });
  }

  try {
    // Upsert — keep the higher score if re-submitted
    await pool.query(
      `INSERT INTO daily_leaderboard (day_number, player_id, player_name, score, target, emojis)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (day_number, player_id) DO UPDATE
         SET score        = GREATEST(daily_leaderboard.score, $4),
             emojis       = EXCLUDED.emojis,
             submitted_at = NOW()`,
      [safeDayNum, String(playerId).slice(0, 64), safeName, safeScore, safeTarget, safeEmojis]
    );

    // Compute player rank for this day
    const rankRes = await pool.query(
      `SELECT COUNT(*) AS above
       FROM daily_leaderboard
       WHERE day_number = $1 AND score > $2`,
      [safeDayNum, safeScore]
    );
    const rank = parseInt(rankRes.rows[0].above, 10) + 1;

    res.json({ success: true, rank });
  } catch (err) {
    console.error('Submit error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET /api/daily/leaderboard/:dayNumber ───
// Returns top-10 entries + total player count
app.get('/api/daily/leaderboard/:dayNumber', async (req, res) => {
  const safeDayNum = Math.floor(Number(req.params.dayNumber));
  if (isNaN(safeDayNum) || safeDayNum < 1) {
    return res.status(400).json({ error: 'Invalid day number' });
  }

  try {
    const topRes = await pool.query(
      `SELECT player_name, score, target, emojis,
              RANK() OVER (ORDER BY score DESC) AS rank
       FROM daily_leaderboard
       WHERE day_number = $1
       ORDER BY score DESC
       LIMIT 10`,
      [safeDayNum]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total FROM daily_leaderboard WHERE day_number = $1`,
      [safeDayNum]
    );

    res.json({
      entries: topRes.rows,
      total:   parseInt(countRes.rows[0].total, 10),
    });
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Fallback: serve index.html for all other GETs
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Plinko Drop server running on port ${PORT}`);
});
