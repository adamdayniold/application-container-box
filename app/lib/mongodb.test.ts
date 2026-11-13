const mockConnect = jest.fn();

jest.mock("./logger");

jest.mock("mongodb", () => ({
  MongoClient: jest.fn(() => ({ connect: mockConnect })),
}));

const originalUri = process.env.MONGODB_URI;
const originalDatabase = process.env.MONGODB_DB;
const originalNodeEnv = process.env.NODE_ENV;

function fakeDb() {
  return { collection: jest.fn().mockReturnValue({ createIndex: jest.fn().mockResolvedValue("email_1") }) };
}

describe("MongoDB connection", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete (globalThis as typeof globalThis & { mongoClientPromise?: unknown }).mongoClientPromise;
  });

  afterAll(() => {
    process.env.MONGODB_URI = originalUri;
    process.env.MONGODB_DB = originalDatabase;
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it("requires a MongoDB URI", async () => {
    delete process.env.MONGODB_URI;
    const { getDb } = await import("./mongodb");
    await expect(getDb()).rejects.toThrow("Set MONGODB_URI");
  });

  it("connects using the configured URI and database", async () => {
    const db = fakeDb();
    const mockDb = jest.fn().mockReturnValue(db);
    mockConnect.mockResolvedValue({ db: mockDb });
    process.env.MONGODB_URI = "mongodb://example.test/canvas";
    process.env.MONGODB_DB = "contacts-test";

    const { getDb } = await import("./mongodb");

    await expect(getDb()).resolves.toBe(db);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockDb).toHaveBeenCalledWith("contacts-test");
  });

  it("reuses one connection across calls, also in production", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    mockConnect.mockResolvedValue({ db: jest.fn().mockReturnValue(fakeDb()) });
    process.env.MONGODB_URI = "mongodb://example.test/canvas";

    const { getDb } = await import("./mongodb");
    await getDb();
    await getDb();

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("retries the connection after a failed attempt", async () => {
    const db = fakeDb();
    mockConnect
      .mockRejectedValueOnce(new Error("connect failed"))
      .mockResolvedValueOnce({ db: jest.fn().mockReturnValue(db) });
    process.env.MONGODB_URI = "mongodb://example.test/canvas";

    const { getDb } = await import("./mongodb");

    await expect(getDb()).rejects.toThrow("connect failed");
    await expect(getDb()).resolves.toBe(db);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it("creates the unique email index once, with the lookup collation", async () => {
    const createIndex = jest.fn().mockResolvedValue("email_1");
    const db = { collection: jest.fn().mockReturnValue({ createIndex }) };
    mockConnect.mockResolvedValue({ db: jest.fn().mockReturnValue(db) });
    process.env.MONGODB_URI = "mongodb://example.test/canvas";

    const { getDb } = await import("./mongodb");
    await getDb();
    await getDb();

    expect(db.collection).toHaveBeenCalledWith("contacts");
    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(createIndex).toHaveBeenCalledWith(
      { email: 1 },
      { unique: true, collation: { locale: "en", strength: 2 } },
    );
  });

  it("warns and keeps the connection when the email index cannot be built", async () => {
    const createIndex = jest.fn().mockRejectedValue(new Error("E11000 duplicate key"));
    const db = { collection: jest.fn().mockReturnValue({ createIndex }) };
    mockConnect.mockResolvedValue({ db: jest.fn().mockReturnValue(db) });
    process.env.MONGODB_URI = "mongodb://example.test/canvas";

    const { getDb } = await import("./mongodb");
    const { log } = await import("./logger");

    await expect(getDb()).resolves.toBe(db);
    await getDb();
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("warn", "could not create the unique email index", { error: "E11000 duplicate key" });
  });
});
