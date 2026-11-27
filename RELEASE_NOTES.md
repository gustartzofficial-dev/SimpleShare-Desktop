# SimpleShare Desktop v0.4.0 — Audio where it belongs, on more desktops

- **Audio sources in one place.** With website 6.3.1, Audio beside Share screen opens add/change/remove source and separate mix controls. Opening the panel does not mute your stream.
- **Extra audio without another picture.** The desktop app uses its application-only audio picker, preserving the active screen and outgoing audio track.
- **A SimpleShare welcome.** Branded Windows setup artwork and a matching Linux AppImage installation screen.
- **Linux x64.** AppImage and .deb packages, system desktop-portal screen selection, PulseAudio / pipewire-pulse application playback capture, favorites and compact mode.
- **Updates that match the installation.** Windows and AppImage use signed updates; .deb installations link to package releases. Existing profile data and updater keys are retained.

Linux needs a working PipeWire desktop portal and the appropriate desktop backend; application audio also needs pulseaudio-utils. Per-stream monitoring depends on the audio server. Windows game-capture restrictions remain platform dependent. See README.md and VALIDATION.md.

Install the Windows setup over your current version. For Linux, use the .deb package manager flow or run the AppImage with --install. Keep the source-upload and changed-files-upload folders for repository changes; they are not release binaries.
