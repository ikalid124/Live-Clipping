# StreamPulse live test report

## V4 update — November 17, 2026

Three natural candidates were captured during continued real monitoring. EsfandTV candidates 451 and 496 scored 94 and 99. GTAMen candidate 538 scored 72. V4 resolved all three to their original broadcasts and timestamped VOD links. Candidate 538's VOD played in Chrome after pre-roll, and its Save for later action survived restart.

The deployment checkpoint recorded 657 GTAMen messages and 1,626 EsfandTV messages since process launch. Compared with V4's starting counts, at least 2,150 additional messages were processed. GTAMen returned from offline to live. Both channels continued independently after restart.

At 3:30 PM Eastern, both channels were subscribed and receiving chat. Four subscriptions were present, with no current monitoring or polling error. Two natural EsfandTV events had in-app broadcast records. Chrome denied localhost notification permission and Discord lacked a webhook. Real external delivery remains blocked.

The final V4 suite passed 24 tests and the Chrome workflow passed. The final IPv4 launcher readiness correction remains unverified because automatic approval review reached a usage limit. Full details, feature classifications, exact limitations and resume steps are in [V4 progress report](V4_PROGRESS_REPORT.md).

## V3 historical checkpoint

November 17, 2026

## Live results

The connected account validated successfully with `user:read:chat`. Its existing Windows credential vault restored after service restarts. The running service established one EventSub WebSocket and four subscriptions across two channels.

| Check | Observed result |
| --- | --- |
| Channels | Added GTAMen and EsfandTV after authenticated search reported them live. Both use bookmark mode and the Variety profile. |
| Genuine chat | Both channels received real EventSub chat. Their last-message timestamps and independent detector baselines updated. |
| Message count | Instrumented EsfandTV intervals recorded 58 genuine messages before the final deployment restart and 25 afterward, totaling at least 83 passed to the detector. Earlier traffic was observed before counters were added. |
| Live/offline | GTAMen was initially live and subsequently became offline. The dashboard reflected the transition. EsfandTV remained live during verification. |
| Dashboard | Inspected the live application in Chrome. EsfandTV showed receiving-chat status, messages per minute, unique chatters, last receipt, processed count and the activity/baseline graph. |
| Natural highlights | Zero qualifying natural highlights at the recorded checkpoints. Detection thresholds retain the existing values. |
| Media | No natural candidate was available for real clip or event-specific VOD playback verification. |
| Notifications | In-app candidate broadcasts verified with controlled input. Desktop alerts are disabled in the existing settings. Discord has no webhook configured. OS display and real Discord delivery remain unverified. |
| Native clips | Both monitored channels use bookmark mode. Actual clip creation remains unverified. |

Processed counters measure calls into the detector for live channels since the current process launched. They include messages that the detector may subsequently filter. Minute counts and unique chatters use bounded in-memory buckets. Raw chat text is excluded from this report and persistent activity summaries.

## Changes

- Added per-channel monitoring state, last-minute volume and unique chatters, process-lifetime detector input counts, baseline, recent qualifying windows, highlight count and sensitivity to Overview and Live activity.
- Added validation timestamp, verified scopes, subscription count and WebSocket diagnostics. Stream polling failures appear in the dashboard.
- Adding a Twitch channel now immediately requests stream status. Existing subscriptions stay active during incremental watchlist updates.
- Added join pacing below Twitch's ordinary 20 attempts per 10 seconds limit, reset reconnect backoff after successful subscriptions, and repaired the rate-limit fallback when the reset header is absent.
- Invalid validation responses and missing required scope clear the authenticated identity indicator. Existing credential files continue to support reconnect.
- Dashboard fetch failures explicitly show unavailable monitoring status. Successful recovery clears the stale error. An EventSource reconnect requests a fresh state.
- Added clickable in-app highlight alerts independently of the desktop permission setting. Alerts include channel, time, score, reason, message volume, spike multiplier and a review link. Delivery reservation suppresses repeated candidate alerts.
- Added a `?source=Twitch` entry URL to open the real monitoring workspace.

## Controlled verification

All 21 automated tests passed on Windows after the implementation changes. Tests use temporary databases and fixture credentials.

The downstream pipeline test injects labeled synthetic activity through the backend message hook. It produces a candidate from 100 independent reacting viewers, checks database-backed state and the Twitch queue API, verifies detector counters, and confirms the actual SSE alert payload while mocked clip processing is still pending. Archive matching and capture failure handling pass against mocked Twitch responses.

Review tests approve, reject, save and rate a candidate, restarting the isolated application after each decision and checking the persisted decision, rating and note. The isolated Chrome workflow verifies chart rendering, video playback of the demo sample, approval, queue filters, workspace separation, watchlist and settings.

The EventSub adapter test verifies subscription creation, duplicate suppression, raid handling, denied optional subscriptions, incremental channel changes and reconnect scheduling with mocked transport. Discord tests verify a successful mocked response and a failed response. Synthetic replay recovered all six scripted highlights. The challenge benchmark detected six of seven labeled highlights, with zero false positives and zero duplicate triggers. The quiet scene remains a known miss.

The first sandboxed full-suite run failed its two loopback integration tests because socket access was restricted. The approved rerun passed. A legacy EventSub documentation URL redirected, and a guessed reference subpath was inaccessible. Current official authentication, WebSocket and clip reference pages were available.

## Official API checks

User access tokens with chat-read scope support this installed WebSocket client. Subscription conditions carry the broadcaster identity and the authenticated reader identity. [Twitch authentication and EventSub](https://dev.twitch.tv/docs/chat/authenticating/)

The ordinary concurrent chat-room limit is 100, with documented broadcaster/moderator exceptions. Ordinary join attempts are limited to 20 per 10 seconds. This run used two channels. [Twitch chat limits](https://dev.twitch.tv/docs/chat/)

The client uses a single WebSocket, subscribes after welcome, handles keepalive and reconnect messages, and resubscribes after a lost connection. Lost messages are unavailable for replay. Documented limits include 300 enabled subscriptions per connection and three connected WebSockets per client/user tuple. [Twitch WebSocket handling](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)

Live creation requires `clips:edit`. VOD creation requires the broadcaster/editor relationship and the relevant manage-clips scope. Current endpoints support a 5–60 second duration. The existing adapter uses these endpoints and checks Get Clips for completion. These checks establish API compatibility of the implementation. Real publication remains unverified. [Twitch Clips API reference](https://dev.twitch.tv/docs/api/reference/clips/)

## Remaining acceptance checks

- A naturally qualifying moment, its persisted review candidate and an actual matching video/VOD.
- OS notification display after the user enables desktop alerts and grants browser permission.
- Real Discord delivery after a webhook is configured and Discord alerts are enabled.
- Prolonged load, a real Twitch-directed WebSocket handoff, network-outage recovery and a broadcaster restarting a stream.
- Optional native clipping after explicit channel opt-in and appropriate authorization.

The original shutdown that caused the earlier connection-refused screen remains unexplained. The local service must be running for monitoring to continue.

At the final checkpoint, 11:19 AM Eastern, the service was listening on port 8765 with four subscriptions, zero reconnect attempts and no polling error. EsfandTV showed 16 messages and 13 unique chatters in its preceding minute. Chrome's controlled fetch-outage check also passed recovery without a stale error banner.

## Reproduce

Open [Twitch monitoring](http://localhost:8765/?source=Twitch). Check EsfandTV or add another currently live channel from Watchlist. Observe the processed count increase and compare its activity graph with its baseline. Keep bookmark mode selected. Open Review queue when a qualifying candidate appears.

Run `node --test`, `node scripts/browser-check.js`, `node replay.js` and `node benchmark.js` from the project directory for isolated regression checks. Launch the normal service with `node --env-file-if-exists=.env server.js` if it has stopped.
