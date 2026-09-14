import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "canvas";

if (!uri) {
  throw new Error("Set MONGODB_URI in .env.local before using the contacts API.");
}

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

const clientPromise = globalForMongo.mongoClientPromise ?? new MongoClient(uri).connect();

if (process.env.NODE_ENV !== "production") {
  globalForMongo.mongoClientPromise = clientPromise;
}

export async function getDb() {
  const client = await clientPromise;
  return client.db(databaseName);
}
