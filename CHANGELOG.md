# Changelog & Version Iteration History — AGY Remote (`agy-remote`)

All notable architectural decisions, performance optimizations, security audits, and bug fixes across the `v1.0.0` → `v2.6.0` development lifecycle of **AGY Remote** are documented in this file.

---

## [v2.6.0] — 2026-11-25
### Added
- **Multi-Message Ordered Input Queue (`convoQueues`)**:
  - Separated the mobile/web **Stop (`⏹`)** button (`#stopRunBtn`) from the **Send (`↑`)** button (`#sendPromptBtn`) in `lib/web-ui.mjs`.
  - Users can continuously type and send multiple messages while the AI is still executing a turn, matching the native Antigravity desktop client experience.
  - Added `convoQueues` in `sidecars/remote/main.mjs` (`POST /api/chat/send` queues messages with `status: 'queued'` when a turn is active, `processConversationQueues()` auto-dispatches queued prompts sequentially within 280ms of the previous turn finishing, and `POST /api/chat/queue-cancel` allows cancelling any queued item).
  - Added visual queue badge (`⏳ 队列中 (等待上一条执行完成后自动发送)` + `✕ 取消`) in the mobile chat stream.

### Fixed
- **Zero Duplicate Turn Rendering**:
  - Fixed a bug in `lib/bridge.mjs` where out-of-slice steps (`!st`) or `<SYSTEM_MESSAGE>` notifications inside `agentState.turns` were misidentified as new `userInput` turn starts (`memTurnStart > diskLastStart`), which previously caused finished turns to be duplicated at the bottom of the screen.
  - Added strict DOM turn reconciliation in `lib/web-ui.mjs` to remove temporary optimistic turn nodes (`turn-pending-*` / `turn-q-*`) immediately when superseded by persisted disk turns (`turn-<step_index>`).

---

## [v2.5.1] — 2026-11-25
### Fixed
- **Eliminated Raw Unrendered Text Flash on Message Send**:
  - Removed the legacy `document.querySelectorAll('[data-markdown-root]')` `.innerText` scraping fallback in `lib/bridge.mjs` that briefly flashed raw unformatted DOM text before the new turn's structured steps initialized.
  - Filtered `<SYSTEM_MESSAGE>` and `<ADDITIONAL_METADATA>` blocks out of `cleanUserPrompt` and skipped non-user system turns in `getConversationMessages`.
- **Single-Turn Delta Transmission (`deltaOnly: true`)**:
  - Reduced payload size from ~85KB full conversation history to ~1.2KB incremental delta (`deltaTurns: turns.slice(-4)` + `allTurnIds`) on SSE push and polling ticks.
- **Persistent Cloudflare Edge Tunnel across Reinstalls**:
  - Saved active detached `cloudflared.exe` session (`pid`, `url`, `port`) to `plugin_data/agy-remote/tunnel-session.json` so updating or restarting the sidecar reuses the warm Edge tunnel immediately without waiting 8–15s for DNS propagation.

---

## [v2.4.0] — 2026-11-25
### Added
- **0-RTT Initial HTML State Hydration & SSE Push**:
  - Embedded AES-256-GCM encrypted `initialState` directly inside the initial `/remote/v4` HTML document (`window.__AGY_INITIAL_STATE__`), eliminating 3 sequential round-trips on mobile load.
  - Upgraded `/api/events` SSE stream to push encrypted `event: state` delta frames every `280ms` when active.
- **CDP Target Caching & Parallel Evaluation**:
  - Cached `findAllHubCdpTargets()` for 3 seconds and switched `evaluateInAllHubs` from serial `for...of` to `Promise.all` in `lib/bridge.mjs`.
- **Smooth `requestAnimationFrame` Streaming**:
  - Throttled mobile DOM patches in `lib/web-ui.mjs` with `requestAnimationFrame` + payload fingerprint checks (`lastRenderHash`) and client-side optimistic prompt rendering.

---

## [v2.3.1] — 2026-11-25
### Fixed
- **Seamless WeChat Scan to Mobile Browser Transition**:
  - Kept `?sid=...&hash=...` in the browser address bar instead of stripping it via `history.replaceState`, and updated `checkAuth()` in `sidecars/remote/main.mjs` to validate `sid` (`d_<hash>`) signatures so tapping "Open in Default Browser" from WeChat never asks for a manual Security Token.
- **Windows Double-Click Installer (`install.bat` & `uninstall.bat`)**:
  - Added batch wrappers using `powershell.exe -NoProfile -ExecutionPolicy Bypass` to bypass default Windows PowerShell `Restricted` execution policies.

---

## [v2.3.0] — 2026-11-25
### Changed
- **Minimalist 380px Bottom-Left QR Modal (`lib/sidebar-inject.mjs`)**:
  - Removed all non-functional placeholder bot cards (WeChat/Feishu/Lark/Telegram) and removed the LAN toggle button.
  - Added global singleton observer `globalThis.__agyRemoteObs` to prevent duplicate phone icons in the bottom-left status bar across hot reloads.
- **Security & Privacy Hardening (Codex Audit Passed)**:
  - Passed full security and privacy audit (`PRIVACY_LEAK_COUNT = 0`): zero personal IPs, tokens, or machine identifiers in the source tree; all runtime state is dynamically generated per host in `~/.gemini/antigravity/plugin_data/agy-remote/`.
  - Enforced `timingSafeEqual` token validation, `HttpOnly; SameSite=Lax` session cookies, strict CSP headers, and AES-256-GCM payload encryption.

---

## [v2.1.0 – v2.2.0] — 2026-11-24
### Added
- **1:1 Native Antigravity Dark UI + ZCode Fast Core (`lib/web-ui.mjs`)**:
  - Rebuilt the mobile/web interface to mirror the native Antigravity client (`#0e0f12` / `#131418` theme, flat conversation list + workspace grouped view, native `Steps` card, collapsible `Thought` block with tool pills, real Git/snapshot file diff drawer with `↩ 撤销修改` revert action, and real Redux model selector sync).
- **Embedded Tailscale + Cloudflare High-Speed Edge (`lib/tailscale.mjs`, `lib/tunnel.mjs`)**:
  - Completely removed Pinggy.
  - Added automatic Tailscale detection/installation and persistent `cloudflared.exe` edge tunneling with Serveo port-443 fallback.
