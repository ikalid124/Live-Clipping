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
import { archiveWindow, coverage } from "./timing.js";
import { findSources, nextSourceCheck } from "./sources.js";
import { Detector, validateDictionary } from "./detector.js";
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
db.exec("CREATE TABLE IF NOT EXISTS notification_checks(destination TEXT PRIMARY KEY,time INTEGER,result TEXT)");
const run = (sql, ...a) => db.prepare(sql).run(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
// Additive migration. Existing reviews, baselines and configuration retain their IDs.
db.exec("BEGIN");
try {
  for (const [table, fields] of Object.entries({
    channels: {
      profile: "text default 'Variety'",
      dictionary: "text default '{}'",
      lastChat: "integer",
    },
    sessions: { streamId: "text", streamStart: "integer" },
    events: {
      streamId: "text",
      rating: "text default ''",
      learn: "integer default 1",
      archive: "text",
      requested: "integer",
      available: "integer",
      sourceAttempts: "integer default 0",
      nextSourceCheck: "integer default 0",
      sourceChecked: "integer",
      sourceError: "text default ''",
    },
    activity: { rejection: "text" },
  })) {
    const existing = all("pragma table_info(" + table + ")").map((x) => x.name);
    for (const [key, type] of Object.entries(fields))
      if (!existing.includes(key))
        db.exec("alter table " + table + " add column " + key + " " + type);
  }
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
db.exec(`CREATE TEMP VIEW ranked AS
 WITH preferences AS (SELECT channel,json_extract(evidence,'$.category') category,
 sum(case rating when 'Excellent' then 10 when 'Good' then 5 when 'Average' then 0 when 'Bad' then -10 else case decision when 'Approved' then 4 else -4 end end)/(3.0+count(*)) adjustment
 FROM events WHERE learn=1 AND (rating!='' OR decision IN ('Approved','Rejected')) GROUP BY channel,category)
 SELECT e.id,e.channel,c.kind,e.time,e.decision,json_extract(e.evidence,'$.category') category,json_extract(e.evidence,'$.score') score,
 round(coalesce(p.adjustment,0),1) adjustment,
 CASE WHEN e.local IS NOT NULL THEN 'Recording' WHEN EXISTS(SELECT 1 FROM clips WHERE event=e.id AND (source='Native' OR json_extract(data,'$.match.confidence')='High-confidence match')) THEN 'Clip'
 WHEN e.archive IS NOT NULL THEN 'VOD' WHEN e.media='Pending clip' THEN 'Processing' ELSE 'Bookmark' END availability
 FROM events e JOIN channels c ON c.id=e.channel LEFT JOIN preferences p ON p.channel=e.channel AND p.category=json_extract(e.evidence,'$.category')`);
const defaults = {
  desktop: false,
  discord: false,
  notify: 75,
  followup: false,
  demoRunning: true,
  demoAlerts: false,
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
const recentErrors = new Map();
const lastSamples = new Map();
let lastTickError = "";
const log = (msg) => {
  if (Date.now() - (recentErrors.get(msg) || 0) < 60000) return;
  recentErrors.set(msg, Date.now());
  if (recentErrors.size > 100) recentErrors.delete(recentErrors.keys().next().value);
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
  " · " + e.n + " messages/5s · " + Number(e.multiplier).toFixed(1) + "× baseline" +
  " · " +
  e.category +
  " · " +
  e.reason;
const port = Number(process.env.PORT || 8765);
async function notify(c, e, id, phase = "initial") {
  if (c.kind === "Demo" && !settings.demoAlerts) return;
  if (phase === "clip" && !settings.followup) return;
  if (e.score < settings.notify) return;
  const method = (name) => (phase === "initial" ? name : name + "-clip");
  const reserve = (name) =>
    run(
      "insert or ignore into alerts values(?,?,?)",
      id,
      method(name),
      "Sending",
    ).changes === 1;
  const url = "http://localhost:" + port + "/#event-" + id;
  const clip = one(
    "select data from clips where event=? and source='Native' limit 1",
    id,
  );
  const message =
    c.kind +
    " · " +
    alertText(c, e) +
    (clip ? "\n" + JSON.parse(clip.data).url : "");
  if (reserve("in-app")) {
    send("alert", { message, url, id, desktop: settings.desktop });
    run(
      "insert or replace into alerts values(?,?,?)",
      id,
      method("in-app"),
      clients.size ? "broadcast" : "No dashboard connected",
    );
    if (settings.desktop && reserve("browser"))
      run("update alerts set result='broadcast' where event=? and method=?", id, method("browser"));
  }
  if (settings.discord && reserve("discord")) {
    let result = "Delivered";
    try {
      await discord(process.env.DISCORD_WEBHOOK_URL, message + "\n" + url);
    } catch (err) {
      result = err.message;
      log(result);
    }
    run(
      "insert or replace into alerts values(?,?,?)",
      id,
      method("discord"),
      result,
    );
  }
}
function detector(c) {
  if (!detectors.has(c.id))
    detectors.set(
      c.id,
      new Detector(c.base, c.profile, JSON.parse(c.dictionary)),
    );
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
const lastChat = new Map();
// One second of counts and unique identities per bucket. No message text is retained here.
const chatMetrics = new Map();
function recordChat(id, user, now) {
  const stats = chatMetrics.get(id) || { processed: 0, buckets: new Map() };
  chatMetrics.set(id, stats);
  stats.processed++;
  const second = Math.floor(now / 1000);
  const slot = second % 60;
  if (stats.buckets.get(slot)?.second !== second)
    stats.buckets.set(slot, { second, count: 0, users: new Set() });
  const bucket = stats.buckets.get(slot);
  bucket.count++;
  bucket.users.add(user);
}
function monitoring(c) {
  const stats = chatMetrics.get(c.id);
  const minute = Math.floor(Date.now() / 1000) - 59;
  let messages = 0;
  const users = new Set();
  for (const bucket of stats?.buckets.values() || []) {
    if (bucket.second < minute) continue;
    messages += bucket.count;
    for (const user of bucket.users) users.add(user);
  }
  let status = "Reconnecting";
  if (!twitch.user || /permission|revoked|401|403/i.test(c.health))
    status = "Authorization required";
  else if (lastPollError) status = "Error";
  else if (c.health && !["Subscribed", "Awaiting subscription"].includes(c.health)) status = "Error";
  else if (c.health === "Subscribed" && twitch.session)
    status = !c.live ? "Offline" : messages ? "Connected and receiving chat" : "Connected but no chat received";
  return { status, messages, users: users.size, processed: stats?.processed || 0,
    spike: lastSamples.get(c.id)?.multiplier || 0 };
}
const twitch = new Twitch(dir, {
  list: () => enabled().filter((c) => c.kind === "Twitch"),
  health: (id, h) => run("update channels set health=? where id=?", h, id),
  error: log,
  gap: () => {
    for (const c of enabled().filter((c) => c.kind === "Twitch")) {
      detectors.delete(c.id);
      chatMetrics.get(c.id)?.buckets.clear();
      run(
        "update channels set health='Awaiting subscription' where id=?",
        c.id,
      );
    }
  },
  message: (id, m) => {
    const c = one("select * from channels where id=?", id);
    if (c?.enabled && !c.removed) {
      lastChat.set(id, Date.now());
      if (c.live) {
        const now = Date.now();
        detector(c).add(m, now);
        recordChat(id, m.user, now);
      }
    }
  },
});
twitch.hooks.raid = (id) => {
  const c = one("select * from channels where id=?", id);
  if (c) detector(c).suppressUntil = Date.now() + 90000;
};
function storeClip(id, clip, source, match = null) {
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
      match,
    }),
    source,
  );
}
async function capture(c, id, vod) {
  run(
    "update events set media='Pending clip',requested=?,error='' where id=?",
    Date.now(),
    id,
  );
  try {
    const ev = JSON.parse(eventRow(id).evidence);
    const liveDuration = Math.max(
      5,
      Math.min(60, Math.ceil((Date.now() - ev.start) / 1000) + 5),
    );
    const clip = await twitch.clip(
      c,
      vod,
      (p) => run("update events set pending=? where id=?", p, id),
      liveDuration,
    );
    storeClip(id, clip, "Native");
    run(
      "update events set media='Completed clip',available=? where id=?",
      Date.now(),
      id,
    );
    if (!vod)
      notify(c, JSON.parse(eventRow(id).evidence), id, "clip").catch((err) =>
        log(err.message),
      );
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
  const e = d.sample(t, {
    threshold: c.threshold || settings.threshold,
    offset: c.offset,
  });
  lastSamples.set(c.id, { multiplier: e.multiplier, time: t });
  run(
    "insert into activity(channel,time,n,base,spike,rejection) values(?,?,?,?,?,?)",
    c.id,
    t,
    e.n,
    e.baseline,
    +e.active,
    !e.active && e.multiplier >= 1.7 && e.n > 0
      ? JSON.stringify({
          score: e.score,
          users: e.users,
          spike: e.multiplier,
          reasons: e.rejected,
        })
      : null,
  );
  run("update channels set base=? where id=?", d.base, c.id);
  if (!e.active) return;
  const streamId =
    one(
      "select streamId from sessions where channel=? and ended is null order by id desc limit 1",
      c.id,
    )?.streamId ?? null;
  const prev = one(
    "select * from events where channel=? order by last desc limit 1",
    c.id,
  );
  const recovered =
    prev &&
    t - prev.last >= 15000 &&
    one(
      "select count(*) count from activity where channel=? and time>? and time<? and n<=max(2,base*1.25)",
      c.id,
      prev.last,
      t,
    ).count >= 2;
  if (
    prev &&
    !recovered &&
    prev.streamId === streamId &&
    t - prev.last <= settings.cooldown * 1000
  ) {
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
      "insert into events(channel,time,last,evidence,streamId) values(?,?,?,?,?)",
      c.id,
      t,
      t,
      JSON.stringify(e),
      streamId,
    ).lastInsertRowid,
  );
  if (!historical) {
    notify(c, e, id).catch((err) => log(err.message));
    if (c.kind === "Twitch" && c.mode === "native")
      capture(c, id).catch((err) => log(err.message));
  }
}
async function remotePoll() {
  await twitch.validate();
  if (twitch.session) await twitch.sync();
  const channels = enabled().filter((c) => c.kind === "Twitch");
  for (let i = 0; i < channels.length; i += 100) {
    const batch = channels.slice(i, i + 100);
    const live = await twitch.api("streams", [
      ["first", "100"],
      ...batch.map((c) => ["user_id", c.remote]),
    ]);
    for (const c of batch) {
      const stream = live.find((s) => s.user_id === c.remote);
      const current = one(
        "select streamId from sessions where channel=? and ended is null",
        c.id,
      );
      if (stream && current?.streamId && current.streamId !== stream.id)
        setLive(c.id, false);
      setLive(c.id, !!stream);
      if (stream)
        run(
          "update sessions set streamId=?,streamStart=? where channel=? and ended is null",
          stream.id,
          Date.parse(stream.started_at),
          c.id,
        );
      if (lastChat.has(c.id))
        run(
          "update channels set lastChat=? where id=?",
          lastChat.get(c.id),
          c.id,
        );
    }
  }

}
let resolving = false;
async function resolveSources() {
  if (resolving || !twitch.user) return;
  resolving = true;
  try {
    const due = all("select e.*,c.remote,c.name from events e join channels c on c.id=e.channel where c.kind='Twitch' and e.nextSourceCheck is not null and e.nextSourceCheck<=? order by e.nextSourceCheck,e.id limit 20", Date.now());
    const channelIds = [...new Set(due.map(e => e.channel))].slice(0, 4);
    for (const channel of channelIds) {
      const events = due.filter(e => e.channel === channel).map(e => ({
        ...e, evidence: JSON.parse(e.evidence),
        knownClips: all("select id from clips where event=?", e.id).map(c => c.id),
      }));
      let error = "";
      try {
        const found = await findSources(twitch.api.bind(twitch), events[0], events);
        for (const { event, archive, matches, native } of found) {
          run("update events set archive=? where id=?",
            archive ? JSON.stringify({ ...archive, checked: Date.now() }) : null, event.id);
          run("delete from clips where event=? and source!='Native'", event.id);
          for (const { clip, match } of matches) {
            if (clip.id !== event.pending) storeClip(event.id, clip, "Community", match);
          }
          if (native) {
            storeClip(event.id, native, "Native", { confidence: "Verified clip", reason: "Twitch returned the requested clip ID" });
            run("update events set media='Completed clip',error='',available=coalesce(available,?) where id=?", Date.now(), event.id);
          }
        }
      } catch (e) {
        error = e.message;
        log(events[0].name + " · Source lookup · " + error);
      }
      for (const event of events) {
        run("update events set sourceAttempts=sourceAttempts+1,nextSourceCheck=?,sourceChecked=?,sourceError=? where id=?",
          nextSourceCheck(event, Date.now()), Date.now(), error, event.id);
      }
    }
  } finally {
    resolving = false;
  }
}

const fresh = !one("select id from settings");
if (fresh) {
  run("insert into settings values(1,?)", JSON.stringify(settings));
  for (const p of fixtures)
    run("insert into channels(name,kind) values(?,'Demo')", p.name);
}
for (const c of enabled().filter(
  (c) => c.kind === "Demo" && settings.demoRunning,
)) {
  const now = Date.now();
  setLive(c.id, true, fresh ? now - 150000 : now);
  if (fresh)
    for (let i = 0; i < 30; i++) sample(c, now - (30 - i) * 5000, i, true);
  counters.set(c.id, 30);
}
let tick = 0,
  polling = false,
  lastPollError = "";
async function pollRemote() {
  if (polling || !twitch.token) return;
  polling = true;
  try {
    await remotePoll();
    lastPollError = "";
  } catch (e) {
    lastPollError = e.message;
    log(e.message);
  } finally {
    polling = false;
  }
}
setInterval(() => {
  try {
    lastTickError = "";
    for (const c of enabled()) {
      if (c.kind === "Demo" && !settings.demoRunning) {
        setLive(c.id, false);
        continue;
      }
      if (c.kind === "Demo") setLive(c.id, true);
      if (c.kind === "Demo" || (c.live && c.health === "Subscribed")) {
        const i = counters.get(c.id) || 0;
        sample(c, Date.now(), i);
        counters.set(c.id, i + 1);
      }
    }
    if (twitch.token && !polling && tick % 6 === 0) {
      pollRemote();
    }
    if (tick % 6 === 0) resolveSources().catch(e => log("Source lookup · " + e.message));
    if (tick++ % 60 === 0) {
      const cutoff = Date.now() - settings.retention * 86400000;
      run("delete from activity where time<?", cutoff);
      run("delete from errors where time<?", cutoff);
    }
    send("refresh", Date.now());
  } catch (e) {
    lastTickError = e.message;
    log("Monitor tick failed · " + e.message);
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
    archive: row.archive ? JSON.parse(row.archive) : null,
    evidence: JSON.parse(row.evidence),
    clips: all(
      "select * from clips where event=? order by (source='Native') desc",
      id,
    ).map((x) => ({
      ...JSON.parse(x.data),
      source: x.source,
      coverage: coverage(
        row.archive ? JSON.parse(row.archive) : null,
        JSON.parse(x.data),
      ),
    })).sort((a, b) => Number(b.source === "Native") - Number(a.source === "Native") ||
      (b.match?.overlap || 0) - (a.match?.overlap || 0)),
  };
}
function state(source) {
  const kind =
    source ||
    (one("select id from channels where kind='Twitch' and removed=0")
      ? "Twitch"
      : "Demo");
  return {
    kind,
    categories: all(
      "select distinct json_extract(evidence,'$.category') category from events join channels on channels.id=events.channel where kind=? order by category",
      kind,
    ).map((r) => r.category),
    diagnostics: {
      authenticated: !!twitch.user,
      validatedAt: twitch.checked || null,
      scopes: twitch.scopes || [],
      subscriptions: twitch.subscriptions.size,
      websocket: !!twitch.session,
      pollingError: lastPollError,
      discordConfigured: !!process.env.DISCORD_WEBHOOK_URL,
      uptime: Math.round(process.uptime()),
      memoryMiB: Math.round(process.memoryUsage().rss / 1048576),
      databaseMiB: Math.round(statSync(join(dir, "pulse.sqlite")).size / 1048576 * 10) / 10,
      monitorError: lastTickError,
      lastApi: twitch.lastApi ?? null,
      reconnects: twitch.attempts || 0,
    },
    rejected: all(
      "select a.time,c.name,c.kind,a.rejection from activity a join channels c on c.id=a.channel where rejection is not null and c.kind=? order by time desc limit 20",
      kind,
    ).map((x) => ({ ...x, ...JSON.parse(x.rejection) })),
    channels: all("select c.*, (select count(*) from events e where e.channel=c.id) highlights from channels c where removed=0").map((c) => ({
      ...c,
      monitoring: c.kind === "Twitch" ? monitoring(c) : null,
      lastChat: lastChat.get(c.id) || c.lastChat,
    })),
    events: all(
      "select e.id from events e join channels c on e.channel=c.id where c.kind=? order by time desc limit 12",
      kind,
    ).map((e) => detail(e.id)),
    counts: one(
      "select count(*) total,sum(decision='Pending') pending,sum(json_extract(evidence,'$.score')>=85) strong from events join channels on channels.id=events.channel where kind=?",
      kind,
    ),
    activity: all(
      "select a.* from activity a join channels c on a.channel=c.id where time>? and c.kind=? order by time",
      Date.now() - 300000,
      kind,
    ),
    settings,
    status: twitch.status,
    configured: !!twitch.credentials,
    canConfigureClient: !twitch.token && !existsSync(twitch.file) &&
      !(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
    errors: all("select * from errors order by time desc limit 5"),
    alerts: all("select a.*,c.name,e.time from alerts a join events e on e.id=a.event join channels c on c.id=e.channel where c.kind=? order by e.time desc limit 12", kind),
    notificationChecks: all("select * from notification_checks"),
    evaluation: all("select c.name,e.rating,count(*) count,round(avg(json_extract(e.evidence,'$.score')),1) score from events e join channels c on c.id=e.channel where c.kind=? and e.rating!='' group by c.id,e.rating", kind),
  };
}
async function action(path, b) {
  if (path === "testNotification") {
    if (b.destination !== "discord") throw Error("Unknown notification destination");
    let result = "Discord accepted the test notification";
    try {
      await discord(process.env.DISCORD_WEBHOOK_URL,
        "StreamPulse test notification · " + new Date().toISOString() +
        "\nMonitoring review desk http://localhost:" + port + "/?source=Twitch#queue");
    } catch (e) {
      result = e.message;
      throw e;
    } finally {
      run("insert or replace into notification_checks values(?,?,?)", "discord", Date.now(), result);
    }
    return { message: result };
  }
  if (path === "configureTwitch") {
    twitch.configure(b.clientId, b.clientSecret);
    return { ok: true };
  }
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
  if (path === "resetPreferences") {
    run("update events set learn=0");
    return { ok: true };
  }
  if (path === "settings") {
    const next = {
      desktop: choices(b.desktop, [true, false]),
      discord: choices(b.discord, [true, false]),
      demoRunning: choices(b.demoRunning ?? settings.demoRunning, [
        true,
        false,
      ]),
      demoAlerts: choices(b.demoAlerts ?? settings.demoAlerts, [true, false]),
      followup: choices(b.followup ?? settings.followup, [true, false]),
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
    if (kind === "Twitch") {
      await twitch.updateWatchlist();
      await pollRemote();
    }
  } else if (path === "channel") {
    const c = one("select * from channels where id=? and removed=0", b.id);
    if (!c) throw Error("Unknown channel");
    const profile = choices(b.profile ?? c.profile, ["Variety", "GTA RP"]);
    const dictionary = JSON.stringify(
      validateDictionary(JSON.parse(b.dictionary ?? c.dictionary)),
    );
    const mode = choices(b.mode, ["bookmark", "native", "local"]);
    if (
      mode === "native" &&
      (c.kind !== "Twitch" || !twitch.token?.scope?.includes("clips:edit"))
    )
      throw Error("Connect a Twitch account with clips:edit first");
    run(
      "update channels set threshold=?,offset=?,mode=?,enabled=?,removed=?,profile=?,dictionary=? where id=?",
      integer(b.threshold, 0, 99),
      integer(b.offset, 0, 60),
      mode,
      +choices(b.enabled, [true, false]),
      +choices(b.removed, [true, false]),
      profile,
      dictionary,
      c.id,
    );
    if (c.profile !== profile || c.dictionary !== dictionary)
      detectors.delete(c.id);
    if (!b.enabled || b.removed) setLive(c.id, false);
    if (c.kind === "Twitch" && (!!c.enabled !== b.enabled || b.removed))
      await twitch.updateWatchlist();
  } else if (path === "review") {
    const prior = detail(b.id);
    const rating = choices(b.rating ?? prior.rating, [
      "",
      "Excellent",
      "Good",
      "Average",
      "Bad",
    ]);
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
        "update events set decision=?,note=?,rating=?,learn=1 where id=?",
        decision,
        note,
        rating,
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
  } else if (path === "findArchive") {
    const event = detail(b.id);
    if (event.kind !== "Twitch" || !event.streamId)
      throw Error("Original Twitch stream identity unavailable");
    const videos = await twitch.api("videos", {
      user_id: event.remote,
      type: "archive",
      first: 100,
    });
    const window = archiveWindow(
      event.streamId,
      event.remote,
      event.evidence,
      videos.find((v) => v.stream_id === event.streamId),
    );
    run(
      "update events set archive=?,sourceAttempts=0,nextSourceCheck=0 where id=?",
      window ? JSON.stringify({ ...window, checked: Date.now() }) : null,
      b.id,
    );
    return {
      message: window
        ? "Matched the source archive"
        : "No accessible archive currently covers this window",
    };
  } else if (path === "vod") {
    const e = detail(b.id);
    if (
      e.kind !== "Twitch" ||
      !b.publish ||
      !/^\d+$/.test(b.video) ||
      e.media === "Pending clip"
    )
      throw Error("Check VOD and publication consent");
    const duration = integer(b.duration ?? 30, 5, 60);
    integer(b.end, duration, 1000000);
    void capture(e, e.id, { id: b.video, end: b.end, duration });
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
      if (p === "/api/state")
        return reply(200, state(url.searchParams.get("source")));
      if (p === "/api/queue") {
        const decision = choices(url.searchParams.get("decision") || "All", [
          "All",
          "Approved",
          "Rejected",
          "Pending",
          "Reviewed",
          "Saved",
        ]);
        const ordering = url.searchParams.get("order");
        const order =
          ordering === "Recent"
            ? "time desc"
            : ordering === "Score"
              ? "score desc,time desc"
              : "score+adjustment desc,time desc";
        const source = url.searchParams.get("source") || "Demo",
          channel = Number(url.searchParams.get("channel") || 0),
          category = url.searchParams.get("category") || "",
          media = url.searchParams.get("media") || "",
          min = integer(Number(url.searchParams.get("min") || 0), 0, 99);
        const offset = integer(
          Number(url.searchParams.get("offset") || 0),
          0,
          100000000,
        );
        return reply(
          200,
          all(
            "select id,adjustment from ranked where kind=? and (?='All' or decision=?) and (?=0 or channel=?) and (?='' or category=?) and score>=? and (?='' or availability=?) order by " +
              order +
              ",id desc limit 51 offset ?",
            source,
            decision,
            decision,
            channel,
            channel,
            category,
            category,
            min,
            media,
            media,
            offset,
          ).map((e) => ({ ...detail(e.id), adjustment: e.adjustment })),
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
