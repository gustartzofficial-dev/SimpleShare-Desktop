# Desktop 0.1.2 validation — 2026-11-03

- Desktop syntax checks and 8 native policy/storage unit tests passed.
- Source and packaged executable each launched, fully quit and relaunched three times against an isolated local fixture. The generated Guest name survived restart, a committed custom name survived restart, and appearance/mute/zero-volume settings were recovered after the website's localStorage was cleared.
- Unknown/credential keys are rejected by the preference bridge and are not written to desktop.json. Backup data is limited to validated public settings.
- Packaged runtime is Windows x64, Electron 45.2.1. Profiles/caches under .local are excluded from distribution.
- Packaged 0.1.2 native-to-browser transfer decoded 45 frames in the three-second sample with audio RMS 0.01065 and remained connected; unrelated-process audio RMS was zero. The real homepage loaded with the native adapter installed. Evidence is under .local/qa. Interop mode checks media and compact controls, while omitting the independent Windows always-on-top flag assertion as described for 0.1.1.

Portable storage remains user-data beside the executable. These checks use the same profile across restarts; moving to a different folder without retaining user-data intentionally produces a fresh profile. No standard AppData directory or production account was modified by these tests.
