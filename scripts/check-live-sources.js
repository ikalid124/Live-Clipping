// Read-only API probe. A derived clip window is a controlled correlation check.
import { join } from "node:path";
import { Twitch } from "../twitch.js";
import { matchClip } from "../sources.js";
import { archiveWindow } from "../timing.js";

const login = process.argv[2];
if (!/^[a-z0-9_]{2,25}$/i.test(login || "")) throw Error("Supply a Twitch channel login");
const twitch = new Twitch(process.env.STREAMPULSE_DATA ||
  join(process.env.LOCALAPPDATA || ".", "StreamPulse"), {
  list: () => [], gap() {}, error(message) { throw Error(message); },
});
await twitch.init();
if (!twitch.user) throw Error("Connect Twitch in the running application first");
const [channel] = await twitch.api("users", { login });
if (!channel) throw Error("Channel not found");
const clips = await twitch.api("clips", {
  broadcaster_id: channel.id,
  started_at: new Date(Date.now() - 86400000).toISOString(),
  first: 20,
});
const result = { channel: login, clipsReturned: clips.length,
  exampleUrls: clips.slice(0, 3).map(c => c.url), controlledCorrelation: null };
for (const clip of clips) {
  if (!clip.video_id || !Number.isFinite(clip.vod_offset)) continue;
  const [video] = await twitch.api("videos", { id: clip.video_id });
  if (!video) continue;
  const start = Date.parse(video.created_at) + clip.vod_offset * 1000;
  const event = {
    streamId: video.stream_id, time: start,
    evidence: { start, end: start + clip.duration * 1000 },
  };
  result.controlledCorrelation = {
    label: "Controlled window derived from a real clip; not a detected highlight",
    clip: clip.url,
    match: matchClip(event, channel.id, clip, [video]),
    archive: archiveWindow(event.streamId, channel.id, event.evidence, video),
  };
  break;
}
console.log(JSON.stringify(result, null, 2));
