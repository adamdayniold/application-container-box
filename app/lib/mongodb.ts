import { MongoClient } from "mongodb";
import { log } from "./logger";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "canvas";
const username = process.env.MONGODB_USERNAME;
const password = process.env.MONGODB_PASSWORD;

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

export async function getDb() {
  if (!uri) {
    throw new Error("Set MONGODB_URI before using the contacts API.");
  }

  globalForMongo.mongoClientPromise ??= connect(uri).catch((error) => {
    globalForMongo.mongoClientPromise = undefined;
    throw error;
  });

  const client = await globalForMongo.mongoClientPromise;
  return client.db(databaseName);
}

async function connect(connectionUri: string) {
  const options = username && password ? { auth: { username, password } } : {};
  const client = await new MongoClient(connectionUri, options).connect();
  try {
    await client
      .db(databaseName)
      .collection("contacts")
      .createIndex({ email: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
  } catch (error) {
    log("warn", "could not create the unique email index", { error: error instanceof Error ? error.message : String(error) });
  }
  return client;
}
