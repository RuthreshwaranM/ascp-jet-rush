const { sb } = require('../lib/db');
const { verify } = require('../lib/token');
const LAPS = 3, TRACK_LEN = 380000, VMAX = 18000;   // must match the game
const enc = encodeURIComponent;
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 14);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  const ts = verify(b.runId);
  const name = cleanName(b.name);
  const room = String(b.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const pos = Number(b.pos), x = Number(b.x), speed = Number(b.speed);
  if (!ts || !name || !room || ![pos, x, speed].every(Number.isFinite)) return res.status(400).json({ error: 'bad request' });
  const elapsed = (Date.now() - ts) / 1000;
  if (elapsed > 3600 || pos < 0 || pos > LAPS * TRACK_LEN * 1.02 || pos > elapsed * VMAX + 3000) {
    return res.status(400).json({ error: 'rejected' });
  }
  const row = {
    room, name, pos: Math.round(pos),
    x: Math.max(-2.5, Math.min(2.5, x)),
    speed: Math.max(0, Math.min(VMAX, speed)),
    lap: Math.min(LAPS, Math.floor(pos / TRACK_LEN) + 1),
    updated_at: new Date().toISOString()
  };
  const since = new Date(Date.now() - 5000).toISOString();
  try {
    const [, others] = await Promise.all([
      sb('race_live?on_conflict=room,name', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row)
      }),
      sb('race_live?select=name,pos,x,speed,lap&room=eq.' + enc(room) + '&updated_at=gte.' + enc(since) +
         '&name=neq.' + enc(name) + '&order=pos.desc&limit=12')
    ]);
    res.status(200).json({ players: Array.isArray(others) ? others : [] });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ players: [] });
  }
};