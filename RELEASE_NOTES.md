# SimpleShare Desktop v0.1.1 — Capture and connection fixes

- Choose a source in a smaller window over your room.
- Share a display with sound from one selected application's process tree. Useful when exclusive-fullscreen games recreate their window. The whole selected display is visible.
- Keep video running if native audio initialization fails; show a persistent warning.
- Keep important capture/media warnings and local connection diagnostics available in preferences.
- Web 6.2.1 separates publishing and receiving recovery, and prevents delayed events from an old capture stopping a replacement.

## Install this update

1. Upload the contents of the accompanying changed-files-only folder to the repository root. Keep the desktop/ and other directory structure intact.
2. Redeploy the frontend from that commit. No Worker deployment or TURN/admin secret change is required.
3. Extract the Windows x64 ZIP completely, then open SimpleShare Desktop.exe. Keep all extracted files together. To retain favorites, copy your existing user-data folder beside the new executable while both versions are closed. Do not publish user-data.
4. Refresh existing web clients and restart desktop clients. For Zenless in exclusive fullscreen, select Displays and choose the game under Application sound for this display.

Unsigned Windows preview. Native capture, scoped audio isolation, compact mode and cleanup have been verified against local fixtures; Zenless itself has not been tested locally. This is not a promise that every exclusive/protected game surface is capturable.

Suggested GitHub tag: desktop-v0.1.1
Suggested release title: SimpleShare Desktop v0.1.1 — Capture and connection fixes
Suggested commit: fix: isolate media recovery and improve desktop game sharing
