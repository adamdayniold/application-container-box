import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "canvas";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

export async function getDb() {
  if (!uri) {
    throw new Error("Set MONGODB_URI before using the contacts API.");
  }

  globalForMongo.mongoClientPromise ??= new MongoClient(uri).connect().catch((error) => {
    globalForMongo.mongoClientPromise = undefined;
    throw error;
  });

  const client = await globalForMongo.mongoClientPromise;
  return client.db(databaseName);
}
