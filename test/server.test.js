import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("dashboard, watchlist, local recording association, review and restart", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-test-"));
  const port = 20000 + Math.floor(Math.random() * 20000),
    root = "http://127.0.0.1:" + port;
  let child;
  const start = async () => {
    child = spawn(process.execPath, ["server.js"], {
      env: {
        ...process.env,
        PORT: String(port),
        STREAMPULSE_DATA: dir,
        DISCORD_WEBHOOK_URL: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw Error("Server exited");
      }),
    ]);
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const closed = once(child, "exit");
      child.kill();
      await closed;
    }
  };
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  await start();
  const get = async (path) => (await fetch(root + path)).json();
  const post = async (path, body, origin = root) =>
    fetch(root + "/api/" + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.match(await (await fetch(root)).text(), /StreamPulse/);
  for (const file of ["/app.js", "/style.css"])
    assert.equal((await fetch(root + file)).status, 200);
  const s = await get("/api/state");
  assert.equal(s.events.length, 3);
  assert.equal(s.channels.length, 3);
  assert.ok(s.events.every((e) => e.media === "Bookmark" && !e.clips.length));
  const id = s.events[0].id;
  assert.equal(
    (
      await post("review", {
        id,
        decision: "Approved",
        rating: "Excellent",
        note: "Good moment",
      })
    ).status,
    200,
  );
  assert.equal(
    (await post("review", { id, decision: "Rejected" }, "https://example.com"))
      .status,
    403,
  );
  assert.equal(
    (await post("add", { kind: "Demo", name: "test_channel" })).status,
    200,
  );
  assert.equal(
    (await post("add", { kind: "Twitch", name: "test_channel" })).status,
    400,
  );
  const c = (await get("/api/state")).channels[0];
  const update = {
    ...c,
    enabled: false,
    removed: false,
    threshold: 0,
    offset: 5,
    mode: "bookmark",
  };
  assert.equal((await post("channel", update)).status, 200);
  assert.equal((await get("/api/state")).channels[0].live, 0);
  const candidate = s.events.find((e) => e.channel === c.id);
  await post("channel", { ...update, mode: "local" });
  writeFileSync(join(dir, "media", "owned.mp4"), "fixture bytes");
  const local = { id: candidate.id, name: "owned.mp4", authorized: false };
  assert.equal((await post("local", local)).status, 400);
  assert.equal(
    (await post("local", { ...local, authorized: true })).status,
    200,
  );
  assert.equal(
    await (await fetch(root + "/media/" + candidate.id)).text(),
    "fixture bytes",
  );
  assert.equal(
    (await post("channel", { ...update, mode: "native" })).status,
    400,
  );
  await post("settings", { ...s.settings, discord: true, notify: 40 });
  for (const decision of ["Rejected", "Saved", "Approved"]) {
    await post("review", { id, decision, rating: "Excellent", note: "Good moment" });
    await stop();
    await start();
    const saved = await get("/api/event/" + id);
    assert.equal(saved.decision, decision);
    assert.equal(saved.rating, "Excellent");
    assert.equal(saved.note, "Good moment");
  }
  await stop();
  await start();
  const e = await get("/api/event/" + id);
  assert.equal(e.decision, "Approved");
  assert.equal(e.note, "Good moment");
  assert.equal(e.rating, "Excellent");
  const q =
    "/api/queue?source=Demo&decision=Approved&channel=" +
    e.channel +
    "&category=" +
    encodeURIComponent(e.evidence.category) +
    "&min=50";
  assert.equal((await get(q))[0].id, id);
  assert.ok((await get(q))[0].adjustment > 0);
  assert.equal((await get("/api/state?source=Twitch")).counts.total, 0);
  assert.deepEqual(await get("/api/queue?source=Twitch"), []);
  await post("resetPreferences", {});
  assert.equal((await get(q))[0].adjustment, 0);
  assert.equal((await get(q))[0].rating, "Excellent");
  assert.equal((await get("/api/state")).channels.length, 4);
  const recovered = await get("/api/state");
  assert.equal(recovered.settings.discord, true);
  assert.equal((await post("testNotification", { destination: "discord" })).status, 400);
  const checks = (await get("/api/state")).notificationChecks;
  assert.equal(checks[0].destination, "discord");
  assert.match(checks[0].result, /DISCORD_WEBHOOK_URL/);
});
