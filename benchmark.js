import { Detector } from "./detector.js";
import { pathToFileURL } from "node:url";
export function benchmark() {
  const cases = [
    {
      name: "100 independent LOL",
      n: 100,
      base: 10,
      text: "LOL.",
      positive: true,
    },
    {
      name: "450 identical emotes",
      n: 450,
      base: 70,
      text: "",
      emotes: ["LUL"],
      positive: true,
    },
    { name: "single account", n: 100, base: 10, text: "LOL.", accounts: 1 },
    {
      name: "coordinated repeaters",
      n: 180,
      base: 10,
      text: "LOL.",
      accounts: 18,
    },
    {
      name: "community scene without dictionary",
      n: 80,
      base: 9,
      text: (i) => "viewer's take " + i,
      positive: true,
    },
    {
      name: "established busy channel",
      n: 1600,
      base: 310,
      text: "OMEGALUL",
      positive: true,
    },
    {
      name: "quiet channel RP",
      n: 8,
      base: 2,
      text: "he snitched",
      profile: "GTA RP",
      positive: true,
    },
    {
      name: "quiet dialogue without reaction",
      n: 2,
      base: 2,
      text: "talking",
      positive: true,
    },
    { name: "ordinary activity", n: 10, base: 10, text: "hey" },
    { name: "raid", n: 150, base: 12, text: "LOL", suppress: true },
    { name: "gift notices", n: 80, base: 8, text: "gifted subs" },
    {
      name: "late batch",
      n: 120,
      base: 12,
      text: "pog",
      delay: 8000,
      positive: true,
    },
    { name: "slow growth", n: 30, base: 22, text: "wow" },
  ];
  const results = [];
  const wall = performance.now(),
    cpu = process.cpuUsage();
  let peak = 0;
  for (const c of cases) {
    const detector = new Detector(0, c.profile);
    let now = 100000;
    function ingest(n, i, text, burst) {
      for (let j = 0; j < n; j++) {
        const time = now - 4000 + Math.floor((j * 3900) / n);
        const m = {
          id: i + "-" + j,
          user: "viewer" + (j % (c.accounts || n)),
          time,
          text: typeof text === "function" ? text(j) : text,
          emotes: burst ? c.emotes : [],
        };
        detector.add(m, time + (burst ? c.delay || 0 : 0));
      }
    }
    for (let i = 0; i < 18; i++) {
      ingest(c.base, i, "chat", false);
      detector.sample(now);
      now += 5000;
    }
    if (c.suppress) detector.suppressUntil = now + 90000;
    ingest(c.n, 19, c.text, true);
    const result = detector.sample(now + (c.delay || 0));
    const repeat = detector.sample(now + (c.delay || 0) + 5000);
    results.push({
      name: c.name,
      expected: !!c.positive,
      detected: result.active,
      score: result.score,
      category: result.category,
      latencyMs: result.active ? 4000 + (c.delay || 0) : null,
      duplicates: +repeat.active,
      reasons: result.rejected,
    });
    peak = Math.max(peak, process.memoryUsage().rss);
  }
  const tp = results.filter((x) => x.expected && x.detected).length,
    positives = results.filter((x) => x.expected).length;
  return {
    results,
    detectionRate: tp / positives,
    falseNegativeRate: (positives - tp) / positives,
    falsePositiveRate:
      results.filter((x) => !x.expected && x.detected).length /
      (results.length - positives),
    duplicateTriggers: results.reduce((n, r) => n + r.duplicates, 0),
    peakRssMiB: Math.round(peak / 1048576),
    cpuMs: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b) / 1000,
    wallMs: Math.round(performance.now() - wall),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(benchmark(), null, 2));
