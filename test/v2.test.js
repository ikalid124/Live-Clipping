import test from "node:test";
import assert from "node:assert/strict";
import { benchmark } from "../benchmark.js";
import { archiveWindow, coverage } from "../timing.js";
import { Detector } from "../detector.js";
test("shared reactions, emotes, anonymous vocabulary, repeated accounts and delayed batches", () => {
  const { results } = benchmark();
  for (const row of results)
    assert.equal(
      row.detected,
      row.expected && row.name !== "quiet dialogue without reaction",
      row.name,
    );
  assert.ok(
    results[0].score > results[2].score && results[0].score > results[3].score,
  );
  assert.ok(results.every((x) => !x.duplicates));
});
test("profile overrides and GTA category remain channel-specific", () => {
  const add = (d) =>
    d.add({ id: "1", user: "u", time: 10000, text: "he snitched" });
  const gta = new Detector(2, "GTA RP"),
    other = new Detector(2);
  add(gta);
  add(other);
  assert.equal(gta.sample(10000).category, "Betrayal");
  assert.equal(other.sample(10000).category, "Activity");
  const custom = new Detector(2, "Variety", {
    "Channel prank": ["banana peel"],
  });
  custom.add({ id: "2", user: "u", time: 10000, text: "banana peel" });
  assert.equal(custom.sample(10000).category, "Channel prank");
});
test("archive identity, bounds, late clip, null offset and incorrect video", () => {
  const origin = 1700000000000,
    video = {
      id: "123",
      user_id: "2",
      type: "archive",
      stream_id: "7",
      created_at: new Date(origin).toISOString(),
      duration: "2h1m10s",
    };
  const e = { start: origin + 50000, end: origin + 71000 };
  const w = archiveWindow("7", "2", e, video);
  assert.equal(w.start, 50);
  assert.equal(w.end, 71);
  for (const v of [
    null,
    { ...video, stream_id: "8" },
    { ...video, user_id: "3" },
    { ...video, duration: "30s" },
  ])
    assert.equal(archiveWindow("7", "2", e, v), null);
  assert.equal(
    coverage(w, { video: "123", offset: 60, duration: 30 }),
    "Starts after estimated onset",
  );
  assert.equal(
    coverage(w, { video: "123", offset: 40, duration: 40 }),
    "Covers estimated window",
  );
  assert.equal(
    coverage(w, { video: "123", offset: null, duration: 30 }),
    "Coverage unknown",
  );
  assert.equal(
    coverage(w, { video: "222", offset: 50, duration: 30 }),
    "Coverage unknown",
  );
});
