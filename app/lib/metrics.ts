import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { log } from "./logger";

type Labels = "method" | "route" | "status";

type Metrics = {
  registry: Registry;
  requests: Counter<Labels>;
  duration: Histogram<Labels>;
};

// Next.js can load a module once per route bundle, and in dev on every reload.
// Keeping one registry on globalThis avoids "metric already registered" errors,
// the same trick app/lib/mongodb.ts uses for the Mongo client.
const globalForMetrics = globalThis as typeof globalThis & { metrics?: Metrics };

function createMetrics(): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const requests = new Counter<Labels>({
    name: "http_requests_total",
    help: "Total HTTP requests handled by the API",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });

  const duration = new Histogram<Labels>({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  return { registry, requests, duration };
}

export const metrics = (globalForMetrics.metrics ??= createMetrics());

// Wraps a route handler to count, time and log it (one JSON log line per request). The handler's own signature is
// kept, so Next's generated route types and the existing tests still fit.
// `route` is the fixed pattern ("/api/contacts/[id]"), never the real URL:
// one label value per contact id would grow Prometheus's memory without limit.
export function withMetrics<Args extends unknown[]>(
  method: string,
  route: string,
  handler: (...args: Args) => Response | Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    const end = metrics.duration.startTimer();
    const started = performance.now();
    let status = 500; // a handler that throws counts as a 500
    let error: unknown;
    try {
      const response = await handler(...args);
      status = response.status;
      return response;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      const labels = { method, route, status: String(status) };
      metrics.requests.inc(labels);
      end(labels);
      log(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "request", {
        method,
        route,
        status,
        duration_ms: Math.round(performance.now() - started),
        ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };
}
