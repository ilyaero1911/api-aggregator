import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLoad } from "./load/gates.mjs";
const p = {
  rps: 100,
  streams: 500,
  gateway_p95_ms: 30,
  ttft_overhead_p95_ms: 50,
};
const measured = {
  achieved_rps: 100,
  max_concurrent_streams: 500,
  gateway_pre_provider_p95_ms: 29,
  ttft_overhead_p95_ms: 49,
  lost_usage_events: 0,
  billing_mismatch_ratio: 0.0049,
  errors: 0,
};
test("complete measured result within NFR thresholds passes", () =>
  assert.deepEqual(evaluateLoad(p, measured), []));
test("missing instrumentation cannot be an NFR pass", () =>
  assert.ok(
    evaluateLoad(p, {
      achieved_rps: 100,
      max_concurrent_streams: 500,
      errors: 0,
    }).includes("lost_usage_events"),
  ));
test("threshold equality, lost usage and underload fail", () =>
  assert.deepEqual(
    evaluateLoad(p, {
      ...measured,
      achieved_rps: 90,
      gateway_pre_provider_p95_ms: 30,
      ttft_overhead_p95_ms: 50,
      lost_usage_events: 1,
      billing_mismatch_ratio: 0.005,
    }),
    [
      "achieved_rps",
      "gateway_pre_provider_p95_ms",
      "ttft_overhead_p95_ms",
      "lost_usage_events",
      "billing_mismatch_ratio",
    ],
  ));
