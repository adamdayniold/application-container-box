/** @jest-environment node */
import { GET } from "./route";

it("reports liveness", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
