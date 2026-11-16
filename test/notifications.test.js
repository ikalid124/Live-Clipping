import test from "node:test";
import assert from "node:assert/strict";
import { discord } from "../notifications.js";
test("Discord rejects missing credentials and surfaces delivery failure without exposing webhook", async (t) => {
  await assert.rejects(discord("", "sample"), /Configure/);
  const f = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 429 }),
  );
  await assert.rejects(
    discord("https://discord.com/api/webhooks/123/mock", "sample"),
    { message: "Discord HTTP 429" },
  );
  const body = JSON.parse(f.mock.calls[0].arguments[1].body);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
});
