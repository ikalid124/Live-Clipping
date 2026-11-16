import test from "node:test";
import assert from "node:assert/strict";
import { Detector } from "../detector.js";
import { fixtures, frame } from "../replay.js";
for (const p of fixtures)
  test(p.name + " separates adjacent windows and independent surges", () => {
    const d = new Detector(),
      hits = [];
    for (let i = 0; i < 60; i++) {
      let t = 100000 + i * 5000;
      for (const m of frame(p, i, t)) d.add(m, t);
      if (d.sample(t).active) hits.push(i);
    }
    assert.deepEqual(
      hits,
      [15, 16, 45, 46].map((i) => i - p.phase),
    );
  });
for (const scenario of ["normal", "single user", "bot flood", "growth", "raid"])
  test(scenario + " stays below detection gate", () => {
    const d = new Detector();
    for (let i = 0; i < 50; i++) {
      const t = 100000 + i * 5000;
      if (scenario === "raid" && i === 15) d.suppressUntil = t + 10000;
      const rows = frame(fixtures[0], i, t);
      if (scenario === "growth")
        for (let j = 0; j < 18 + i; j++)
          d.add(
            {
              id: i + ":" + j,
              user: "u" + j,
              text: ["lol", "wow", "pog"][j % 3],
              time: t,
            },
            t,
          );
      else
        for (const m of rows) {
          if (scenario === "normal") m.text = "hello";
          if (scenario === "single user") m.user = "spam";
          if (scenario === "bot flood") m.text = "wow";
          if (scenario === "raid" && i > 16) m.text = "ordinary";
          d.add(m, t);
        }
      assert.equal(d.sample(t).active, false, "sample " + i);
    }
  });
test("event time, offset and duplicate delivery", () => {
  const d = new Detector();
  d.ticks = 10;
  for (const m of frame(fixtures[0], 15, 100000)) {
    d.add(m, 103000);
    d.add(m, 103000);
  }
  const e = d.sample(103000, { offset: 8 });
  assert.equal(e.n, 90);
  assert.ok(e.active);
  assert.equal(e.start, e.reactionTime - 23000);
  assert.ok(e.end < e.now);
  d.add({ id: "stale", time: 1000, user: "u", text: "wow" }, 103000);
  assert.equal(d.rows.length, 90);
});
