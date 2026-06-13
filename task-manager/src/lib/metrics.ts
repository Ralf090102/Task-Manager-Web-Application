import { register, Counter, Histogram, collectDefaultMetrics } from "prom-client";

collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

export const taskOperations = new Counter({
  name: "task_operations_total",
  help: "Total number of task operations",
  labelNames: ["operation", "status"],
});

export function observeRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
) {
  httpRequestDuration
    .labels(method, route, String(statusCode))
    .observe(durationSeconds);
}

export function trackTaskOperation(operation: string, status: string) {
  taskOperations.labels(operation, status).inc();
}

export { register };
