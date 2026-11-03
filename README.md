# SimpleShare Desktop — Windows preview

The live SimpleShare website, with a native home around it. Rooms, participants, viewing, quotas and media publication still come from https://simple-share-hazel.vercel.app. This project is separate from the website; no frontend or Worker deployment is needed to use the desktop app.

## Open the app

Extract the portable Windows ZIP in `release/`, keep the extracted folder together, and open **SimpleShare Desktop.exe**. You do not need Node.js to run the portable build. This first build is an unsigned Windows x64 preview, so it has no verified publisher signature or automatic updater.

## What is implemented

- A frameless window with integrated SimpleShare branding, drag area and window buttons. Desktop-only CSS removes the duplicate web header while preserving the live room controls.
- Saved rooms with personal names, a recent-room list and a star for the current room. Invites and direct-mode links retain their room identity. Clicking the room you already have open does not reload it or stop capture.
- A dedicated **compact companion**, not a shrunken website: current streamers, your local screen preview, Open room, Go live and Stop sharing. Switching modes retains the same web contents and media session. Compact mode can stay on top, and its controls fit small windows with up to ten streamers.
- An integrated desktop source picker with application/display thumbnails, explicit selection, cancel, and revalidation if a source changes or closes.
- **Windows application audio** captured from the selected process and its descendants using WASAPI, through an isolated native utility process. PCM is delivered at 48 kHz, signed 16-bit stereo to a bounded AudioWorklet buffer, then passed into the live website's normal audio mixer and stream.
- Quality presets for the next share: 720p/30, 720p/60, 1080p/60. Actual resolution, FPS, video bitrate and network quality still depend on the live site and source.
- A tray menu and optional close-to-tray behavior. Active capture/viewing prevents automatic app suspension; no display-sleep blocker is used. Closing to the tray keeps the current room running.
- Persistent local preferences, optional last-room reopening, offline/error recovery, and source cleanup on stop, navigation or app exit.

## Application audio

Click the website's **Share screen** or compact mode's **Go live**. Select an application, check **Include application sound**, then confirm. The website's source-audio option must also be enabled. No microphone permission is granted, and there is no silent fallback to full-system audio.

The audio scope is the application's **process tree**, not necessarily one tab or one window. Selecting a browser can include other tabs in that browser. Shared shell/host processes, such as Explorer, terminals and UWP ApplicationFrameHost, are not offered for process-tree audio because they may own unrelated applications. Such windows can still be shared as video.

Display selections are video-only. To combine a whole display with a specific application's sound, share the display with source audio enabled, then use the live room's **Settings → Audio sources** to add the application as the second source. The second source uses the same native application picker; its picture is not published. Up to two steady audio sources plus one temporary replacement are supported.

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
npm run package        # portable Windows x64 folder in release/
```

The native integration fixture briefly plays two quiet generated tones in separate Electron processes. It verifies selected-process audio is present, unrelated-process sound is absent, compact preview is live, favorites are stable, and capture ends cleanly. It does not send media to production.

## Architecture and security

The local window owns favorites and native controls. A separate `WebContentsView` loads the live site with sandboxing and context isolation enabled and Node integration disabled. IPC validates the sender frame and exact origin; the remote page cannot read files, execute commands or choose arbitrary process IDs. Capture requires an explicit user gesture and confirmation in the local picker. Granted sources are rechecked before native audio starts. Utility-process failures stop that audio source instead of silently widening capture.

The desktop media adapter uses a narrow, versioned DOM/API contract with the current live app. It does not fork or replace the site's application bundle, bypass usage limits or change the backend. Major web DOM changes may require a desktop adapter update. If capture cannot initialize, the attempt ends with an error rather than enabling system or microphone audio.

See `VALIDATION.md` for the actual checks and `THIRD_PARTY_NOTICES.md` for dependency licenses. Original SimpleShare code/assets and new desktop source follow the included CC0 license; third-party components retain their own licenses.

## Distribution

The clean source archive excludes `node_modules/`, `.local/`, runtime profiles and generated binaries. The portable archive includes Electron and production dependencies. Neither contains Cloudflare keys or admin passwords. This desktop addition does not replace your existing web-only update folders.

Suggested commit: `feat: add SimpleShare desktop companion with native application audio`
