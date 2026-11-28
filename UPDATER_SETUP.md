# Publish SimpleShare Desktop v0.4.0

Keep the existing repository, app identifier and updater public key. The private updater key stays outside source and release uploads.

1. Upload changed-files-upload to the repository root, preserving paths, or review and merge the isolated build branch. The full source-upload folder is also provided.
2. Create a normal GitHub release tagged exactly **v0.4.0** and mark it Latest after testing.
3. Attach the Windows .exe and .exe.sig, Linux .AppImage and .AppImage.sig, the .deb, Install-SimpleShare.sh, latest.json and INSTALLER_SHA256SUMS.txt.
4. Use RELEASE_NOTES.md for the description. Source uploads alone do not create downloadable updates.

If you choose a different release tag, regenerate latest.json with node scripts/release-manifest.mjs --assets release/v0.4.0 --tag YOUR-EXACT-TAG --require-linux. The application version remains 0.4.0. A tag mismatch produces a download 404 even when update discovery works.

## Linux build and local signing

Run **Actions → Build Linux x64 release** on the source you intend to ship. The isolated codex/linux-release-0.4.0 branch also triggers it on push. The workflow has read-only repository permissions and uploads build artifacts, without creating tags, changing main or publishing releases.

Download and extract SimpleShare-linux-x64 on E:. From the desktop source folder, run:

    ./scripts/finalize-linux.ps1 -AssetsDirectory 'E:/path/to/extracted/Linux-artifacts' -SigningKeyPath 'E:/SimpleShare-Major Update/desktop-tauri/.local/private/updater.key' -ReleaseTag 'v0.4.0'

It signs the AppImage with the existing key and generates a manifest containing Windows and Linux. The Windows installer and its signature must already be in release/v0.4.0. Do not change signed binaries after signing. Debian packages are installed and updated by the package manager rather than by the AppImage updater.

## Windows build

Load the existing E: portable environment, point TAURI_SIGNING_PRIVATE_KEY at the original updater.key file, set TAURI_SIGNING_PRIVATE_KEY_PASSWORD to an empty string for this existing key, and run npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis --ci. Copy the resulting installer and .sig into release/v0.4.0. Never generate a new key for this update.

A Windows publisher certificate is separate from updater signing. The included updater signatures do not remove SmartScreen’s unsigned-publisher warning.
