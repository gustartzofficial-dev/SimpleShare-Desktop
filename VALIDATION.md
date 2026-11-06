# Validation — SimpleShare Desktop 0.2.0

Validation date: 6 November 2026. Checks run on the local Windows x64 machine in isolated test profiles inside the project folder. No production room was used for the native capture tests.

## Completed source and runtime checks

- JavaScript syntax checks and Vite production frontend build.
- Rust compilation and five unit tests: canonical restricted room links, safe preference validation, persisted name/sidebar state, preservation of malformed profiles, and importing an Electron profile including zero volume.
- A native Win32/GDI animated window and WASAPI test tone are captured through the app-owned selector. The sharing flow acquires video through Rust Windows Graphics Capture, not browser `getDisplayMedia` acquisition.
- GPU-scaled 1280 × 720 picture reaches a generated video track. Application audio is live, and stopping the selected test tone produces zero measured RMS in the capture.
- Native video passes through a real local WebRTC peer connection. Received frames continue increasing while compact mode is active.
- Resizing the selected window, minimizing it, and restoring it preserve the capture track and resume video delivery.
- Closing the main window to the tray preserves native capture and WebRTC frame delivery. The test exposed and led to a correction of native window calls made while holding the shared app-state lock.
- Compact preview renders the selected native picture. Favorites, name, and collapsed-sidebar state survive navigation and full application restart.
- The remote live webview is refused access to privileged shell commands.
- The same suite passes on the optimized release executable with its embedded UI. After a full restart, two native captures can run concurrently, the desktop Stop control ends both tracks, and their background keep-alive locks are released.

The runtime test is `tests/runtime.mjs --capture`. It uses Playwright's CDP client to inspect only the test app's WebView2 pages; it does not launch an external Chromium browser. The fixture is the app executable's explicit `--native-fixture` test mode.

A fresh copy of the clean source upload was checked with `npm ci`, the production frontend build, and `cargo check --locked`. Generated bridge and permission files are recreated by the build; caches and toolchains are excluded from the upload.

## Release checks

The Windows x64 NSIS installer and updater signature are generated locally. Its packaged application executable was tested directly; the installer itself was not installed into the user's profile. The private signing key is excluded from source and distribution archives. The separate signature check verifies the signed installer and rejects a one-byte modification:

```powershell
$env:SIMPLESHARE_TEST_INSTALLER = 'absolute-path-to-the-setup.exe'
cargo test --locked --manifest-path src-tauri/Cargo.toml installer_signature -- --ignored
```

The normal unit-test run intentionally ignores this artifact-dependent test; it is run explicitly after packaging. `THIRD_PARTY_LICENSES.txt` is generated from the locked Windows dependency graph and bundled with the installer.

## Not yet established

- A public GitHub Actions run and an end-to-end update between two published versions. Those require the owner to add the signing secret and publish normal GitHub Releases with the installer, signature, and `latest.json`.
- Clean-machine installation/uninstallation. The installer is built, but this development session does not install it into the user's AppData or replace the existing installed client.
- Long gaming sessions, exclusive-fullscreen device/window recreation, anti-cheat compatibility, HDR/color accuracy, protected content, multiple GPU adapters, or all supported Windows versions.
- Reliability across multiple remote users or restrictive networks. TURN/SFU behavior belongs to the unchanged live service and needs a real multi-user test.
- A measured performance or total-memory advantage over Electron. Installer size alone does not establish runtime memory or CPU usage. The render and WebRTC engine is still WebView2.

Windows Graphics Capture may pause while a source is minimized or protected. The app preserves the track while the source is temporarily unavailable; closure or a capture failure ends that track. A game that creates an entirely new window may require selecting it again.
