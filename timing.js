export function archiveWindow(streamId, broadcaster, evidence, video) {
  if (
    !streamId ||
    !video ||
    video.type !== "archive" ||
    video.stream_id !== streamId ||
    video.user_id !== broadcaster ||
    !/^\d+$/.test(video.id)
  )
    return null;
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(video.duration);
  if (!parts) return null;
  const duration =
    Number(parts[1] || 0) * 3600 +
    Number(parts[2] || 0) * 60 +
    Number(parts[3] || 0);
  const origin = Date.parse(video.created_at),
    start = Math.floor((evidence.start - origin) / 1000),
    end = Math.ceil((evidence.end - origin) / 1000);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    start < 0 ||
    end > duration
  )
    return null;
  return {
    id: video.id,
    start,
    end,
    origin,
    url: "https://www.twitch.tv/videos/" + video.id + "?t=" + start + "s",
  };
}
export function coverage(window, clip) {
  if (
    !window ||
    clip.video !== window.id ||
    !Number.isFinite(clip.offset) ||
    !Number.isFinite(clip.duration)
  )
    return "Coverage unknown";
  if (clip.offset >= window.end || clip.offset + clip.duration <= window.start)
    return "Outside estimated window";
  if (clip.offset > window.start) return "Starts after estimated onset";
  return clip.offset + clip.duration >= window.end
    ? "Covers estimated window"
    : "Ends before estimated finish";
}
