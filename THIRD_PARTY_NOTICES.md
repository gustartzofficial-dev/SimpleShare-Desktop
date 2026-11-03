# Third-party components

The application source follows the original SimpleShare CC0 license. The following dependencies are separate works; their licenses continue to apply.

- **Electron 45.2.1** — MIT, https://github.com/electron/electron. The portable distribution includes Electron's license and Chromium third-party license notices.
- **loopback-capture 4.0.0**, Matin Tat — MIT, https://github.com/WerdoxDev/loopback-capture. Provides the Windows WASAPI process-audio backend, based on the MIT-licensed Microsoft Windows classic application-loopback sample. Its source and license are included with the runtime dependency; a license copy is also in `assets/licenses/`.
- **Koffi 3.3.6**, Niels Martignène — MIT, https://koffi.dev/. Used only for fixed Windows process/window query functions in the main process. License copy in `assets/licenses/` and the runtime dependency.
- **Geist** — SIL Open Font License 1.1. Font license is in `assets/licenses/Geist-OFL.txt`.
- **@electron/packager 20.3.0** — BSD-2-Clause, development/build tooling, https://github.com/electron/packager.
- **Playwright 1.63.0** — Apache-2.0, development/test tooling, https://github.com/microsoft/playwright.

Runtime dependency license files, including transitive notices, remain inside the portable app's `resources/app/node_modules/`. Electron's Chromium notices are shipped alongside its executable. Local source caches and private profiles are excluded from both distribution archives.
