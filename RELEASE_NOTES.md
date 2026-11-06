# SimpleShare Desktop v0.2.1 — Clearer sharing controls

- Fixed desktop notifications being covered by the room when the sidebar was collapsed. Notices now appear above the visible room, and remain available in compact mode and preferences.
- Centered the collapsed new-room (+) button.
- Moved the collapse/expand control into the Your places sidebar, with matching labels and tooltips.
- Added native image previews for windows and displays in the sharing selector, with lazy loading, a refresh button, and an explicit unavailable state for sources that cannot supply a preview.
- Requested Windows borderless capture for screen sharing and previews. Windows may retain its indicator if permission is denied or another application requires it.

Install `SimpleShare_0.2.1_x64-setup.exe`, or publish the signed installer, its `.sig`, and `latest.json` for existing Tauri users to receive the update. Keep the existing updater signing key and application identifier. Saved names, rooms, and preferences stay in AppData.

For a manual source update from v0.2.0, use `changed-files-upload` or the changed-files ZIP. No Electron migration or new signing key is needed. See `DELETED_FILES.txt` for any removals.
