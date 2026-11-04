# SimpleShare Desktop v0.1.2 — Remember your name and preferences

- Generated Guest names are saved and reused instead of changing at every launch.
- Custom names and basic preferences have a native backup, restored before the website loads.
- Preserve appearance, master mute/volume, sound effects and source-mix levels across restarts.
- Keep the native preference bridge limited to validated public settings; no room tokens or passwords are backed up.
- Flush Chromium storage on close/quit and show a warning if native settings cannot be saved.

## Update

Close both app versions. Extract SimpleShare-Desktop-v0.1.2-Windows-x64.zip completely. Copy your existing **user-data** folder beside the new executable before starting it; that preserves names, favorites and preferences. Keep the entire extracted folder together. Do not publish user-data.

Upload the contents of the accompanying changed-files-only source folder and deploy web 6.2.3. No Worker deployment or TURN/admin secret changes are needed.

Unsigned Windows x64 preview. Automated tests fully restart both source and packaged apps and verify generated/custom names, missing-browser-data recovery and rejection of credential fields. Capture and browser interoperability use local fixtures, not production room traffic.

Tag: desktop-v0.1.2
Title: SimpleShare Desktop v0.1.2 — Remember your name and preferences
Commit: fix: persist desktop identity and user preferences
