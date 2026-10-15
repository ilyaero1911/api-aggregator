import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

test("official OpenAI SDK works with local baseURL for chat, SSE and Responses", async () => {
  const processMock = spawn(".cache/mock-provider", [], {
    env: { ...process.env, PORT: "7089" },
    stdio: "ignore",
  });
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      try {
        const r = await fetch("http://127.0.0.1:7089/healthz");
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(25);
    }
    assert.ok(ready, "mock did not start");
    const sdk = new OpenAI({
      apiKey: "ng_local_demo_only",
      baseURL: "http://127.0.0.1:7089/v1",
      maxRetries: 0,
    });
    const chat = await sdk.chat.completions.create({
      model: "mock/chat",
      messages: [{ role: "user", content: "hello" }],
    });
    assert.equal(chat.choices[0].message.content, "mock response");
    const stream = await sdk.chat.completions.create({
      model: "mock/chat",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    });
    let text = "";
    for await (const part of stream)
      text += part.choices[0]?.delta.content || "";
    assert.equal(text, "mock response");
    const response = await sdk.responses.create({
      model: "mock/chat",
      input: "hello",
      store: false,
    });
    assert.equal(response.output_text, "mock response");
  } finally {
    processMock.kill("SIGTERM");
    await new Promise((resolve) => {
      if (processMock.exitCode !== null) resolve();
      else processMock.once("exit", resolve);
    });
  }
});
