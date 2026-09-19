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

  const clientPromise = globalForMongo.mongoClientPromise ?? new MongoClient(uri).connect();

  if (process.env.NODE_ENV !== "production") {
    globalForMongo.mongoClientPromise = clientPromise;
  }

  const client = await clientPromise;
  return client.db(databaseName);
}
