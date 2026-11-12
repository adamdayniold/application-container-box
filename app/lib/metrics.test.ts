/** @jest-environment node */
import { metrics, withMetrics } from "./metrics";
import { log } from "./logger";

jest.mock("./logger");

beforeEach(() => {
  metrics.requests.reset();
  metrics.duration.reset();
  jest.mocked(log).mockClear();
});

it("counts and times a handled request", async () => {
  const handler = withMetrics("GET", "/api/test", async () => new Response(null, { status: 204 }));
  expect((await handler()).status).toBe(204);
  const text = await metrics.registry.metrics();
  expect(text).toMatch(/http_requests_total\{[^}]*route="\/api\/test"[^}]*status="204"[^}]*\} 1/);
  expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/api\/test"[^}]*\} 1/);
});

it("passes the handler arguments through", async () => {
  const inner = jest.fn(async (a: string, b: number) => Response.json({ a, b }));
  const handler = withMetrics("POST", "/api/test", inner);
  await handler("x", 2);
  expect(inner).toHaveBeenCalledWith("x", 2);
});

it("counts a throwing handler as a 500 and rethrows", async () => {
  const handler = withMetrics("GET", "/api/boom", async () => {
    throw new Error("boom");
  });
  await expect(handler()).rejects.toThrow("boom");
  const text = await metrics.registry.metrics();
  expect(text).toMatch(/http_requests_total\{[^}]*route="\/api\/boom"[^}]*status="500"[^}]*\} 1/);
});

it("logs one line per request with route, status and duration", async () => {
  const handler = withMetrics("GET", "/api/test", async () => new Response(null, { status: 204 }));
  await handler();
  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(
    "info",
    "request",
    expect.objectContaining({ method: "GET", route: "/api/test", status: 204, duration_ms: expect.any(Number) }),
  );
});

it("logs a 4xx response as a warning", async () => {
  const handler = withMetrics("POST", "/api/test", async () => new Response(null, { status: 400 }));
  await handler();
  expect(log).toHaveBeenCalledWith("warn", "request", expect.objectContaining({ status: 400 }));
});

it("logs a throwing handler as an error with the message", async () => {
  const handler = withMetrics("GET", "/api/boom", async () => {
    throw new Error("boom");
  });
  await expect(handler()).rejects.toThrow("boom");
  expect(log).toHaveBeenCalledWith("error", "request", expect.objectContaining({ status: 500, error: "boom" }));
});
