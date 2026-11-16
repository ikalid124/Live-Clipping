import { readFileSync } from "node:fs";
const dictionary = JSON.parse(
  readFileSync(new URL("./reactions.json", import.meta.url)),
);
const patterns = Object.entries(dictionary).map(([name, words]) => [
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
  constructor(base = 0) {
    this.base = base;
    this.rows = [];
    this.seen = new Map();
    this.ticks = 0;
    this.suppressUntil = 0;
  }
  add({ id, time, user, text, emotes = [] }, now = time) {
    if (
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
    if (/^(?:!\w+|https?:\/\/)|\b(?:ad break|commercial break|gifted subs?|welcome raiders|sponsored by|use code)\b/i.test(content)) return;
    const reaction = patterns.find(([, rx]) =>
      rx.some((p) => p.test(content)),
    )?.[0];
    this.rows.push({ time, user, content, reaction });
    if (this.rows.length > 24000) this.rows.splice(0, 4000);
  }
  sample(now, { threshold = 70, offset = 6, bias = 0 } = {}) {
    this.rows = this.rows.filter((m) => m.time > now - 30000);
    for (const [id, t] of this.seen) {
      if (t < now - 60000) this.seen.delete(id);
      else break;
    }
    const recent = this.rows.filter((m) => m.time > now - 5000);
    const fifteen = this.rows.filter((m) => m.time > now - 15000).length;
    const n = recent.length,
      users = new Set(recent.map((m) => m.user)).size;
    const reacting = new Map(),
      phrases = new Set();
    for (const m of recent)
      if (m.reaction) {
        reacting.set(m.user, m.reaction);
        phrases.add(m.content);
      }
    const counts = {};
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
    const score = Math.round(
      Math.min(
        99,
        Math.max(
          0,
          25 * Math.log2(Math.max(1, multiplier)) +
            Math.min(20, users * 2) +
            (25 * reacting.size) / Math.max(1, users) +
            bias,
        ),
      ),
    );
    const active =
      this.ticks >= 6 &&
      now >= this.suppressUntil &&
      users >= 4 &&
      reacting.size >= 3 &&
      phrases.size >= 3 &&
      multiplier >= 1.7 &&
      score >= threshold;
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
      reason:
        reacting.size +
        " reacting viewers · " +
        multiplier.toFixed(1) +
        "× normal chat",
    };
  }
}
