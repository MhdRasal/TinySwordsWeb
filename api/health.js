// api/health.js - Diagnostic endpoint for Vercel & MongoDB connection status
const { getDatabase, DB_NAME, COLLECTION_NAME } = require('../lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const startTime = Date.now();

  try {
    const { db, collection } = await getDatabase();
    await db.command({ ping: 1 });
    const count = await collection.countDocuments();
    const latency = Date.now() - startTime;

    return res.status(200).json({
      status: 'healthy',
      database: DB_NAME,
      collection: COLLECTION_NAME,
      documents_count: count,
      latency_ms: latency,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      latency_ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
  }
};
