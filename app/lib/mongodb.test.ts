const mockConnect = jest.fn();

jest.mock("mongodb", () => ({
  MongoClient: jest.fn(() => ({ connect: mockConnect })),
}));

const originalUri = process.env.MONGODB_URI;
const originalDatabase = process.env.MONGODB_DB;

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

  it("requires a MongoDB URI", () => {
    delete process.env.MONGODB_URI;
    expect(() => require("./mongodb")).toThrow("Set MONGODB_URI");
  });

  it("connects using the configured URI and database", async () => {
    const db = { collection: jest.fn() };
    const mockDb = jest.fn().mockReturnValue(db);
    mockConnect.mockResolvedValue({ db: mockDb });
    process.env.MONGODB_URI = "mongodb://example.test/canvas";
    process.env.MONGODB_DB = "contacts-test";

    const { getDb } = require("./mongodb") as typeof import("./mongodb");

    await expect(getDb()).resolves.toBe(db);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockDb).toHaveBeenCalledWith("contacts-test");
  });
});
