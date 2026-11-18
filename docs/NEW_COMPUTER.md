# Continue on another computer

This repository contains the application code, tests, demo media, original development requests, research, dated status reports and available user/assistant project conversation. Git preserves the original checkpoint and subsequent changes.

## Download and run

Install Git and Node.js 22.17 or later, then run in PowerShell:

```powershell
git clone https://github.com/ikalid124/Live-Clipping.git
cd Live-Clipping
node --env-file-if-exists=.env server.js
```

Open http://localhost:8765. Open the cloned folder in Codex using the desired account and paste:

> Read AGENTS.md, PROJECT_STATUS.md, V4_PROGRESS_REPORT.md, LIVE_TEST_REPORT.md and README.md first. Review docs/CONVERSATION_HISTORY.md and docs/requests/ for historical requirements. Continue StreamPulse from the recorded state. Verify the outstanding IPv4 launcher check before claiming it passes. Update PROJECT_STATUS.md at the end of every run and keep secrets out of Git.

## What needs separate setup

The repository does not contain Twitch credentials, OAuth tokens, Discord webhooks, private chat captures, saved runtime databases or user media. Configure Twitch credentials locally in Settings and reconnect Twitch. Windows-encrypted tokens from another computer/user cannot be relied on there. Discord requires a locally configured webhook; browser notifications require permission.

To retain existing saved candidates, reviews and media, stop StreamPulse on both computers and privately copy the application's data from the old user's `%LOCALAPPDATA%\StreamPulse` folder. Back up any existing destination data first. Do not upload that folder to this public repository. Reconnect Twitch on the new computer.

The earlier Desktop copy is a separate local checkout; it will not automatically track future changes here. Use the GitHub clone for continued work on the new computer.

## Verification and limitations

V4 recorded 24 passing automated tests, a passing browser workflow and three natural candidates with timestamped VOD links. Those results belong to the recorded Windows environment, not to a fresh clone. Run `node --test` and `node replay.js` to check the new environment. The browser test requires local Chrome and the optional test tooling described by its script. See the status reports for unresolved notification delivery, launcher validation and field accuracy work.
