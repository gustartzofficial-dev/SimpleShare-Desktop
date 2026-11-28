# Desktop 0.4.0 validation — 2026-11-28

## Windows: passed

- Windows x64 MSVC release build and branded NSIS packaging completed. Installer size: 3,947,122 bytes.
- Seven profile, localization and local-origin unit tests passed.
- Original-key updater verification passed and rejected a modified installer.
- Native Win32/WASAPI fixture passed source previews, application audio (RMS 0.021), and silence checks.
- Extra audio used the application-only picker, returned no video track, and left the main video/audio alive.
- Real WebRTC video continued across compact mode, tray hiding, window resizing and minimize/restore.
- Stop after app restart released both capture tracks and capture locks. Saved name/rooms persisted. Remote shell access was rejected.

## Website: passed

- ESLint, 102 unit tests and production build.
- Chromium and Firefox source add/replace/cancel/remove checks, stable outgoing track and responsive panel.
- WebKit phone check confirms listening controls remain when source capture is unavailable.

## Linux: passed

- Ten Linux Rust tests passed, including application-audio parsing, installer replacement without profile loss, symbolic-link protection, saved preferences and local-origin checks.
- Ubuntu 22.04 x64 AppImage and Debian packaging completed.
- Both the native executable and the packaged AppImage passed real bidirectional video and a data-channel exchange with a browser peer. The browser decoded 5 and 10 Linux frames respectively; Linux decoded the browser video in both runs.
- Native preference IPC, persisted name/room and a compact window below 500px passed for both package paths.
- The pinned Rust RTC adapter supplies the missing peer API. Linux startup initializes media before WebCodecs probes and schedules the adapter's hidden encoder video independently of WebKit presentation callbacks.
- Final artifact workflow: https://github.com/gustartzofficial-dev/SimpleShare-Desktop/actions/runs/46102946982
- AppImage signing and local updater verification use the existing key. See the shipped signatures and INSTALLER_SHA256SUMS.txt.

## Limits

Physical PipeWire portal selection, Wayland compositors and real application-audio servers need distribution/device checks. The initial Linux adapter caps screen encoding at 15 fps; it is a preview, not measured parity with the Windows capture path. Protected games, elevated apps and fullscreen-window replacement remain platform-dependent. No claim of lower RAM use or universal connection reliability is made.
