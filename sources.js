import { archiveWindow } from "./timing.js";

// Clip creation time can differ substantially from the footage's time.
export function matchClip(event, broadcaster, clip, videos) {
  let url;
  try { url = new URL(clip.url); } catch { return null; }
  const isClip = url.hostname === "clips.twitch.tv" ||
    (["www.twitch.tv", "twitch.tv"].includes(url.hostname) && /^\/[^/]+\/clip\/[^/]+$/.test(url.pathname));
  if (clip.broadcaster_id !== broadcaster || url.protocol !== "https:" || !isClip)
    return null;
  const video = videos.find(v => v.id === clip.video_id);
  if (video && (video.stream_id !== event.streamId || video.user_id !== broadcaster))
    return null;
  const window = archiveWindow(event.streamId, broadcaster, event.evidence, video);
  if (window && Number.isFinite(clip.vod_offset) && Number.isFinite(clip.duration)) {
    const overlap = Math.max(0, Math.min(window.end, clip.vod_offset + clip.duration) -
      Math.max(window.start, clip.vod_offset));
    if (!overlap) return null;
    const fraction = overlap / (window.end - window.start);
    return {
      confidence: fraction >= 0.8 ? "High-confidence match" : "Approximate match",
      reason: Math.round(fraction * 100) + "% of estimated window overlaps the same broadcast",
      overlap: fraction,
    };
  }
  // Known offsets with unresolved archive identity cannot establish a match.
  if (clip.video_id && Number.isFinite(clip.vod_offset)) return null;
  const distance = Math.abs(Date.parse(clip.created_at) - event.time);
  if (distance > 90000 || !Number.isFinite(distance)) return null;
  return {
    confidence: "Approximate match",
    reason: "Creation time is nearby. Footage timing is unavailable.",
    overlap: 0,
  };
}

export function nextSourceCheck(event, now) {
  const delays = [30000, 120000, 300000, 900000, 3600000, 10800000, 43200000, 86400000, 172800000];
  const expiry = event.time + 7 * 86400000;
  if (now >= expiry || event.sourceAttempts >= delays.length) return null;
  return Math.min(expiry, now + delays[event.sourceAttempts]);
}

export async function findSources(api, channel, events, now = Date.now()) {
  const videos = await api("videos", { user_id: channel.remote, type: "archive", first: 100 });
  const clips = await api("clips", {
    broadcaster_id: channel.remote,
    started_at: new Date(Math.min(...events.map(e => e.time)) - 90000).toISOString(),
    ended_at: new Date(now).toISOString(),
    first: 100,
  });
  const known = [...new Set(events.flatMap(e => [e.pending, ...(e.knownClips || [])]).filter(Boolean))];
  for (let i = 0; i < known.length; i += 100) {
    const verified = await api("clips", known.slice(i, i + 100).map(id => ["id", id]));
    for (const clip of verified) {
      const index = clips.findIndex(c => c.id === clip.id);
      if (index >= 0) clips[index] = clip;
      else clips.push(clip);
    }
  }
  const missing = [...new Set(clips.map(c => c.video_id).filter(id =>
    id && !videos.some(v => v.id === id)))];
  for (let i = 0; i < missing.length; i += 100)
    videos.push(...await api("videos", missing.slice(i, i + 100).map(id => ["id", id])));
  return events.map(event => {
    const archive = archiveWindow(event.streamId, channel.remote, event.evidence,
      videos.find(v => v.stream_id === event.streamId));
    const matches = clips.map(clip => ({
      clip, match: matchClip(event, channel.remote, clip, videos),
    })).filter(x => x.match).sort((a, b) => b.match.overlap - a.match.overlap);
    const native = clips.find(c => c.id === event.pending && c.broadcaster_id === channel.remote);
    return { event, archive, matches: matches.slice(0, 5), native };
  });
}
