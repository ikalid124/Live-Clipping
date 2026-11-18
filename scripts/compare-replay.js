import { readFileSync } from "node:fs";
import { Detector } from "../detector.js";
import { fixtures, frame } from "../replay.js";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find(a => a.startsWith("--" + name + "="))?.split("=").slice(1).join("=") ?? fallback;
const thresholds = [Number(option("baseline", "70")), Number(option("proposed", "65"))];
if (thresholds.some(t => !Number.isInteger(t) || t < 40 || t > 99))
  throw Error("Thresholds must be integers from 40 to 99");
const profile = option("profile", "Variety");
if (!["Variety", "GTA RP"].includes(profile)) throw Error("Unknown profile");
const file = args.find(a => a.endsWith(".jsonl"));
const records = file ? readFileSync(file, "utf8").split(/\r?\n/).filter(l => l.trim()).map(JSON.parse).sort((a, b) => a.time - b.time) : null;
if (records && (!records.length || records.some(r => !Number.isFinite(r.time))))
  throw Error("Replay needs records with numeric UTC millisecond timestamps");
for (const fixture of records ? [{ name: "Supplied replay" }] : fixtures) {
  const detectors = thresholds.map(() => new Detector(0, profile));
  const hits = thresholds.map(() => []);
  const start = records?.[0].time ?? 1000000;
  const end = records?.at(-1).time ?? start + 295000;
  let cursor = 0;
  for (let now = start, step = 0; now <= end + 5000; now += 5000, step++) {
    const batch = [];
    if (records) {
      while (cursor < records.length && records[cursor].time <= now) batch.push(records[cursor++]);
    } else batch.push(...frame(fixture, step, now));
    detectors.forEach((detector, index) => {
      for (const message of batch) detector.add(message, now);
      const result = detector.sample(now, { threshold: thresholds[index] });
      if (result.active) hits[index].push({ time: now, score: result.score, category: result.category });
    });
  }
  const baselineTimes = new Set(hits[0].map(h => h.time));
  const proposedTimes = new Set(hits[1].map(h => h.time));
  console.log(JSON.stringify({
    source: fixture.name, synthetic: !records, profile, thresholds,
    qualifyingWindows: hits.map(h => h.length),
    added: hits[1].filter(h => !baselineTimes.has(h.time)),
    removed: hits[0].filter(h => !proposedTimes.has(h.time)),
    note: "Window comparison requires human labels to measure entertainment quality. Production settings are unchanged.",
  }, null, 2));
}
