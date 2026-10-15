import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const profileName = process.env.PROFILE || "mvp";
const profiles = JSON.parse(
  await readFile(new URL("./profiles.json", import.meta.url), "utf8"),
);
const p = profiles[profileName];
if (!p) throw new Error("Unknown profile");
const base = process.env.BASE_URL;
if (!base) throw new Error("Set BASE_URL to a dedicated test gateway /v1");
const key = process.env.NG_TEST_KEY;
if (!key) throw new Error("Set NG_TEST_KEY for synthetic test tenant only");
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${key}`,
};
const body = {
  model: process.env.MODEL || "mock/chat",
  messages: [{ role: "user", content: "synthetic load fixture" }],
  max_tokens: 16,
};
const probe = await fetch(`${base}/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10000),
});
if (!probe.ok)
  throw new Error(
    `Gateway is not ready: ${probe.status}. A 501 scaffold is not an SLO pass.`,
  );
await probe.arrayBuffer();
const cancel = new AbortController();
let active = 0,
  maxActive = 0,
  errors = 0,
  completed = 0;
const latency = [];
async function once(record) {
  const start = performance.now();
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    await r.arrayBuffer();
    if (record) {
      completed++;
      latency.push(performance.now() - start);
      if (!r.ok) errors++;
    }
  } catch {
    if (record) {
      errors++;
      completed++;
    }
  }
}
const streams = Array.from({ length: p.streams }, async () => {
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, stream: true }),
      signal: cancel.signal,
    });
    if (
      !r.ok ||
      !r.headers.get("content-type")?.includes("text/event-stream")
    ) {
      errors++;
      return;
    }
    active++;
    maxActive = Math.max(active, maxActive);
    try {
      for await (const chunk of r.body) {
        void chunk;
      }
    } finally {
      active--;
    }
  } catch (e) {
    if (!cancel.signal.aborted) {
      errors++;
      console.error(String(e));
    }
  }
});
const inflight = new Set();
try {
  for (const record of [false, true]) {
    const until =
      performance.now() +
      (record ? p.duration_seconds : p.warmup_seconds) * 1000;
    let next = performance.now();
    while (performance.now() < until) {
      if (inflight.size > p.rps * 30)
        throw new Error("Too many in-flight requests");
      const work = once(record);
      inflight.add(work);
      work.finally(() => inflight.delete(work));
      next += 1000 / p.rps;
      await delay(Math.max(0, next - performance.now()));
    }
  }
  await Promise.all(inflight);
} finally {
  cancel.abort();
  await Promise.allSettled(streams);
}
latency.sort((a, b) => a - b);
const result = {
  profile: profileName,
  at: new Date().toISOString(),
  requests: completed,
  errors,
  max_concurrent_streams: maxActive,
  user_end_to_end_p95_ms: latency[Math.floor(latency.length * 0.95)],
  note: "HTTP latency includes provider. Gateway/TTFT overhead and ledger loss require trace/DB reconciliation.",
};
await writeFile(
  process.env.RESULT_FILE || "benchmark-local.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(result);
if (errors || maxActive < p.streams) process.exitCode = 1;
