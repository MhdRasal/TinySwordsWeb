// api/player.js - Player Profile Management Endpoint
const { getDatabase } = require('../lib/mongodb');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { collection } = await getDatabase();

    // -------------------------------------------------------------------------
    // GET: Query Specific Player Profile & Rank
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const { player_id } = req.query;

      if (!player_id) {
        return res.status(400).json({ success: false, error: 'player_id parameter required' });
      }

      const player = await collection.findOne(
        { player_id: String(player_id).trim() },
        { projection: { _id: 0 } }
      );

      if (!player) {
        return res.status(404).json({ success: false, error: 'Player profile not found' });
      }

      // Calculate player rank
      const rank = await collection.countDocuments({
        $or: [
          { highest_wave: { $gt: player.highest_wave || 0 } },
          { highest_wave: player.highest_wave || 0, highest_level: { $gt: player.highest_level || 0 } }
        ]
      }) + 1;

      return res.status(200).json({
        success: true,
        player: {
          ...player,
          rank
        }
      });
    }

    // -------------------------------------------------------------------------
    // POST: Register New Player Name or Rename
    // -------------------------------------------------------------------------
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
        }
      }

      const { player_id, player_name } = body || {};

      if (!player_id || !player_name) {
        return res.status(400).json({ success: false, error: 'Both player_id and player_name are required' });
      }

      const cleanId = String(player_id).trim();
      let cleanName = String(player_name).trim().substring(0, 20);

      if (cleanName.length < 2) {
        return res.status(400).json({ success: false, error: 'Player name must be at least 2 characters' });
      }

      const now = new Date().toISOString();

      const result = await collection.findOneAndUpdate(
        { player_id: cleanId },
        {
          $set: {
            player_name: cleanName,
            updated_at: now
          },
          $setOnInsert: {
            player_id: cleanId,
            highest_wave: 1,
            highest_level: 1,
            enemies_slain: 0,
            character_used: 'warrior',
            runs_count: 0,
            created_at: now
          }
        },
        {
          upsert: true,
          returnDocument: 'after',
          projection: { _id: 0 }
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Player profile saved successfully',
        player: result
      });
    }

    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Player API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};
