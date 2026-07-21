import http from 'k6/http';
import { check, sleep } from 'k6';

// Load test for HPA autoscaling verification
// Hits /api/tasks — returns 401 (unauthenticated) but still generates metrics
// The Prometheus Adapter maps the request counter to "requests_per_second"
// HPA scales pods when avg > targetRequestsPerSecond per pod

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 VUs
    { duration: '1m', target: 50 },     // Stay at 50 VUs for 1 minute
    { duration: '30s', target: 80 },    // Ramp up to 80 VUs
    { duration: '1m', target: 80 },     // Stay at 80 VUs for 1 minute
    { duration: '30s', target: 0 },     // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://task-manager.local';

export default function () {
  const res = http.get(`${BASE_URL}/api/tasks`);
  check(res, {
    'status is 401 or 200': (r) => r.status === 401 || r.status === 200,
  });
  sleep(0.1);
}
