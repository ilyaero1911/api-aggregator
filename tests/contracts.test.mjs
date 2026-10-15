import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
const ajv = new Ajv2020({ allErrors: true, strict: false });
const requestSchema = JSON.parse(
  readFileSync(new URL("../schema/llm-request.schema.json", import.meta.url)),
);
const responseSchema = JSON.parse(
  readFileSync(new URL("../schema/llm-response.schema.json", import.meta.url)),
);
const validate = ajv.compile(requestSchema);
const response = ajv.compile(responseSchema);
const base = {
  model: "mock/chat",
  messages: [{ role: "user", content: "hello" }],
};
const accepts = [
  ["text", base],
  [
    "developer",
    {
      ...base,
      messages: [{ role: "developer", content: "rules" }, ...base.messages],
    },
  ],
  [
    "multimodal",
    {
      ...base,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "caption" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AA==" },
            },
            { type: "file", file: { filename: "a.pdf", file_data: "AA==" } },
            {
              type: "input_audio",
              input_audio: { data: "AA==", format: "wav" },
            },
          ],
        },
      ],
    },
  ],
  [
    "tool roundtrip",
    {
      ...base,
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: "ok" },
      ],
    },
  ],
  [
    "parameters",
    {
      ...base,
      temperature: 0,
      top_p: 0.5,
      max_tokens: 10,
      seed: 1,
      stop: ["end"],
      response_format: { type: "json_object" },
      parallel_tool_calls: true,
      stream: true,
      stream_options: { include_usage: true },
      store: false,
      provider: { require_parameters: true, allow_fallbacks: false },
    },
  ],
];
for (const [name, value] of accepts)
  test(`canonical accepts ${name}`, () =>
    assert.equal(validate(value), true, JSON.stringify(validate.errors)));
const rejects = [
  ["empty messages", { ...base, messages: [] }],
  ["role", { ...base, messages: [{ role: "root", content: "x" }] }],
  [
    "tool without correlation",
    { ...base, messages: [{ role: "tool", content: "x" }] },
  ],
  ["negative tokens", { ...base, max_tokens: -1 }],
  ["boolean tokens", { ...base, max_tokens: true }],
  ["unknown parameter", { ...base, secret: "x" }],
  ["missing user content", { ...base, messages: [{ role: "user" }] }],
  ["temperature range", { ...base, temperature: 3 }],
  ["persistent storage", { ...base, store: true }],
  [
    "audio format",
    {
      ...base,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: "AA==", format: "exe" },
            },
          ],
        },
      ],
    },
  ],
];
for (const [name, value] of rejects)
  test(`canonical rejects ${name}`, () => assert.equal(validate(value), false));
test("canonical response preserves all token categories", () => {
  const value = {
    id: "gen-1",
    object: "chat.completion",
    created: 1,
    model: "mock/chat",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "hello" },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
      cached_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 1,
      audio_input_tokens: 0,
      audio_output_tokens: 0,
      image_input_tokens: 0,
      image_output_tokens: 0,
    },
  };
  assert.equal(response(value), true, JSON.stringify(response.errors));
  value.choices[0].finish_reason = "unknown";
  assert.equal(response(value), false);
});
