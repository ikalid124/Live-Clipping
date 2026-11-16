# StreamPulse

A local livestream highlight desk for Windows. The demo works immediately and sends simulated chat through the same detector as Twitch. The first launch seeds three channels and their detected bookmarks. More chat arrives every five seconds.

## Launch on Windows

Install Node.js 22.17 or later with built-in SQLite and WebSocket support. This project has zero third-party runtime dependencies. [Node.js downloads](https://nodejs.org/en/download)

Open PowerShell in the project directory and run

```powershell
node --version
node --env-file-if-exists=.env server.js
```

Open **http://localhost:8765**. Keep the terminal running. Ctrl+C stops the server. The PowerShell launcher `./Start-StreamPulse.ps1` and `npm.cmd start` invoke the same entry point. Node 22 may print an experimental SQLite warning on startup.

## Try one review

Open **Review queue**, select a candidate and inspect its reaction category, spike multiplier, unique chatters and estimated video window. Add a note and choose **Approve**. Filter the queue by **Approved**. Restart the server to see the decision again. The score measures heuristic evidence on a 0–99 scale. Each channel's existing approvals and rejections shift future scores by up to five points.

In **Watchlist**, add a demo channel or pause fixtures individually. Channel thresholds override the global setting. A smaller threshold increases sensitivity. The timing field shifts the estimated video window earlier by the configured delay. The chart shows actual five-second message counts and the learned baseline. Open a demo bookmark to play the bundled six-second arcade rally. All simulated candidates share this labeled sample footage.

## Connect your Twitch account

1. Register an application under your own developer account. Enable Twitch two-factor authentication. Choose a confidential client type where offered. Add the exact redirect URL `http://localhost:8765/oauth/callback`. Generate a client secret under **Manage**. [Developer console](https://dev.twitch.tv/console/apps) · [Registration guide](https://dev.twitch.tv/docs/authentication/register-app/)
2. Copy the example once and fill in `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. For this OneDrive workspace you can instead set those variables in the launch environment to keep your credentials outside the synced project folder.
3. Restart StreamPulse. Select **Settings → Connect Twitch**, then sign in and approve **user:read:chat**. The authorization code is exchanged by the local server. Windows DPAPI protects access and refresh tokens under the current Windows user.
4. In **Watchlist**, enter a username or Twitch URL and choose **Twitch → Add channel**. Partial names work with **Search Twitch**. Select a result and add it. Check the channel details for subscription status. Live status is polled roughly every 30 seconds. A fresh detector warms up for six five-second intervals.
5. Watch **Live activity** on a live channel with active chat. To revoke account access use Twitch account settings under Connections. Reconnect in StreamPulse after changing scopes or recovering revoked access.

```powershell
Copy-Item .env.example .env
notepad .env
```

The signed-in user and broadcaster are distinct identities. The server supplies both IDs when subscribing to EventSub. Twitch can deny an individual subscription. The local client uses two subscriptions per watched channel for chat messages and raid notices. [Twitch chat authorization](https://dev.twitch.tv/docs/chat/authenticating)

## Notifications

- **Browser** — Open Settings, select desktop alerts, save, and allow notifications in your browser. Keep a dashboard tab open. Your OS notification settings apply.
- **Discord** — Create a webhook in the intended Discord channel's integration settings, copy its URL to `DISCORD_WEBHOOK_URL`, restart StreamPulse, and enable Discord alerts in Settings. Alerts include the score, spike, reason, channel, time and candidate URL. A confirmed automatic native clip adds its Twitch URL. The localhost dashboard link opens on the machine running StreamPulse. A failed send is recorded under Settings. Demo channels also generate alerts when enabled.
- Set the minimum notification score independently of the detection threshold. Adjacent active windows merge for the configured interval. A merged window keeps its original notification.

## Clip modes

**Bookmark** is the default. It records evidence and source information immediately. Community clip matching runs for recent Twitch events. An available archive offset gives a stronger time match. When Twitch returns a null offset, the dashboard labels the association approximate. A community clip opens on Twitch.

**Native Twitch** can publish to Twitch before review. To opt in, set `TWITCH_CLIP_SCOPE=clips:edit`, restart and reconnect Twitch, then choose **native** on a specific Twitch channel and confirm. A detection starts an official live clip request. StreamPulse checks the returned clip ID for up to 60 seconds. The dashboard reports pending, verified, or capture error. Switch that channel back to bookmark to stop automatic creation. Twitch determines eligibility and the captured footage. [Twitch Clips API](https://dev.twitch.tv/docs/api/reference/clips)

**VOD clips** are created manually from a Twitch candidate. Add `channel:manage:clips` for your own channel or `editor:manage:clips` for a channel you edit to the space-separated `TWITCH_CLIP_SCOPE`. Restart and reconnect. Supply a verified VOD ID and the desired **end** offset in seconds, at least 30. Confirm publication. The request creates a 30-second clip ending at that offset. The endpoint enforces the broadcaster/editor relationship. [Create Clip From VOD](https://dev.twitch.tv/docs/api/reference/clips/#create-clip-from-vod)

**Authorized local recording** associates an existing segment with a candidate. Copy an owned or permitted MP4 or WebM into `%LOCALAPPDATA%\StreamPulse\media`, switch the channel to **local**, then open the candidate and enter the filename. Confirm permission and attach. The local player serves that file. Recording and trimming happen in your recording software.

## Data and configuration

SQLite, the protected token vault and the media directory live in `%LOCALAPPDATA%\StreamPulse`. Override this directory with `STREAMPULSE_DATA` before launch for a separate workspace. Stop the server before backing up the directory. The token vault is tied to the Windows user. The app listens on IPv4 loopback. The registered OAuth callback uses port 8765.

Settings retain activity summaries and connection errors for 1–90 days. Review decisions, candidates, clip metadata and sessions persist. Raw chat is processed in bounded memory. Edit `reactions.json` to tune keyword and emote categories and restart. User-supplied reaction words are matched literally.

## Reproduce validation

```powershell
node --test
node replay.js
node replay.js --speed=20
node scripts/browser-check.js
```

Replay defaults to maximum speed. A positive factor controls time compression. To replay a single channel's own JSONL, use `node replay.js path/to/chat.jsonl --speed=10`. Each row contains a unique message ID, UTC epoch milliseconds, pseudonymous user ID and text. Use one file per channel.

```json
{"id":"msg-1","time":1780000000000,"user":"viewer-17","text":"clip that","emotes":[]}
```

The browser check launches a temporary server on port 18765 and uses a fresh Chrome or Edge profile. Set `CHROME_PATH` for a nonstandard installation. See [project status](PROJECT_STATUS.md) for verified results, remaining limitations and run history. The full original requirements are preserved in [the project brief](PROJECT_BRIEF.md).


