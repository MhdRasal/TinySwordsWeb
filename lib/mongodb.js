// lib/mongodb.js - Cached MongoDB Atlas Connection Helper for Vercel Serverless
const { MongoClient } = require('mongodb');

// Connection URI with password @ character percent-encoded (%40)
const DEFAULT_MONGODB_URI = "REDACTED_MONGODB_URI";

const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "Tinyswordgame";
const COLLECTION_NAME = "Data";

let client;
let clientPromise;

const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode (Vercel serverless), it's best to not use a global variable.
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
}

/**
 * Returns database and collection instances
 */
async function getDatabase() {
  const clientInstance = await clientPromise;
  const db = clientInstance.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);
  return { client: clientInstance, db, collection };
}

module.exports = {
  getDatabase,
  clientPromise,
  DB_NAME,
  COLLECTION_NAME
};
