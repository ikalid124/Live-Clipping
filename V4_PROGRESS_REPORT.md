# StreamPulse V4 checkpoint

November 17, 2026

This checkpoint includes the accumulated V2, V3 and V4 work since Git commit d6f01c0. PROJECT_STATUS.md is the starting point for subsequent runs. README.md covers launch and configuration. LIVE_TEST_REPORT.md retains the dated live evidence. RESEARCH_NOTES.md records API references and implementation choices. The original requirements remain in PROJECT_BRIEF.md.

## Initial state and priorities

V3 had verified real chat ingestion and independent baselines, with 21 passing tests. Natural highlights, actual footage playback and external notification delivery were still unverified. V4 prioritized broadcast-aware video matching, delayed source resolution, monitoring recovery, notification diagnostics and evidence-based detector evaluation.

## Real results

By the deployment checkpoint, GTAMen had processed 657 messages and EsfandTV 1,626 since the preceding process launch. At the beginning of V4 the counters were zero and 133 respectively, establishing at least 2,150 additional messages during this run. Both channels use bookmark mode. GTAMen went offline and returned to live status.

Three natural candidates appeared and survived restarts.

| Candidate | Channel | Score | Source |
| --- | --- | --- | --- |
| 451 | esfandtv | 94 | VOD 2931437970 at 4748 seconds |
| 496 | esfandtv | 99 | VOD 2931437970 at 15469 seconds |
| 538 | gtamen | 72 | VOD 2931609952 at 3970 seconds |

The GTAMen VOD played in Chrome after Twitch's pre-roll. Its candidate appeared in the review interface and was saved for later through the UI. The Saved decision remained present after a server restart. The EsfandTV VOD links were resolved through Twitch metadata. Their playback was not individually inspected.

Two real EsfandTV candidates have recorded in-app broadcast attempts. OS notification delivery remains blocked by Chrome's denied localhost permission. The Discord test correctly reports a missing webhook. No natural candidate had a verified community clip association at the checkpoint.

At 3:30 PM Eastern the service reported four subscriptions, both channels receiving chat, no current polling or monitor error, approximately 56 MiB process memory and a 1.4 MiB main SQLite file. The three candidates and source retry counters remained available after restart.

## Implementation and verification

| Feature | Status | Evidence and limits |
| --- | --- | --- |
| Account restoration and two-channel ingestion | VERIFIED LIVE | Existing credentials restored and both channels received messages after restart. |
| Natural candidate generation and persistence | VERIFIED LIVE | Candidates 451, 496 and 538. Entertainment quality remains uncalibrated. |
| Candidate review | VERIFIED LIVE | Candidate 538 saved through Chrome and recovered after restart. Approval, rejection and ratings additionally pass isolated tests. |
| VOD resolution | VERIFIED LIVE | All three candidates received matching-broadcast VOD links. GTAMen playback inspected. |
| Community clip confidence | VERIFIED LOCALLY | Tests cover wrong sessions, delayed creation, missing offsets, overlap and URL forms. A controlled window derived from a real EsfandTV clip matched its real archive. |
| Delayed source checks | VERIFIED LOCALLY | Persistent attempts and scheduled timestamps, bounded to ten checks and seven days. Production candidates reached three attempts across restarts. Full multi-day schedule remains unobserved. |
| EventSub handoff and refresh failures | VERIFIED LOCALLY | Tests exercise retained subscriptions, null heartbeat and rejected refresh. Natural network interruption remains unverified. |
| Browser notifications | BLOCKED | Chrome reports denied permission. Real UI test displays the actionable error. |
| Discord delivery | BLOCKED | Webhook absent. Missing-configuration UI, successful mocked delivery and error responses verified. |
| Notification history and presets | VERIFIED LOCALLY | Workspace-scoped attempts, all/high/exceptional thresholds and browser controls. Broadcast does not confirm OS display. |
| Replay comparison and rating summaries | VERIFIED LOCALLY | Threshold 70 versus 65 produced identical windows on three fixtures. No private live-chat replay was retained. |
| Hidden background launch | VERIFIED LIVE | Server launched and continued independently of the browser. |
| IPv4 readiness and duplicate-launch check | IMPLEMENTED BUT UNVERIFIED | Final address correction awaits execution. |
| Automatic Windows startup and process supervisor | NOT IMPLEMENTED | Optional future work. Manual background launch is available. |
| Native Windows toast integration | NOT IMPLEMENTED | SDK registration adds deployment complexity. Browser and Discord paths remain available. |
| Public clip creation | IMPLEMENTED BUT UNVERIFIED | Existing opt-in adapter retained. Live testing used bookmarks. |

Important repairs include separating video lookups from stream-status polling, checking broadcast identity and footage overlap, accepting real channel-based Twitch clip URLs, bounding retry work, preserving heartbeat values across handoff, closing both sockets on failed handoff, clearing invalid authentication indicators, suppressing repeated identical errors, and preventing automatic refresh from cancelling a slower user-requested render.

## Checks and failures

The final full automated suite passed 24 tests. Chrome smoke testing passed chart rendering, review, settings, notification controls, denied permission handling, delayed state rendering and fetch recovery. Replay found six scripted highlights. The benchmark found six of seven positive scenarios with zero false positives and duplicates. The quiet scene remains a known miss.

An initial browser run intermittently failed to clear the credential form after save. Investigation identified overlapping automatic and forced refreshes. Forced rendering now takes priority, and a six-second response-delay regression passed.

A live API probe initially rejected Twitch's channel-based clip URLs. That validation bug was corrected and retested against the real response and local cases.

The background launcher reported a false readiness failure even while the server was healthy. The localhost request exceeded its two-second timeout. Readiness checks were changed to the server's IPv4 bind address, 127.0.0.1. The final verification command was not executed because automatic approval review hit a usage limit. The prior live state request independently confirmed the running server and Saved review. This final launcher check remains pending.

## Independent improvement review

1. Delayed, identity-aware footage resolution offers high value with moderate complexity and was implemented and exercised against real candidates.
2. A durable alert history offers high value with low complexity and was added so notification attempts can be inspected after a tab was closed.
3. Detector calibration from rated real footage has high potential value but requires more labeled observations. Rating summaries and replay comparison were implemented. Thresholds were retained because three candidates do not establish detection precision.

Remaining limits include bounded searches of up to 100 clips and archives per channel, cached URLs that may later expire, estimated audience-reaction offsets, unknown entertainment precision, missed quiet scenes, unverified prolonged outage recovery and external notification setup.

## Resume and launch

Run `./Start-StreamPulse.ps1 -Background` from the project directory, then open http://localhost:8765/?source=Twitch. If startup reports an error, run `./Start-StreamPulse.ps1` in the foreground to see it. The server was running at the last successful observation.

The first follow-up check is running the background launcher against the existing listener, verifying its PID stays the same, then verifying a fresh launch after a controlled stop. The IPv4 readiness correction is the only code change made after the final full-suite and browser passes.

For desktop alerts, allow localhost notifications in Chrome, enable browser notifications in StreamPulse and use its test button. Keep a tab open. For browser-independent delivery, configure DISCORD_WEBHOOK_URL locally, restart, enable Discord alerts and run its test. Credentials and private chat belong outside Git.

Review candidate 538, which is Saved, and the two Pending EsfandTV candidates. Add quality ratings after watching. Use `node scripts/compare-replay.js path/to/chat.jsonl --baseline=70 --proposed=65` with authorized replay data to assess a proposed threshold.
