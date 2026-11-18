# StreamPulse engineering notes

## V4 findings used on November 17, 2026

Get Videos supplies originating stream and broadcaster identities. Get Clips exposes nullable footage offsets and duration. V4 uses broadcast identity and interval overlap to associate footage. Creation-time proximity is labeled approximate. A live probe returned channel-based clip URLs under www.twitch.tv, so validation now accepts both Twitch clip URL forms. [Videos](https://dev.twitch.tv/docs/api/reference/videos/) · [Clips](https://dev.twitch.tv/docs/api/reference/clips/)

Reconnect handoffs retain subscriptions and may supply a null keepalive timeout. The adapter now preserves the prior heartbeat interval and tracks both sockets until transfer finishes, closing both on recovery. Token-refresh rejection clears the authenticated indicator. Existing join pacing and rate-limit cooldown remain in use. [EventSub](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) · [API rate limits](https://dev.twitch.tv/docs/api/guide)

Source resolution runs independently of stream-status polling. Persistent attempt counts and next-check timestamps bound automatic work to ten checks per candidate, capped at seven days. Each worker pass selects at most twenty candidates from four channels. API responses are bounded to one hundred recent clips and archives per channel, plus known clip IDs. This limits coverage on very prolific channels.

Browser notifications have permission, show and error states. V4 exposes these states and tests them, while keeping the open-tab requirement visible. The inspected Chrome profile denies localhost notifications. Discord provides browser-independent delivery once configured. Native Windows app notifications require SDK integration and app registration, adding a separate deployment component to this Node application. That option is deferred. [Browser notification events](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API) · [Microsoft console-app notifications](https://learn.microsoft.com/windows/apps/develop/notifications/app-notifications/app-notifications-console)

The background launcher starts a hidden Windows process, verifies HTTP readiness and reuses an existing StreamPulse listener. It creates no startup registration. The backend operates independently of browser tabs. A process supervisor remains a future reliability option. [Node child-process lifecycle](https://nodejs.org/api/child_process.html#optionsdetached)

Real candidates demonstrate that the current detector can respond to audience activity. Three observations cannot establish precision or justify replacing its algorithm. The new replay comparator evaluates the same stored JSONL under two thresholds and reports added and removed qualifying windows. Quality labels remain explicit reviewer judgments. Synthetic threshold 70 versus 65 produced identical qualifying windows across the three bundled fixtures.

## Milestones and acceptance

1. Feed three traffic profiles through one independent detector. A surge from multiple reacting viewers should produce one explainable candidate while spam and steady traffic produce none.
2. Persist candidates and decisions in SQLite. Restart a temporary instance and recover its queue. Exercise the demo, watchlist, settings and review actions through the local API.
3. Connect authenticated sources with a separate adapter. Exercise failures offline and reserve live verification for an authorized account.
4. Document exact launch steps, evidence and outstanding validation after each run.

## Decisions

Use Node's built-in SQLite, WebSocket, HTTP, fetch and test runner and a browser-native dashboard. This Windows host has Node 22.17.1 and a nonfunctional default Python alias. Avoid a build step. Store UTC Unix milliseconds. Keep raw messages in bounded rolling memory and persist aggregate evidence. Run services on loopback.

LIGHTOR uses time-stamped audience activity to locate approximate highlights. Audience reaction often trails the video. Separate reaction time, processing time and an adjustable pre-roll. Research on emotes and collective decisions supports combining unusual volume with audience breadth and reaction diversity. Neither study calibrates this application's heuristic score. [LIGHTOR](https://www.cs.sfu.ca/~jnwang/papers/lightor.pdf) · [Collective decisions](https://link.springer.com/article/10.1140/epjds/s13688-021-00295-6)

TwitchSnipBot separates spike detection from browser and CLI clipping. Its repository page showed no identifiable license. All implementation here is original. [TwitchSnipBot](https://github.com/bihanikeshav/TwitchSnipBot)

A local EventSub WebSocket needs a user access token. Subscribe with the token owner's user ID and the watched broadcaster ID. Request user:read:chat. Join limits, account restrictions and subscription cost can prevent monitoring. Reconnect handoffs retain subscriptions. A fresh welcome after transport loss requires new subscriptions and missed messages cannot be replayed. [Chat authorization](https://dev.twitch.tv/docs/chat/authenticating) · [EventSub](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) · [Chat events](https://dev.twitch.tv/docs/eventsub/reference/chat)

Live Create Clip requires clips:edit, a live stream and channel permission. Its retrospective capture buffer is time-sensitive. The default duration is 30 seconds and accepted durations are 5–60 seconds. Creation returns an asynchronous ID. Poll Get Clips before exposing a playable URL. VOD clipping uses videos/clips with the broadcaster or editor grant, matching editor_id and a known end offset. Get Clips offsets can be null. Creation time alone offers weak correlation. [Clips reference](https://dev.twitch.tv/docs/api/reference/clips)


## V2 research and design

The official Get Videos response ties an archive to its originating stream and broadcaster. Get Clips reports the clip **start** offset, which may be null. Create Clip From VOD instead takes an **end** offset and a duration. StreamPulse uses these conventions independently and requires both identity and range checks before offering a derived archive link. The live endpoint captures recent footage around the request; request duration alone cannot establish coverage. [Videos](https://dev.twitch.tv/docs/api/reference/videos) · [Clips](https://dev.twitch.tv/docs/api/reference/clips)

Twitch identifies LUL and PogChamp among familiar emotes. GTA RP communities document pursuit maneuvers, in-character dialogue and narrative events such as ocean dumping. These informed optional dictionary entries. A term is evidence of audience response, not proof of a particular on-screen action. The detector also accepts a sufficiently broad surge of varied unrecognized text. [Twitch community emotes](https://blog.twitch.tv/en/2026/11/13/twitchcon-san-diego-2026) · [ROMPUS roleplay policies](https://rompus.net/cm/in-game-policies/) · [Rush Hour Roleplay rules](https://rushhourroleplay.com/rules)
