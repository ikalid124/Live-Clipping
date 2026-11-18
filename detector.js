import { readFileSync } from "node:fs";
const tuning = JSON.parse(
  readFileSync(new URL("./detection-settings.json", import.meta.url)),
);
const dictionary = JSON.parse(
  readFileSync(new URL("./reactions.json", import.meta.url)),
);
const gta = JSON.parse(readFileSync(new URL("./gta-rp.json", import.meta.url)));
export function validateDictionary(value) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).length > 24
  )
    throw Error("Enter a JSON object with up to 24 categories");
  for (const [key, words] of Object.entries(value)) {
    if (
      !key.trim() ||
      key.length > 60 ||
      !Array.isArray(words) ||
      words.length > 60 ||
      words.some((w) => typeof w !== "string" || !w.trim() || w.length > 64)
    )
      throw Error("Each category needs a list of short reaction phrases");
  }
  return value;
}
const compile = (dictionary) =>
  Object.entries(dictionary).map(([name, words]) => [
    name,
    words.map(
      (w) =>
        new RegExp(
          "(?:^|[^a-z0-9])" +
            w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "(?:$|[^a-z0-9])",
          "iu",
        ),
    ),
  ]);
export class Detector {
  constructor(base = 0, profile = "Variety", custom = {}) {
    this.patterns = compile({
      ...dictionary,
      ...(profile === "GTA RP" ? gta : {}),
      ...validateDictionary(custom),
    });
    this.base = base;
    this.rows = [];
    this.seen = new Map();
    this.ticks = 0;
    this.suppressUntil = 0;
  }
  add({ id, time, user, text, emotes = [] }, now = time) {
    if (
      !user ||
      !id ||
      typeof text !== "string" ||
      !Number.isFinite(time) ||
      time < now - 30000 ||
      time > now + 2000 ||
      this.seen.has(id)
    )
      return;
    this.seen.set(id, time);
    if (this.seen.size > 30000) this.seen.delete(this.seen.keys().next().value);
    const content = (text + " " + emotes.join(" "))
      .trim()
      .toLowerCase()
      .slice(0, 500);
    if (
      /^(?:!\w+|https?:\/\/)|\b(?:ad break|commercial break|gifted subs?|welcome raiders|sponsored by|use code)\b/i.test(
        content,
      )
    )
      return;
    const reaction = this.patterns.find(([, rx]) =>
      rx.some((p) => p.test(content)),
    )?.[0];
    this.rows.push({ time, received: now, user, content, reaction });
    if (this.rows.length > 24000) this.rows.splice(0, 4000);
  }
  sample(now, { threshold = 70, offset = 6, bias = 0 } = {}) {
    this.rows = this.rows.filter((m) => m.time > now - 30000);
    for (const [id, t] of this.seen) {
      if (t < now - 60000) this.seen.delete(id);
      else break;
    }
    const arrivals = this.rows.filter(
      (m) => m.received > Math.max(this.lastSample ?? -Infinity, now - 5000),
    );
    this.lastSample = now;
    // Use a coherent event-time window for a late batch rather than summing a reconnect backlog.
    const windowEnd = arrivals.length
      ? Math.min(now, Math.max(...arrivals.map((m) => m.time)))
      : now;
    const recent = this.rows.filter(
      (m) => m.time > windowEnd - 5000 && m.time <= windowEnd,
    );
    const fifteen = this.rows.filter(
      (m) => m.time > windowEnd - 15000 && m.time <= windowEnd,
    ).length;
    const n = recent.length,
      users = new Set(recent.map((m) => m.user)).size;
    const reacting = new Map();
    for (const m of recent)
      if (m.reaction) {
        reacting.set(m.user, m.reaction);
      }
    const counts = Object.create(null);
    for (const type of reacting.values())
      counts[type] = (counts[type] || 0) + 1;
    const category =
      Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] ||
      "Activity";
    const baseline = this.base;
    const multiplier = Math.max(
      n / Math.max(2, baseline),
      fifteen / Math.max(6, 3 * baseline),
      this.rows.length / Math.max(12, 6 * baseline),
    );
    const share = reacting.size / Math.max(1, users);
    const copies = new Map(),
      perUser = new Map();
    for (const m of recent) {
      copies.set(m.content, (copies.get(m.content) || 0) + 1);
      perUser.set(m.user, (perUser.get(m.user) || 0) + 1);
    }
    const concentration = Math.max(0, ...copies.values()) / Math.max(1, n);
    const dominance = Math.max(0, ...perUser.values()) / Math.max(1, n);
    const repeatedFlood =
      concentration > 0.85 &&
      n >= 12 &&
      n / users >= tuning.repeatedCopiesPerViewer;
    const sharedReaction =
      reacting.size >= 3 && share >= tuning.minimumReactionShare;
    const broadSurge =
      users >= Math.max(12, baseline * 2) &&
      multiplier >= tuning.broadSurgeMultiplier &&
      concentration < 0.65;
    const baselineConfidence = Math.min(1, this.ticks / 12);
    const scoreCeiling =
      users < tuning.minimumViewers ? 35 : repeatedFlood ? 45 : 99;
    const score = Math.round(
      Math.max(
        0,
        Math.min(
          scoreCeiling,
          23 * Math.log2(Math.max(1, multiplier)) +
            Math.min(26, users * 3) +
            24 * share +
            5 * baselineConfidence +
            bias -
            65 * dominance -
            (repeatedFlood ? 55 : 0),
        ),
      ),
    );
    const rejected = [];
    if (this.ticks < tuning.warmupSamples) rejected.push("Baseline warming up");
    if (now < this.suppressUntil)
      rejected.push("Raid or gifting suppression active");
    if (users < tuning.minimumViewers || dominance > tuning.maximumUserShare)
      rejected.push("Too few independent participants");
    if (repeatedFlood)
      rejected.push("Accounts repeatedly sent the same message");
    if (!sharedReaction && !broadSurge)
      rejected.push("Insufficient audience reaction");
    if (multiplier < tuning.minimumSpike)
      rejected.push("Traffic near channel baseline");
    if (score < threshold) rejected.push("Below channel score threshold");
    if (!arrivals.length) rejected.push("No new messages");
    const active = rejected.length === 0;
    this.base =
      this.ticks === 0 && !baseline
        ? n
        : baseline * 0.92 + 0.08 * Math.min(n, Math.max(5, baseline * 2));
    this.ticks++;
    const reactionTime = n
      ? Math.min(...recent.filter((m) => m.reaction).map((m) => m.time))
      : now;
    const anchor = Number.isFinite(reactionTime) ? reactionTime : now;
    return {
      now,
      n,
      fifteen,
      thirty: this.rows.length,
      baseline,
      multiplier,
      score,
      users,
      category,
      active,
      start: anchor - (offset + 15) * 1000,
      end: anchor + (8 - offset) * 1000,
      reactionTime: anchor,
      reacting: reacting.size,
      concentration,
      dominance,
      baselineConfidence,
      rejected,
      threshold,
      receivedAt: recent.length
        ? Math.max(...recent.map((m) => m.received))
        : null,
      timingNote:
        "Estimated from chat time, channel delay and a five-second sampling interval.",
      reason:
        reacting.size +
        " reacting viewers · " +
        multiplier.toFixed(1) +
        "× normal chat",
    };
  }
}
