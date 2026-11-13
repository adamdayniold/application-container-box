/** @jest-environment node */

import { getSummary } from "@/app/lib/contacts";
import { metrics } from "@/app/lib/metrics";
import { GET } from "./route";

jest.mock("@/app/lib/contacts", () => ({ getSummary: jest.fn() }));

const mockGetSummary = jest.mocked(getSummary);
const summary = { total: 10, active: 3, leads: 2 };

describe("/api/contacts/summary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the contact counts", async () => {
    mockGetSummary.mockResolvedValue(summary);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(summary);
  });

  it("records metrics under the route pattern", async () => {
    metrics.requests.reset();
    mockGetSummary.mockResolvedValue(summary);
    await GET();
    const text = await metrics.registry.metrics();
    expect(text).toMatch(/http_requests_total\{[^}]*route="\/api\/contacts\/summary"[^}]*status="200"[^}]*\} 1/);
  });
});
