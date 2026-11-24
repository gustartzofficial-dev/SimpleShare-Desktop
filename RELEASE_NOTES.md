# SimpleShare Desktop v0.3.1 — Sidebar hotfix

- Fixed the collapsed sidebar’s New room button: it now shows only a centered plus icon in English, Português (Brasil), and Español.
- Kept the full translated label when expanded, plus a translated tooltip and accessible button name when collapsed.

Install `SimpleShare_0.3.1_x64-setup.exe` over your current version. Saved names, rooms and preferences stay in AppData.

# SimpleShare Desktop v0.3.0 — Real fullscreen, camera, and your language

- **Real fullscreen.** Choosing full screen on a shared screen or camera now fills the whole monitor. The desktop title bar, sidebar and window frame step aside, and Esc (or the page) restores the window exactly as it was. Switching to compact mode leaves fullscreen first.
- **Camera sharing.** The room’s new Camera button works in the app. The camera is allowed only for the pinned SimpleShare website and only after you press the button; microphone requests are always refused. Compact mode gains a Camera toggle.
- **English, Português (Brasil) and Español.** The desktop shell, sharing selectors, tray menu, quit dialog and update messages follow the room’s language, which is chosen automatically from Windows. Desktop preferences → Language changes the app and the room together and is saved in your profile.
- **Parity with website 6.3.0.** The Audio switch next to Share screen, translated room interface and hardened room service come from the live website. Saved rooms stay in the desktop sidebar (★), so the website’s own saved-room list and its Windows app card are hidden inside the app. New room names default to the chosen language.
- Your Audio-switch preference and language are kept in `profile.json` with your other site preferences.

Install `SimpleShare_0.3.0_x64-setup.exe` over the existing version; saved names, rooms and preferences stay in AppData. Existing installations update automatically only from a release whose installer is signed with the original updater key (see UPDATER_SETUP.md).
