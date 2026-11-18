import test from "node:test";
import assert from "node:assert/strict";
import { Twitch } from "../twitch.js";
const make = () => new Twitch(".", { gap() {}, list: () => [], error() {} });
test("rejects invalid OAuth states before token exchange", async () => {
  const t = make();
  await assert.rejects(t.finish("invalid", "code"), /state/);
});
test("bookmark account cannot create a Twitch clip", async () => {
  const t = make();
  t.token = { scope: ["user:read:chat"] };
  await assert.rejects(t.clip({ remote: "1" }), /permission/);
});
test("VOD creation uses verified endpoint and waits for Get Clips", async () => {
  const t = make(),
    calls = [];
  t.token = { scope: ["editor:manage:clips"] };
  t.user = "5";
  t.api = async (...args) => {
    calls.push(args);
    return args[0] === "videos/clips"
      ? [{ id: "p" }]
      : [{ id: "p", url: "https://clips.twitch.tv/p", vod_offset: null }];
  };
  let pending;
  const clip = await t.clip(
    { remote: "8" },
    { id: "22", end: 60 },
    (id) => (pending = id),
  );
  assert.equal(pending, "p");
  assert.equal(clip.vod_offset, null);
  assert.deepEqual(calls[0], [
    "videos/clips",
    {
      broadcaster_id: "8",
      duration: 30,
      editor_id: "5",
      vod_id: "22",
      vod_offset: 60,
      title: "StreamPulse highlight",
    },
    "POST",
  ]);
  assert.equal(calls[1][0], "clips");
});
test("rate limits prevent immediate repeat attempts", async (t) => {
  const adapter = make();
  adapter.token = { access_token: "test" };
  const f = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("{}", {
        status: 429,
        headers: { "ratelimit-reset": String(Date.now() / 1000 + 15) },
      }),
  );
  await assert.rejects(adapter.api("streams"), /429/);
  await assert.rejects(adapter.api("streams"), /cooling/);
  assert.equal(f.mock.callCount(), 1);
});
test("fresh WebSocket subscribes, deduplicates, reports raids and retries disconnects", async (t) => {
  const statuses = [],
    messages = [],
    raids = [];
  const a = new Twitch(".", {
    gap() {},
    error() {},
    health: (...s) => statuses.push(s),
    list: () => [
      { remote: "9", id: 1 },
      { remote: "10", id: 2, name: "second" },
    ],
    message: (...m) => messages.push(m),
    raid: (id) => raids.push(id),
  });
  let watched = a.hooks.list();
  a.hooks.list = () => watched;
  const original = globalThis.WebSocket;
  let ws;
  globalThis.WebSocket = class {
    constructor() {
      ws = this;
    }
    close() {}
  };
  t.after(() => {
    a.reset();
    globalThis.WebSocket = original;
  });
  a.token = {};
  a.validate = async () => {
    a.user = "5";
  };
  const subs = [];
  a.api = async (...v) => {
    const request = v[3];
    if (v[2] === "DELETE") return [];
    subs.push(request);
    if (
      request.type === "channel.chat.notification" &&
      request.condition.broadcaster_user_id === "10"
    )
      throw Error("Twitch eventsub/subscriptions returned 403");
    return [{ id: "sub" + subs.length }];
  };
  await a.start();
  const send = (type, p, id = "1") =>
    ws.onmessage({
      data: JSON.stringify({
        metadata: {
          message_type: type,
          message_id: id,
          message_timestamp: new Date().toISOString(),
        },
        payload: p,
      }),
    });
  await send("session_welcome", {
    session: { id: "s", keepalive_timeout_seconds: 10 },
  });
  assert.equal(subs.length, 4);
  assert.deepEqual(statuses, [
    [1, "Subscribed"],
    [2, "Subscribed"],
  ]);
  await send("revocation", {
    subscription: {
      type: "channel.chat.notification",
      condition: { broadcaster_user_id: "9" },
      status: "authorization_revoked",
    },
  });
  assert.equal(a.status, "EventSub connected");
  const payload = {
    subscription: { type: "channel.chat.message" },
    event: {
      broadcaster_user_id: "9",
      message_id: "m",
      chatter_user_id: "user",
      message: { text: "pog", fragments: [] },
    },
  };
  await send("notification", payload);
  await send("notification", payload);
  assert.equal(messages.length, 1);
  await send(
    "notification",
    {
      subscription: { type: "channel.chat.notification" },
      event: { broadcaster_user_id: "9", notice_type: "raid" },
    },
    "2",
  );
  assert.deepEqual(raids, [1]);
  const originalSocket = ws;
  watched = [watched[0], { remote: "11", id: 3, name: "third" }];
  await a.updateWatchlist();
  assert.equal(ws, originalSocket);
  assert.equal(
    subs.filter(
      (r) =>
        r.condition.broadcaster_user_id === "9" &&
        r.type === "channel.chat.message",
    ).length,
    1,
  );
  await ws.onmessage({ data: "{" });
  await send(
    "notification",
    {
      subscription: { type: "channel.chat.message" },
      event: { broadcaster_user_id: "9", message: null },
    },
    "broken",
  );
  assert.equal(ws, originalSocket);
  assert.equal(a.timer, null);
  await send("session_reconnect", { session: { reconnect_url: "wss://eventsub.wss.twitch.tv/ws?reconnect=test" } });
  assert.notEqual(ws, originalSocket);
  const subscriptionCount = subs.length;
  await send("session_welcome", { session: { id: "handoff", keepalive_timeout_seconds: null } });
  assert.equal(subs.length, subscriptionCount);
  assert.equal(a.heartbeat, 10);
  assert.equal(a.session, "handoff");
  ws.onclose();
  assert.match(a.status, /retrying/);
  assert.ok(a.timer);
  assert.equal(a.sockets.size, 0);
});

test("rejected token refresh clears the authenticated identity", async t => {
  const adapter = make();
  adapter.client = { id: "fixture", secret: "fixture" };
  adapter.token = { access_token: "fixture", refresh_token: "fixture" };
  adapter.user = "old-user";
  t.mock.method(globalThis, "fetch", async url =>
    new Response(null, { status: url.endsWith("/validate") ? 401 : 400 }));
  await assert.rejects(adapter.validate(), /exchange failed/);
  assert.equal(adapter.user, null);
  assert.equal(adapter.checked, 0);
});
