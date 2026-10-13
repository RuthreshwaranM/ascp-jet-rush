const { sb } = require('../lib/db');

module.exports = async (req, res) => {
  const by = req.query && req.query.by === 'distance' ? 'distance' : 'time';
  const q = by === 'time'
    ? 'race_scores?select=name,best_ms,races&best_ms=not.is.null&order=best_ms.asc&limit=10'
    : 'race_scores?select=name,total_m,races&total_m=gt.0&order=total_m.desc&limit=10';
  try {
    const rows = await sb(q);
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.error(e.message);
    res.status(500).json([]);
  }
};