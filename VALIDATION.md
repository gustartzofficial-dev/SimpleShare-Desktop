# Desktop 0.4.0 validation — 2026-11-27

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

## Linux: final media verification pending

The initial native WebKit runtime exposed no RTCPeerConnection. A pinned Linux-only Rust WebRTC plugin now supplies that API. The final workflow requires bidirectional video and a data channel with a real browser peer, persistent native preferences, and a compact window below 500px. Packages must not be marked ready until that job passes.

## Limits

Physical PipeWire portal selection, Wayland compositors and real application-audio servers need distribution/device checks. The initial Linux adapter caps screen encoding at 15 fps; it is a preview, not measured parity with the Windows capture path. Protected games, elevated apps and fullscreen-window replacement remain platform-dependent. No claim of lower RAM use or universal connection reliability is made.
