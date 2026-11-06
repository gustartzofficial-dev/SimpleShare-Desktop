# SimpleShare Desktop

Simple screen sharing, with a desktop home. **Version 0.2.1** is the Windows x64 client built with **Rust and Tauri 2**. It continues the desktop migration introduced in v0.2.0.

The app uses the [live SimpleShare website](https://simple-share-hazel.vercel.app) for rooms and streaming connections. Its desktop shell, window/display selection, screen acquisition, application audio, profile storage, tray integration, and updater are implemented locally. No separate browser window is launched.

## Desktop features

- An integrated window with a collapsible **Your places** sidebar, named favorite rooms, and recent rooms.
- A small app-owned sharing selector with native window/display thumbnails and a refresh control. **Windows Graphics Capture acquires the picture directly from Rust**; the desktop client does not use browser screen acquisition or the browser screen picker.
- Direct3D GPU scaling to the selected stream size before readback, with two shared frame buffers and acknowledgements to prevent an unlimited frame queue.
- Native **WASAPI application-loopback audio**, including the selected process and its child processes. Choose the audio application independently from the picture. The live room's secondary audio controls remain available.
- Compact mode with your own preview, the people sharing, and quick controls. The same room and capture remain active when switching views.
- Per-user installation, persistent AppData storage, single-instance behavior, system tray controls, and signed GitHub updates.

Desktop notices stay visible above the room, and the collapsible sidebar owns its expand/collapse control. Capture requests borderless mode through Windows; Windows may retain its indicator when permission is denied or another app requires it.

## Install

Download `SimpleShare_0.2.1_x64-setup.exe` from [Releases](https://github.com/gustartzofficial-dev/SimpleShare-Desktop/releases). Run the installer, then open SimpleShare from the Start menu. The installer can install the Microsoft Edge WebView2 runtime when it is missing.

Windows 11 x64 is the recommended platform. Native process-loopback audio requires Windows build 20348 or newer. Protected video, anti-cheat restrictions, exclusive-fullscreen transitions, and applications running with higher privileges can affect capture. Borderless mode can help with games that recreate their rendering window.

The installer does not include a Windows publisher certificate. Windows may identify it as an unsigned publisher. Update signatures are a separate mechanism: the app verifies downloaded releases against its embedded public key.

## Saved data and Electron migration

Profiles are stored in **`%APPDATA%\dev.simpleshare.desktop\`**, outside the application directory:

- `profile.json`: display name, safe room preferences, favorites, recent rooms, and desktop preferences.
- `webview\`: the persistent WebView2 website profile.

Keep the application identifier `dev.simpleshare.desktop` unchanged in future builds. Reinstalling or changing build folders uses the same profile. Leave the uninstaller's option to remove application data unchecked when you want to retain it. The app opens the profile folder from Desktop preferences. A malformed JSON profile is preserved as `profile-invalid-<id>.json` before a fresh profile is created.

To migrate from Electron, close the old application, open **Desktop preferences → Import old profile**, and choose the old `user-data/desktop.json`. Favorites and supported preferences, including the saved name, are imported. This does not copy browser credentials or all browser storage. Keep the old portable folder until the import has been checked, then stop using the Electron client. Electron 0.1.x cannot install Tauri updates automatically; this first installer must be installed manually.

## Updates

Automatic checks are enabled by default. The app checks the public repository at startup and periodically, downloads a signed installer while idle, verifies its signature, and applies it outside a room. In-room activity defers installation. Desktop preferences also provides manual check/install controls and an automatic-update toggle.

Repository: **[gustartzofficial-dev/SimpleShare-Desktop](https://github.com/gustartzofficial-dev/SimpleShare-Desktop)**.

Update endpoint: `https://github.com/gustartzofficial-dev/SimpleShare-Desktop/releases/latest/download/latest.json`.

The repository owner must complete [UPDATER_SETUP.md](UPDATER_SETUP.md) before publishing. Every release needs the installer, its `.sig`, and `latest.json`. The private signing key must never be committed or attached to a release. Keep the original key for future versions; changing the embedded key prevents existing clients from accepting those updates.

## Build on Windows

Install Node.js 24 LTS, stable Rust with the `x86_64-pc-windows-msvc` target, Microsoft Visual Studio C++ build tools with a Windows SDK, and WebView2. Then:

```powershell
npm ci
npm run check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri -- dev
```

Create a signed installer:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = 'C:\private\simpleshare-updater.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis --ci
```

Normal build output is under `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. `scripts/env.ps1` supports this workspace's optional local toolchain and redirects output to `.local/target/`; it is not a prerequisite for a normal developer installation.

The GitHub workflow in `.github/workflows/release.yml` builds and signs a **draft** release when run manually. The owner reviews and publishes it. Increase the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` for each release; update the lockfiles as needed.

## Architecture and limits

The pinned live website receives a narrow native bridge. Native code validates the calling webview and origin. Only the local shell can manage desktop preferences, navigation, or installation. The live website cannot access arbitrary files or launch arbitrary commands. Source grants come from the local picker and are revalidated before capture.

Video acquisition and GPU scaling run in Rust through Windows Graphics Capture and Direct3D. Read-only shared memory carries bounded frames to a generated video track for the website's WebRTC transport. Audio runs in a separate Rust WASAPI helper with startup timeout, bounded packets, and parent-process lifetime handling. No whole-system audio fallback is used.

**Tauri on Windows still uses WebView2, which is Chromium-based, to render the live website and run its existing WebRTC connection.** Rust replaces Electron's Node main process and the acquisition path. This is not a fully native room UI or a Rust WebRTC implementation. Lower total RAM use and better game performance are not guaranteed without measurements on the target systems.

An internet connection and the existing SimpleShare backend are required. TURN, SFU, and account secrets belong on the server; none should be embedded in this application. The website/Worker sources are maintained separately and are not changed by uploading this desktop repository.

## Validation and licensing

See [VALIDATION.md](VALIDATION.md) for performed checks and remaining real-world checks, and [RELEASE_NOTES.md](RELEASE_NOTES.md) for this release. Source follows the original CC0 license. Third-party dependencies and the Geist font retain their licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
