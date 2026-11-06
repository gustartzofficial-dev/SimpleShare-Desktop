# Owner setup: GitHub releases and signed updates

Use the existing **gustartzofficial-dev/SimpleShare-Desktop** repository. Keep its Releases and history. Replace the Electron source using `REMOVE_OLD_ELECTRON_FILES.txt` and the clean source upload; GitHub web uploads do not delete obsolete files.


## Updating an existing Tauri v0.2.0 installation to v0.2.1

Reuse the original signing key and GitHub Actions secret. Upload the contents of changed-files-upload over the existing desktop repository, then create release v0.2.1. Attach SimpleShare_0.2.1_x64-setup.exe, its .sig, and latest.json; publish it as the latest normal release. Existing Tauri clients can then receive it through their updater. This update keeps saved AppData and does not require removing the Electron folders again. The initial migration instructions below apply only to Electron users.

## One-time signing setup

The public update verification key is already embedded in `src-tauri/tauri.conf.json`. Its matching private key is deliberately excluded from source and release archives.

This is the desktop update-signing key. It is separate from your Cloudflare API token and TURN credentials.

For the original workspace, the private key is at:

`E:\SimpleShare-Major Update\desktop-tauri\.local\private\updater.key`

1. Make a private backup of this file outside any public repository. Losing it prevents signing updates accepted by this installed version.
2. Open the desktop repository → **Settings → Secrets and variables → Actions → New repository secret**.
3. Name the secret **`TAURI_SIGNING_PRIVATE_KEY`**. Its value is the **entire contents of `updater.key`**, not its path and not the `.pub` file.
4. This generated key has no password. The optional **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`** secret can remain absent. If you later use an encrypted key, store its password in that secret.

Never paste the private key into source, README files, release descriptions, issue comments, or chat. The desktop application contains only the public key.

## First release: manual assets already built locally

For the initial replacement using GitHub's website: open the repository and press `.` to open github.dev. Before uploading the new source, delete the old `assets`, `src`, `scripts`, and `tests` folders and commit those deletions from Source Control. Return to the normal repository page and upload the **contents** of `source-upload` at the root, including `.github`. If you have already uploaded new source, use the exact file list instead; do not delete the new `src` folder. Keep the repository and its existing Releases.

1. Upload the replacement source at the repository root, including `.github/workflows/release.yml`. Remove the old Electron-only files listed in the supplied removal list.
2. Suggested commit: **`Migrate desktop client to Rust/Tauri with native capture and signed updates`**.
3. Open **Releases → Draft a new release**. Create tag **`v0.2.0`** on the updated source commit. Title: **`SimpleShare Desktop v0.2.0 — Native Windows capture`**.
4. Use `RELEASE_NOTES.md` for the description. Attach these three files from the prepared release folder:
   - `SimpleShare_0.2.0_x64-setup.exe`
   - `SimpleShare_0.2.0_x64-setup.exe.sig`
   - `latest.json`
5. Optionally attach the clean source ZIP. Do not attach `.local`, any private key, `node_modules`, target directories, test profiles, or old portable distributions.
6. Publish as a normal release and make it the **latest** release. Draft/prerelease assets will not serve the configured public latest-update channel.

Electron users install this first Tauri installer manually. Tauri users then receive later correctly signed releases through the app. A release with the same version as the installed app will not trigger an update.

## Later releases: GitHub Actions

1. Update the application version in all three manifests and the release notes, then upload/commit the source changes.
2. Open **Actions → Windows installer release → Run workflow** on the updated default branch.
3. The workflow builds, tests, signs, and creates a draft release with the installer, signature, and updater manifest. It requires the signing secret above; `GITHUB_TOKEN` is supplied by GitHub automatically.
4. Review the draft and test the installer. Publish it as the latest normal release when ready.

This workflow has been prepared locally; a successful run and an actual cross-version update require publishing in your repository. Do not generate a new signing key for each release.

Reference: [Tauri updater documentation](https://v2.tauri.app/plugin/updater/) and [GitHub build pipeline](https://v2.tauri.app/distribute/pipelines/github/).

