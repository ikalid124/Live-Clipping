const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (t) => new Date(t).toLocaleString();
const titles = {
  dashboard: "Overview",
  channels: "Watchlist",
  activity: "Live activity",
  queue: "Review queue",
  settings: "Settings",
};
let state,
  filter = "All",
  sort = "Best",
  dirty = false,
  generation = 0;
const requestedSource = new URLSearchParams(location.search).get("source");
if (["Twitch", "Demo"].includes(requestedSource)) localStorage.setItem("pulse-source", requestedSource);
let source = localStorage.getItem("pulse-source") || "",
  queueIds = [];
const filters = { channel: "0", category: "", min: "0", media: "" };
function scopeChannels() {
  return state.channels.filter((c) => c.kind === state.kind);
}
function scopePicker() {
  return (
    '<label class="scope">Workspace<select id="source"><option value="Demo" ' +
    (state.kind === "Demo" ? "selected" : "") +
    '>Demo mode</option><option value="Twitch" ' +
    (state.kind === "Twitch" ? "selected" : "") +
    ">Twitch monitoring</option></select></label>"
  );
}
function notice(msg) {
  $("#notice").textContent = msg;
}
async function api(path, body) {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const v = await r.json();
  if (!r.ok) throw Error(v.error);
  return v;
}
function tag(v) {
  return '<span class="tag">' + esc(v) + "</span>";
}
function options(items, current) {
  return items
    .map(
      (v) =>
        "<option " +
        (String(v) === String(current) ? "selected" : "") +
        ">" +
        esc(v) +
        "</option>",
    )
    .join("");
}
function field(label, name, value, min, max) {
  return (
    "<label>" +
    label +
    '<input required type="number" name="' +
    name +
    '" min="' +
    min +
    '" max="' +
    max +
    '" value="' +
    value +
    '"></label>'
  );
}
function check(label, name, on) {
  return (
    '<label class="check"><input type="checkbox" name="' +
    name +
    '" ' +
    (on ? "checked" : "") +
    ">" +
    label +
    "</label>"
  );
}
function mediaLabel(e) {
  if (e.media !== "Bookmark") return e.media;
  if (e.clips.some(c => c.source === "Native" || c.match?.confidence === "High-confidence match"))
    return "Matched clip";
  if (e.archive) return "Timestamped VOD";
  if (e.clips.length) return "Possible clip · check timing";
  return e.kind === "Demo" ? "Bookmark · demo preview" : "Timestamp bookmark";
}
function eventList(events) {
  return (
    events
      .map(
        (e) =>
          '<a class="event" href="#event-' +
          e.id +
          '"><span class="score">' +
          e.evidence.score +
          "</span><div><strong>" +
          esc(e.evidence.category) +
          " · " +
          esc(e.name) +
          '</strong><div class="sub">' +
          date(e.time) +
          " · " +
          esc(e.kind) +
          " · " +
          esc(e.evidence.reason) +
          " · " +
          esc(mediaLabel(e)) +
          "</div></div>" +
          tag(
            e.decision +
              (e.adjustment
                ? " · preference " +
                  (e.adjustment > 0 ? "+" : "") +
                  e.adjustment
                : ""),
          ) +
          "</a>",
      )
      .join("") || '<p class="sub">No candidates match this view.</p>'
  );
}
function channelMetrics(c) {
  const m = c.monitoring;
  if (!m) return "";
  const spikes = state.activity.filter(a => a.channel === c.id && a.spike).length;
  return '<p><strong>' + esc(m.status) + '</strong> · ' + esc(state.diagnostics.pollingError || c.health || state.status) +
    '</p><p>' + m.messages + ' messages/min · ' + m.users + ' unique chatters in the last minute · ' +
    Number(c.base).toFixed(1) + ' baseline messages/5s</p><p class="sub">' +
    Number(m.spike || 0).toFixed(1) + '× current spike · ' +
    spikes + ' qualifying windows in 5 min · ' + c.highlights + ' highlights · score threshold ' +
    (c.threshold || state.settings.threshold) + ' · Last chat ' + (c.lastChat ? date(c.lastChat) : 'awaiting first message') +
    ' · ' + m.processed + ' messages passed to detector since launch</p>';
}
function charts(channels) {
  return channels
    .map(
      (c) =>
        '<article class="timeline"><div class="row"><h3>' +
        esc(c.name) +
        "</h3>" +
        tag(c.kind + " · " + (c.live ? "Live" : "Offline")) +
        '</div>' + channelMetrics(c) + '<canvas data-chart="' +
        c.id +
        '" aria-label="Chat activity for ' +
        esc(c.name) +
        '"></canvas><div class="sub">Messages per 5s · dashed baseline · amber detection</div></article>',
    )
    .join("");
}
function draw() {
  for (const el of document.querySelectorAll("canvas")) {
    const rows = state.activity.filter((a) => a.channel == el.dataset.chart);
    const w = (el.width = Math.max(200, el.clientWidth * 2)),
      h = (el.height = 250),
      ctx = el.getContext("2d"),
      max = Math.max(4, ...rows.map((a) => Math.max(a.n, a.base)));
    const x = (i) => (i * w) / Math.max(1, rows.length - 1),
      y = (v) => h - 10 - ((h - 24) * v) / max;
    for (const [key, color] of [
      ["base", "#84979d"],
      ["n", "#9aebbc"],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash(key === "base" ? [8, 8] : []);
      ctx.beginPath();
      rows.forEach((a, i) =>
        i ? ctx.lineTo(x(i), y(a[key])) : ctx.moveTo(x(i), y(a[key])),
      );
      ctx.stroke();
    }
    ctx.fillStyle = "#f2bd75";
    rows.forEach((a, i) => {
      if (a.spike) {
        ctx.beginPath();
        ctx.arc(x(i), y(a.n), 5, 0, 7);
        ctx.fill();
      }
    });
  }
}
function overview() {
  const c = scopeChannels();
  return (
    '<p class="sub">Backend running ' + Math.floor(state.diagnostics.uptime / 60) +
    ' min · memory ' + state.diagnostics.memoryMiB + ' MiB · database ' +
    state.diagnostics.databaseMiB + ' MiB · ' + esc(state.diagnostics.monitorError || state.diagnostics.pollingError || "No current system error") + '</p>' +
    '<div class="stats">' +
    [
      ["Monitored", c.filter((x) => x.enabled).length],
      ["Live now", c.filter((x) => x.live).length],
      ["Highlights", state.counts.total],
      ["Score 85+", state.counts.strong || 0],
      ["Awaiting review", state.counts.pending || 0],
    ]
      .map(
        ([k, v]) =>
          '<div class="card"><small>' +
          k.toUpperCase() +
          "</small><strong>" +
          v +
          "</strong></div>",
      )
      .join("") +
    '</div><div class="row"><h2>Stream activity</h2><a href="#activity">All channels →</a></div>' +
    charts(c.filter((x) => x.enabled).slice(0, state.kind === "Twitch" ? undefined : 1)) +
    '<div class="row"><h2>Recent highlights</h2><a href="#queue">Review queue →</a></div>' +
    eventList(state.events.slice(0, 6))
  );
}
function watchlist() {
  return (
    '<form data-action="add"><h3>Add channel</h3><div class="toolbar"><input name="name" required placeholder="Username or Twitch URL" aria-label="Channel"><select name="kind">' +
    options(["Twitch", "Demo"], state.kind) +
    '</select><button class="primary">Add channel</button><button type="button" id="search">Search Twitch</button></div><div id="matches"></div></form>' +
    scopeChannels()
      .map(
        (c) =>
          "<details><summary>" +
          esc(c.name) +
          " · " +
          esc(c.kind) +
          " · " +
          (c.enabled ? (c.live ? "Live" : "Offline") : "Paused") +
          '</summary><p class="sub">' +
          esc(c.health) +
          " · Baseline " +
          c.base.toFixed(1) +
          ' messages per 5s</p><form data-action="channel" data-id="' +
          c.id +
          '">' +
          check("Monitor channel", "enabled", c.enabled) +
          '<div class="grid">' +
          field(
            "Score threshold (0 inherits global)",
            "threshold",
            c.threshold,
            0,
            99,
          ) +
          field("Reaction delay in seconds", "offset", c.offset, 0, 60) +
          '<label>Detection profile<select name="profile">' +
          options(["Variety", "GTA RP"], c.profile) +
          '</select></label><label>Custom reactions (category → JSON list)<textarea name="dictionary">' +
          esc(c.dictionary) +
          "</textarea></label>" +
          '<label>Clipping mode<select name="mode">' +
          options(
            c.kind === "Twitch"
              ? ["bookmark", "native", "local"]
              : ["bookmark", "local"],
            c.mode,
          ) +
          '</select></label></div><p class="sub">Native clips may publish on Twitch before review.</p><button>Save channel</button> <button name="remove" value="1">Remove channel</button></form></details>',
      )
      .join("")
  );
}
let queueOffset = 0;
async function queue() {
  const rows = await api(
    "queue?" +
      new URLSearchParams({
        decision: filter,
        order: sort,
        source: state.kind,
        ...filters,
        offset: queueOffset,
      }),
  );
  queueIds = rows.slice(0, 50).map((e) => e.id);
  const select = (key, label, items) =>
    "<label>" +
    label +
    '<select data-filter="' +
    key +
    '">' +
    items
      .map(
        ([value, name]) =>
          '<option value="' +
          esc(value) +
          '" ' +
          (String(value) === filters[key] ? "selected" : "") +
          ">" +
          esc(name) +
          "</option>",
      )
      .join("") +
    "</select></label>";
  return (
    '<p class="sub">' +
    (state.counts.pending || 0) +
    " pending in " +
    esc(state.kind) +
    '</p><div class="toolbar">' +
    select("channel", "Streamer", [
      ["0", "All streamers"],
      ...scopeChannels().map((c) => [c.id, c.name]),
    ]) +
    select("category", "Category", [
      ["", "All categories"],
      ...state.categories.map((x) => [x, x]),
    ]) +
    select(
      "min",
      "Minimum score",
      [0, 40, 60, 70, 80, 90, 95].map((n) => [n, n]),
    ) +
    select("media", "Media", [
      ["", "All media"],
      ...["Clip", "Recording", "VOD", "Bookmark", "Processing"].map((x) => [
        x,
        x,
      ]),
    ]) +
    "</div>" +
    ('<div class="toolbar"><label>Decision<select id="filter">' +
      options(
        ["All", "Pending", "Approved", "Rejected", "Saved", "Reviewed"],
        filter,
      ) +
      '</select></label><label>Order<select id="sort">' +
      options(["Best", "Recent", "Score"], sort) +
      "</select></label></div>" +
      eventList(rows.slice(0, 50)) +
      '<div class="toolbar">' +
      (queueOffset ? '<button id="earlier">Previous page</button>' : "") +
      (rows.length > 50 ? '<button id="later">Next page</button>' : "") +
      "</div>")
  );
}
function settings() {
  const s = state.settings;
  return (
    "<article><h3>Monitoring diagnostics</h3><p>" +
    (state.diagnostics.authenticated
      ? "Token validated"
      : "Account disconnected") +
    " · Last successful API call " +
    (state.diagnostics.lastApi
      ? date(state.diagnostics.lastApi)
      : "unobserved") +
    " · Reconnect attempts " +
    state.diagnostics.reconnects +
    "</p><p class=\"sub\">EventSub subscriptions " + state.diagnostics.subscriptions +
    " · Token validated " + (state.diagnostics.validatedAt ? date(state.diagnostics.validatedAt) : "awaiting validation") +
    " · Permissions " + esc(state.diagnostics.scopes.join(", ") || "none verified") + "</p>" +
    state.channels
      .filter((c) => c.kind === "Twitch" && c.enabled)
      .map(
        (c) =>
          "<p>" +
          esc(c.name) +
          " · " +
          esc(c.health || "Awaiting subscription") +
          " · " +
          (c.lastChat ? "Last chat " + date(c.lastChat) : "No chat received") +
          (c.live && (!c.lastChat || Date.now() - c.lastChat > 120000)
            ? " · No recent chat observed"
            : "") +
          "</p>",
      )
      .join("") +
    "</article>" +
    "<article><h3>Recent spikes below detection gate</h3>" +
    state.rejected
      .map(
        (r) =>
          "<p>" +
          esc(r.name) +
          " · " +
          date(r.time) +
          " · " +
          r.spike.toFixed(1) +
          "× · " +
          r.users +
          " viewers · " +
          esc(r.reasons.join(", ")) +
          "</p>",
      )
      .join("") +
    (state.rejected.length
      ? ""
      : "No recent rejected spikes in this workspace.") +
    "</article>" +
    '<article><h3>Review preferences</h3>' +
    (state.evaluation.map(r => '<p>' + esc(r.name) + ' · ' + esc(r.rating) + ' · ' +
      r.count + ' rated · average score ' + r.score + '</p>').join('') || '<p>No rated moments in this workspace yet.</p>') +
    '<button id="resetPrefs">Reset ranking preferences</button></article>' +
    "<article><h3>Twitch connection</h3><p>" +
    esc(state.status) +
    '</p><p class="sub">' +
    (state.configured
      ? "Authorize the account used to read chat."
      : "Register a Twitch application to connect your account.") +
    "</p>" + (state.canConfigureClient ?
      '<details'+(state.configured?'':' open')+'><summary>Twitch application credentials</summary><form data-action="configureTwitch"><p>In the <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">Twitch Developer Console</a>, register a confidential application with this OAuth redirect URL.</p><p><code>http://localhost:8765/oauth/callback</code></p><label>Client ID<input name="clientId" required maxlength="128" autocomplete="off" spellcheck="false"></label><label>Client secret<input type="password" name="clientSecret" required maxlength="128" autocomplete="off"></label><p class="sub">Windows encrypts these credentials for your user account.</p><button>Save application credentials</button></form></details>' : "") +
    (state.configured ? '<button id="authorize">Connect Twitch</button>' : '') +
    '</article><form data-action="settings"><h3>Detection and alerts</h3><div class="grid">' +
    field("Detection score threshold", "threshold", s.threshold, 40, 99) +
    field("Notification score threshold", "notify", s.notify, 40, 99) +
    '<label>Alert selection<select id="alertPreset"><option value="">Custom threshold</option><option value="40">All qualifying highlights</option><option value="75">High confidence · score 75+</option><option value="90">Exceptional · score 90+</option></select></label>' +
    field("Merge window (seconds)", "cooldown", s.cooldown, 5, 120) +
    field("Activity retention (days)", "retention", s.retention, 1, 90) +
    "</div>" +
    check("Run simulated channels", "demoRunning", s.demoRunning) +
    check(
      "Include simulated candidates in alerts",
      "demoAlerts",
      s.demoAlerts,
    ) +
    check("Browser notifications while a dashboard tab is open", "desktop", s.desktop) +
    '<p class="sub">Browser permission · ' + esc(window.Notification?.permission || "unsupported") +
    '. An open tab is required. Discord can notify you while the browser is closed.</p>' +
    '<button type="button" id="testBrowser">Test browser notification</button>' +
    check("Discord webhook alerts", "discord", s.discord) +
    check(
      "Send a follow-up when an automatic clip is verified",
      "followup",
      s.followup,
    ) +
    '<p class="sub">Discord webhook · ' + (state.diagnostics.discordConfigured ? "configured" : "not configured") +
    '. Set DISCORD_WEBHOOK_URL in .env and restart to change the destination.</p>' +
    '<button type="button" id="testDiscord">Test Discord notification</button>' +
    state.notificationChecks.map(r => '<p>' + date(r.time) + ' · ' + esc(r.result) + '</p>').join('') +
    '<button class="primary">Save preferences</button></form><article><h3>Recent alerts</h3>' +
    '<p class="sub">Broadcast means sent to connected tabs. Windows display is unconfirmed.</p>' +
    (state.alerts.map(a => '<p><a href="#event-' + a.event + '">' + esc(a.name) +
      '</a> · ' + date(a.time) + ' · ' + esc(a.method) + ' · ' + esc(a.result) + '</p>').join('') ||
      '<p>No alerts in this workspace yet.</p>') +
    '</article><article><h3>Recent connection errors</h3>' +
    state.errors
      .map((e) => "<p>" + date(e.time) + " · " + esc(e.detail) + "</p>")
      .join("") +
    (state.errors.length ? "" : "No recorded errors.") +
    "</article>"
  );
}
function link(url, label) {
  try {
    if (new URL(url).protocol === "https:")
      return (
        '<a target="_blank" rel="noreferrer" href="' +
        esc(url) +
        '">' +
        esc(label) +
        " ↗</a>"
      );
  } catch {}
  return "";
}
function detail(e) {
  const d = e.evidence;
  const bestClip = e.clips.find(c => c.source === "Native" || c.match?.confidence === "High-confidence match");
  return (
    '<div class="row"><a href="#queue">← Review queue</a><div>' +
    queueIds
      .filter(
        (id, index) =>
          Math.abs(index - queueIds.indexOf(e.id)) === 1 &&
          queueIds.includes(e.id),
      )
      .map(
        (id) =>
          '<a href="#event-' +
          id +
          '">' +
          (queueIds.indexOf(id) < queueIds.indexOf(e.id)
            ? "Previous"
            : "Next") +
          "</a>",
      )
      .join(" · ") +
    "</div></div><h2>" +
    esc(d.category) +
    " · " +
    esc(e.name) +
    '</h2><article><div class="row"><span class="score">' +
    d.score +
    " / 99 · heuristic evidence</span>" +
    tag(e.kind + " · " + e.decision) +
    "</div>" +
    (bestClip
      ? link(bestClip.url, "Watch matched clip")
      : e.archive
        ? link(e.archive.url, "Watch estimated moment in VOD")
        : "") +
    "<h2>" +
    esc(d.reason) +
    "</h2><p>Detected " +
    date(e.time) +
    " · " +
    d.users +
    ' unique chatters</p><p class="sub">5s / 15s / 30s message counts · ' +
    [d.n, d.fifteen, d.thirty].join(" / ") +
    "<br>Estimated video window · " +
    date(d.start) +
    " – " +
    date(d.end) +
    "</p>" +
    (d.receivedAt
      ? '<p class="sub">First reaction ' +
        date(d.reactionTime) +
        " · Last receipt " +
        date(d.receivedAt) +
        " · Dominant phrase " +
        Math.round(100 * d.concentration) +
        "% · Baseline warm-up " +
        Math.round(100 * d.baselineConfidence) +
        "% · Threshold " +
        d.threshold +
        "</p>"
      : "") +
    '<p class="sub">' +
    esc(d.timingNote || "Window estimated from chat timing.") +
    (e.requested ? " · Capture requested " + date(e.requested) : "") +
    (e.available ? " · Available " + date(e.available) : "") +
    "</p>" +
    (e.kind === "Twitch" && e.streamId
      ? '<button type="button" data-archive="' +
        e.id +
        '">Check video sources</button> '
      : "") +
    tag(mediaLabel(e)) +
    (e.kind === "Twitch" ? '<p class="sub">Source check ' +
      (e.sourceChecked ? date(e.sourceChecked) : "pending") +
      " · " + (e.nextSourceCheck == null ? "Automatic checks finished" : "Next check " + date(e.nextSourceCheck || Date.now())) +
      (e.sourceError ? " · " + esc(e.sourceError) : "") + "</p>" : "") +
    " " +
    esc(e.error) +
    (e.kind === "Twitch"
      ? " " + link("https://www.twitch.tv/" + e.name, "Source stream")
      : "") +
    '<p class="sub">' +
    (e.archive
      ? link(e.archive.url, "Open matched archive at " + e.archive.start + "s")
      : e.clips.some((c) => c.video && c.offset != null)
        ? "VOD timing available on associated clip."
        : "No verified archive offset. The archive may be processing, private, expired, or unavailable.") +
    "</p>" +
    e.clips
      .map(
        (c) =>
          "<p>" +
          link(c.url, c.title) +
          " · " +
          esc(c.source) +
          " · " + esc(c.match?.confidence || (c.source === "Native" ? "Verified clip" : "Approximate match")) +
          " · " + esc(c.match?.reason || "Legacy association awaiting a source check") +
          " · " +
          esc(c.coverage) +
          " · " +
          c.views +
          " views " +
          (c.video && c.offset != null
            ? link(
                "https://www.twitch.tv/videos/" +
                  c.video +
                  "?t=" +
                  Math.floor(c.offset) +
                  "s",
                "Open VOD",
              )
            : "") +
          "</p>",
      )
      .join("") +
    (e.local
      ? '<video controls src="/media/' + e.id + '"></video>'
      : e.kind === "Demo"
        ? '<figure><video controls muted playsinline preload="metadata" aria-label="Simulated arcade rally" src="/demo-rally.mp4"></video><figcaption class="sub">Demo footage · sample arcade rally shared by simulated candidates.</figcaption></figure>'
        : "") +
    '</article><form data-action="review" data-id="' +
    e.id +
    '"><label>Quality rating<select name="rating">' +
    options(["", "Excellent", "Good", "Average", "Bad"], e.rating) +
    '</select></label><label>Review notes<textarea name="note" maxlength="4000">' +
    esc(e.note) +
    '</textarea></label><div class="toolbar">' +
    ["Approved", "Rejected", "Saved", "Reviewed", "Pending"]
      .map(
        (d, i) =>
          "<button " +
          (!i ? 'class="primary"' : "") +
          ' name="decision" value="' +
          d +
          '">' +
          ["Approve", "Reject", "Save for later", "Mark reviewed", "Reopen"][
            i
          ] +
          "</button>",
      )
      .join("") +
    "</div></form>" +
    (e.mode === "local"
      ? '<form data-action="local" data-id="' +
        e.id +
        '"><label>File in your StreamPulse media folder<input required name="name" placeholder="segment.mp4"></label>' +
        check("I have permission to use this recording", "authorized", false) +
        "<button>Attach recording</button></form>"
      : "") +
    (e.kind === "Twitch"
      ? '<details><summary>Create a clip from a VOD</summary><form data-action="vod" data-id="' +
        e.id +
        '"><label>Verified source VOD ID<input required name="video" value="' +
        esc(e.archive?.id || "") +
        '"></label>' +
        field(
          "Clip end offset (seconds)",
          "end",
          Math.max(5, e.archive?.end || 30),
          5,
          1000000,
        ) +
        field(
          "Clip duration (seconds)",
          "duration",
          e.archive
            ? Math.min(60, Math.max(5, e.archive.end - e.archive.start))
            : 30,
          5,
          60,
        ) +
        check("Publish this clip on Twitch", "publish", false) +
        "<button>Create VOD clip</button></form></details>"
      : "")
  );
}
let failedRefresh = "";
let forcedRenders = 0;
async function render(force = false) {
  if (!force && forcedRenders) return;
  if (force) forcedRenders++;
  const g = ++generation;
  try {
    const data = await api("state?source=" + encodeURIComponent(source));
    if (g !== generation) return;
    state = data;
    if (failedRefresh && $("#notice").textContent === failedRefresh) notice("");
    failedRefresh = "";
    const page = location.hash.slice(1) || "dashboard",
      event = page.startsWith("event-");
    $("#health").textContent =
      state.kind === "Demo"
        ? "Demo mode · simulated activity"
        : "Twitch · " + state.status + (state.diagnostics.pollingError ? " · " + state.diagnostics.pollingError : "");
    if (
      !force &&
      (dirty ||
        document.querySelector("details[open]") ||
        document.activeElement?.matches("input,select,textarea") ||
        document.querySelector("video"))
    )
      return;
    const selected = event ? "queue" : page;
    document
      .querySelectorAll("nav a")
      .forEach((a) => a.classList.toggle("active", a.hash === "#" + selected));
    const title = event ? "Candidate review" : titles[page] || "Overview";
    $("#crumb").textContent = title;
    const html = event
      ? detail(await api("event/" + Number(page.slice(6))))
      : await (
          {
            channels: watchlist,
            queue,
            settings,
            dashboard: overview,
            activity: () => charts(scopeChannels().filter((c) => c.enabled)),
          }[page] || overview
        )();
    if (g !== generation) return;
    $("#view").innerHTML =
      '<div class="row"><h1>' +
      title +
      "</h1>" +
      scopePicker() +
      "</div>" +
      html;
    draw();
  } catch (e) {
    if (g !== generation) return;
    failedRefresh = "Dashboard update failed · " + e.message;
    $("#health").textContent = "Monitoring status unavailable";
    notice(failedRefresh);
  } finally {
    if (force) forcedRenders--;
  }
}
document.addEventListener("input", (e) => {
  if (e.target.closest("form")) dirty = true;
});
document.addEventListener("change", (e) => {
  if (e.target.id === "alertPreset") {
    if (e.target.value) document.querySelector('[name="notify"]').value = e.target.value;
    dirty = true;
    return;
  }
  if (e.target.id === "source") {
    source = e.target.value;
    localStorage.setItem("pulse-source", source);
    Object.assign(filters, { channel: "0", category: "", media: "", min: "0" });
    dirty = false;
    if (location.hash.startsWith("#event-")) location.hash = "queue";
  } else if (e.target.dataset.filter)
    filters[e.target.dataset.filter] = e.target.value;
  else if (e.target.id === "filter") filter = e.target.value;
  else if (e.target.id === "sort") sort = e.target.value;
  else return;
  queueOffset = 0;
  render(true);
});
document.addEventListener("click", async (e) => {
  if (e.target.id === "testDiscord") {
    try {
      notice((await api("testNotification", { destination: "discord" })).message);
    } catch (error) {
      notice(error.message);
    }
    await render();
    return;
  }
  if (e.target.id === "testBrowser") {
    try {
      if (!window.Notification) throw Error("This browser does not support notifications");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw Error("Browser permission is " + permission + ". Enable notifications in this site's browser settings.");
      const notification = new Notification("StreamPulse test notification", {
        body: "Browser notifications require an open dashboard tab.",
        tag: "pulse-test",
      });
      notification.onclick = () => { window.focus(); location.hash = "queue"; };
      notification.onerror = () => notice("The browser could not display the notification. Check Windows and browser notification settings.");
      notification.onshow = () => notice("Browser reported that the test notification was displayed.");
      notice("Browser accepted the test notification. Check your Windows notification area.");
    } catch (error) {
      notice(error.message);
    }
    return;
  }
  if (e.target.dataset.archive) {
    try {
      const result = await api("findArchive", {
        id: Number(e.target.dataset.archive),
      });
      notice(result.message);
      await render(true);
    } catch (err) {
      notice(err.message);
    }
    return;
  }
  if (e.target.id === "resetPrefs") {
    try {
      await api("resetPreferences", {});
      notice("Ranking preferences reset. Reviews and ratings retained.");
    } catch (err) {
      notice(err.message);
    }
    return;
  }
  if (e.target.id === "earlier" || e.target.id === "later") {
    queueOffset = Math.max(
      0,
      queueOffset + (e.target.id === "later" ? 50 : -50),
    );
    render(true);
    return;
  }
  if (e.target.dataset.login) {
    document.querySelector("[name=name]").value = e.target.dataset.login;
    document.querySelector("[name=kind]").value = "Twitch";
    dirty = true;
    return;
  }
  if (e.target.id === "search") {
    try {
      const rows = await api("search", {
        query: document.querySelector("[name=name]").value,
      });
      dirty = true;
      $("#matches").innerHTML =
        rows
          .map(
            (c) =>
              '<button type="button" data-login="' +
              esc(c.login) +
              '">' +
              esc(c.login) +
              (c.live ? " · Live" : "") +
              "</button>",
          )
          .join(" ") || "No matching channels";
    } catch (err) {
      notice(err.message);
    }
    return;
  }
  if (e.target.id === "authorize") {
    try {
      location.href = (await api("authorize", {})).url;
    } catch (err) {
      notice(err.message);
    }
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target,
    b = Object.fromEntries(new FormData(f));
  for (const el of f.querySelectorAll("[type=checkbox]"))
    b[el.name] = el.checked;
  for (const el of f.querySelectorAll("[type=number]"))
    b[el.name] = Number(el.value);
  if (f.dataset.id) b.id = Number(f.dataset.id);
  if (f.dataset.action === "review") b.decision = e.submitter.value;
  if (f.dataset.action === "channel") {
    b.removed = e.submitter.name === "remove";
    if (
      b.mode === "native" &&
      !b.removed &&
      !confirm(
        "Enable native clipping? Twitch may publish clips before review.",
      )
    )
      return;
  }
  try {
    if (
      b.desktop &&
      (!("Notification" in window) ||
        (await Notification.requestPermission()) !== "granted")
    )
      throw Error("Browser notification permission is required");
    await api(f.dataset.action, b);
    if (f.dataset.action === "add") {
      source = b.kind;
      localStorage.setItem("pulse-source", source);
    }
    dirty = false;
    notice("Saved");
    await render(true);
  } catch (err) {
    notice(err.message);
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    dirty ||
    e.target.closest("input,textarea,select,button") ||
    !location.hash.startsWith("#event-")
  )
    return;
  const i = queueIds.indexOf(Number(location.hash.slice(7)));
  const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (step && i >= 0 && queueIds[i + step]) {
    e.preventDefault();
    location.hash = "event-" + queueIds[i + step];
  }
});
window.addEventListener("hashchange", () => {
  dirty = false;
  notice("");
  render(true);
});
const feed = new EventSource("/feed");
feed.onopen = () => render();
feed.addEventListener("refresh", () => render());
feed.addEventListener("alert", (e) => {
  const a = JSON.parse(e.data);
  notice(a.message);
  const review = document.createElement("a");
  review.href = "#event-" + a.id;
  review.textContent = " Review moment";
  $("#notice").append(review);
  if (a.desktop && window.Notification?.permission === "granted") {
    const n = new Notification("StreamPulse highlight", {
      body: a.message,
      tag: "pulse-" + a.id,
    });
    n.onclick = () => {
      window.focus();
      location.hash = "event-" + a.id;
    };
  }
});
feed.onerror = () => {
  $("#health").textContent = "Dashboard reconnecting…";
};
render(true);
