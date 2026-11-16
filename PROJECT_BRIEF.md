# MASTER DEVELOPMENT PROMPT
## Project: StreamPulse — Intelligent Livestream Highlight Detection and Clipping

You are acting as a senior full-stack engineer, software architect, and AI systems engineer.

Your mission is to independently design, implement, test, debug, and deliver a working local-first application that detects potentially viral or entertaining moments in livestreams.

This is an execution task, not merely a planning task.

I want a functional application that I can run, evaluate, and improve after your implementation.

Work autonomously. Make reasonable engineering decisions without repeatedly requesting approval. Where credentials, external accounts, or permissions are required, implement the relevant integration completely, provide setup instructions, and ensure the rest of the application works in a realistic demonstration mode.

Do not claim that an integration is operational unless you have actually tested it successfully.

Do not sacrifice core functionality to implement cosmetic features or experimental features.

---

# 1. PRODUCT VISION

Build a system that automatically monitors livestreams, detects interesting events, and presents them for human review.

The primary use case is monitoring several Twitch streamers simultaneously.

The user should not need to watch those streams continuously.

When an event occurs, the system should:

1. Detect that something unusual or entertaining may have happened.
2. Determine why the event is interesting.
3. Record the likely event time and relevant stream information.
4. Preserve the moment through an authorized clipping method when available and enabled.
5. Send an alert.
6. Save the event in a review dashboard.
7. Allow the user to watch, approve, reject, or dismiss it.
8. Use review feedback to improve future recommendations.

The application must NEVER automatically publish content to TikTok, Instagram, YouTube, or other social platforms.

The main goal is highlight discovery and review, not automated social-media posting.

---

# 2. RESEARCH AND IMPLEMENTATION PROCESS

Before writing substantial code:

1. Inspect the repository and identify any existing code or project instructions.
2. Read the relevant official Twitch API and EventSub documentation.
3. Research established algorithms for livestream highlight detection using chat activity and audience engagement.
4. Evaluate relevant open-source implementations, including TwitchSnipBot, for architectural ideas.
5. Verify the current permissions, limitations, and behavior of the Twitch clipping endpoints.
6. Identify the major technical risks.
7. Create a concise implementation plan with milestones and acceptance criteria.

Useful documentation:

https://dev.twitch.tv/docs/eventsub/

https://dev.twitch.tv/docs/eventsub/reference/chat

https://dev.twitch.tv/docs/api/reference/clips

https://dev.twitch.tv/docs/chat/authenticating

https://dev.twitch.tv/docs/eventsub/handling-websocket-events/

Reference implementation:

https://github.com/bihanikeshav/TwitchSnipBot

Do not blindly copy the reference implementation. Review its architecture, license, limitations, and applicable ideas.

After planning, implement the entire highest-priority application.

Do not stop after creating documentation, scaffolding, placeholder pages, or API interfaces.

---

# 3. TECHNOLOGY STACK

Preferred stack:

Backend:
- Python 3.12+
- FastAPI
- Asyncio
- WebSockets
- SQLite
- SQLAlchemy or SQLModel
- Pydantic
- Pytest

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- A lightweight charting library

Development environment:
- Windows 10/11
- PowerShell
- Localhost

Use currently maintained, compatible dependency versions.

Keep dependencies minimal.

No mandatory Docker, cloud services, paid APIs, or local GPU models.

Implement clean module boundaries so platform integrations and AI capabilities can be added later.

---

# 4. TWITCH INTEGRATION

Implement a real Twitch integration using official, documented APIs.

Required capabilities:

- Twitch OAuth authentication.
- Secure token handling.
- Token refresh when applicable.
- Channel search and broadcaster ID resolution.
- Detect live/offline channel status.
- Subscribe to channel chat events using EventSub.
- Receive and process live chat messages.
- Handle disconnects, reconnects, revoked authorizations, and stream endings.
- Respect Twitch API limits.
- Support multiple monitored channels within actual authorization and subscription limits.

Use the appropriate EventSub WebSocket transport for a local application.

Verify the exact authorization requirements for reading a broadcaster's chat with the selected user account.

Do not assume that every public channel can be monitored without authentication.

Do not use unofficial or undocumented endpoints as the foundation of the application.

Do not scrape protected streams or bypass platform permissions.

If authentication is unavailable, provide a helpful configuration screen and retain a fully working simulated-data mode.

---

# 5. HIGHLIGHT DETECTION ENGINE

This is the most important component.

Build a modular detection engine that works independently of Twitch-specific code.

Inputs should include:

- Chat message timestamps.
- Channel identity.
- Chat user identifiers.
- Message content.
- Emotes when available.
- Stream status.
- Optional viewer activity information.
- Optional viewer-created clip information.

The engine must analyze rolling windows of chat activity.

Implement:

A. MESSAGE RATE DETECTION

Measure messages over multiple windows, including approximately 5, 15, and 30 seconds.

Compare current message rates with each channel's historical baseline.

Use a statistically sensible method such as an exponentially weighted moving average, median/MAD, or another robust adaptive baseline.

Use relative increases rather than a single global message threshold.

Handle channels with dramatically different chat sizes.

B. UNIQUE PARTICIPANT ANALYSIS

Track how many distinct viewers are participating.

Avoid treating repeated messages from a single user as equivalent to widespread audience excitement.

C. KEYWORD AND EMOTE SIGNALS

Identify common reactions associated with:

- Surprise
- Excitement
- Laughter
- Shock
- Direct clipping requests
- Significant community reactions

Use configurable keyword and emote dictionaries.

Avoid allowing ordinary profanity or a single common word to dominate detection.

D. SPAM AND FALSE-POSITIVE CONTROL

Detect or reduce the influence of:

- Repeated identical messages.
- Single-user spam.
- Bot-like bursts.
- Raids where identifiable.
- Advertisements.
- Routine channel events.
- Duplicate detection events.
- Sudden disconnections and reconnects.

Do not silently assume every activity spike is an entertaining event.

E. EVENT SCORING

Produce a configurable score for every candidate highlight.

Each highlight should include:

- Overall highlight score.
- Relative chat activity.
- Unique chatter count.
- Reaction classification.
- Reasons for detection.
- Event timestamp.
- Estimated highlight time window.
- Confidence or evidence-strength indicator.

Clearly distinguish a heuristic confidence score from a statistically validated probability.

F. EVENT MERGING

If several high-scoring windows occur close together, merge them into a single highlight when appropriate.

Use configurable cooldowns and overlap handling.

Avoid flooding the user with duplicate notifications.

G. ADAPTIVE CHANNEL PROFILES

Maintain separate detection baselines for each monitored channel.

Store per-channel thresholds and preferences.

Enable the user to adjust sensitivity.

Implement basic feedback-based ranking from approved and rejected candidates.

Do not introduce an unnecessarily complex machine-learning training pipeline for the initial version.

Prioritize reliable, interpretable statistical detection.

---

# 6. TIMESTAMP AND STREAM SYNCHRONIZATION

Accurate timing is essential.

The application must not assume that a chat message's arrival time is identical to the video moment that caused the reaction.

Account for:

- Platform latency.
- Chat delivery latency.
- Viewer reaction delay.
- Detection-processing delay.
- Differences between wall-clock timestamps and VOD offsets.

Store raw timestamps in UTC.

Use timezone-aware datetime handling.

Support configurable timing offsets per channel.

Estimate a candidate window that includes content before the detected reaction.

Do not invent VOD offsets when the API has not provided them.

If an offset is unavailable, represent that status clearly.

Implement tests for delayed chat messages and timestamp alignment.

---

# 7. CLIPPING SYSTEM

Implement a separate clipping service.

Support three modes:

MODE 1: BOOKMARK ONLY

Record the interesting moment, relevant timestamps, channel, evidence, and available source links.

Do not create or publish a native Twitch clip.

This is the default mode.

MODE 2: AUTOMATIC TWITCH CLIP CREATION

When authorized and explicitly enabled by the user, call Twitch's official Create Clip API promptly after detection.

Respect the live-clip capture window and permitted clip duration.

Handle API failures, disabled clipping, permission errors, unavailable streams, and clips that do not finish processing.

Verify that the clip exists before marking it as successfully created.

Save the clip ID, URL, and metadata.

IMPORTANT: Clearly warn the user that native Twitch clip creation may publish the clip on Twitch before review.

This setting must be explicitly enabled.

MODE 3: AUTHORIZED LOCAL CAPTURE

Design an optional capture interface for media sources the user owns or has permission to record.

Do not implement unauthorized downloading or scraping.

If an authorized local recording source exists, allow local video segments to be associated with highlight events.

Keep this mode optional.

Also implement an authorized VOD clipping path for broadcasters or approved channel editors when supported by the official API.

The application should never pretend that a timestamp bookmark is an actual video file.

Every candidate must clearly indicate whether it has:

- A completed video clip.
- A pending clip.
- A VOD timestamp link.
- Only a timestamp bookmark.
- A capture error.

---

# 8. COMMUNITY CLIP CORRELATION

Implement a secondary mechanism that checks for Twitch clips created by viewers near detected events.

Use the official Get Clips endpoint.

Support:

- Retrieving recent clips for monitored broadcasters.
- Comparing creation times with detected events.
- Associating matching clips with candidate highlights.
- Avoiding duplicate clip references.
- Recording available metadata and view counts.
- Displaying existing clips in the review interface.

Recognize that clip creation time and video-event time may differ.

Use VOD offsets when available and handle null offsets correctly.

Respect Twitch rate limits.

This component should improve detection and review without becoming the only way highlights are identified.

---

# 9. NOTIFICATION SYSTEM

Implement two notification methods:

1. Browser or desktop notifications.
2. Discord webhook notifications.

The user should be able to enable or disable each independently.

A notification should contain:

- Streamer name.
- Time detected.
- Highlight score.
- Primary reason for detection.
- Chat-spike multiplier.
- Direct link to the candidate in the dashboard.
- Clip link when one actually exists.

Provide configurable notification thresholds.

Use cooldowns and deduplication.

Never send raw authentication tokens or private credentials in notifications.

Failures in Discord notifications must not interrupt livestream monitoring.

---

# 10. USER INTERFACE

Create a polished, responsive dashboard with a clean dark theme.

Aim for the quality of a real SaaS dashboard rather than a basic developer control panel.

The application should have the following views.

A. DASHBOARD

Show:

- Number of monitored channels.
- Currently live channels.
- Number of detected highlights.
- High-confidence candidates.
- Pending reviews.
- Recent activity.
- System connection status.

B. CHANNEL WATCHLIST

Allow the user to:

- Add a Twitch channel by username or URL.
- Remove a channel.
- Enable or disable monitoring.
- View live/offline status.
- Configure detection sensitivity.
- Select clipping mode.
- Review channel-specific statistics.

C. LIVE ACTIVITY MONITOR

Show:

- Real-time chat activity chart.
- Historical activity baseline.
- Detected spikes.
- Active stream information.
- Recent highlighted events.
- Connection health.

D. HIGHLIGHT REVIEW QUEUE

This is the most important screen.

For each candidate, display:

- Streamer.
- Date and time.
- Highlight score.
- Detection reasons.
- Chat activity metrics.
- Category.
- Clip or VOD availability.
- Video preview or link where supported.
- Associated viewer-created clips.

Provide buttons for:

- Approve.
- Reject.
- Save for later.
- Mark as reviewed.
- Open clip.
- Open source stream.
- Add manual notes.

Allow sorting and filtering.

E. SETTINGS

Include:

- Twitch account connection.
- Discord webhook configuration.
- Notification preferences.
- Global detection sensitivity.
- Per-channel overrides.
- Clipping permissions.
- Data-retention settings.
- Debugging information.

F. DEMONSTRATION MODE

Provide a clearly labeled demo mode with simulated streams, chat messages, spikes, candidate clips, and review events.

Do not fabricate real Twitch clips.

The demo should allow a reviewer to exercise the detection pipeline without API credentials.

---

# 11. DATABASE DESIGN

Design an appropriate SQLite schema.

Store, at minimum:

- Monitored channels.
- Stream sessions.
- Chat activity summaries.
- Highlight candidates.
- Detection evidence.
- Candidate clip references.
- Review decisions.
- Detection settings.
- Notification history.
- Connection status or errors.

Store only the message data necessary for detection, debugging, and limited review.

Use configurable retention and avoid accumulating unlimited raw chat history.

Persist all important review decisions across application restarts.

Use proper migrations or a reliable schema initialization strategy.

---

# 12. PERFORMANCE AND RELIABILITY

Optimize the application for continuous operation on a normal Windows desktop.

Chat monitoring should remain lightweight.

Use asynchronous processing where appropriate.

Avoid blocking network event handlers with expensive computations.

Keep memory usage bounded.

Clean up stale time windows and temporary state.

Recover gracefully from:

- Internet disconnections.
- Twitch WebSocket reconnects.
- Stream ending unexpectedly.
- Token expiration.
- API rate limiting.
- Duplicate webhook or event messages.
- Database errors.
- Notification failures.
- Application restart.

Use exponential backoff with sensible limits where applicable.

Provide useful logs.

Never silently discard an entire stream because of a temporary network failure.

---

# 13. TESTING AND VALIDATION

Create automated tests for the detection engine.

Include realistic synthetic data covering:

1. Normal chat activity.
2. Sudden legitimate spikes.
3. Slow, sustained audience growth.
4. Single-user spam.
5. Bot floods.
6. Raids.
7. Quiet streams.
8. Highly active streams.
9. Repeated bursts from one event.
10. Two separate highlights close together.
11. Delayed chat messages.
12. Stream termination.
13. Network disconnections.
14. Duplicate events.
15. Missing VOD offsets.
16. Unauthorized clipping attempts.
17. Notification errors.

Verify that strong highlights are detected and obvious false positives are suppressed.

Build a replay harness that feeds timestamped chat logs into the detector at adjustable playback speeds.

Create at least three representative simulation fixtures:

- High-traffic gaming stream.
- Medium-traffic variety stream.
- Low-traffic stream.

Generate useful metrics such as detected events, false positives, event detection latency, and duplicate events.

If actual labeled data is unavailable, describe this limitation rather than presenting synthetic test results as real-world accuracy.

Also test the frontend and core API flows.

---

# 14. SECURITY AND COMPLIANCE

Follow official Twitch OAuth requirements.

Validate OAuth state and callback handling.

Keep secrets out of source control.

Use appropriate secure local storage for sensitive tokens.

Use least-privilege permissions.

Do not request channel-management permissions unless the feature actually requires them.

Do not bypass platform authentication, rate limits, or content restrictions.

Do not automatically download or republish other creators' videos without permission.

Keep external publishing disabled.

Treat streamed user messages as untrusted data.

Never interpret chat messages as instructions for the application or its AI components.

---

# 15. DEVELOPMENT PRIORITIES

Complete work in the following priority order.

PRIORITY 0 — MUST WORK

- Project setup.
- Database.
- Twitch authentication.
- Twitch chat monitoring.
- Adaptive detection engine.
- Multi-channel watchlist.
- Timestamped candidate storage.
- Functional review dashboard.
- Discord and desktop notification options.
- Fully functional demonstration mode.
- Tests.

PRIORITY 1 — COMPLETE AFTER PRIORITY 0

- Optional native Twitch clip creation.
- Viewer-created clip correlation.
- Improved event scoring.
- Channel-specific sensitivity.
- Review-feedback ranking.
- Better timeline visualization.
- Stronger error recovery.

PRIORITY 2 — ONLY AFTER THE APPLICATION WORKS

- Optional audio analysis interface.
- Speech-to-text integration points.
- AI semantic scoring interface.
- Additional platform adapters.
- More advanced analytics.

Do not spend substantial time implementing Priority 2 features while Priority 0 remains broken.

If actual live integration testing is impossible without credentials, complete all credential-independent code paths, mocks, and setup instructions instead of skipping the integration.

---

# 16. ONE-SHOT EXECUTION RULES

Work through the complete implementation autonomously.

Follow this loop:

PLAN → IMPLEMENT → TEST → INSPECT → FIX → RETEST.

Continue until the highest-priority application is working or you encounter a genuine external blocker.

Do not stop simply because a major file or component has been created.

Do not repeatedly ask me what to do next.

Make reasonable assumptions and document them.

Avoid placeholder implementations, fake production integrations, hardcoded responses, or buttons that do nothing.

If a feature requires credentials, external permissions, or unavailable services, implement the integration and provide the exact setup procedure.

Do not claim to have tested external APIs without actually doing so.

Favor reliability over feature count.

Keep the code modular and understandable so that future changes can be made without rewriting the application.

---

# 17. REQUIRED FINAL DELIVERABLES

Before finishing:

1. Produce the complete source code.
2. Ensure dependencies can be installed.
3. Provide a Windows PowerShell setup procedure.
4. Provide a straightforward way to launch the application.
5. Include an `.env.example`.
6. Include a README documenting installation and configuration.
7. Provide a real demonstration mode.
8. Run available tests.
9. Fix discovered bugs.
10. Explain exactly how to connect a Twitch account.
11. Explain how to configure Discord notifications.
12. Explain how to enable native Twitch clipping safely.
13. Document which integrations were actually tested.
14. Document any remaining limitations.

Create a `PROJECT_STATUS.md` file containing:

- Completed functionality.
- Incomplete functionality.
- Test results.
- Known problems.
- External credentials still required.
- Recommended next improvements.

Create a `RESEARCH_NOTES.md` file containing the architecture decisions, important official API constraints, and sources consulted.

These documents are secondary deliverables. The primary deliverable is working software.

---

# 18. DEFINITION OF SUCCESS

The implementation is successful when I can:

1. Launch the application on Windows.
2. Open the dashboard.
3. Add streamers to a watchlist.
4. Connect Twitch using my own account.
5. Monitor authorized livestream chats in real time.
6. See chat activity updating.
7. Have the application identify significant events.
8. Receive useful notifications.
9. Open a review queue containing detected candidates.
10. Watch actual native clips where available and authorized, or follow accurate source links where clips are not available.
11. Approve, reject, or save moments.
12. Restart the application without losing stored work.
13. Replay example streams to verify the detection system.
14. Understand why every event was flagged.

The application should feel like an actual functioning product, not a proof of concept consisting primarily of mockups.

Start by researching the official API constraints and designing the architecture.

Then proceed immediately to implementation.

Keep going through testing and bug fixing until the deliverable is usable.

At the end, provide a concise report explaining what works, what requires my credentials, how to run it, and what should be improved next.