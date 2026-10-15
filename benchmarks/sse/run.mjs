import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const concurrency = Number(process.env.STREAMS || 1000);
const repeats = Number(process.env.REPEATS || 3);
const holdMs = Number(process.env.HOLD_MS || 2000);
const goBinary = process.env.GO_BENCH_BINARY || ".cache/sse-go";
const output =
  process.env.BENCH_OUTPUT || "docs/architecture/benchmarks/sse-results.json";
const quantile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * p) - 1)
  ];
const rss = (pid) =>
  Number(
    execFileSync("ps", ["-o", "rss=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim(),
  );

async function health(port) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/healthz`, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(1000, () =>
      request.destroy(new Error("health timeout")),
    );
  });
}

async function run(runtime, repeat) {
  const port = runtime === "go" ? 7091 : 7092;
  const child = spawn(
    runtime === "go" ? goBinary : process.execPath,
    runtime === "go" ? [] : ["benchmarks/sse/node/server.mjs"],
    {
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const streams = [];
  try {
    let started = false;
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw new Error(`server exited: ${stderr}`);
      try {
        await health(port);
        started = true;
        break;
      } catch {
        await delay(50);
      }
    }
    if (!started) throw new Error(`server did not start: ${stderr}`);
    const idleRss = rss(child.pid);
    let frames = 0;
    const startStream = () =>
      new Promise((resolve, reject) => {
        const begin = performance.now();
        let first = true;
        let buffer = "";
        const request = http.get(
          `http://127.0.0.1:${port}/events`,
          { agent: false },
          (response) => {
            streams.push([request, response]);
            if (response.statusCode !== 200) {
              reject(new Error(`status ${response.statusCode}`));
              return;
            }
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              buffer += chunk;
              while (buffer.includes("\n\n")) {
                const cut = buffer.indexOf("\n\n");
                const frame = buffer.slice(0, cut);
                buffer = buffer.slice(cut + 2);
                if (frame.startsWith("data: ")) {
                  JSON.parse(frame.slice(6));
                  frames++;
                  if (first) {
                    first = false;
                    resolve(performance.now() - begin);
                  }
                }
              }
            });
            response.on("error", (error) => {
              if (first) reject(error);
            });
          },
        );
        request.on("error", (error) => {
          if (first) reject(error);
        });
        request.setTimeout(15000, () =>
          request.destroy(new Error("stream timeout")),
        );
      });
    // Ramp connections in identical batches for both runtimes. All streams
    // remain open: this measures 1000 concurrent streams without benchmarking
    // the host's SYN backlog limit instead of the SSE implementation.
    const latencies = [];
    for (let offset = 0; offset < concurrency; offset += 25) {
      latencies.push(
        ...(await Promise.all(
          Array.from(
            { length: Math.min(25, concurrency - offset) },
            startStream,
          ),
        )),
      );
    }
    const active = (await health(port)).active;
    if (active !== concurrency)
      throw new Error(`active streams ${active}, expected ${concurrency}`);
    const samples = [];
    for (let n = 0; n < 5; n++) {
      samples.push(rss(child.pid));
      await delay(holdMs / 5);
    }
    for (const [request, response] of streams) {
      response.destroy();
      request.destroy();
    }
    let after = concurrency;
    for (let n = 0; n < 100; n++) {
      after = (await health(port)).active;
      if (after === 0) break;
      await delay(20);
    }
    if (after !== 0) throw new Error(`stream leak: ${after}`);
    return {
      runtime,
      repeat,
      concurrency,
      confirmed_active: active,
      active_after_disconnect: after,
      hold_ms: holdMs,
      frames,
      first_event_p50_ms: quantile(latencies, 0.5),
      first_event_p95_ms: quantile(latencies, 0.95),
      idle_rss_kib: idleRss,
      peak_rss_kib: Math.max(...samples),
      additional_rss_kib_per_stream:
        (Math.max(...samples) - idleRss) / concurrency,
    };
  } finally {
    for (const [request, response] of streams) {
      response.destroy();
      request.destroy();
    }
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", resolve);
    });
  }
}
const results = [];
for (let repeat = 1; repeat <= repeats; repeat++)
  for (const runtime of ["go", "node"]) {
    const result = await run(runtime, repeat);
    results.push(result);
    console.log(JSON.stringify(result));
  }
mkdirSync(output.slice(0, output.lastIndexOf("/")), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      measured_at: new Date().toISOString(),
      host: {
        platform: os.platform(),
        arch: os.arch(),
        kernel: os.release(),
        cpus: os.cpus().length,
        cpu: os.cpus()[0]?.model,
        memory_bytes: os.totalmem(),
        node: process.version,
      },
      method:
        "Loopback HTTP/1.1; connections ramped in batches of 25; first-event includes connection setup; 100ms token interval; all simultaneous streams held after reaching concurrency; process RSS via ps; not provider latency or production gateway overhead.",
      results,
    },
    null,
    2,
  ) + "\n",
);
