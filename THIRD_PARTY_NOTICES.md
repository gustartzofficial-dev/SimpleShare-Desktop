# Third-party notices

The SimpleShare application source retains the original CC0-1.0 license. Dependencies are separate works and retain their own licenses.

The installer includes `THIRD_PARTY_LICENSES.txt`, `LICENSE.txt`, and `Geist-OFL.txt`. `scripts/licenses.mjs` regenerates the dependency notices from the locked Windows Cargo graph and the bundled frontend bridge during builds. The source archive includes the generated notices as well.

Principal components:

- [Tauri 2](https://github.com/tauri-apps/tauri), its official updater/dialog/opener/single-instance plugins, Wry, Tao, and WebView2 Rust bindings — MIT and/or Apache-2.0; see the component notices.
- [windows-capture 2.0.1](https://github.com/NiiightmareXD/windows-capture) — MIT; native Windows Graphics Capture.
- [wasapi 0.23](https://github.com/HEnquist/wasapi-rs) — MIT; Windows application audio.
- [windows-rs](https://github.com/microsoft/windows-rs) — MIT or Apache-2.0; Windows API bindings.
- [Geist](https://github.com/vercel/geist-font) — SIL Open Font License 1.1; license in `public/assets/licenses/`.
- [Playwright](https://github.com/microsoft/playwright) — Apache-2.0; development testing only.
- [Vite](https://github.com/vitejs/vite) and [esbuild](https://github.com/evanw/esbuild) — MIT; build tools only.

Microsoft Edge WebView2 is a separately maintained Microsoft runtime under its own distribution terms. The app uses the installed shared runtime; the installer downloads Microsoft's bootstrapper if required. Electron, Node.js, Koffi, and the old loopback-capture Node addon are not included as application runtimes in this release.
