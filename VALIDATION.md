# Validation — SimpleShare Desktop 0.2.1

Validation uses isolated E: test profiles and the existing portable E: Rust/MSVC toolchain. npm, Cargo, rustup, temporary files, browser profiles, and build outputs are configured on E:. No production room or Cloudflare quota is used for the native tests.

## Completed checks

The debug and optimized release runtime suites passed, including native thumbnail refresh, centered collapsed controls, notice dismissal across compact mode, video/audio and WebRTC regression checks, and persistence across restart. Windows returned `AppCapabilityAccessStatus::Allowed` for borderless capture in the isolated test. Five Rust unit tests passed. The final signed installer also passed signature verification and rejection of a modified payload.

## Checks

The runtime suite verifies the sidebar-owned collapse control, centered collapsed new-room button, notification visibility inside the room view, and native 320 × 180 source thumbnails. It also exercises video/audio capture, local WebRTC delivery, compact/tray continuity, source resize and minimize/restore, persistence across restart, and stopping concurrent native captures.

Rust unit tests cover room URL validation, safe saved settings, profile persistence/recovery, and Electron-profile import. The signed installer is checked separately against the embedded public key, including rejection of a modified payload.

Thumbnails are snapshots captured in memory through Windows Graphics Capture and GPU scaling. Visible source cards load lazily, one preview at a time. Refresh requests new snapshots; protected, minimized, or inactive sources can report that a preview is unavailable.

## Platform limits

Border suppression uses Windows' supported borderless capture access request and `IsBorderRequired = false`. Windows retains control of the permission and may show its indicator if consent is denied or another capture application requires a border. This update does not bypass system privacy controls.

The installer is built locally; clean-machine installation/uninstallation is not performed in this development session. Long gaming sessions, protected content, HDR, multiple GPU adapters, and production multi-user networking still need broader testing. Tauri still uses WebView2 for the room UI and WebRTC transport.

Source upload and changed-only packages exclude private signing keys, development tools, dependency directories, build outputs, and test profiles. The update baseline is the delivered v0.2.0 source snapshot.
