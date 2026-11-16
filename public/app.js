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
  sort = "Recent",
  dirty = false,
  generation = 0;
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
  if (e.clips.length) return "Viewer clip available";
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
          " · " + esc(mediaLabel(e)) +
          "</div></div>" +
          tag(e.decision) +
          "</a>",
      )
      .join("") || '<p class="sub">No candidates match this view.</p>'
  );
}
function charts(channels) {
  return channels
    .map(
      (c) =>
        '<article class="timeline"><div class="row"><h3>' +
        esc(c.name) +
        "</h3>" +
        tag(c.kind + " · " + (c.live ? "Live" : "Offline")) +
        '</div><canvas data-chart="' +
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
  const c = state.channels;
  return (
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
    charts(c.filter((x) => x.enabled).slice(0, 1)) +
    '<div class="row"><h2>Recent highlights</h2><a href="#queue">Review queue →</a></div>' +
    eventList(state.events.slice(0, 6))
  );
}
function watchlist() {
  return (
    '<form data-action="add"><h3>Add channel</h3><div class="toolbar"><input name="name" required placeholder="Username or Twitch URL" aria-label="Channel"><select name="kind">' +
    options(["Twitch", "Demo"], "Twitch") +
    '</select><button class="primary">Add channel</button><button type="button" id="search">Search Twitch</button></div><div id="matches"></div></form>' +
    state.channels
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
        offset: queueOffset,
      }),
  );
  return (
    '<div class="toolbar"><label>Decision<select id="filter">' +
    options(
      ["All", "Pending", "Approved", "Rejected", "Saved", "Reviewed"],
      filter,
    ) +
    '</select></label><label>Order<select id="sort">' +
    options(["Recent", "Score"], sort) +
    "</select></label></div>" +
    eventList(rows.slice(0, 50)) +
    '<div class="toolbar">' +
    (queueOffset ? '<button id="earlier">Previous page</button>' : "") +
    (rows.length > 50 ? '<button id="later">Next page</button>' : "") +
    "</div>"
  );
}
function settings() {
  const s = state.settings;
  return (
    "<article><h3>Twitch connection</h3><p>" +
    esc(state.status) +
    '</p><p class="sub">' +
    (state.configured
      ? "Authorize the account used to read chat."
      : "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env and restart to connect.") +
    '</p><button id="authorize">Connect Twitch</button></article><form data-action="settings"><h3>Detection and alerts</h3><div class="grid">' +
    field("Detection score threshold", "threshold", s.threshold, 40, 99) +
    field("Notification score threshold", "notify", s.notify, 40, 99) +
    field("Merge window (seconds)", "cooldown", s.cooldown, 5, 120) +
    field("Activity retention (days)", "retention", s.retention, 1, 90) +
    "</div>" +
    check("Desktop alerts while dashboard is open", "desktop", s.desktop) +
    check("Discord webhook alerts", "discord", s.discord) +
    '<p class="sub">Set DISCORD_WEBHOOK_URL in .env and restart to change the destination.</p><button class="primary">Save preferences</button></form><article><h3>Recent connection errors</h3>' +
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
  return (
    '<a href="#queue">← Review queue</a><h2>' +
    esc(d.category) +
    " · " +
    esc(e.name) +
    '</h2><article><div class="row"><span class="score">' +
    d.score +
    " / 99 · heuristic evidence</span>" +
    tag(e.kind + " · " + e.decision) +
    "</div><h2>" +
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
    tag(mediaLabel(e)) +
    " " +
    esc(e.error) +
    (e.kind === "Twitch"
      ? " " + link("https://www.twitch.tv/" + e.name, "Source stream")
      : "") +
    '<p class="sub">' +
    (e.clips.some((c) => c.video && c.offset != null)
      ? "VOD timing available on associated clip."
      : "VOD offset unavailable.") +
    "</p>" +
    e.clips
      .map(
        (c) =>
          "<p>" +
          link(c.url, c.title) +
          " · " +
          esc(c.source) +
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
    (e.local ? '<video controls src="/media/' + e.id + '"></video>'
      : e.kind === "Demo" ? '<figure><video controls muted playsinline preload="metadata" aria-label="Simulated arcade rally" src="/demo-rally.mp4"></video><figcaption class="sub">Demo footage · sample arcade rally shared by simulated candidates.</figcaption></figure>' : "") +
    '</article><form data-action="review" data-id="' +
    e.id +
    '"><label>Review notes<textarea name="note" maxlength="4000">' +
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
        '"><label>Verified source VOD ID<input required name="video"></label>' +
        field("Known clip end offset in seconds", "end", 30, 30, 1000000) +
        check("Publish a 30-second clip on Twitch", "publish", false) +
        "<button>Create VOD clip</button></form></details>"
      : "")
  );
}
async function render(force = false) {
  const g = ++generation;
  try {
    const data = await api("state");
    if (g !== generation) return;
    state = data;
    const page = location.hash.slice(1) || "dashboard",
      event = page.startsWith("event-");
    $("#health").textContent =
      state.status +
      " · " +
      state.channels.filter((c) => c.kind === "Demo" && c.enabled).length +
      " demo channels";
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
            activity: () => charts(state.channels.filter((c) => c.enabled)),
          }[page] || overview
        )();
    if (g !== generation) return;
    $("#view").innerHTML = "<h1>" + title + "</h1>" + html;
    draw();
  } catch (e) {
    notice(e.message);
  }
}
document.addEventListener("input", (e) => {
  if (e.target.closest("form")) dirty = true;
});
document.addEventListener("change", (e) => {
  if (e.target.id === "filter") filter = e.target.value;
  else if (e.target.id === "sort") sort = e.target.value;
  else return;
  queueOffset = 0;
  render(true);
});
document.addEventListener("click", async (e) => {
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
    dirty = false;
    notice("Saved");
    await render(true);
  } catch (err) {
    notice(err.message);
  }
});
window.addEventListener("hashchange", () => {
  dirty = false;
  notice("");
  render(true);
});
const feed = new EventSource("/feed");
feed.addEventListener("refresh", () => render());
feed.addEventListener("alert", (e) => {
  const a = JSON.parse(e.data);
  if (window.Notification?.permission === "granted") {
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
