// NFR acceptance gates; traces/reconciliation must come from an actual instrumented test run.
export function evaluateLoad(profile, result) {
  const checks = [
    ["achieved_rps", (value) => value >= profile.rps * 0.95],
    ["max_concurrent_streams", (value) => value >= profile.streams],
    [
      "gateway_pre_provider_p95_ms",
      (value) => value >= 0 && value < profile.gateway_p95_ms,
    ],
    [
      "ttft_overhead_p95_ms",
      (value) => value >= 0 && value < profile.ttft_overhead_p95_ms,
    ],
    ["lost_usage_events", (value) => value === 0],
    ["billing_mismatch_ratio", (value) => value >= 0 && value < 0.005],
    ["errors", (value) => value === 0],
  ];
  return checks.flatMap(([field, valid]) =>
    Number.isFinite(result[field]) && valid(result[field]) ? [] : [field],
  );
}
