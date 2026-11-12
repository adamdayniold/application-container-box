/** @jest-environment node */
import { log } from "./logger";

const original = process.env.LOG_LEVEL;

beforeEach(() => {
  delete process.env.LOG_LEVEL; // jest.setup.ts silences the logger, these tests need it on
});

afterEach(() => {
  jest.restoreAllMocks();
  if (original === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = original;
});

it("writes one JSON line with time, level, message and extra fields", () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  log("info", "hello", { route: "/api/test", status: 200 });
  expect(spy).toHaveBeenCalledTimes(1);
  const line = JSON.parse(spy.mock.calls[0][0]);
  expect(line).toMatchObject({ level: "info", msg: "hello", route: "/api/test", status: 200 });
  expect(new Date(line.time).toISOString()).toBe(line.time);
});

it("writes errors to stderr", () => {
  const out = jest.spyOn(console, "log").mockImplementation(() => {});
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  log("error", "boom");
  expect(err).toHaveBeenCalledTimes(1);
  expect(out).not.toHaveBeenCalled();
  expect(JSON.parse(err.mock.calls[0][0]).level).toBe("error");
});

it("writes nothing when LOG_LEVEL is silent", () => {
  process.env.LOG_LEVEL = "silent";
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  log("info", "hidden");
  expect(spy).not.toHaveBeenCalled();
});
