# StreamPulse project status

**Last updated November 17, 2026 · V4 and Git checkpoint**

Real Twitch monitoring produced three natural candidates with timestamped VOD links. GTAMen candidate 538 played in Chrome and its Saved decision survived restart. Both GTAMen and EsfandTV were live and receiving chat at the last check. External notifications require browser permission or a Discord webhook. Read [V4 progress report](V4_PROGRESS_REPORT.md) and [Live test report](LIVE_TEST_REPORT.md) before continuing. The last IPv4 launcher correction awaits verification after an approval-review usage limit.

The requested Git checkpoint captures the accumulated V2–V4 implementation, tests and context documents on branch `codex/streampulse-v4-checkpoint`. Existing Git history begins with checkpoint d6f01c0. Runtime credentials and SQLite data remain outside the source checkpoint.

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
- Independent browser and Discord switches, notification thresholds, per-candidate delivery records and error isolation. Initial detection alerts are independent of clip processing. Verified clips can trigger an optional follow-up.

## Verification

| Check | Observed result |
| --- | --- |
| `node --test` | 24 passed, 0 failed on Windows in V4. Includes persistence, API protection, DPAPI with synthetic tokens, OAuth failures, socket handoff, source matching and notification handling. |
| `node scripts/browser-check.js` | Passed in headless Chrome. The script loaded the overview and chart, opened a candidate, approved with a note, filtered the queue, added a demo channel and saved settings. |
| `node replay.js` | Each five-minute fixture produced two expected events, merged two extra active windows and produced zero extra candidates. All six detected at the first sampled burst. Sample-aligned labels yield zero simulated latency. |
| Live Twitch | Four subscriptions and two channels receiving chat on November 17. At least 2,150 additional messages during V4; three natural candidates with VOD links. GTAMen playback and Saved review persistence verified. |
| Discord delivery and OS notification display | Real delivery unverified. Chrome permission is denied and Discord lacks a webhook. Real UI tests surfaced both conditions; controlled delivery tests passed. |

## Known limits and unfinished validation

- Synthetic fixtures do not establish real-world accuracy. The model can miss quiet dialogue and confuse coordinated one-message accounts with independent viewers. Diverse bot messages or organic raid chatter without a raid notice can trigger a candidate. The English reaction dictionary needs channel-specific evaluation. Ads are filtered by textual indicators.
- Timing estimates combine chat delivery and viewer reaction delay into a configurable offset. EventSub message time is a proxy. Missing chat during outages cannot be recovered. Stream transitions are observed through polling, and capture may miss live content near the edges of Twitch's buffer.
- Community searches are bounded to 100 clips and archives per channel. Matching checks broadcast identity and footage overlap; creation-time suggestions remain explicitly approximate. Persistent retries stop after ten checks or seven days. Manual investigation on Twitch may be necessary.
- Authorized local capture accepts previously recorded segments. Video trimming and automated recorder control are outside this implementation. Attachment serving used fixture bytes in tests. Real codec playback still needs an owned media file.
- Desktop alerts require an open tab and OS permission. Discord delivery errors are logged. Historical alerts are not resent. Real push display, prolonged high-load monitoring, live reconnect handoff and broadcaster/editor permission combinations still need field testing.
- Optional audio, speech-to-text, AI scoring and additional platform adapters are deferred.

## Credentials and next acceptance check

The existing account is authenticated with chat-read permission and restores from its Windows vault. Open [Twitch monitoring](http://localhost:8765/?source=Twitch), observe EsfandTV or add another live channel, and review the next natural candidate against available footage. Browser desktop alerts need the setting and browser permission. Discord delivery needs a webhook and its setting. Native clipping requires explicit channel opt-in and the applicable scope. Exact steps are in the README.

## Run history

### November 17, 2026 — source checkpoint and context handoff

Created branch `codex/streampulse-v4-checkpoint` in the existing repository to preserve its initial checkpoint history. Included the accumulated implementation, regression tests, replay tools, research, live evidence and V2/V4 reports. Updated the current verification summary to distinguish V4 results from historical runs. Git diff whitespace checks passed; a targeted credential-pattern scan found only the synthetic Discord test URL. The environment example contains blank credential fields. Runtime data and .env remain excluded. No remote publication was requested.

The earlier 24-test and browser passes are recorded above; this documentation/checkpoint step did not rerun them. The outstanding IPv4 background-launch verification and external notification requirements remain unchanged. Next reproducible step: run `./Start-StreamPulse.ps1 -Background` twice and verify the existing server PID is reused, then test a controlled fresh launch. Consult V4_PROGRESS_REPORT.md for remaining field validation and credential requirements.

### November 17, 2026 — V4 operation and requested Git checkpoint

Completed broadcast-aware source matching, persisted bounded source retries, independent video polling, notification test controls and history, explicit permission status, threshold presets, rating summaries, replay comparison, health counters and optional background launch. Corrected handoff socket cleanup, rejected-refresh authentication status, clip URL validation and overlapping UI refreshes.

Observed at least 2,150 additional real messages and three natural candidates during V4. Resolved all three to VODs and inspected GTAMen playback. Saved candidate 538 through the UI and independently confirmed Saved after restart. All 24 tests and the Chrome workflow passed. Replay recovered six scripted highlights and the challenge benchmark missed its known quiet scene.

The launcher incorrectly timed out on localhost despite a healthy server. Its readiness address now uses 127.0.0.1. Automatic approval review hit a usage limit before the final readiness and duplicate-launch verification could execute. This remains the next reproducible check. Browser permission is denied and Discord is unconfigured. The service was still running at the last successful check. See V4_PROGRESS_REPORT.md for full context, limitations and launch instructions.

### November 16, 2026 — initial application

Started with an empty Git working tree. Preserved the full brief, researched Twitch and audience-based detection, built the application and ran the three validation paths above. The sandbox initially prevented a loopback integration test from connecting. It passed with local network access. A real DPAPI round-trip test exposed a PowerShell module-loading failure. Replaced the cmdlet-based implementation with the Windows ProtectedData API and reran the full suite successfully. Left live credentials unset and bookmark mode enabled. Next run should start with the authorized live chat acceptance check, then record observed results here.

### November 16, 2026 — restored dashboard access

Port 8765 had no listener. Started StreamPulse as a background Windows process using the normal database. Opened a fresh in-app browser tab at http://localhost:8765/ and verified three demo channels, the activity chart and three pending highlights. The original tab held the connection-refused error page. After a Windows restart, launch the server using the README command before opening the dashboard. This run required no credentials or application code changes. Live Twitch validation is still pending.

### November 16, 2026 — playable demo and multi-channel monitoring fix

Confirmed the new attachment matched PROJECT_BRIEF.md. Added an original six-second arcade sample to demo candidate details and a media availability label to queue rows. The footage is shared across demo candidates. Corrected subscription handling so a denied or revoked optional raid subscription cannot disable a working chat subscription. Added generation checks around asynchronous subscription setup.

All 17 tests passed on Windows, including mocked two-channel subscription denial and revocation. The Chrome check decoded the sample video, confirmed playback advanced and approved a candidate. Replay recovered all six labeled synthetic highlights with zero additional detections. Restarted the existing local server and verified three channels, 30 stored candidates and HTTP 200 for the MP4. Refresh the review queue to load the new client. Live Twitch, Discord delivery and desktop notification display still need the account, webhook and OS permission checks described above.

### November 16, 2026 — V2 targeted production upgrade

Git checkpoint d6f01c0 captures the original working tree. Reproduced the identical-LOL false negative and fixed it. Added opt-in GTA RP dictionaries, evidence for rejected spikes, timing and archive checks, immediate alerts, incremental subscriptions, scoped workspaces, quality ratings and ranked queue filters. Existing reviews survived the additive migration. The pre-upgrade snapshot is before-v2-7ef2b1fc7324401894a2c8722c4e40c8.sqlite beside the active database under the Windows user's LocalAppData StreamPulse folder.

21 automated tests, three replays, the challenge benchmark and Chrome review workflow passed their expected checks. One deliberately quiet labeled scene was missed. V2 is running on localhost port 8765. The account was disconnected and the client ID unconfigured; live verification remains outstanding. Start the next run with [the V2 audit](V2_AUDIT.md) and [the validation report](V2_TEST_RESULTS.md), then verify a consenting stream in bookmark mode before enabling clipping.

### November 16, 2026 — local Twitch account setup

The running service initially reported no configured Twitch app, no authenticated account and zero monitored Twitch channels. Settings now accepts the client ID and secret for first-time setup and stores them in a Windows user-encrypted client vault. Saving takes effect immediately. A complete environment configuration still takes precedence. Updated README setup instructions.

All 21 Windows tests passed, including client vault restoration and mocked OAuth refresh. The isolated Chrome check saved synthetic credentials and confirmed that Connect Twitch appeared and the secret field cleared. Restarted the normal service and verified setup was available with zero recorded errors. No test failed during this run. Live chat and actual Twitch clip creation still require an authorized account. Next, open Settings, register the displayed redirect URL with the Twitch application, enter its credentials locally, connect the account and add a live channel in bookmark mode.

### November 17, 2026 — Settings connection restored

Settings displayed “Failed to fetch” while the local service was stopped. Restarted StreamPulse on port 8765, verified that `/api/state` returned settings, and reloaded the open browser tab. The error cleared and fresh demo activity appeared. This operational check required no credentials. The cause of the earlier shutdown is unknown. To repeat the check, open [Settings](http://localhost:8765/#settings) and confirm diagnostics load. Live Twitch verification still requires an authorized account.
### November 17, 2026 — Twitch setup status check

The running service returned `configured=true` and `canConfigureClient=true`. The application credentials are saved locally and an account token has yet to be stored. Checked the local state endpoint and the authorization flow in the source. The first sandboxed request could not reach localhost, and the approved retry succeeded. Credential validity and live Twitch access remain unverified. Next, select **Connect Twitch** under **Settings → Twitch connection** and complete the Twitch sign-in and consent screen.

### November 17, 2026 — V3 real monitoring

Verified the existing account and chat-read scope against Twitch. Added GTAMen and EsfandTV in bookmark mode after authenticated search reported them live. Both delivered genuine messages, and their baselines updated independently. GTAMen subsequently went offline. At 11:19 AM Eastern, EsfandTV was receiving chat with 16 messages and 13 unique chatters in the preceding minute. Instrumented intervals recorded 58 messages before the deployment restart and 25 afterward, all passed to the detector. Earlier traffic predates these counters. Zero natural highlights qualified at the recorded checkpoints.

Added per-channel metrics and explicit connection states, immediate stream-status polling on channel add, token/subscription diagnostics, visible polling errors, join pacing, reconnect backoff reset and rate-limit fallback. Fixed stale dashboard errors after fetch recovery. Added clickable in-app highlight alerts and chat-volume details. Opened the Twitch workspace and left the service listening on port 8765, process 34696 at the checkpoint.

All 21 automated tests passed, including new metric, queue, SSE alert and review-restart assertions. Chrome smoke testing passed, including an injected fetch outage and successful recovery. Inspected genuine EsfandTV activity in Chrome. Replay found six scripted highlights. The challenge benchmark found six of seven expected highlights and missed the quiet scene, with zero false positives or duplicates. The initial sandbox run blocked two local-socket tests, and the approved rerun passed. No application test failures remain.

Controlled downstream injection verified candidate creation, queue listing, alert transmission and mocked archive resolution in isolated databases. Real natural highlight/video matching, desktop notification display, Discord delivery, live reconnect handoff and broadcaster restart remain unverified. Desktop alerts are disabled and no Discord webhook is configured. Both channels retain bookmark mode. The next reproducible step is opening the Twitch monitoring link above, confirming an increasing processed-message count, and reviewing the next natural candidate. Full results and official API references are in LIVE_TEST_REPORT.md.
