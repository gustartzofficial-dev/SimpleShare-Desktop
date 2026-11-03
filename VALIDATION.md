# Desktop 0.1.1 preview validation — 2026-11-03

Windows x64, Electron 45.2.1, Node 24.19.0.

Verified in development:

- Six Node regressions for strict origin/invite parsing, bounded remote snapshots, safe preferences, saved-room persistence/deduplication/rename/removal, and bounded native audio packet credits.
- Real local Windows application video capture, with decoded video frames in the live-view contract fixture.
- Native WASAPI process audio from a selected application, delivered through a utility process and AudioWorklet into a real MediaStream audio track. Measured RMS around 0.0106 for a generated tone.
- Audio packets have a bounded acknowledgment window and a bounded worklet buffer, so a stalled web view drops old samples instead of accumulating an unlimited audio queue.
- Process isolation: a second unselected application continued playing a tone while the selected one was suspended; captured RMS became zero. No system-loopback or microphone fallback was used.
- Smaller parented source-picker window; the live WebContentsView remains visible behind it. Cancellation releases the request, and a new picker can open afterward. Switching application/display categories clears selection. Source/PID identity is revalidated.
- Native display video plus separately selected application audio passes a real monitor-capture test. Selected application RMS 0.01065; a second unrelated application remains excluded.
- Capture remains live across a local fixture window entering/leaving fullscreen, and simulated mute/unmute events do not stop capture. This does not emulate Zenless or prove support for every exclusive-fullscreen game.
- Saved-room creation and inline rename, quality preference applied to the live page, and opening the current favorite without reloading an active capture.
- Compact mode retains the same live session and produces a moving local preview. Streamer roster and Stop controls remain usable at the minimum compact size with ten fixture participants. Native always-on-top state is applied.
- Stop ends all capture tracks; the native utility process exits. Returning to full mode does not create another room or publication.
- Real production homepage loads in the sandboxed live view, with the native capture adapter installed and desktop appearance applied. No production room was joined and no production media was sent.
- Remote content uses `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. No renderer errors were reported by the local native integration test.

Evidence is saved locally under `.local/qa/`, including native capture/isolation measurements and full/compact screenshots. That directory is excluded from source and portable distribution archives.

The packaged portable executable passed the same native capture, application-audio isolation, compact-mode and cleanup integration checks (selected audio RMS 0.01065, unselected process RMS 0, no renderer errors). It also passed startup against the real homepage. This is an unsigned preview, not a signed installer or auto-update release. These checks do not establish behavior in every game, protected media, minimized source, network/NAT combination, or on macOS/Linux. Video quality and server reliability remain bounded by the live website's encoder and transport.

Web 6.2.1 checks: ESLint, 85 Node regressions and production build passed. Selected browser media/audio/reliability checks passed in Chromium and Firefox, including distinct publisher/receiver engines, isolated publisher recovery/teardown, rejection of browser system audio, acceptance of native scoped display audio, and ignoring ended events from replaced captures. The broader Firefox loopback media fixture initially timed out establishing ICE; it passed on an isolated rerun. No production room or real-game stream was exercised.
