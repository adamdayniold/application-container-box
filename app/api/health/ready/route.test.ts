/** @jest-environment node */
import { getDb } from "@/app/lib/mongodb";
import { GET } from "./route";

jest.mock("@/app/lib/mongodb", () => ({ getDb: jest.fn() }));
const mockGetDb = jest.mocked(getDb);

describe("/api/health/ready", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is ready when Mongo answers the ping", async () => {
    mockGetDb.mockResolvedValue({ command: jest.fn().mockResolvedValue({ ok: 1}) } as never);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns 503 when Mongo is unreachable", async () => {
    mockGetDb.mockRejectedValue(new Error("down"));
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
