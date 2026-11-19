import assert from "node:assert/strict"
import test from "node:test"
import { chatPayload, headers } from "./client.mjs"

test("payload keeps provider", () => {
  const body = chatPayload("gpt", [{ role: "user", content: "a" }], { provider: { only: ["mock"] } })
  assert.deepEqual(body.provider.only, ["mock"])
  assert.equal(headers("secret").Authorization, "Bearer secret")
})
