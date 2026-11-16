# StreamPulse project status

**Last updated November 16, 2026 · Run 3**

The local application and credential-free demo are runnable on Windows. An authenticated Twitch session and a real Discord delivery remain the principal acceptance checks. Start here for each run, consult the original brief for scope, and append a dated entry after testing.

## Resume the project

| Need | Location |
| --- | --- |
| Original development request and priorities | [Project brief](PROJECT_BRIEF.md) |
| Windows launch, credentials, capture and replay instructions | [README](README.md) |
| Research, API constraints, architecture and initial acceptance plan | [Research notes](RESEARCH_NOTES.md) |
| Run handoff instructions | [AGENTS.md](AGENTS.md) |
| Detection, dictionaries and replay | detector.js, reactions.json, fixtures.json, replay.js |
| OAuth, protected tokens, EventSub and official clipping | twitch.js |
| Persistence, sessions, alerts, community correlation and HTTP API | server.js, notifications.js |
| Browser UI | public/index.html, public/app.js, public/style.css |
| Regression and browser checks | test/, scripts/browser-check.js |

Launch from this directory with `node --env-file-if-exists=.env server.js`. Open http://localhost:8765. The normal user's database and media live under `%LOCALAPPDATA%\StreamPulse`. Tests use independent temporary databases. The implementation uses Node.js and browser-native JavaScript in place of the preferred Python/React stack, allowing the installed Node 22.17.1 runtime to run every local feature without package installation.

## Completed functionality

- Three deterministic live demo profiles feed the actual detector. The dashboard shows monitoring status, activity with baseline and spike markers, candidate counts and the review queue.
- Per-channel rolling windows, capped EWMA, minimum viewer breadth, keyword/emote categories, repeated-phrase and routine-message controls, raid suppression, startup warm-up, configurable thresholds, timing offsets, merge interval and feedback adjustments. Raw chat stays in temporary memory.
- SQLite stores stream sessions, summaries, timestamped evidence, source links, clip metadata, settings, decisions, notes, alerts and errors. Removing a channel preserves historical review work.
- Review supports approval, rejection, saving, marking reviewed, reopening, sorting, filtering and pagination. Actual clips open on Twitch and attached local segments play in the dashboard.
- OAuth code exchange, state validation, refresh, startup/hourly validation and Windows user-bound token storage are implemented. The adapter resolves logins, searches channels, polls stream status, establishes EventSub subscriptions, handles raids, deduplicates, supports socket handoff, retries transport failures and surfaces subscription errors.
- Bookmark default, explicit native clip opt-in, verification through Get Clips, manual editor/broadcaster VOD clipping, and authorized MP4/WebM association. Recent community clips use archive timing when available or a labeled approximate creation-time match.
- Independent browser and Discord switches, notification thresholds, per-candidate delivery records and error isolation. Native-clip alerts wait for verification or failure.

## Verification

| Check | Observed result |
| --- | --- |
| `node --test` | 17 passed, 0 failed, 0 skipped on Windows. Includes SQLite restart persistence, API origin protection, media attachment/serving, Windows DPAPI round trip with synthetic tokens, mocked OAuth refresh, chat subscription and disconnect, rate limits, denied clipping, VOD clip confirmation and Discord error response. |
| `node scripts/browser-check.js` | Passed in headless Chrome. The script loaded the overview and chart, opened a candidate, approved with a note, filtered the queue, added a demo channel and saved settings. |
| `node replay.js` | Each five-minute fixture produced two expected events, merged two extra active windows and produced zero extra candidates. All six detected at the first sampled burst. Sample-aligned labels yield zero simulated latency. |
| Live Twitch, posting a Discord alert, OS notification display | Unverified. Tests used mock transport responses or local services. No external clip was created. |

## Known limits and unfinished validation

- Synthetic fixtures do not establish real-world accuracy. The model can miss quiet moments and coordinated reactions with identical text. Diverse bot messages or organic raid chatter without a raid notice can trigger a candidate. The English reaction dictionary needs channel-specific evaluation. Ads are filtered by textual indicators.
- Timing estimates combine chat delivery and viewer reaction delay into a configurable offset. EventSub message time is a proxy. Missing chat during outages cannot be recovered. Stream transitions are observed through polling, and capture may miss live content near the edges of Twitch's buffer.
- A community search looks at up to 100 clips in each recent query. Matching is approximate and can choose an adjacent event. An interrupted pending clip is recorded as an error on restart. Manual investigation on Twitch may be necessary.
- Authorized local capture accepts previously recorded segments. Video trimming and automated recorder control are outside this implementation. Attachment serving used fixture bytes in tests. Real codec playback still needs an owned media file.
- Desktop alerts require an open tab and OS permission. Discord delivery errors are logged. Historical alerts are not resent. Real push display, prolonged high-load monitoring, live reconnect handoff and broadcaster/editor permission combinations still need field testing.
- Optional audio, speech-to-text, AI scoring and additional platform adapters are deferred.

## Credentials and next acceptance check

On the user's Windows account, register the localhost callback and configure the Twitch application ID and secret. Connect with chat-read scope and add one authorized live channel in bookmark mode. Verify its channel details say Subscribed, the chart receives chat and a candidate opens with a plausible window. Then calibrate timing against an owned VOD. Configure a Discord webhook to check delivery. Live clip testing requires explicit per-channel opt-in and an account allowed to clip. VOD testing requires broadcaster/editor authorization and a known offset. Exact steps are in the README.

## Run history

### November 16, 2026 — initial application

Started with an empty Git working tree. Preserved the full brief, researched Twitch and audience-based detection, built the application and ran the three validation paths above. The sandbox initially prevented a loopback integration test from connecting. It passed with local network access. A real DPAPI round-trip test exposed a PowerShell module-loading failure. Replaced the cmdlet-based implementation with the Windows ProtectedData API and reran the full suite successfully. Left live credentials unset and bookmark mode enabled. Next run should start with the authorized live chat acceptance check, then record observed results here.

### November 16, 2026 — restored dashboard access

Port 8765 had no listener. Started StreamPulse as a background Windows process using the normal database. Opened a fresh in-app browser tab at http://localhost:8765/ and verified three demo channels, the activity chart and three pending highlights. The original tab held the connection-refused error page. After a Windows restart, launch the server using the README command before opening the dashboard. This run required no credentials or application code changes. Live Twitch validation is still pending.

### November 16, 2026 — playable demo and multi-channel monitoring fix

Confirmed the new attachment matched PROJECT_BRIEF.md. Added an original six-second arcade sample to demo candidate details and a media availability label to queue rows. The footage is shared across demo candidates. Corrected subscription handling so a denied or revoked optional raid subscription cannot disable a working chat subscription. Added generation checks around asynchronous subscription setup.

All 17 tests passed on Windows, including mocked two-channel subscription denial and revocation. The Chrome check decoded the sample video, confirmed playback advanced and approved a candidate. Replay recovered all six labeled synthetic highlights with zero additional detections. Restarted the existing local server and verified three channels, 30 stored candidates and HTTP 200 for the MP4. Refresh the review queue to load the new client. Live Twitch, Discord delivery and desktop notification display still need the account, webhook and OS permission checks described above.
