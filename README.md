# SimpleShare Desktop

Simple screen sharing, with a desktop home. **Version 0.4.0** adds dedicated extra application audio, branded installers, and Linux x64 packaging alongside Windows x64.

The app opens the [live SimpleShare website](https://simple-share-hazel.vercel.app) inside its desktop window. Saved places, compact mode, profile storage and installation are local. There is no separate browser window.

## What changed

- The room’s **Audio** action opens extra sources and mix controls with website 6.3.1. It no longer immediately toggles outgoing audio.
- Extra desktop audio uses an **audio-only application picker**. Adding it does not allocate another video capture or replace the outgoing mixed track.
- Windows setup has SimpleShare artwork, its own icon, and English / Português (Brasil) / Español installer translations.
- Linux preview has x64 AppImage and Debian packaging. The AppImage includes a branded, per-user installation screen.
- The collapsed sidebar still shows only its centered plus, with a translated tooltip and accessible name.

## Install on Windows

Download **SimpleShare_0.4.0_x64-setup.exe** from [Releases](https://github.com/gustartzofficial-dev/SimpleShare-Desktop/releases). Run it over the existing installation. Saved data stays in AppData. Setup offers WebView2 installation if needed.

Windows 11 x64 is recommended. Application audio requires Windows build 20348 or later. Pictures use Windows Graphics Capture and Direct3D; audio uses WASAPI process loopback. The app requests borderless capture, subject to Windows permission. Protected content, elevated applications, anti-cheat restrictions and games that recreate their fullscreen window can still affect capture.

The updater signature authenticates updates inside SimpleShare. It is separate from a Windows publisher certificate; SmartScreen may still show an unsigned-publisher prompt.

## Install on Linux

Target: **x64 Ubuntu 22.04+ / Debian with WebKitGTK 4.1**, PipeWire and an appropriate xdg-desktop-portal backend for your desktop. Install the portal backend for GNOME, KDE or your wlroots desktop through your distribution. The AppImage still needs the system’s working graphics, media and portal services.

**AppImage:** download the AppImage and Install-SimpleShare.sh from the same release into one folder. Mark them executable, then run the script. Alternatively run the AppImage with --install to open the branded installer. You can also run the AppImage directly without installing it.

The installer copies it to ~/.local/share/SimpleShare/SimpleShare.AppImage and adds an applications-menu entry and icon. XDG_DATA_HOME is respected. No root password is needed. Keep the installed file writable for signed updates. Files downloaded through a browser may need “Allow executing as program” enabled first.

**Debian package:** install the downloaded .deb through your package manager, for example sudo apt install ./SimpleShare_0.4.0_amd64.deb. Dependencies are declared in the package. Updates use your package manager; the app links to Releases rather than trying to replace a system-owned executable with an AppImage.

Linux pictures use **WebKitGTK/GStreamer and the system’s PipeWire desktop capture portal**. A pinned Rust WebRTC adapter supplies peer connections when the system webview has no native WebRTC. The system picker and its privacy prompt are intentional; Windows’ capture implementation is not used on Linux. The shell and live room are laid out in one integrated GTK window.

Application audio uses PulseAudio or pipewire-pulse plus **pulseaudio-utils**. Play sound in an application before opening the picker. Select one playback stream; microphones and the default system recording source are never used as fallbacks. If an app recreates its audio stream, select it again. Per-stream monitoring support depends on the installed audio server. The initial Linux Rust transport currently uses a screen-sharing encoder profile capped at 15 fps (up to 1080p); Windows keeps its existing capture/frame-rate path. Linux capture and desktop integration should be checked on your actual distribution before wider rollout.

## Rooms, compact mode and saved data

Save frequent rooms in **Your places**, rename them and collapse the rail. Compact mode shows who is sharing, your preview and quick controls. Camera sharing is a separate picture without microphone access. The shell supports English, Português (Brasil) and Español.

The application identifier remains **dev.simpleshare.desktop**. Profiles live outside the application directory:

- Windows: %APPDATA%/dev.simpleshare.desktop/
- Linux: the XDG configuration directory, normally ~/.config/dev.simpleshare.desktop/
- profile.json stores your name, favorites, recent rooms and preferences; webview/ holds the website profile.

Reinstalling or moving build folders keeps the profile. Desktop preferences opens the saved-data folder. A malformed profile is preserved before recovery. Legacy Electron favorites and names can be imported from desktop.json using **Import old profile**; keep the old folder until you have checked the result.

## Updates and releases

Windows and AppImage installations check the desktop repository and verify downloads against the existing embedded public key. Installation waits until you leave a room. Never replace that key for an ordinary update. Debian installations use package updates instead.

See [UPDATER_SETUP.md](UPDATER_SETUP.md) for the exact release asset list and local signing. The release tag in latest.json must exactly match the published GitHub tag. Use scripts/release-manifest.mjs --tag YOUR-EXACT-TAG rather than editing URLs by hand.

## Build and validate

Use Node.js 24 and stable Rust. On Windows, reuse a configured MSVC / Windows SDK toolchain. Configure tool locations, TEMP/TMP, npm cache, Cargo/rustup homes and build output before installing or compiling; this owner’s portable environment is in E:/SimpleShare-Major Update/desktop-tauri/scripts/env.ps1. Do not place development caches on C:.

Run npm ci, npm run check and npm run build after configuring the environment. Build Windows with npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis --ci and TAURI_SIGNING_PRIVATE_KEY pointing to the original private key.

The **Build Linux x64 release** workflow installs Linux dependencies, runs Rust tests, then builds AppImage and .deb with src-tauri/tauri.linux.conf.json. It uploads an artifact only and never publishes a release or needs the private signing key. After downloading the artifact on the owner’s Windows PC, use scripts/finalize-linux.ps1 to sign the AppImage and combine both platforms in latest.json.

Native capture regression checks are in tests/runtime.mjs --capture and use an isolated profile and a Win32/WASAPI fixture. Validation results and limits belong in [VALIDATION.md](VALIDATION.md).

## Architecture and security

Only trusted local webviews control desktop settings, installation and source selection. The live website receives narrow, origin-checked commands. Grants come from the native picker and are revalidated before capture. The installer command is restricted to its own local webview.

Windows uses WebView2 for rendering and WebRTC; Linux uses WebKitGTK/GStreamer. Rust replaces the Electron main process and supplies native integration. This is not a fully native room renderer or Rust WebRTC engine, and performance gains require measurement on actual devices.

TURN, SFU and admin secrets belong on the server. The website and Worker are maintained separately. Ship the website 6.3.1 update with this desktop release for the corrected Audio-button placement. No Worker changes are needed for that UI update.
