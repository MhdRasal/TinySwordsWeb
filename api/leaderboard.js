// api/leaderboard.js - Vercel Serverless Function for Leaderboard
const { getDatabase } = require('../lib/mongodb');

// Set CORS headers for Godot Web and Mobile apps
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { collection } = await getDatabase();

    // Ensure index exists on score fields for lightning-fast queries
    collection.createIndex({ highest_wave: -1, highest_level: -1, enemies_slain: -1 }).catch(() => {});
    collection.createIndex({ player_id: 1 }, { unique: true }).catch(() => {});

    // -------------------------------------------------------------------------
    // GET: Fetch Top Champions Leaderboard
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

      const topRecords = await collection
        .find({
          highest_wave: { $gt: 0 }
        })
        .sort({
          highest_wave: -1,
          highest_level: -1,
          enemies_slain: -1,
          updated_at: 1
        })
        .limit(limit)
        .project({
          _id: 0,
          player_id: 1,
          player_name: 1,
          highest_wave: 1,
          highest_level: 1,
          enemies_slain: 1,
          character_used: 1,
          platform: 1,
          updated_at: 1
        })
        .toArray();

      // Add rank indices (1-indexed)
      const rankedLeaderboard = topRecords.map((item, index) => ({
        rank: index + 1,
        player_id: item.player_id,
        player_name: item.player_name || 'Anonymous Champion',
        highest_wave: item.highest_wave || 1,
        highest_level: item.highest_level || 1,
        enemies_slain: item.enemies_slain || 0,
        character_used: item.character_used || 'warrior',
        platform: item.platform || 'all',
        updated_at: item.updated_at || new Date().toISOString()
      }));

      // Cache response for 15s on Vercel CDN edge, stale while revalidate 30s
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

      return res.status(200).json({
        success: true,
        count: rankedLeaderboard.length,
        leaderboard: rankedLeaderboard
      });
    }

    // -------------------------------------------------------------------------
    // POST: Submit or Update Champion Run Score
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

      const {
        player_id,
        player_name,
        wave = 1,
        level = 1,
        kills = 0,
        character = 'warrior',
        platform = 'android'
      } = body || {};

      if (!player_id || typeof player_id !== 'string' || player_id.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Missing or invalid player_id' });
      }

      const cleanPlayerId = player_id.trim();
      const cleanPlayerName = (player_name && typeof player_name === 'string')
        ? player_name.trim().substring(0, 20)
        : 'Champion';
      const parsedWave = Math.max(1, parseInt(wave, 10) || 1);
      const parsedLevel = Math.max(1, parseInt(level, 10) || 1);
      const parsedKills = Math.max(0, parseInt(kills, 10) || 0);
      const validCharacter = ['warrior', 'archer', 'monk'].includes(character) ? character : 'warrior';

      const now = new Date().toISOString();

      // Find existing player record
      const existing = await collection.findOne({ player_id: cleanPlayerId });

      let isNewHighScore = false;

      if (!existing) {
        // First record for this player
        isNewHighScore = true;
        await collection.insertOne({
          player_id: cleanPlayerId,
          player_name: cleanPlayerName,
          highest_wave: parsedWave,
          highest_level: parsedLevel,
          enemies_slain: parsedKills,
          character_used: validCharacter,
          platform: platform,
          runs_count: 1,
          created_at: now,
          updated_at: now
        });
      } else {
        // Check if incoming run beat their personal best
        const prevWave = existing.highest_wave || 0;
        const prevLevel = existing.highest_level || 0;
        const prevKills = existing.enemies_slain || 0;

        if (
          parsedWave > prevWave ||
          (parsedWave === prevWave && parsedLevel > prevLevel) ||
          (parsedWave === prevWave && parsedLevel === prevLevel && parsedKills > prevKills)
        ) {
          isNewHighScore = true;
        }

        const updateFields = {
          player_name: cleanPlayerName, // Keep name updated if player renamed
          updated_at: now
        };

        if (isNewHighScore) {
          updateFields.highest_wave = parsedWave;
          updateFields.highest_level = parsedLevel;
          updateFields.enemies_slain = parsedKills;
          updateFields.character_used = validCharacter;
          updateFields.platform = platform;
        }

        await collection.updateOne(
          { player_id: cleanPlayerId },
          {
            $set: updateFields,
            $inc: { runs_count: 1 }
          }
        );
      }

      // Calculate the player's updated global rank
      const currentWave = isNewHighScore ? parsedWave : (existing.highest_wave || 1);
      const currentLevel = isNewHighScore ? parsedLevel : (existing.highest_level || 1);

      const higherPlayersCount = await collection.countDocuments({
        $or: [
          { highest_wave: { $gt: currentWave } },
          { highest_wave: currentWave, highest_level: { $gt: currentLevel } }
        ]
      });

      const playerRank = higherPlayersCount + 1;

      return res.status(200).json({
        success: true,
        is_new_high_score: isNewHighScore,
        player_rank: playerRank,
        player_name: cleanPlayerName,
        highest_wave: currentWave,
        highest_level: currentLevel,
        message: isNewHighScore ? 'New Personal Record saved!' : 'Score checked (prior record was higher).'
      });
    }

    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Leaderboard API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};
