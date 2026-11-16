import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  existsSync,
  createReadStream,
  statSync,
} from "node:fs";
import { join, basename, extname } from "node:path";
import { Detector } from "./detector.js";
import { fixtures, frame } from "./replay.js";
import { Twitch } from "./twitch.js";
import { discord } from "./notifications.js";
const dir =
  process.env.STREAMPULSE_DATA ||
  join(process.env.LOCALAPPDATA || ".", "StreamPulse");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(join(dir, "pulse.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
CREATE TABLE IF NOT EXISTS channels(id INTEGER PRIMARY KEY, name TEXT, kind TEXT, remote TEXT, enabled INTEGER DEFAULT 1, live INTEGER DEFAULT 0, health TEXT DEFAULT '', threshold INTEGER DEFAULT 0, offset INTEGER DEFAULT 6, mode TEXT DEFAULT 'bookmark', base REAL DEFAULT 0, removed INTEGER DEFAULT 0, UNIQUE(name,kind));
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,channel INTEGER,started INTEGER,ended INTEGER);
CREATE TABLE IF NOT EXISTS activity(channel INTEGER,time INTEGER,n INTEGER,base REAL,spike INTEGER);
CREATE INDEX IF NOT EXISTS activity_time ON activity(time);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,channel INTEGER,time INTEGER,last INTEGER,evidence TEXT,decision TEXT DEFAULT 'Pending',note TEXT DEFAULT '',media TEXT DEFAULT 'Bookmark',error TEXT DEFAULT '',pending TEXT,local TEXT);
CREATE INDEX IF NOT EXISTS events_channel ON events(channel,last);
CREATE TABLE IF NOT EXISTS clips(event INTEGER,id TEXT,data TEXT,source TEXT,PRIMARY KEY(event,id));
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY,event INTEGER,time INTEGER,decision TEXT,note TEXT);
CREATE TABLE IF NOT EXISTS alerts(event INTEGER,method TEXT,result TEXT,PRIMARY KEY(event,method));
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,data TEXT);
CREATE TABLE IF NOT EXISTS errors(time INTEGER,detail TEXT);`);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const defaults = {
  desktop: false,
  discord: false,
  notify: 75,
  threshold: 70,
  retention: 14,
  cooldown: 20,
};
let settings = {
  ...defaults,
  ...JSON.parse(one("select data from settings")?.data || "{}"),
};
const enabled = () =>
  all("select * from channels where enabled=1 and removed=0");
const eventRow = (id) =>
  one(
    "select e.*,c.name,c.kind,c.remote,c.mode from events e join channels c on c.id=e.channel where e.id=?",
    id,
  );
const detectors = new Map(),
  counters = new Map(),
  clients = new Set();
const log = (msg) => {
  run("insert into errors values(?,?)", Date.now(), msg);
  console.error(msg);
};
const send = (type, value) => {
  for (const c of clients)
    c.write("event: " + type + "\ndata: " + JSON.stringify(value) + "\n\n");
};
const alertText = (c, e) =>
  c.name +
  " · " +
  new Date(e.now).toISOString() +
  " · score " +
  e.score +
  " · " +
  e.category +
  " · " +
  e.reason;
const port = Number(process.env.PORT || 8765);
async function notify(c, e, id) {
  if (e.score < settings.notify) return;
  const url = "http://localhost:" + port + "/#event-" + id;
  const clip = one("select data from clips where event=? and source='Native' limit 1", id);
  const message = c.kind + " · " + alertText(c, e) + (clip ? "\n"+JSON.parse(clip.data).url : "");
  if (settings.desktop) {
    send("alert", { message, url, id });
    run(
      "insert or ignore into alerts values(?,?,?)",
      id,
      "browser",
      "broadcast",
    );
  }
  if (settings.discord) {
    let result = "Delivered";
    try {
      await discord(process.env.DISCORD_WEBHOOK_URL, message + "\n" + url);
    } catch (err) {
      result = err.message;
      log(result);
    }
    run("insert or ignore into alerts values(?,?,?)", id, "discord", result);
  }
}
function detector(c) {
  if (!detectors.has(c.id)) detectors.set(c.id, new Detector(c.base));
  return detectors.get(c.id);
}
function setLive(id, live, now = Date.now()) {
  const c = one("select live from channels where id=?", id);
  if (!c || Boolean(c.live) === live) return;
  run("update channels set live=? where id=?", +live, id);
  if (live) run("insert into sessions(channel,started) values(?,?)", id, now);
  else {
    run(
      "update sessions set ended=? where channel=? and ended is null",
      now,
      id,
    );
    detectors.delete(id);
  }
}
const twitch = new Twitch(dir, {
  list: () => enabled().filter((c) => c.kind === "Twitch"),
  health: (id, h) => run("update channels set health=? where id=?", h, id),
  error: log,
  gap: () => {
    for (const c of enabled().filter((c) => c.kind === "Twitch")) {
      detectors.delete(c.id);
      run(
        "update channels set health='Awaiting subscription' where id=?",
        c.id,
      );
    }
  },
  message: (id, m) => {
    const c = one("select * from channels where id=?", id);
    if (c?.live && c.enabled && !c.removed) detector(c).add(m, Date.now());
  },
});
twitch.hooks.raid = (id) => {
  const c = one("select * from channels where id=?", id);
  if (c) detector(c).suppressUntil = Date.now() + 90000;
};
function storeClip(id, clip, source) {
  run(
    "insert or replace into clips values(?,?,?,?)",
    id,
    clip.id,
    JSON.stringify({
      id: clip.id,
      url: clip.url,
      title: clip.title,
      views: clip.view_count,
      created: clip.created_at,
      video: clip.video_id,
      offset: clip.vod_offset ?? null,
      duration: clip.duration,
    }),
    source,
  );
}
async function capture(c, id, vod) {
  run("update events set media='Pending clip',error='' where id=?", id);
  try {
    const clip = await twitch.clip(c, vod, (p) =>
      run("update events set pending=? where id=?", p, id),
    );
    storeClip(id, clip, "Native");
    run("update events set media='Completed clip' where id=?", id);
  } catch (e) {
    run(
      "update events set media='Capture error',error=? where id=?",
      e.message,
      id,
    );
  }
}
function sample(c, t, i, historical = false) {
  const d = detector(c);
  if (c.kind === "Demo")
    for (const m of frame(
      fixtures.find((p) => p.name === c.name) || fixtures[1],
      i,
      t,
    ))
      d.add(m, t);
  const bias = one(
    "select coalesce(avg(case decision when 'Approved' then 1.0 when 'Rejected' then -1.0 end),0)*5 as n from events where channel=?",
    c.id,
  ).n;
  const e = d.sample(t, {
    threshold: c.threshold || settings.threshold,
    offset: c.offset,
    bias,
  });
  run(
    "insert into activity values(?,?,?,?,?)",
    c.id,
    t,
    e.n,
    e.baseline,
    +e.active,
  );
  run("update channels set base=? where id=?", d.base, c.id);
  if (!e.active) return;
  const prev = one(
    "select * from events where channel=? order by last desc limit 1",
    c.id,
  );
  if (prev && t - prev.last <= settings.cooldown * 1000) {
    const old = JSON.parse(prev.evidence);
    const best = e.score > old.score ? e : old;
    run(
      "update events set last=?,evidence=? where id=?",
      t,
      JSON.stringify({
        ...best,
        start: old.start,
        end: Math.max(old.end, e.end),
      }),
      prev.id,
    );
    return;
  }
  const id = Number(
    run(
      "insert into events(channel,time,last,evidence) values(?,?,?,?)",
      c.id,
      t,
      t,
      JSON.stringify(e),
    ).lastInsertRowid,
  );
  if (!historical) {
    const ready = c.kind === "Twitch" && c.mode === "native" ? capture(c, id) : Promise.resolve();
    ready.then(() => notify(c, e, id)).catch(err => log(err.message));
  }
}
async function remotePoll() {
  await twitch.validate();
  const channels = enabled().filter((c) => c.kind === "Twitch");
  for (let i = 0; i < channels.length; i += 100) {
    const batch = channels.slice(i, i + 100);
    const live = await twitch.api("streams", [
      ["first", "100"],
      ...batch.map((c) => ["user_id", c.remote]),
    ]);
    for (const c of batch)
      setLive(
        c.id,
        live.some((s) => s.user_id === c.remote),
      );
  }
  for (const c of channels) {
    const recent = all(
      "select * from events where channel=? and time>?",
      c.id,
      Date.now() - 900000,
    );
    if (!recent.length) continue;
    const clips = await twitch.api("clips", {
      broadcaster_id: c.remote,
      started_at: new Date(Date.now() - 1200000).toISOString(),
      ended_at: new Date().toISOString(),
      first: 100,
    });
    const videoIds = [
      ...new Set(
        clips
          .filter((clip) => clip.video_id && clip.vod_offset != null)
          .map((clip) => clip.video_id),
      ),
    ];
    const videos = videoIds.length
      ? await twitch.api(
          "videos",
          videoIds.map((id) => ["id", id]),
        )
      : [];
    for (const clip of clips) {
      if (one("select id from clips where id=? and source='Native'", clip.id))
        continue;
      const video = videos.find((v) => v.id === clip.video_id);
      const aligned = video && clip.vod_offset != null;
      const t = aligned
        ? Date.parse(video.created_at) +
          (clip.vod_offset + clip.duration / 2) * 1000
        : Date.parse(clip.created_at);
      const distance = (e) => {
        const ev = JSON.parse(e.evidence);
        return Math.abs((aligned ? (ev.start + ev.end) / 2 : e.time) - t);
      };
      const nearest = recent
        .filter((e) => distance(e) <= (aligned ? 30000 : 90000))
        .sort((a, b) => distance(a) - distance(b))[0];
      if (nearest) {
        run("delete from clips where id=? and event!=?", clip.id, nearest.id);
        storeClip(
          nearest.id,
          clip,
          aligned
            ? "Community · VOD window match"
            : "Community · approximate time match",
        );
      }
    }
  }
}
run("update sessions set ended=? where ended is null", Date.now());
run("update channels set live=0,health=''");
run(
  "update events set media='Capture error',error='Processing interrupted by restart' where media='Pending clip'",
);
const fresh = !one("select id from settings");
if (fresh) {
  run("insert into settings values(1,?)", JSON.stringify(settings));
  for (const p of fixtures)
    run("insert into channels(name,kind) values(?,'Demo')", p.name);
}
for (const c of enabled().filter((c) => c.kind === "Demo")) {
  const now = Date.now();
  setLive(c.id, true, fresh ? now - 150000 : now);
  if (fresh)
    for (let i = 0; i < 30; i++) sample(c, now - (30 - i) * 5000, i, true);
  counters.set(c.id, 30);
}
let tick = 0,
  polling = false;
setInterval(() => {
  try {
    for (const c of enabled()) {
      if (c.kind === "Demo") setLive(c.id, true);
      if (c.kind === "Demo" || (c.live && c.health === "Subscribed")) {
        const i = counters.get(c.id) || 0;
        sample(c, Date.now(), i);
        counters.set(c.id, i + 1);
      }
    }
    if (twitch.token && !polling && tick % 6 === 0) {
      polling = true;
      remotePoll()
        .catch((e) => log(e.message))
        .finally(() => (polling = false));
    }
    if (tick++ % 60 === 0) {
      const cutoff = Date.now() - settings.retention * 86400000;
      run("delete from activity where time<?", cutoff);
      run("delete from errors where time<?", cutoff);
    }
    send("refresh", Date.now());
  } catch (e) {
    console.error("Monitor tick failed", e.message);
  }
}, 5000);
twitch.init().catch((e) => log(e.message));
const integer = (v, min, max) => {
  if (!Number.isInteger(v) || v < min || v > max)
    throw Error("Value must be between " + min + " and " + max);
  return v;
};
const choices = (v, a) => {
  if (!a.includes(v)) throw Error("Invalid selection");
  return v;
};
function detail(id) {
  const row = eventRow(id);
  if (!row) throw Error("Unknown candidate");
  return {
    ...row,
    evidence: JSON.parse(row.evidence),
    clips: all("select * from clips where event=?", id).map((x) => ({
      ...JSON.parse(x.data),
      source: x.source,
    })),
  };
}
function state() {
  return {
    channels: all("select * from channels where removed=0"),
    events: all("select id from events order by time desc limit 250").map((e) =>
      detail(e.id),
    ),
    counts: one(
      "select count(*) total,sum(decision='Pending') pending,sum(json_extract(evidence,'$.score')>=85) strong from events",
    ),
    activity: all(
      "select * from activity where time>? order by time",
      Date.now() - 300000,
    ),
    settings,
    status: twitch.status,
    configured: !!process.env.TWITCH_CLIENT_ID,
    errors: all("select * from errors order by time desc limit 5"),
    alerts: all("select * from alerts order by event desc limit 5"),
  };
}
async function action(path, b) {
  if (path === "authorize") return { url: twitch.authorize() };
  if (path === "search") {
    const query = String(b.query || "").trim();
    if (query.length < 2 || query.length > 60)
      throw Error("Enter 2–60 characters to search");
    const channels = await twitch.api("search/channels", { query, first: 10 });
    return channels.map((c) => ({
      login: c.broadcaster_login,
      live: c.is_live,
    }));
  }
  if (path === "settings") {
    const next = {
      desktop: choices(b.desktop, [true, false]),
      discord: choices(b.discord, [true, false]),
      threshold: integer(b.threshold, 40, 99),
      notify: integer(b.notify, 40, 99),
      retention: integer(b.retention, 1, 90),
      cooldown: integer(b.cooldown, 5, 120),
    };
    run("update settings set data=?", JSON.stringify(next));
    settings = next;
  } else if (path === "add") {
    const name = String(b.name)
      .trim()
      .replace(/^https?:\/\/(?:www\.)?twitch\.tv\//i, "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (!/^[a-z0-9_]{2,25}$/.test(name))
      throw Error("Enter a Twitch login or channel URL");
    const kind = choices(b.kind, ["Demo", "Twitch"]);
    let remote = null;
    if (kind === "Twitch") {
      const [u] = await twitch.api("users", { login: name });
      if (!u) throw Error("Channel not found");
      remote = u.id;
    }
    run(
      "insert into channels(name,kind,remote) values(?,?,?) on conflict(name,kind) do update set removed=0,enabled=1",
      name,
      kind,
      remote,
    );
    if (kind === "Twitch") await twitch.start();
  } else if (path === "channel") {
    const c = one("select * from channels where id=? and removed=0", b.id);
    if (!c) throw Error("Unknown channel");
    const mode = choices(b.mode, ["bookmark", "native", "local"]);
    if (
      mode === "native" &&
      (c.kind !== "Twitch" || !twitch.token?.scope?.includes("clips:edit"))
    )
      throw Error("Connect a Twitch account with clips:edit first");
    run(
      "update channels set threshold=?,offset=?,mode=?,enabled=?,removed=? where id=?",
      integer(b.threshold, 0, 99),
      integer(b.offset, 0, 60),
      mode,
      +choices(b.enabled, [true, false]),
      +choices(b.removed, [true, false]),
      c.id,
    );
    if (!b.enabled || b.removed) setLive(c.id, false);
    if (c.kind === "Twitch" && (!!c.enabled !== b.enabled || b.removed))
      await twitch.start();
  } else if (path === "review") {
    detail(b.id);
    const note = String(b.note || "").slice(0, 4000),
      decision = choices(b.decision, [
        "Approved",
        "Rejected",
        "Saved",
        "Reviewed",
        "Pending",
      ]);
    db.exec("BEGIN");
    try {
      run(
        "update events set decision=?,note=? where id=?",
        decision,
        note,
        b.id,
      );
      run(
        "insert into reviews(event,time,decision,note) values(?,?,?,?)",
        b.id,
        Date.now(),
        decision,
        note,
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } else if (path === "local") {
    const e = detail(b.id);
    if (e.mode !== "local" || !b.authorized)
      throw Error("Choose authorized local capture on this channel");
    const name = String(b.name);
    if (
      basename(name) !== name ||
      !/[.](mp4|webm)$/i.test(name) ||
      !existsSync(join(dir, "media", name))
    )
      throw Error("Place an MP4 or WebM in the media folder first");
    run(
      "update events set local=?,media='Local recording' where id=?",
      name,
      b.id,
    );
  } else if (path === "vod") {
    const e = detail(b.id);
    if (
      e.kind !== "Twitch" ||
      !b.publish ||
      !/^\d+$/.test(b.video) ||
      e.media === "Pending clip"
    )
      throw Error("Check VOD and publication consent");
    integer(b.end, 30, 1000000);
    void capture(e, e.id, { id: b.video, end: b.end });
  } else throw Error("Unknown action");
  return { ok: true };
}
mkdirSync(join(dir, "media"), { recursive: true });
http
  .createServer(async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (
        !["localhost:" + port, "127.0.0.1:" + port].includes(req.headers.host)
      )
        return reply(403, { error: "Local access only" });
      const url = new URL(req.url, "http://localhost:" + port),
        p = url.pathname;
      if (req.method === "POST") {
        if (
          req.headers.origin !== "http://" + req.headers.host ||
          req.headers["content-type"] !== "application/json"
        )
          return reply(403, { error: "Invalid origin" });
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16000) throw Error("Request too large");
        }
        return reply(
          200,
          await action(p.replace("/api/", ""), JSON.parse(body)),
        );
      }
      if (p === "/api/state") return reply(200, state());
      if (p === "/api/queue") {
        const decision = choices(url.searchParams.get("decision") || "All", [
          "All",
          "Approved",
          "Rejected",
          "Pending",
          "Reviewed",
          "Saved",
        ]);
        const order =
          url.searchParams.get("order") === "Score"
            ? "json_extract(evidence,'$.score') desc, time desc"
            : "time desc";
        const offset = integer(
          Number(url.searchParams.get("offset") || 0),
          0,
          100000000,
        );
        return reply(
          200,
          all(
            "select id from events where (?='All' or decision=?) order by " +
              order +
              " limit 51 offset ?",
            decision,
            decision,
            offset,
          ).map((e) => detail(e.id)),
        );
      }
      if (p.startsWith("/api/event/"))
        return reply(200, detail(Number(p.slice(11))));
      if (p === "/oauth/callback") {
        await twitch.finish(
          url.searchParams.get("state"),
          url.searchParams.get("code"),
        );
        res.writeHead(303, { Location: "/#settings" });
        return res.end();
      }
      if (p === "/feed") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        res.write(": ready\n\n");
        clients.add(res);
        res.on("close", () => clients.delete(res));
        return;
      }
      if (p.startsWith("/media/")) {
        const e = detail(Number(p.slice(7)));
        if (!e.local) throw Error("Missing recording");
        const file = join(dir, "media", e.local);
        const size = statSync(file).size;
        res.writeHead(200, {
          "Content-Length": size,
          "Content-Type": extname(file) === ".mp4" ? "video/mp4" : "video/webm",
        });
        createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
        return;
      }
      const files = {
        "/": "index.html",
        "/app.js": "app.js",
        "/style.css": "style.css",
        "/demo-rally.mp4": "demo-rally.mp4",
      };
      if (!Object.hasOwn(files, p))
        return reply(404, { error: "Unknown page" });
      res.writeHead(200, {
        "Content-Type": {
          "/": "text/html; charset=utf-8",
          "/app.js": "text/javascript",
          "/style.css": "text/css",
          "/demo-rally.mp4": "video/mp4",
        }[p],
        "Content-Security-Policy":
          "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'",
      });
      res.end(readFileSync(new URL("./public/" + files[p], import.meta.url)));
    } catch (e) {
      if (!res.headersSent) reply(400, { error: e.message });
      else res.end();
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log("StreamPulse running at http://localhost:" + port),
  );
