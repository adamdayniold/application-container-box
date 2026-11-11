/** @jest-environment node */
import { GET } from "./route";

it("exposes Prometheus metrics", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/plain");
  const body = await response.text();
  expect(body).toContain("process_cpu_user_seconds_total");
  expect(body).toContain("# TYPE http_requests_total counter");
  expect(body).toContain("# TYPE http_request_duration_seconds histogram");
});
