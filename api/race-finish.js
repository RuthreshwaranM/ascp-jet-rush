const { sb } = require('../lib/db');
const { verify } = require('../lib/token');
const LAPS = 3, TRACK_LEN = 380000, VMAX = 18000, MIN_MS = 60000;   // must match the game
const enc = encodeURIComponent;
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 14);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { runId, name, distance, timeMs } = req.body || {};
  const ts = verify(runId), clean = cleanName(name), dist = Number(distance);
  if (!ts || !clean || !Number.isFinite(dist) || dist < 0) return res.status(400).json({ error: 'bad request' });
  const elapsed = (Date.now() - ts) / 1000;
  if (elapsed > 3600 || dist > elapsed * VMAX + 3000 || dist > LAPS * TRACK_LEN * 1.01) {
    return res.status(400).json({ error: 'rejected' });
  }
  let best = null;
  if (timeMs !== null && timeMs !== undefined) {
    if (!Number.isInteger(timeMs) || timeMs < MIN_MS || timeMs / 1000 > elapsed + 1 || dist < LAPS * TRACK_LEN * 0.98) {
      return res.status(400).json({ error: 'rejected' });
    }
    best = timeMs;
  }
  try {
    const rows = await sb('race_scores?select=best_ms,total_m,races,last_run&name=eq.' + enc(clean));
    const old = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (old && Number(old.last_run) >= ts) return res.status(200).json({ ok: true, duplicate: true });   // each run counts once
    const newBest = best !== null ? (old && old.best_ms != null ? Math.min(old.best_ms, best) : best) : (old ? old.best_ms : null);
    await sb('race_scores?on_conflict=name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        name: clean, best_ms: newBest,
        total_m: (old ? Number(old.total_m) : 0) + Math.floor(dist / 100),
        races: (old ? old.races : 0) + 1, last_run: ts, updated_at: new Date().toISOString()
      })
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'save failed' });
  }
};