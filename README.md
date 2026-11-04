# SimpleShare Desktop 0.1.2 — Windows preview

The live SimpleShare website, with a native home around it. Rooms, participants, viewing, quotas and media publication still come from https://simple-share-hazel.vercel.app. This project is separate from the website; no frontend or Worker deployment is needed to use the desktop app.

## Saved identity and preferences

Generated Guest names are saved once and reused. Custom names, appearance, master mute/volume, sound effects and audio-mix levels have a validated native backup in user-data/desktop.json as well as the website's local storage. The backup is restored before the website initializes. Room membership tokens and passwords are not included. Favorites and desktop preferences remain in the same profile.

The portable profile stays beside the executable. Updating or moving the app into another directory requires keeping/copying the existing **user-data** folder beside the new executable while both versions are closed. A new empty profile is a new identity. Extract the full ZIP; do not run an executable directly from an archive's temporary preview.

The desktop preload persists the initial name even with the older live frontend, imports existing saved preferences, and observes committed name changes. Deploy web 6.2.3 too for immediate native writes of the public preferences and stable generated names in ordinary browsers. Unavailable browser storage can fall back to the native preference cache. A failed native save is reported visibly instead of silently claiming success.

## Open the app

Extract the portable Windows ZIP in `release/`, keep the extracted folder together, and open **SimpleShare Desktop.exe**. You do not need Node.js to run the portable build. This build is an unsigned Windows x64 preview, so it has no verified publisher signature or automatic updater.

## What is implemented

- A frameless window with integrated SimpleShare branding, drag area and window buttons. Desktop-only CSS removes the duplicate web header while preserving the live room controls.
- Saved rooms with personal names, a recent-room list and a star for the current room. Invites and direct-mode links retain their room identity. Clicking the room you already have open does not reload it or stop capture.
- A dedicated **compact companion**, not a shrunken website: current streamers, your local screen preview, Open room, Go live and Stop sharing. Switching modes retains the same web contents and media session. Compact mode can stay on top, and its controls fit small windows with up to ten streamers.
- A smaller, separate source-picker window over the room. The room remains visible and active while choosing. Applications and displays have thumbnails, explicit selection, cancel, and source/PID revalidation.
- **Windows application audio** captured from the selected process and its descendants using WASAPI, through an isolated native utility process. PCM is delivered at 48 kHz, signed 16-bit stereo to a bounded AudioWorklet buffer, then passed into the live website's normal audio mixer and stream.
- Quality presets for the next share: 720p/30, 720p/60, 1080p/60. Actual resolution, FPS, video bitrate and network quality still depend on the live site and source.
- A tray menu and optional close-to-tray behavior. Active capture/viewing prevents automatic app suspension; no display-sleep blocker is used. Closing to the tray keeps the current room running.
- Persistent local preferences, optional last-room reopening, offline/error recovery, and source cleanup on stop, navigation or app exit.

## Application audio

Click the website's **Share screen** or compact mode's **Go live**. Select an application, check **Include application sound**, then confirm. The website's source-audio option must also be enabled. No microphone permission is granted, and there is no silent fallback to full-system audio.

The audio scope is the application's **process tree**, not necessarily one tab or one window. Selecting a browser can include other tabs in that browser. Shared shell/host processes, such as Explorer, terminals and UWP ApplicationFrameHost, are not offered for process-tree audio because they may own unrelated applications. Such windows can still be shared as video.

For an exclusive-fullscreen game, use **Displays**, choose the display showing the game, then select the game under **Application sound for this display**. Only that application's process tree is captured for sound; other desktop audio is excluded. The picture includes the entire selected display, so notifications and other windows on it are visible. Window capture can end when a game destroys/recreates its fullscreen surface; selecting a display avoids depending on that window's identity, but does not guarantee support for every protected or exclusive game.

The live room's **Settings → Audio sources** can still add or replace a second application source. Its picture is not published. Up to two steady audio sources plus one temporary replacement are supported.

**Deploy the accompanying web 6.2.1 frontend patch before using display + application audio.** It recognizes the desktop adapter's exact captured stream as application-scoped while continuing to reject browser-provided whole-system audio. The same patch separates publishing from receiving, so a publication timeout/recovery does not rebuild watched streams. No Worker secret or TURN setting needs changing for this update.

Scoped audio requires Windows x64, build 20348 or later. This build is tested on Windows 11. Protected/DRM media, exclusive fullscreen games, minimized windows and applications routing sound through unrelated services may not capture normally. There is no claim of universal game support or Discord quality parity. The live site's encoder/bitrate limits and existing SFU/TURN transport remain in effect.

## Compact mode

Use the square compact button in the title bar, or **Toggle compact mode** in the tray. The app keeps the live room loaded with background throttling disabled; it does not join again, republish or start another stream. The local preview is a small JPEG sampled about three times a second for low overhead, not a second high-quality network stream. **Open room** returns to the full app. **Stop sharing** releases the source and native audio helper.

## Saved data and updates

The portable app keeps `user-data/` beside the executable. It contains favorites, preferences and the isolated Chromium profile used by the live site. Keep that folder when updating the portable app. Do not upload or share it. Development builds use `.local/user-data/` instead. Desktop preferences do not read your regular browser profile.

Web updates arrive through the live site. Native desktop updates currently require replacing the portable app files while retaining `user-data/`. The public site origin is pinned in `src/lib/policy.cjs`; changing domains requires a deliberate rebuild. Favorites accept only that origin and valid room links.

## Develop and build

Use Node.js 22.12+ (Node 24 recommended), Windows x64 and npm. The native dependencies include prebuilt N-API binaries; a C++ toolchain is not needed for the supplied portable build.

```powershell
Set-Location -LiteralPath "E:\SimpleShare-Major Update\desktop"
$env:electron_config_cache = "$PWD\.local\electron-cache"
$env:npm_config_cache = "$PWD\.local\npm-cache"
npm ci
npm start
```

```powershell
npm run check          # source syntax and policy/storage regressions
npm run test:desktop   # real native capture and process-isolation fixture
npm run test:live      # real website load; no production room is joined
npm run test:persistence # full restarts, names and preference recovery
npm run package        # portable Windows x64 folder in release/
```

The persistence test exercises shared public/lib modules and requires the full repository checkout, supplied in the full source archive.

The native integration fixture briefly plays two quiet generated tones in separate Electron processes. It verifies selected-process audio is present, unrelated-process sound is absent, compact preview is live, favorites are stable, and capture ends cleanly. It does not send media to production.

## Architecture and security

The local window owns favorites and native controls. A separate `WebContentsView` loads the live site with sandboxing and context isolation enabled and Node integration disabled. IPC validates the sender frame and exact origin; the remote page cannot read files, execute commands or choose arbitrary process IDs. Capture requires an explicit user gesture and confirmation in the local picker. Granted sources are rechecked before native audio starts. Utility-process failures stop that audio source instead of silently widening capture.

The desktop media adapter uses a narrow, documented DOM/API contract with the current live app. It does not fork or replace the site's application bundle, bypass usage limits or change the backend. Major web DOM changes may require a desktop adapter update. If native audio initialization fails, video can continue with a persistent warning; no system or microphone fallback is enabled. Windows capture mute/unmute is logged without stopping the share. An ended source requires a new explicit selection.

See `VALIDATION.md` for the actual checks and `THIRD_PARTY_NOTICES.md` for dependency licenses. Original SimpleShare code/assets and new desktop source follow the included CC0 license; third-party components retain their own licenses.

## Web 6.2.2 compatibility update

Desktop 0.1.1 uses this update automatically after the live frontend is deployed; restart the desktop app. No replacement executable is required. Browser viewers also need to refresh. Audio metadata updates preserve video; replacement video prepares before switching, and listening settings survive handoffs.

The source adds an optional local interoperability check:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\SimpleShare-Major Update\.local\browsers"
npx playwright install chromium
npm run test:interop
```

Run those commands from the desktop folder. This captures the approved local test window and application audio, then sends it over local WebRTC to a separate headless Chromium browser. It does not publish a production room. Interop mode focuses on media and omits the independent Windows always-on-top assertion; the regular test:desktop suite retains it.

## Diagnostics and fullscreen failures

Desktop preferences → **Open connection diagnostics** opens the local user-data/diagnostics.json report. It retains up to 200 recent startup, source selection, capture pause/resume/end and media/ICE log events. URLs and credential-like fields are redacted; it does not record video/audio frames, SDP or TURN credentials. Messages can still include display names and media-session identifiers. Review before sharing. Important room/TURN/capture messages remain visible in the sidebar until dismissed. A publication timeout is no longer presented as proof of a TURN configuration failure.

The capture/isolation tests use local Windows fixtures, including fullscreen transitions. Zenless Zone Zero itself has not been tested on this machine. Borderless mode may be another useful option when Windows cannot capture an exclusive surface.

## Distribution

The clean source archive excludes `node_modules/`, `.local/`, runtime profiles and generated binaries. The portable archive includes Electron and production dependencies. Neither contains Cloudflare keys or admin passwords. This desktop addition does not replace your existing web-only update folders.

Suggested commit: `fix: persist desktop identity and user preferences`
