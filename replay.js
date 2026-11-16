import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Detector } from "./detector.js";
export const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures.json", import.meta.url)),
);
export function frame(profile, i, time) {
  const burst =
    (i + profile.phase) % 30 === 15 || (i + profile.phase) % 30 === 16;
  const n = burst ? Math.max(10, profile.traffic * 5) : profile.traffic;
  return Array.from({ length: n }, (_, j) => ({
    id: i + "-" + j,
    time: time - (j % 100),
    user: "viewer" + j,
    text: burst
      ? ["wow", "lol", "clip that", "clutch", "no way"][j % 5]
      : "regular chat",
  }));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const path = process.argv.find((x) => x.endsWith(".jsonl"));
  const speed = Number(
    process.argv.find((x) => x.startsWith("--speed="))?.slice(8) ?? 0,
  );
  const records = path
    ? readFileSync(path, "utf8")
        .trim()
        .split(/\r?\n/)
        .map((l) => JSON.parse(l))
        .sort((a, b) => a.time - b.time)
    : null;
  for (const p of records ? [{ name: "log" }] : fixtures) {
    const d = new Detector();
    let last = -Infinity,
      hits = [],
      duplicates = 0,
      fp = 0,
      cursor = 0;
    const start = records?.[0]?.time ?? 1000000;
    const steps = records
      ? Math.ceil((records.at(-1).time - start) / 5000) + 1
      : 60;
    for (let i = 0; i < steps; i++) {
      const t = start + i * 5000;
      if (records) {
        while (cursor < records.length && records[cursor].time <= t)
          d.add(records[cursor++], t);
      } else for (const m of frame(p, i, t)) d.add(m, t);
      const e = d.sample(t);
      if (e.active) {
        if (t - last > 20000) {
          hits.push(t);
          if (!records && (i + p.phase) % 30 !== 15) fp++;
        } else duplicates++;
        last = t;
      }
      if (speed > 0) await new Promise((r) => setTimeout(r, 5000 / speed));
    }
    const expected = records
      ? []
      : [15 - p.phase, 45 - p.phase].map((i) => start + i * 5000);
    const latency = expected
      .map((t) => hits.find((h) => h >= t && h < t + 20000))
      .map((hit, i) => (hit == null ? null : hit - expected[i]));
    console.log({
      profile: p.name,
      events: hits.length,
      mergedWindows: duplicates,
      syntheticFalsePositives: records ? null : fp,
      detectionLatencyMs: records ? null : latency,
      firstDetectionMs: hits.length ? hits[0] - start : null,
    });
  }
}
