// Loaded only by the isolated pipeline test. Advance the production sampler explicitly.
import { Twitch } from "../twitch.js";
let adapter,
  sample,
  completeClip,
  live = true;
const origin = Date.now();
let time = origin;
Date.now = () => time;
const interval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...args) => {
  if (ms === 5000) {
    sample = fn;
    return;
  }
  return interval(fn, ms, ...args);
};
Twitch.prototype.init = async function () {
  adapter = this;
  this.user = "tester";
  this.token = { scope: ["clips:edit"] };
};
Twitch.prototype.validate = async () => {};
Twitch.prototype.updateWatchlist = async function () {
  for (const c of this.hooks.list()) this.hooks.health(c.id, "Subscribed");
};
Twitch.prototype.api = async (path) => {
  if (path === "users") return [{ id: "9" }];
  if (path === "streams")
    return live
      ? [
          {
            id: "broadcast",
            user_id: "9",
            started_at: new Date(origin - 600000).toISOString(),
          },
        ]
      : [];
  if (path === "videos")
    return [
      {
        id: "20",
        stream_id: "broadcast",
        user_id: "9",
        type: "archive",
        created_at: new Date(origin - 600000).toISOString(),
        duration: "1h",
      },
    ];
  return [];
};
Twitch.prototype.clip = async (c, vod, pending) => {
  pending("simulated");
  return new Promise((resolve, reject) => {
    completeClip = () => reject(Error("Synthetic processing failure"));
  });
};
process.on("message", async (op) => {
  if (op === "fail") completeClip();
  else {
    if (op === "end") live = false;
    time += 5000;
    const n = op === "burst" ? 100 : 10;
    for (const c of adapter.hooks.list())
      for (let j = 0; j < n; j++)
        adapter.hooks.message(c.id, {
          time: time - j * 20,
          user: "u" + j,
          id: time + "-" + j,
          text: op === "burst" ? "LOL." : "chat",
        });
    sample();
  }
  await new Promise((r) => setImmediate(r));
  process.send("done");
});
