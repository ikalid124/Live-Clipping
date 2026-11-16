# StreamPulse engineering notes

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

