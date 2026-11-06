# SimpleShare Desktop v0.2.0 — Native Windows capture

This release replaces the Electron desktop client with Rust/Tauri and a Windows installer.

- Native Windows Graphics Capture for windows and displays, with an app-owned sharing selector. The room stays visible behind a separate, compact selector window.
- GPU scaling and bounded shared frame buffers; browser screen acquisition is no longer used by the desktop sharing flow.
- Native application audio, with the sound source selected independently from the shared picture.
- A collapsible Your places sidebar, favorite rooms, recent rooms, compact mode with stream preview, and tray controls.
- Persistent names and preferences in AppData, plus import of the old Electron `desktop.json` profile.
- Signed GitHub updates, automatic checks, and installation deferred while in a room.
- Profile recovery and capture-worker lifetime safeguards.

**Install:** download and run `SimpleShare_0.2.0_x64-setup.exe`. Existing Electron 0.1.x users must install this version manually. Back up the old profile, import it in Desktop preferences, and then stop using the Electron client.

Windows 11 x64 is recommended. Application audio requires Windows build 20348 or newer. The app still uses WebView2 to render the live website and run its existing WebRTC transport. Game capture varies with fullscreen mode, anti-cheat protection, graphics drivers, and permissions; broader multiplayer and game testing is still required. The installer has an unsigned Windows publisher; update payloads are separately signed and verified.

The first public release and a cross-version update cannot be verified until the repository owner publishes the release assets and completes the signing-secret setup. See `UPDATER_SETUP.md` and `VALIDATION.md`.
