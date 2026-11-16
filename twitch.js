import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const callback = "http://localhost:8765/oauth/callback";
function protect(value, decrypt = false) {
  const script = decrypt
    ? "$cipher=[Convert]::FromBase64String([Console]::In.ReadToEnd());[Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,'CurrentUser')))"
    : "$bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());[Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,'CurrentUser')))";
  const p = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;"+script],
    { input: value, encoding: "utf8", windowsHide: true },
  );
  if (p.status !== 0 || !p.stdout) throw Error("Windows token vault unavailable");
  return p.stdout;
}
export class Twitch {
  constructor(dir, hooks) {
    this.file = dir + "/account.dpapi";
    this.hooks = hooks;
    this.status = "Disconnected";
    this.channels = new Map();
    this.retry = 1000;
    this.checked = 0;
    this.seen = new Map();
  }
  async init() {
    if (existsSync(this.file)) {
      this.token = JSON.parse(protect(readFileSync(this.file, "utf8"), true));
      await this.start();
    }
  }
  authorize() {
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET)
      throw Error(
        "Configure Twitch client ID and secret in .env, then restart",
      );
    this.state = randomBytes(32).toString("hex");
    this.until = Date.now() + 600000;
    return (
      "https://id.twitch.tv/oauth2/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: process.env.TWITCH_CLIENT_ID,
        redirect_uri: callback,
        state: this.state,
        scope: ["user:read:chat", process.env.TWITCH_CLIP_SCOPE]
          .filter(Boolean)
          .join(" "),
      })
    );
  }
  async exchange(params) {
    const r = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      body: new URLSearchParams({
        ...params,
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
      }),
    });
    if (!r.ok)
      throw Error(
        "Twitch token exchange failed (" +
          r.status +
          "). Reconnect in Settings.",
      );
    const t = await r.json();
    writeFileSync(this.file + ".tmp", protect(JSON.stringify(t)));
    renameSync(this.file + ".tmp", this.file);
    this.token = t;
  }
  async finish(state, code) {
    if (
      !this.state ||
      Date.now() > this.until ||
      !/^[0-9a-f]{64}$/.test(state) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(this.state))
    )
      throw Error("Expired or invalid OAuth state");
    this.state = null;
    await this.exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: callback,
    });
    this.checked = 0;
    this.reset();
    await this.start();
  }
  async refresh() {
    this.refreshing ??= this.exchange({
      grant_type: "refresh_token",
      refresh_token: this.token.refresh_token,
    }).finally(() => (this.refreshing = null));
    await this.refreshing;
  }
  async validate() {
    if (Date.now() - this.checked < 3600000) return;
    const check = () =>
      fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: "OAuth " + this.token.access_token },
        signal: AbortSignal.timeout(10000),
      });
    let r = await check();
    if (r.status === 401) {
      await this.refresh();
      r = await check();
    }
    if (!r.ok) throw Error("Twitch validation failed (" + r.status + ")");
    const info = await r.json();
    if (
      info.client_id !== process.env.TWITCH_CLIENT_ID ||
      !info.scopes.includes("user:read:chat")
    )
      throw Error("Reconnect Twitch with chat permission");
    this.user = info.user_id;
    this.checked = Date.now();
  }
  async api(path, params = {}, method = "GET", body) {
    if (!this.token) throw Error("Connect Twitch first");
    if (Date.now() < this.blocked)
      throw Error("Twitch rate limit cooling down");
    const call = () =>
      fetch(
        "https://api.twitch.tv/helix/" +
          path +
          "?" +
          new URLSearchParams(params),
        {
          method,
          signal: AbortSignal.timeout(12000),
          headers: {
            Authorization: "Bearer " + this.token.access_token,
            "Client-Id": process.env.TWITCH_CLIENT_ID,
            "Content-Type": "application/json",
          },
          body: body && JSON.stringify(body),
        },
      );
    let r = await call();
    if (r.status === 401) {
      await this.refresh();
      r = await call();
    }
    if (r.status === 429)
      this.blocked = Math.max(
        Date.now() + 1000,
        Number(r.headers.get("ratelimit-reset")) * 1000,
      );
    if (!r.ok) throw Error("Twitch " + path + " returned " + r.status);
    return (await r.json()).data;
  }
  reset() {
    clearTimeout(this.timer);
    clearTimeout(this.watchdog);
    this.generation = (this.generation || 0) + 1;
    this.socket?.close();
    this.socket = null;
    this.channels.clear();
    this.hooks.gap();
  }
  async start() {
    this.reset();
    const gen = this.generation;
    if (!this.token) return;
    try {
      await this.validate();
      if (gen !== this.generation) return;
      const list = this.hooks.list();
      if (!list.length) {
        this.status = "Connected · watchlist idle";
        return;
      }
      for (const c of list) this.channels.set(c.remote, c);
      this.open("wss://eventsub.wss.twitch.tv/ws", gen, false);
    } catch (e) {
      this.again(gen, e.message);
    }
  }
  again(gen, msg) {
    if (gen !== this.generation) return;
    this.reset();
    this.status = msg;
    this.hooks.error(msg);
    this.timer = setTimeout(() => this.start(), this.retry);
    this.retry = Math.min(60000, this.retry * 2);
  }
  open(url, gen, handoff) {
    if (gen !== this.generation) return;
    const old = this.socket,
      ws = new WebSocket(url);
    let transferred = false;
    this.socket = ws;
    const arm = (seconds) => {
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(
        () => this.again(gen, "EventSub heartbeat expired"),
        (seconds + 3) * 1000,
      );
    };
    arm(10);
    ws.onmessage = async ({ data }) => {
      if (gen !== this.generation) return;
      try {
        const { metadata: m, payload: p } = JSON.parse(data);
        if (ws === this.socket)
          arm(p.session?.keepalive_timeout_seconds || this.heartbeat || 10);
        if (m.message_type === "session_welcome") {
          this.heartbeat = p.session.keepalive_timeout_seconds;
          this.retry = 1000;
          if (handoff) old?.close();
          else
            for (const [id, c] of this.channels) {
              try {
                for (const type of [
                  "channel.chat.message",
                  "channel.chat.notification",
                ]) {
                  if (gen !== this.generation) return;
                  try {
                  await this.api("eventsub/subscriptions", {}, "POST", {
                    type,
                    version: "1",
                    condition: { broadcaster_user_id: id, user_id: this.user },
                    transport: {
                      method: "websocket",
                      session_id: p.session.id,
                    },
                  });
                  } catch (error) {
                    if (type === "channel.chat.message") throw error;
                    if (gen === this.generation) this.hooks.error("Raid notices unavailable for "+c.name+" · "+error.message);
                  }
                  if (gen !== this.generation) return;
                  if (type === "channel.chat.message") this.hooks.health(c.id, "Subscribed");
                }
              } catch (e) {
                if (gen !== this.generation) return;
                this.hooks.health(c.id, e.message);
                if (!/returned 40[13]/.test(e.message)) throw e;
              }
            }
          this.status = "EventSub connected";
        } else if (m.message_type === "session_reconnect") {
          const next = new URL(p.session.reconnect_url);
          if (next.protocol !== "wss:" || !next.hostname.endsWith(".twitch.tv"))
            throw Error("Invalid reconnect destination");
          transferred = true;
          this.open(next.href, gen, true);
        } else if (m.message_type === "revocation") {
          const c = this.channels.get(
            p.subscription.condition.broadcaster_user_id,
          );
          if (p.subscription.type === "channel.chat.notification") {
            if (c) this.hooks.error("Raid notices revoked for "+c.name+" · "+p.subscription.status);
          } else {
            if (c) this.hooks.health(c.id, "Revoked · " + p.subscription.status);
            this.status = "Chat subscription revoked";
          }
        } else if (m.message_type === "notification") {
          if (this.seen.has(m.message_id)) return;
          this.seen.set(m.message_id, true);
          if (this.seen.size > 10000)
            this.seen.delete(this.seen.keys().next().value);
          const e = p.event,
            c = this.channels.get(e.broadcaster_user_id);
          if (c && p.subscription.type === "channel.chat.notification") {
            if (["raid", "shared_chat_raid"].includes(e.notice_type))
              this.hooks.raid(c.id);
            return;
          }
          if (c)
            this.hooks.message(c.id, {
              id: e.message_id,
              user: e.chatter_user_id,
              text: e.message.text,
              time: Date.parse(m.message_timestamp),
              emotes: e.message.fragments
                .filter((f) => f.type === "emote")
                .map((f) => f.text),
            });
        }
      } catch (e) {
        this.again(gen, e.message);
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (!transferred && this.socket === ws)
        this.again(gen, "EventSub disconnected · retrying");
    };
  }
  async clip(channel, vod, onPending = () => {}) {
    const scope = vod
      ? ["channel:manage:clips", "editor:manage:clips"]
      : ["clips:edit"];
    if (!scope.some((s) => this.token?.scope?.includes(s)))
      throw Error("Missing Twitch clip permission");
    const args = { broadcaster_id: channel.remote, duration: 30 };
    if (vod)
      Object.assign(args, {
        editor_id: this.user,
        vod_id: vod.id,
        vod_offset: vod.end,
        title: "StreamPulse highlight",
      });
    const [pending] = await this.api(
      vod ? "videos/clips" : "clips",
      args,
      "POST",
    );
    onPending(pending.id);
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      const [clip] = await this.api("clips", { id: pending.id });
      if (clip) return clip;
    }
    throw Error("Clip processing unconfirmed after 60 seconds");
  }
}
