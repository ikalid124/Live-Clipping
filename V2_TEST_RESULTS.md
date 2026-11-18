# StreamPulse V2 validation

Tested on Windows with Node 22.17.1. The original detector returned inactive at 99/99 for 100 distinct viewers sending “LOL.” against a baseline of ten. V2 accepts that event at 99/99.

| Check | Observed result |
| --- | --- |
| `node --test` | 21 passed, zero failed or skipped. Includes Windows DPAPI, token refresh with synthetic credentials, reconnect and duplicate delivery, multiple channel subscriptions, malformed messages, incremental watchlist changes, database persistence, archive bounds, clip failure and prompt initial alerts. |
| `node scripts/browser-check.js` | Passed in Chrome. Verified chart, playable demo, approval with quality rating and note, decision filtering, an empty real monitoring queue, return to demo, channel addition and saved settings. |
| `node replay.js` | Six labeled moments across three traffic profiles. Each produced two candidates and merged two adjacent detection windows. Zero extra candidates. Labels align with sample boundaries. |
| `node benchmark.js` | Thirteen synthetic scenarios. Six of seven labeled moments detected (85.7%), one missed (14.3%), zero false positives across six negatives, zero extra triggers in the subsequent quiet sample. |
| Synthetic latency and resources | Five detected scenarios triggered 4 seconds after burst onset. The delayed batch triggered at 12 seconds. A Windows run sampled 43 MiB peak process RSS at scenario boundaries, 156 ms CPU and 92 ms wall time. These figures cover the benchmark process only. |
| Production database check | Snapshotted SQLite before restarting. The dashboard then reported 84 demo candidates, zero Twitch candidates and zero recent errors. Compared existing candidate IDs, decisions, notes, review history, settings and saved channel configuration with the snapshot. Zero missing or changed rows in those comparisons. |

Independent “LOL.” and 450 matching emotes scored 99. One account flooding the channel scored 0. Eighteen accounts repeatedly copying the same text scored 45. A varied vocabulary-free surge and a small GTA RP betrayal reaction qualified. The missed positive was the deliberately quiet dialogue scene. Raid and gifting scenarios produced no candidate. A separate production-sampler test separated two nearby surges after chat returned to baseline.

The running service reported no configured Twitch client and no authenticated channels. All Twitch calls in integration tests used fixtures. No actual Twitch monitoring, clip publication, Discord delivery or OS notification display was verified. Native publication requires per-channel opt-in. The next field test is an authorized GTA RP channel in bookmark mode with reviewer-labeled moments and measured VOD timing errors.
