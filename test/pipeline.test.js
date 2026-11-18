import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("candidate is saved and alerted while native capture is pending; archive backfill and failure preserve it", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-pipeline-")),
    port = 41000 + Math.floor(Math.random() * 4000),
    origin = "http://127.0.0.1:" + port;
  const child = fork("server.js", [], {
    silent: true,
    execArgv: ["--import", "./scripts/mock-stream-fixture.js"],
    env: { ...process.env, PORT: String(port), STREAMPULSE_DATA: dir },
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const closed = once(child, "exit");
      child.kill();
      await closed;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw Error("Fixture server failed");
    }),
  ]);
  const state = async () =>
    (await fetch(origin + "/api/state?source=Twitch")).json();
  const post = async (p, data) => {
    const r = await fetch(origin + "/api/" + p, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    assert.equal(r.status, 200, await r.text());
  };
  const step = async (op) => {
    const done = once(child, "message");
    child.send(op);
    await done;
  };
  await post("add", { kind: "Twitch", name: "fixture" });
  const s = await state(),
    c = s.channels.find((c) => c.kind === "Twitch");
  await post("settings", { ...s.settings, desktop: true });
  await post("channel", {
    ...c,
    enabled: true,
    removed: false,
    mode: "native",
  });
  for (let i = 0; i < 10; i++) await step("normal");
  const feed = await fetch(origin + "/feed", { signal: AbortSignal.timeout(5000) });
  const reader = feed.body.getReader();
  await step("burst");
  const detected = await state();
  assert.equal(detected.events.length, 1);
  const e = detected.events[0];
  assert.equal(e.media, "Pending clip");
  assert.equal(e.streamId, "broadcast");
  assert.equal(e.evidence.users, 100);
  const queue = await (await fetch(origin + "/api/queue?source=Twitch")).json();
  assert.equal(queue[0].id, e.id);
  assert.ok(detected.alerts.some(a => a.event === e.id && a.method === "in-app"));
  let sent = "";
  while (!sent.includes("event: alert")) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    sent += new TextDecoder().decode(chunk.value);
  }
  await reader.cancel();
  assert.match(sent, /Review|#event-/);
  assert.match(sent, /messages\/5s/);
  const metrics = detected.channels.find(x => x.id === c.id).monitoring;
  assert.equal(metrics.processed, 200);
  assert.equal(metrics.messages, 200);
  assert.equal(metrics.users, 100);
  assert.ok(
    detected.alerts.some((a) => a.event === e.id && a.method === "browser"),
  );
  await step("fail");
  await step("normal");
  await step("normal");
  const reviewed = (await state()).events[0];
  assert.equal(reviewed.media, "Capture error");
  assert.equal(reviewed.archive.id, "20");
  assert.equal(reviewed.evidence.start, e.evidence.start);
  await step("normal");
  await step("burst");
  assert.equal(
    (await state()).events.length,
    2,
    "distinct surge after audience returned to baseline",
  );
  await step("fail");
  for (let i = 0; i < 6; i++) await step("end");
  assert.equal((await state()).channels.find((x) => x.id === c.id).live, 0);
});
