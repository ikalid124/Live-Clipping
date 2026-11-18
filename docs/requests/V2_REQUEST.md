# STREAM PULSE V2 — TARGETED PRODUCTION UPGRADE

You are continuing development of my existing StreamPulse application.

I have had the current repository independently reviewed. The project already contains a functional Node.js backend, SQLite database, browser dashboard, detection engine, Twitch integration code, notification system, and automated tests.

Your job is NOT to rebuild this application.

Your job is to identify and resolve the weaknesses described below, improve its real-world usefulness, and deliver a reliable livestream highlight discovery system.

My primary use case is identifying entertaining moments from GTA RP and variety livestreams.

I want to monitor streamers without manually watching their broadcasts, receive notifications when something interesting happens, and review the potential clips myself.

## FIRST: INSPECT THE EXISTING CODE

Read the entire relevant project, especially:

- AGENTS.md
- PROJECT_STATUS.md
- README.md
- detector.js
- twitch.js
- server.js
- replay.js
- reactions.json
- public/app.js
- public/style.css
- Existing tests

Understand how these components interact.

Preserve the existing Node.js architecture unless there is a compelling technical reason to change it.

Do not migrate the project to Python or React merely because those technologies appeared in the original specifications.

Preserve existing working features, local data, and user settings.

Create a Git checkpoint before making major changes if the repository supports it.

---

# PRIORITY 1: FIX THE HIGHLIGHT DETECTOR

An independent test discovered a significant detection problem.

Scenario:

100 independent viewers suddenly type "LOL."

Chat activity increases to 10 times normal.

The detector reports:

- 100 unique chatters.
- 10× normal activity.
- Score of 99/99.
- active = false.

This happens because detector.js requires at least three distinct reaction phrases.

THIS IS A HIGH-PRIORITY BUG.

A large number of independent viewers reacting with the same expression should still be recognized as a potential highlight.

Redesign the detection gate.

Instead of fixed rules that require three distinct phrases, use a configurable combination of:

1. Relative chat activity.
2. Unique participating viewers.
3. Reaction intensity.
4. Reaction concentration.
5. Absolute participation.
6. Historical channel activity.
7. Spam likelihood.
8. Repeated-message patterns.
9. Confidence in the current baseline.

Maintain protections against bot spam and single-user flooding.

However, distinguish organic shared reactions from spam.

Examples:

100 independent viewers saying "LOL" may indicate a genuine moment.

One account saying "LOL" 100 times should not receive the same score.

A coordinated bot flood should receive lower confidence when identifiable.

Do not blindly count every repeated message as spam.

Create comprehensive tests demonstrating that these scenarios behave differently.

Also fix any other weaknesses identified during inspection.

---

# PRIORITY 2: IMPROVE GTA RP HIGHLIGHT DETECTION

I primarily want to find moments that might make entertaining short-form videos.

Examples include:

- Funny GTA RP interactions.
- Unexpected police encounters.
- Chaotic pursuits.
- Streamers laughing uncontrollably.
- Surprising betrayals.
- Heated arguments.
- Unexpected plot developments.
- Dramatic reactions.
- Funny conversations.
- Awkward or embarrassing interactions.
- Unexpected failures.
- Moments when chat suddenly explodes.

Expand the existing reaction dictionaries.

Research common Twitch chat reactions and GTA RP terminology.

Avoid relying exclusively on predefined keywords.

Create configurable detection categories.

Allow channel-specific dictionaries and sensitivity settings.

Implement a GTA RP detection profile without forcing every monitored streamer to use it.

Recognize that chat-only detection cannot fully understand quiet dialogue-driven scenes.

Do not pretend otherwise.

Design optional future audio and transcription detectors, but prioritize a strong chat-based detector first.

Do not introduce mandatory paid AI services.

---

# PRIORITY 3: IMPROVE CLIP TIMING AND VIDEO RETRIEVAL

Inspect the timestamping and clipping logic in:

- detector.js
- twitch.js
- server.js

The detector currently estimates event windows, but those estimates are not fully integrated into native Twitch clip selection.

Improve synchronization between:

1. When an event happens on stream.
2. When viewers react.
3. When chat messages reach the application.
4. When the detector triggers.
5. When clipping begins.
6. When the resulting clip becomes available.

Review current Twitch documentation before modifying API calls.

IMPORTANT:

Native Twitch Create Clip captures a limited recent stream window.

It does not automatically guarantee that the published clip includes the entire detected event.

Do not pretend that a candidate's estimated start and end timestamps are exactly represented in the resulting clip.

Preserve the detected event's original timing information.

Where supported and authorized, use official VOD-based clipping to improve timing accuracy.

Store timing uncertainty and clip coverage information.

Add automated tests for delayed reactions and clips that start too late.

---

# PRIORITY 4: MAKE EVERY HIGHLIGHT EASY TO REVIEW

Currently, some candidates are only timestamp bookmarks.

Improve the system so that the user can easily revisit the actual moment.

When possible, provide:

- Native Twitch clip.
- Community-created clip.
- Timestamped VOD link.
- Authorized local recording.
- Source-stream bookmark.

Prioritize actual playable media over bare timestamps.

Implement VOD discovery or backfilling using official Twitch APIs where available.

Track the relevant stream session and its start time.

Calculate VOD offsets carefully.

Never fabricate offsets.

If a VOD is unavailable, expired, or inaccessible, explain that clearly.

Do not allow the interface to imply that a video is available when it is not.

Improve the review interface to display the most useful available media source first.

Make reviewing detected moments fast and convenient.

---

# PRIORITY 5: NOTIFICATION SPEED

Inspect the notification workflow in server.js.

Currently, native capture can delay notifications while the application waits for a clip to become available.

Redesign this behavior.

When a sufficiently strong highlight is detected:

1. Immediately save the candidate.
2. Notify the user promptly.
3. Start clipping asynchronously if enabled and authorized.
4. Update the candidate when the clip becomes available.
5. Optionally send a follow-up notification containing the actual clip.

Never block detection or initial notifications while waiting for video processing.

Avoid duplicate alerts.

Allow the user to configure notification sensitivity.

Include useful context in alerts:

- Streamer.
- Time.
- Highlight score.
- Detection category.
- Chat spike.
- Number of reacting viewers.
- Direct review link.

---

# PRIORITY 6: LIVE TWITCH RELIABILITY

Inspect the existing Twitch implementation.

Focus on:

- OAuth token handling.
- EventSub subscriptions.
- Multiple monitored channels.
- Reconnection behavior.
- Subscription revocation.
- Chat-message validation.
- Duplicate message handling.
- API rate limits.
- Stream status polling.
- Network interruptions.

Investigate whether updating the watchlist unnecessarily disconnects other monitored channels.

Minimize avoidable monitoring gaps.

Ensure one failed channel or API request does not unnecessarily interrupt the others.

Handle malformed or unexpected Twitch events gracefully.

Do not let one unexpected message crash or restart the entire monitoring system.

Add realistic multi-channel simulations.

Provide a diagnostics view showing:

- Authentication status.
- Current monitored channels.
- Subscription state.
- Last received message.
- Last successful API request.
- Current reconnect attempts.
- Error details.

Display a clear warning when a channel is not actually receiving chat.

Do not treat a successful subscription request as proof that the full end-to-end data pipeline has been validated.

---

# PRIORITY 7: SEPARATE DEMO FROM REAL MONITORING

The current application includes automatically seeded demo channels.

Preserve the useful demonstration system.

However, make the distinction between simulated data and real Twitch activity unmistakable.

Implement a clearly labeled Demo Mode.

Allow demo channels to be hidden or disabled.

Ensure real monitoring statistics are not inflated by demo activity.

Distinguish synthetic highlights from actual livestream candidates in the database and UI.

Keep all demonstration functionality available for testing.

---

# PRIORITY 8: MAKE DETECTION EXPLAINABLE

Every detected candidate should explain why it was flagged.

Additionally, provide diagnostics for significant spikes that were NOT flagged.

For example:

"Strong chat spike detected, but rejected because only one user participated."

Or:

"High engagement detected, but raid suppression was active."

This is particularly important because the current detector can calculate a score of 99 and still reject an event.

Record enough aggregated evidence to explain such decisions without retaining excessive raw chat.

Add a diagnostic testing interface or replay report to help identify false negatives.

This will make future algorithm improvements easier.

---

# PRIORITY 9: REVIEW-BASED IMPROVEMENT

The existing feedback system makes small score adjustments based on approvals and rejections.

Improve it without introducing unnecessary complexity.

When I review a highlight, allow me to categorize it as:

- Excellent.
- Good.
- Average.
- Bad.

Preserve the existing approved/rejected workflow.

Track which types of events I consistently prefer.

Use those decisions to improve ranking over time.

Avoid training complex models on tiny datasets.

Allow preferences to be reset.

Make sure candidate rankings remain interpretable.

---

# PRIORITY 10: IMPROVE THE REVIEW EXPERIENCE

The main purpose of StreamPulse is to save me time.

Optimize the dashboard for reviewing potentially entertaining content.

Add or improve:

- Best highlights first.
- Pending review count.
- Filtering by streamer.
- Filtering by detection category.
- Filtering by highlight score.
- Filtering by media availability.
- Efficient navigation between candidates.
- Keyboard shortcuts where useful.
- Persistent review notes.
- Clear indication of actual video availability.

Make the application visually polished, but do not prioritize cosmetic changes over functional improvements.

Ensure buttons and controls actually work.

---

# PRIORITY 11: REALISTIC BENCHMARKING

The existing project contains synthetic replay fixtures.

Preserve them, but expand testing.

Create challenging simulations covering:

- 100 viewers sending the same reaction.
- Hundreds of viewers sending identical emotes.
- Single-user message flooding.
- Multiple coordinated bot accounts.
- A legitimate sudden chat spike.
- Slowly increasing chat activity.
- Large established Twitch channels.
- Small channels with low chat traffic.
- GTA RP dialogue with modest chat activity.
- Raids and sub gifting.
- Two entertaining events close together.
- Delayed chat messages.
- Twitch connection interruptions.
- Duplicate delivery.
- Incorrect or unavailable VOD offsets.
- Failed clip creation.
- Multiple simultaneous streamers.

Measure:

- Detection rate on labeled examples.
- False-positive rate.
- False-negative rate.
- Detection latency.
- Duplicate event frequency.
- Resource consumption.

Keep synthetic metrics separate from real-world performance.

Do not claim the algorithm is highly accurate without real labeled testing.

---

# PRIORITY 12: TEST THE COMPLETE APPLICATION

After implementing improvements:

1. Run the existing test suite.
2. Fix failures.
3. Add targeted regression tests.
4. Run replay simulations.
5. Run browser checks on Windows when available.
6. Test database persistence.
7. Test notification behavior.
8. Test clipping error recovery.
9. Verify that the dashboard launches.
10. Verify that the review queue works.
11. Inspect logs for recurring errors.
12. Retest after fixing problems.

When Twitch credentials are unavailable, clearly explain which live functionality cannot be tested.

Do not invent successful live tests.

When authorized credentials are available, run a real end-to-end monitoring test using a live channel.

Keep native clip publishing disabled until I explicitly opt in.

---

# EXECUTION INSTRUCTIONS

Work autonomously.

First inspect the existing code and create a prioritized repair plan.

Then implement the repairs.

Do not stop after producing the plan.

Follow:

INSPECT → REPRODUCE → FIX → TEST → VERIFY → IMPROVE.

Complete the most important tasks before optional enhancements.

Preserve the existing project.

Do not unnecessarily rewrite the backend or frontend.

Do not introduce expensive AI dependencies.

Do not replace real features with simulated functionality.

Do not claim success without verification.

Use the available execution budget productively.

Continue until the major issues are fixed and all available automated checks pass, or a genuine external blocker prevents further progress.

Do not ask routine implementation questions.

Document external requirements instead of abandoning the task.

---

# FINAL DELIVERABLES

Update:

- PROJECT_STATUS.md
- README.md
- RESEARCH_NOTES.md

Create:

- V2_AUDIT.md
- V2_TEST_RESULTS.md

Explain:

1. Which bugs were discovered.
2. Which bugs were fixed.
3. How detection improved.
4. Whether the 100-viewer LOL test now passes.
5. Whether actual Twitch monitoring was verified.
6. Whether actual clip creation was verified.
7. Which features still require account setup.
8. How to launch the updated application.
9. Which improvements would have the greatest impact next.

Do not overwrite or delete my existing review data.

The final application should focus on one outcome:

Automatically discover entertaining livestream moments, preserve the best available source footage, and let me quickly review and select the moments worth editing.

BEGIN BY INSPECTING THE CURRENT REPOSITORY AND REPRODUCING THE DETECTION BUGS.

THEN IMPLEMENT, TEST, AND VERIFY THE IMPROVEMENTS.