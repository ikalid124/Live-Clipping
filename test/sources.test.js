import test from "node:test";
import assert from "node:assert/strict";
import { matchClip, nextSourceCheck, findSources } from "../sources.js";

const origin = 1700000000000;
const event = { id: 1, time: origin + 70000, streamId: "stream", sourceAttempts: 0,
  evidence: { start: origin + 50000, end: origin + 70000 } };
const video = { id: "123", stream_id: "stream", user_id: "9", type: "archive",
  created_at: new Date(origin).toISOString(), duration: "3h" };
const clip = { id: "clip", broadcaster_id: "9", video_id: "123", vod_offset: 40,
  duration: 40, url: "https://clips.twitch.tv/clip", created_at: new Date(origin + 3600000).toISOString() };

test("delayed clips require same-broadcast overlap and expose partial or missing timing", () => {
  assert.equal(matchClip(event, "9", clip, [video]).confidence, "High-confidence match");
  assert.equal(matchClip(event, "9", { ...clip, url: "https://www.twitch.tv/channel/clip/clip" }, [video]).confidence, "High-confidence match");
  assert.equal(matchClip(event, "9", { ...clip, url: "https://twitch.tv.evil.test/channel/clip/clip" }, [video]), null);
  assert.equal(matchClip(event, "9", clip, [{ ...video, stream_id: "other" }]), null);
  assert.equal(matchClip(event, "9", { ...clip, vod_offset: 80 }, [video]), null);
  assert.equal(matchClip(event, "9", { ...clip, vod_offset: 65 }, [video]).confidence, "Approximate match");
  assert.equal(matchClip(event, "9", { ...clip, vod_offset: null }, [video]), null);
  const nearby = { ...clip, vod_offset: null, created_at: new Date(event.time).toISOString() };
  assert.equal(matchClip(event, "9", nearby, [video]).confidence, "Approximate match");
  assert.equal(matchClip(event, "9", nearby, [{ ...video, stream_id: "other" }]), null);
  assert.equal(matchClip(event, "8", clip, [video]), null);
  assert.equal(matchClip(event, "9", clip, []), null);
});

test("source retry budget terminates and recovers a delayed clip through existing IDs", async () => {
  assert.equal(nextSourceCheck(event, event.time), event.time + 30000);
  assert.equal(nextSourceCheck({ ...event, sourceAttempts: 9 }, event.time), null);
  assert.equal(nextSourceCheck(event, event.time + 7 * 86400000), null);
  const calls = [];
  const api = async (path, params) => {
    calls.push([path, params]);
    if (path === "videos") return [video];
    return Array.isArray(params) ? [clip] : [];
  };
  const [result] = await findSources(api, { remote: "9" }, [{ ...event, knownClips: ["clip"] }], origin + 7200000);
  assert.equal(result.archive.id, "123");
  assert.equal(result.matches[0].match.confidence, "High-confidence match");
  assert.equal(calls.length, 3);
});
