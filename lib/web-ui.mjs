export function renderRemoteWebIdeHtml({ token = '', hostName = 'AGY Host', initialState = null } = {}) {
  const encodedInitialState = encodeURIComponent(JSON.stringify(initialState || null));
  return `<!doctype html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="no-referrer" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>Antigravity</title>
  <style>
    :root {
      /* 1:1 Antigravity Native Dark Theme Tokens */
      --agy-bg: #0e0f12;
      --agy-sidebar-bg: #131418;
      --agy-surface: #17191e;
      --agy-surface-hover: #1e2028;
      --agy-surface-active: #232630;
      --agy-input-bg: #181a20;
      --agy-border: rgba(255, 255, 255, 0.07);
      --agy-border-strong: rgba(255, 255, 255, 0.13);
      --agy-text: #eceef2;
      --agy-text-sec: #9ca0ab;
      --agy-text-muted: #686c77;
      --agy-accent: #60a5fa;
      --agy-accent-bg: rgba(96, 165, 250, 0.13);
      --agy-green: #34d399;
      --agy-green-bg: rgba(52, 211, 153, 0.12);
      --agy-red: #f87171;
      --agy-red-bg: rgba(248, 113, 113, 0.12);
      --agy-user-bubble: #20232b;
      --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, system-ui, sans-serif;
      --font-mono: "JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", Consolas, monospace;
    }
    html.light {
      --agy-bg: #ffffff;
      --agy-sidebar-bg: #f6f7f9;
      --agy-surface: #f1f3f6;
      --agy-surface-hover: #e7eaef;
      --agy-surface-active: #dfe3ea;
      --agy-input-bg: #f4f5f8;
      --agy-border: rgba(0, 0, 0, 0.08);
      --agy-border-strong: rgba(0, 0, 0, 0.14);
      --agy-text: #141518;
      --agy-text-sec: #525660;
      --agy-text-muted: #858994;
      --agy-accent: #2563eb;
      --agy-accent-bg: rgba(37, 99, 235, 0.1);
      --agy-user-bubble: #eef0f5;
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: var(--agy-bg); color: var(--agy-text);
      font-family: var(--font-sans);
      font-size: 14.5px; line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }
    button, input, select, textarea { font: inherit; color: inherit; }

    /* Master AGY Client Frame */
    .agy-app {
      display: flex; width: 100%; height: 100%; overflow: hidden; position: relative;
    }

    /* ============================================================
       LEFT SIDEBAR (Desktop: AGY Native Sidebar | Mobile: Page 1)
       ============================================================ */
    .agy-sidebar {
      width: 280px; flex-shrink: 0; height: 100%;
      background: var(--agy-sidebar-bg);
      border-right: 1px solid var(--agy-border);
      display: flex; flex-direction: column;
      user-select: none;
    }
    .sidebar-top {
      padding: 12px 12px 8px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .brand-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 2px 4px;
    }
    .brand-left {
      display: flex; align-items: center; gap: 9px;
      font-size: 14.5px; font-weight: 600; color: var(--agy-text);
    }
    .agy-logo-mark {
      width: 24px; height: 24px; border-radius: 7px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      display: inline-flex; align-items: center; justify-content: center;
      color: #fff; font-weight: 700; font-size: 13px;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    }
    .brand-actions {
      display: flex; align-items: center; gap: 2px;
    }
    .agy-icon-btn {
      appearance: none; border: 0; background: transparent;
      color: var(--agy-text-sec); width: 28px; height: 28px;
      border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; transition: background 0.12s, color 0.12s;
    }
    .agy-icon-btn:hover, .agy-icon-btn.active {
      background: var(--agy-surface-hover); color: var(--agy-text);
    }

    /* AGY Native "+ New Conversation" Button & Search Box */
    .new-convo-btn {
      appearance: none;
      width: 100%;
      background: var(--agy-surface);
      border: 1px solid var(--agy-border-strong);
      color: var(--agy-text);
      padding: 7px 11px;
      border-radius: 8px;
      font-size: 13px; font-weight: 500;
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer; transition: background 0.12s, border-color 0.12s;
    }
    .new-convo-btn:hover {
      background: var(--agy-surface-hover);
    }
    .new-convo-left {
      display: flex; align-items: center; gap: 8px;
    }
    .kbd-hint {
      font-size: 11px; color: var(--agy-text-muted);
      font-family: var(--font-mono);
    }

    .sidebar-search-wrap {
      position: relative; display: flex; align-items: center;
    }
    .sidebar-search-wrap svg {
      position: absolute; left: 9px; color: var(--agy-text-muted); pointer-events: none;
    }
    .sidebar-search-input {
      width: 100%;
      background: var(--agy-surface);
      border: 1px solid var(--agy-border);
      border-radius: 7px;
      padding: 5px 10px 5px 28px;
      font-size: 12.5px; color: var(--agy-text);
      outline: none;
    }
    .sidebar-search-input:focus { border-color: var(--agy-border-strong); }
    .sidebar-search-input::placeholder { color: var(--agy-text-muted); }

    /* Sidebar View Switcher: AGY Flat List vs Workspace Grouped */
    .sidebar-section-bar {
      padding: 6px 14px 4px;
      display: flex; align-items: center; justify-content: space-between;
      font-size: 11.5px; font-weight: 600; color: var(--agy-text-muted);
      letter-spacing: 0.02em;
    }
    .view-mode-pills {
      display: inline-flex; gap: 2px;
      background: var(--agy-surface); padding: 2px; border-radius: 6px;
    }
    .view-mode-pill {
      appearance: none; border: 0; background: transparent;
      color: var(--agy-text-muted); font-size: 11px; font-weight: 500;
      padding: 2px 7px; border-radius: 4px; cursor: pointer;
    }
    .view-mode-pill.active {
      background: var(--agy-surface-active); color: var(--agy-text);
    }

    /* Sidebar Conversation List */
    .sidebar-list {
      flex: 1; overflow-y: auto;
      padding: 4px 8px 14px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .convo-row {
      padding: 8px 10px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      cursor: pointer; transition: background 0.1s;
      color: var(--agy-text-sec);
    }
    .convo-row:hover {
      background: var(--agy-surface-hover); color: var(--agy-text);
    }
    .convo-row.active {
      background: var(--agy-surface-active); color: var(--agy-text); font-weight: 500;
    }
    .convo-row-left {
      display: flex; align-items: center; gap: 8px;
      min-width: 0; flex: 1;
    }
    .convo-status-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: transparent; border: 1.5px solid var(--agy-text-muted);
      flex-shrink: 0;
    }
    .convo-row.active .convo-status-dot {
      background: var(--agy-accent); border-color: var(--agy-accent);
    }
    .convo-status-dot.running {
      background: var(--agy-green); border-color: var(--agy-green);
      box-shadow: 0 0 8px var(--agy-green);
    }
    .convo-row-title {
      font-size: 13.5px; line-height: 1.35;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .convo-row-time {
      font-size: 11.5px; color: var(--agy-text-muted); flex-shrink: 0;
    }

    /* Workspace Group Folder Header (when in Workspace view mode) */
    .ws-folder-group {
      margin-bottom: 6px;
    }
    .ws-folder-head {
      padding: 6px 8px; border-radius: 6px;
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12px; font-weight: 600; color: var(--agy-text-sec);
      cursor: pointer;
    }
    .ws-folder-head:hover { background: var(--agy-surface-hover); color: var(--agy-text); }
    .ws-folder-children {
      padding-left: 6px; display: flex; flex-direction: column; gap: 2px;
    }
    .ws-folder-group.collapsed .ws-folder-children { display: none; }

    /* AGY Sidebar Bottom Footer Bar (Matches Desktop AGY Bottom-Left Bar) */
    .sidebar-footer {
      padding: 9px 12px;
      border-top: 1px solid var(--agy-border);
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12px; color: var(--agy-text-sec);
      background: var(--agy-sidebar-bg);
    }
    .sidebar-footer-left {
      display: flex; align-items: center; gap: 7px; min-width: 0;
    }
    .remote-online-pill {
      width: 22px; height: 22px; border-radius: 6px;
      background: rgba(34, 197, 94, 0.14); color: #4ade80;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    /* ============================================================
       MAIN CONVERSATION CANVAS (1:1 AGY Conversation View)
       ============================================================ */
    .agy-main {
      flex: 1; height: 100%; min-width: 0;
      background: var(--agy-bg);
      display: flex; flex-direction: column;
      position: relative;
    }

    /* AGY Native Top Header Bar */
    .agy-topbar {
      height: 46px; flex-shrink: 0;
      padding: 0 16px;
      border-bottom: 1px solid var(--agy-border);
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      background: var(--agy-bg);
      position: relative;
    }
    .topbar-left {
      display: flex; align-items: center; gap: 8px;
      min-width: 0; flex: 1;
    }
    .mobile-back-btn {
      appearance: none; border: 0; background: transparent;
      color: var(--agy-text-sec); padding: 4px 6px 4px 2px;
      border-radius: 6px; cursor: pointer;
      display: none; align-items: center; gap: 4px;
    }
    .mobile-back-btn:hover { background: var(--agy-surface-hover); color: var(--agy-text); }
    .topbar-title {
      font-size: 14px; font-weight: 600; color: var(--agy-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .topbar-right {
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .topbar-pill-btn {
      appearance: none;
      border: 1px solid var(--agy-border);
      background: var(--agy-surface);
      color: var(--agy-text-sec);
      height: 28px; padding: 0 9px;
      border-radius: 7px; font-size: 12px; font-weight: 500;
      display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer; transition: background 0.12s, color 0.12s;
    }
    .topbar-pill-btn:hover {
      background: var(--agy-surface-hover); color: var(--agy-text);
    }

    /* AGY Conversation Scroll Stream */
    .agy-stream {
      flex: 1; overflow-y: auto;
      padding: 20px 18px 32px;
      display: flex; flex-direction: column; gap: 26px;
      -webkit-overflow-scrolling: touch;
    }
    .agy-turn {
      max-width: 760px; width: 100%; margin: 0 auto;
      display: flex; flex-direction: column; gap: 14px;
    }

    /* AGY User Prompt Bubble */
    .agy-user-row {
      display: flex; justify-content: flex-end;
    }
    .agy-user-bubble {
      max-width: 85%;
      background: var(--agy-user-bubble);
      border: 1px solid var(--agy-border-strong);
      color: var(--agy-text);
      padding: 10px 15px;
      border-radius: 14px;
      font-size: 14.5px; line-height: 1.55;
      white-space: pre-wrap; word-break: break-word;
    }

    /* AGY Assistant Response Container */
    .agy-agent-row {
      display: flex; flex-direction: column; gap: 12px;
    }

    /* AGY Native Thought & Tool Execution Bar */
    .agy-thought-box {
      border-radius: 9px;
      background: var(--agy-surface);
      border: 1px solid var(--agy-border);
      overflow: hidden;
    }
    .agy-thought-box > summary {
      padding: 7px 12px;
      font-size: 12.5px; color: var(--agy-text-sec);
      cursor: pointer; user-select: none;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      list-style: none;
    }
    .agy-thought-box > summary::-webkit-details-marker { display: none; }
    .agy-thought-box > summary:hover { background: var(--agy-surface-hover); color: var(--agy-text); }
    .thought-summary-left {
      display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;
    }
    .thought-pulse-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--agy-accent); flex-shrink: 0;
      box-shadow: 0 0 8px var(--agy-accent);
    }
    .thought-focus-text {
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .agy-thought-body {
      padding: 8px 12px 10px;
      border-top: 1px solid var(--agy-border);
      background: rgba(0, 0, 0, 0.14);
      display: flex; flex-direction: column; gap: 6px;
    }
    .agy-thinking-block {
      font-size: 12px; color: var(--agy-text-sec);
      border-left: 2px solid var(--agy-border-strong);
      padding: 4px 10px; margin: 2px 0 4px;
      white-space: pre-wrap; font-family: var(--font-sans);
      max-height: 180px; overflow-y: auto;
    }

    /* AGY Native Tool Call Pills */
    .agy-tool-pill {
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid var(--agy-border);
      overflow: hidden;
    }
    .agy-tool-pill > summary {
      padding: 5px 9px;
      font-size: 12px; font-family: var(--font-mono);
      color: var(--agy-text-sec);
      cursor: pointer; list-style: none;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .agy-tool-pill > summary::-webkit-details-marker { display: none; }
    .agy-tool-pill > summary:hover { background: var(--agy-surface-hover); color: var(--agy-text); }
    .agy-tool-output {
      padding: 6px 9px;
      border-top: 1px solid var(--agy-border);
      background: #090a0c;
      font-family: var(--font-mono); font-size: 11px;
      color: var(--agy-text-muted);
      white-space: pre-wrap; word-break: break-all;
      max-height: 160px; overflow-y: auto;
    }

    /* AGY Native Steps Checklist Widget (1:1 Matches AGY update_steps UI!) */
    .agy-steps-card {
      background: var(--agy-surface);
      border: 1px solid var(--agy-border);
      border-radius: 10px;
      overflow: hidden;
    }
    .agy-steps-header {
      padding: 8px 13px;
      border-bottom: 1px solid var(--agy-border);
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12px; font-weight: 600; color: var(--agy-text-sec);
      background: rgba(255, 255, 255, 0.015);
    }
    .agy-steps-list {
      padding: 6px 12px;
      display: flex; flex-direction: column; gap: 5px;
    }
    .agy-step-row {
      display: flex; align-items: center; gap: 9px;
      font-size: 13px; line-height: 1.4;
      color: var(--agy-text-sec);
      padding: 2px 0;
    }
    .agy-step-row.done { color: var(--agy-text); }
    .agy-step-row.in_progress { color: var(--agy-accent); font-weight: 500; }
    .step-icon-done {
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--agy-green-bg); color: var(--agy-green);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 800; flex-shrink: 0;
    }
    .step-icon-prog {
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--agy-accent-bg); color: var(--agy-accent);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 10px; flex-shrink: 0;
    }
    .step-icon-pend {
      width: 16px; height: 16px; border-radius: 50%;
      border: 1.5px solid var(--agy-text-muted);
      display: inline-block; flex-shrink: 0;
    }

    /* AGY Intermediate Progress Update Text */
    .agy-progress-update {
      font-size: 13.5px; color: var(--agy-text-sec);
      padding-left: 11px;
      border-left: 2px solid var(--agy-border-strong);
    }

    /* AGY Native Markdown Typography */
    .md-prose {
      font-size: 14.5px; line-height: 1.68; color: var(--agy-text);
      word-break: break-word;
    }
    .md-prose p { margin: 0 0 11px 0; }
    .md-prose p:last-child { margin-bottom: 0; }
    .md-prose h1, .md-prose h2, .md-prose h3, .md-prose h4 {
      margin: 16px 0 8px 0; font-weight: 600; line-height: 1.35; color: var(--agy-text);
    }
    .md-prose h3 { font-size: 15.5px; }
    .md-prose ul, .md-prose ol {
      margin: 6px 0 12px 0; padding-left: 20px;
    }
    .md-prose li { margin: 4px 0; }
    .md-prose li::marker { color: var(--agy-text-muted); }
    .md-prose a {
      color: var(--agy-accent); text-decoration: none; font-weight: 500;
    }
    .md-prose a:hover { text-decoration: underline; }
    .md-prose code {
      font-family: var(--font-mono); font-size: 12.5px;
      background: var(--agy-surface-hover);
      border: 1px solid var(--agy-border);
      padding: 1.5px 5px; border-radius: 5px;
    }
    .code-block-wrap { position: relative; margin: 10px 0; }
    .code-copy-mini {
      position: absolute; top: 7px; right: 7px;
      appearance: none; border: 1px solid var(--agy-border-strong);
      background: var(--agy-surface); color: var(--agy-text-sec);
      border-radius: 5px; padding: 2px 8px; font-size: 11px; cursor: pointer;
    }
    .code-copy-mini:hover { color: var(--agy-text); background: var(--agy-surface-hover); }
    .md-prose pre {
      background: #0a0b0e; border: 1px solid var(--agy-border);
      padding: 12px 14px; border-radius: 9px; overflow-x: auto; margin: 0;
    }
    .md-prose pre code {
      background: transparent; border: 0; padding: 0; font-size: 12.5px; color: #e2e8f0;
    }

    /* Edited Files Diff & Revert Bar */
    .files-changed-card {
      background: var(--agy-surface);
      border: 1px solid var(--agy-border);
      border-radius: 9px;
      overflow: hidden;
    }
    .files-changed-bar {
      padding: 8px 12px;
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12.5px; cursor: pointer; user-select: none;
    }
    .files-changed-bar:hover { background: var(--agy-surface-hover); }
    .files-changed-left {
      display: flex; align-items: center; gap: 8px; font-weight: 500; color: var(--agy-text-sec);
    }
    .stat-add { color: var(--agy-green); font-family: var(--font-mono); font-weight: 600; }
    .stat-del { color: var(--agy-red); font-family: var(--font-mono); font-weight: 600; }
    .revert-btn {
      appearance: none; border: 1px solid var(--agy-border);
      background: var(--agy-surface-hover);
      color: var(--agy-text-sec); font-size: 11.5px; font-weight: 500;
      display: inline-flex; align-items: center; gap: 4px;
      cursor: pointer; padding: 3px 8px; border-radius: 5px;
    }
    .revert-btn:hover { color: var(--agy-text); border-color: var(--agy-border-strong); }
    .files-diff-drawer {
      display: none;
      border-top: 1px solid var(--agy-border);
      background: #090a0d;
      padding: 9px 12px;
      font-family: var(--font-mono); font-size: 11.5px;
      max-height: 240px; overflow-y: auto;
    }
    .files-changed-card.expanded .files-diff-drawer { display: block; }
    .files-changed-card.expanded .diff-arrow { transform: rotate(90deg); }
    .diff-arrow { transition: transform 0.15s ease; }
    .diff-file-item { margin-bottom: 8px; }
    .diff-file-item:last-child { margin-bottom: 0; }
    .diff-file-head {
      display: flex; align-items: center; justify-content: space-between;
      color: var(--agy-text-sec); font-weight: 600; margin-bottom: 4px; cursor: pointer;
    }
    .diff-file-head:hover { color: var(--agy-accent); }
    .diff-line-add { color: #4ade80; background: rgba(52, 211, 153, 0.11); padding: 1px 6px; border-radius: 3px; white-space: pre-wrap; word-break: break-all; }
    .diff-line-del { color: #f87171; background: rgba(248, 113, 113, 0.11); padding: 1px 6px; border-radius: 3px; white-space: pre-wrap; word-break: break-all; }

    /* Turn Action Row */
    .turn-footer-bar {
      display: flex; align-items: center; gap: 10px;
      color: var(--agy-text-muted); font-size: 11.5px;
    }
    .turn-action-icon {
      appearance: none; border: 0; background: transparent;
      color: var(--agy-text-muted); padding: 3px 5px; border-radius: 5px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px;
    }
    .turn-action-icon:hover, .turn-action-icon.active {
      color: var(--agy-text); background: var(--agy-surface-hover);
    }

    /* ============================================================
       AGY NATIVE AGENT INPUT BOX (Bottom Composer)
       ============================================================ */
    .agy-composer-outer {
      padding: 8px 16px 14px;
      padding-bottom: calc(14px + env(safe-area-inset-bottom));
      background: var(--agy-bg);
    }
    .agy-composer-box {
      max-width: 760px; width: 100%; margin: 0 auto;
      background: var(--agy-input-bg);
      border: 1px solid var(--agy-border-strong);
      border-radius: 14px;
      padding: 11px 13px 9px;
      display: flex; flex-direction: column; gap: 8px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
      position: relative;
    }
    .agy-composer-box:focus-within {
      border-color: rgba(96, 165, 250, 0.45);
    }
    .agy-composer-textarea {
      width: 100%; min-height: 42px; max-height: 140px;
      background: transparent; border: 0; outline: none; resize: none;
      font-size: 14.5px; line-height: 1.5; color: var(--agy-text);
    }
    .agy-composer-textarea::placeholder { color: var(--agy-text-muted); }
    .agy-composer-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .composer-left-group, .composer-right-group {
      display: flex; align-items: center; gap: 6px;
    }
    .agy-model-pill {
      appearance: none;
      border: 1px solid var(--agy-border);
      background: var(--agy-surface);
      color: var(--agy-text-sec);
      height: 26px; padding: 0 9px;
      border-radius: 999px;
      font-size: 12px; font-weight: 500;
      display: inline-flex; align-items: center; gap: 5px;
      cursor: pointer; transition: background 0.12s, color 0.12s;
    }
    .agy-model-pill:hover, .agy-model-pill.active {
      background: var(--agy-surface-hover); color: var(--agy-text);
    }
    .agy-model-pill.thinking-on {
      color: var(--agy-accent);
      border-color: rgba(96, 165, 250, 0.3);
      background: var(--agy-accent-bg);
    }
    .agy-send-btn {
      appearance: none; border: 0;
      width: 30px; height: 30px; border-radius: 8px;
      background: var(--agy-text); color: var(--agy-bg);
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; transition: opacity 0.12s, transform 0.1s;
    }
    .agy-send-btn:hover { opacity: 0.9; }
    .agy-send-btn.stopping {
      background: var(--agy-red-bg); color: var(--agy-red);
      border: 1px solid rgba(248, 113, 113, 0.4);
    }

    /* Popover Menus */
    .popover-sheet {
      position: absolute; bottom: calc(100% + 8px);
      background: var(--agy-surface);
      border: 1px solid var(--agy-border-strong);
      border-radius: 12px;
      padding: 6px;
      min-width: 220px; max-width: 300px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      z-index: 60;
      display: none; flex-direction: column; gap: 2px;
    }
    .popover-sheet.open { display: flex; }
    .popover-title {
      font-size: 11px; font-weight: 600; color: var(--agy-text-muted);
      padding: 4px 10px 6px; border-bottom: 1px solid var(--agy-border);
      margin-bottom: 2px;
    }
    .popover-item {
      appearance: none; border: 0; background: transparent;
      color: var(--agy-text); font-size: 13px;
      padding: 7px 10px; border-radius: 7px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      cursor: pointer; text-align: left;
    }
    .popover-item:hover, .popover-item.active { background: var(--agy-surface-hover); }
    .popover-stat-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 10px; font-size: 12px; color: var(--agy-text-sec);
    }

    .toast-banner {
      position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
      background: var(--agy-surface-active); color: var(--agy-text);
      border: 1px solid var(--agy-border-strong);
      padding: 7px 15px; border-radius: 999px;
      font-size: 12.5px; font-weight: 500;
      box-shadow: 0 6px 20px rgba(0,0,0,0.4);
      z-index: 200; opacity: 0; pointer-events: none;
      transition: opacity 0.18s ease;
    }
    .toast-banner.show { opacity: 1; }

    /* Code & Workspace Drawer */
    .code-drawer {
      position: fixed; inset: 0; z-index: 100;
      background: var(--agy-bg);
      display: none; flex-direction: column;
    }
    .code-drawer.open { display: flex; }

    /* Mobile Responsive 2-Page Adaptation of AGY Native Layout */
    @media (max-width: 860px) {
      .agy-sidebar { width: 100%; border-right: 0; }
      .agy-app[data-mobile-page="chat"] .agy-sidebar { display: none; }
      .agy-app[data-mobile-page="list"] .agy-main { display: none; }
      .mobile-back-btn { display: inline-flex; }
    }
  </style>
</head>
<body>
  <div class="toast-banner" id="toastBanner"></div>

  <div class="agy-app" id="appShell" data-mobile-page="chat">
    <!-- ============================================================
         LEFT SIDEBAR: 1:1 AGY Native Conversations Sidebar
         ============================================================ -->
    <aside class="agy-sidebar">
      <div class="sidebar-top">
        <div class="brand-bar">
          <div class="brand-left">
            <span class="agy-logo-mark">A</span>
            <span>Antigravity</span>
          </div>
          <div class="brand-actions">
            <button type="button" class="agy-icon-btn" id="refreshListBtn" title="同步桌面端会话">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0-6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            </button>
            <button type="button" class="agy-icon-btn" id="themeToggleBtn1" title="切换深浅色外观">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            </button>
          </div>
        </div>

        <button type="button" class="new-convo-btn" id="sidebarNewConvoBtn">
          <span class="new-convo-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            <span>新建会话</span>
          </span>
          <span class="kbd-hint">Ctrl+N</span>
        </button>

        <div class="sidebar-search-wrap">
          <svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input class="sidebar-search-input" id="wsSearchInput" placeholder="过滤未归档会话..." />
        </div>
      </div>

      <div class="sidebar-section-bar">
        <span id="wsSummaryCount">会话列表</span>
        <div class="view-mode-pills">
          <button type="button" class="view-mode-pill active" data-view-mode="flat">AGY 列表</button>
          <button type="button" class="view-mode-pill" data-view-mode="grouped">按工作区</button>
        </div>
      </div>

      <div class="sidebar-list" id="workspaceGroupsContainer"></div>

      <footer class="sidebar-footer">
        <div class="sidebar-footer-left">
          <span class="remote-online-pill" title="已连接本地 AGY 客户端">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/></svg>
          </span>
          <span id="connSubtitle" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">已同步桌面 AGY</span>
        </div>
        <button type="button" class="agy-icon-btn" id="sidebarOpenFilesBtn" title="浏览工作区文件">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
        </button>
      </footer>
    </aside>

    <!-- ============================================================
         RIGHT MAIN CANVAS: 1:1 AGY Native Conversation View
         ============================================================ -->
    <main class="agy-main">
      <header class="agy-topbar">
        <div class="topbar-left">
          <button type="button" class="mobile-back-btn" id="backToListBtn" title="返回会话列表">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            <span style="font-size:13px;font-weight:500;">会话</span>
          </button>
          <span class="topbar-title" id="activeConvoTitle">Antigravity 会话</span>
        </div>

        <div class="topbar-right">
          <!-- Context Window Circle Button (Matches AGY Titlebar Circle) -->
          <button type="button" class="agy-icon-btn" id="contextToolBtn" title="会话统计与上下文占用">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8" stroke-opacity="0.3"/><path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round"/></svg>
          </button>
          <!-- Workspace Files Drawer Toggle -->
          <button type="button" class="topbar-pill-btn" id="openCodeDrawerBtn" title="打开工作区文件">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
            <span>文件</span>
          </button>
        </div>

        <!-- Context & Telemetry Popover -->
        <div class="popover-sheet" id="contextMenuPopover" style="top:44px;bottom:auto;right:14px;">
          <div class="popover-title">AGY 会话与安全统计</div>
          <div class="popover-stat-row"><span>当前会话轮次</span><strong id="statTurnsCount">0 轮</strong></div>
          <div class="popover-stat-row"><span>累计执行步数</span><strong id="statStepsCount">0 步</strong></div>
          <div class="popover-stat-row"><span>Transcript 大小</span><strong id="statBytesSize">0 KB</strong></div>
          <div class="popover-stat-row"><span>实时同步内核</span><strong id="statSseState" style="color:var(--agy-green);">SSE 实时流</strong></div>
          <div class="popover-stat-row"><span>公网防泄漏保护</span><strong id="statE2eeState" style="color:var(--agy-green);">AES-256-GCM 端到端加密</strong></div>
        </div>
      </header>

      <!-- AGY Native Conversation Stream -->
      <div class="agy-stream" id="chatStream" data-testid="conversation-view"></div>

      <!-- AGY Native Agent Input Box -->
      <div class="agy-composer-outer">
        <div class="agy-composer-box" data-testid="agent-input-box">
          <!-- Plus Menu Popover -->
          <div class="popover-sheet" id="plusMenuPopover" style="left:10px;">
            <div class="popover-title">Antigravity 快捷指令</div>
            <button type="button" class="popover-item" data-plus-action="new"><span>➕ 新建对话</span></button>
            <button type="button" class="popover-item" data-plus-action="files"><span>📂 查看工作区文件</span></button>
            <button type="button" class="popover-item" data-plus-cmd="/plan "><span>🗺️ /plan 分步规划执行</span></button>
            <button type="button" class="popover-item" data-plus-cmd="/boost "><span>🚀 /boost 深度思考与验证</span></button>
            <button type="button" class="popover-item" data-plus-cmd="/goal "><span>🎯 /goal 持续推进直至达成</span></button>
            <button type="button" class="popover-item" data-plus-cmd="/compact "><span>🧹 /compact 压缩上下文</span></button>
          </div>

          <!-- Model Selector Popover (100% Dynamically Synced from Local AGY Client!) -->
          <div class="popover-sheet" id="modelMenuPopover" style="left:44px;">
            <div class="popover-title">切换 Antigravity 模型 (与桌面同步)</div>
            <div id="dynamicModelList" style="display:flex;flex-direction:column;gap:2px;"></div>
          </div>

          <textarea class="agy-composer-textarea" id="promptInput" rows="2" placeholder="向 Antigravity 发送指令，或输入 / 调用命令..."></textarea>

          <div class="agy-composer-toolbar">
            <div class="composer-left-group">
              <button type="button" class="agy-icon-btn" id="plusToolBtn" title="添加上下文或快捷指令 (+)">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              </button>
              <!-- AGY Native Model Selector Pill -->
              <button type="button" class="agy-model-pill" id="modelToolBtn" title="切换当前模型">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                <span id="modelBadgeText">同步中...</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <!-- AGY Thinking Toggle Pill -->
              <button type="button" class="agy-model-pill thinking-on" id="thinkingToolBtn" title="切换深度思考模式">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>
                <span>Thinking</span>
              </button>
            </div>

            <div class="composer-right-group">
              <button type="button" class="agy-send-btn stopping" id="stopRunBtn" title="停止当前运行任务" style="display:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>
              </button>
              <button type="button" class="agy-send-btn" id="sendPromptBtn" title="发送 / 加入队列 (Enter)">
                <svg id="sendIconSvg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Slide-out Workspace File Viewer / Editor Drawer -->
    <section class="code-drawer" id="codeDrawer">
      <header class="agy-topbar">
        <div class="topbar-left">
          <button type="button" class="topbar-pill-btn" id="closeCodeDrawerBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m15 18-6-6 6-6"/></svg>
            <span>返回对话</span>
          </button>
          <span class="topbar-title" id="activeFilePath" style="font-family:var(--font-mono);font-size:12px;">工作区文件浏览器</span>
        </div>
        <div class="topbar-right">
          <button type="button" class="topbar-pill-btn" id="saveFileBtn">💾 保存修改</button>
        </div>
      </header>
      <div style="padding:8px 14px;border-bottom:1px solid var(--agy-border);display:flex;gap:6px;background:var(--agy-sidebar-bg);">
        <select id="workspaceSelect" style="flex:1;padding:5px 8px;border-radius:6px;background:var(--agy-surface);border:1px solid var(--agy-border);font-size:12.5px;"></select>
        <button type="button" class="topbar-pill-btn" id="upDirBtn">↑ 上级目录</button>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div id="fileList" style="height:34%;overflow-y:auto;padding:8px;border-bottom:1px solid var(--agy-border);font-family:var(--font-mono);font-size:12px;"></div>
        <textarea id="codeEditor" spellcheck="false" style="flex:1;width:100%;background:#0a0b0e;color:#e2e8f0;border:0;outline:none;padding:14px;font-family:var(--font-mono);font-size:12.5px;line-height:1.55;resize:none;" placeholder="点击上方列表中的文件即可查看或编辑源码..."></textarea>
      </div>
    </section>
  </div>

  <script>
    try {
      window.__INITIAL_STATE__ = JSON.parse(decodeURIComponent("${encodedInitialState}"));
    } catch (e) {
      window.__INITIAL_STATE__ = null;
    }
    (() => {
      const urlParams = new URLSearchParams(location.search);
      const serverToken = ${JSON.stringify(token)};
      const token = urlParams.get('hash') || urlParams.get('token') || serverToken || localStorage.getItem('agy_remote_token') || '';
      if (token) localStorage.setItem('agy_remote_token', token);
      // Keep ?hash= in URL so "Open in Browser" from WeChat and browser bookmarking work seamlessly without prompting for Token!
      if (token && !urlParams.has('hash') && !urlParams.has('token')) {
        try {
          urlParams.set('hash', token);
          history.replaceState(null, '', location.pathname + '?' + urlParams.toString());
        } catch {}
      }

      const toastEl = document.getElementById('toastBanner');
      let toastTimer = null;
      function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
      }

      const shellEl = document.getElementById('appShell');
      // On desktop (>860px) both panes show simultaneously; on mobile start on list or active chat
      if (window.innerWidth <= 860) {
        shellEl.dataset.mobilePage = 'list';
      }
      const setMobilePage = (page) => {
        shellEl.dataset.mobilePage = page;
      };

      document.getElementById('backToListBtn').addEventListener('click', () => {
        setMobilePage('list');
      });

      document.getElementById('themeToggleBtn1').addEventListener('click', () => {
        const isLight = document.documentElement.classList.toggle('light');
        showToast(isLight ? '已切换至 AGY 浅色主题' : '已切换至 AGY 深色主题');
      });

      let cachedAesKeyPromise = null;
      async function getAesKey() {
        if (!window.crypto || !window.crypto.subtle || !token) return null;
        if (!cachedAesKeyPromise) {
          cachedAesKeyPromise = (async () => {
            const rawBytes = new TextEncoder().encode(token);
            const hashBuf = await crypto.subtle.digest('SHA-256', rawBytes);
            return await crypto.subtle.importKey('raw', hashBuf, { name: 'AES-GCM' }, false, ['decrypt']);
          })().catch(() => null);
        }
        return cachedAesKeyPromise;
      }

      async function decryptE2eeEnvelope(env) {
        const key = await getAesKey();
        if (!key) throw new Error('WebCrypto 不可用');
        const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const iv = b64ToBytes(env.iv);
        const cipherBytes = b64ToBytes(env.data);
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
        return JSON.parse(new TextDecoder().decode(plainBuf));
      }

      const api = async (path, options = {}) => {
        const canE2ee = Boolean(window.crypto && window.crypto.subtle && token);
        const headers = {
          'Content-Type': 'application/json',
          'x-agy-token': token,
          ...(canE2ee ? { 'x-agy-e2ee': '1' } : {}),
          ...(options.headers || {})
        };
        const res = await fetch(path, { ...options, headers, credentials: 'same-origin' });
        let data = await res.json().catch(() => ({}));
        if (data && data.e2ee && data.iv && data.data) {
          data = await decryptE2eeEnvelope(data);
        }
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      };

      let currentConversationId = '';
      let lastDesktopConvoId = '';
      let createNewMode = false;
      let isCurrentConvoRunning = false;
      let thinkingEnabled = true;
      let sidebarViewMode = 'flat'; // 'flat' (AGY default sidebar) | 'grouped' (by workspace)
      let filterSearchText = '';
      let lastRev = '';
      let lastSidebarSig = '';
      let renderedConvoId = '';
      const collapsedGroupPaths = new Set();

      const turnSigMap = new Map();
      const localConvoCache = new Map();
      let currentRoot = '';
      let currentSubDir = '';
      let activeFileRel = '';
      let lastLatestState = window.__INITIAL_STATE__ || null;

      const escapeHtml = s => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      function formatRelativeTime(ms) {
        if (!ms) return '刚刚';
        const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
        if (diffSec < 60) return '刚刚';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return diffMin + 'm';
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return diffHour + 'h';
        const diffDay = Math.floor(diffHour / 24);
        return diffDay + 'd';
      }

      function formatClockTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return hh + ':' + mi;
      }

      function formatProse(text) {
        if (!text) return '';
        const raw = escapeHtml(text);
        const segments = raw.split('\`\`\`');
        let html = '';
        for (let i = 0; i < segments.length; i++) {
          if (i % 2 === 1) {
            const firstNl = segments[i].indexOf('\\n');
            const code = firstNl >= 0 ? segments[i].slice(firstNl + 1) : segments[i];
            html += '<div class="code-block-wrap"><button type="button" class="code-copy-mini" data-copy-code="1">复制</button><pre><code>' + code + '</code></pre></div>';
          } else {
            const lines = segments[i].split('\\n');
            let inList = false;
            for (let line of lines) {
              const trimmed = line.trim();
              if (!trimmed) {
                if (inList) { html += '</ul>'; inList = false; }
                continue;
              }
              let formattedLine = line
                .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s"'<>)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
                .replace(/\\[([^\\]]+)\\]\\((file:\\/\\/\\/[^\\s"'<>)]+)\\)/g, '<a href="#" data-open-file-uri="$2">$1</a>');

              if (/^#{1,4}\\s+/.test(trimmed)) {
                if (inList) { html += '</ul>'; inList = false; }
                const titleText = formattedLine.replace(/^\\s*#{1,4}\\s+/, '');
                html += '<h3>' + titleText + '</h3>';
              } else if (/^[-*]\\s+/.test(trimmed)) {
                if (!inList) { html += '<ul>'; inList = true; }
                html += '<li>' + formattedLine.replace(/^\\s*[-*]\\s+/, '') + '</li>';
              } else {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<p>' + formattedLine + '</p>';
              }
            }
            if (inList) html += '</ul>';
          }
        }
        return html;
      }

      // Sidebar View Mode & Search Controls
      document.querySelectorAll('[data-view-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-view-mode]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          sidebarViewMode = btn.dataset.viewMode || 'flat';
          lastSidebarSig = '';
          if (lastLatestState) renderSidebarList(lastLatestState);
        });
      });

      document.getElementById('wsSearchInput').addEventListener('input', (e) => {
        filterSearchText = e.target.value.trim().toLowerCase();
        lastSidebarSig = '';
        if (lastLatestState) renderSidebarList(lastLatestState);
      });

      function renderConvoRowHtml(c) {
        const isAct = !createNewMode && c.conversationId === currentConversationId;
        return '<div class="convo-row ' + (isAct ? 'active' : '') + '" data-id="' + c.conversationId + '">' +
          '<div class="convo-row-left">' +
            '<span class="convo-status-dot ' + (c.isRunning ? 'running' : '') + '"></span>' +
            '<span class="convo-row-title">' + escapeHtml(c.title) + '</span>' +
          '</div>' +
          '<span class="convo-row-time">' + formatRelativeTime(c.updatedAtMs) + '</span>' +
        '</div>';
      }

      function renderSidebarList(st) {
        const convos = (st.conversations || []).filter(c => {
          if (filterSearchText && !(c.title || '').toLowerCase().includes(filterSearchText)) return false;
          return true;
        });
        const groups = st.workspaceGroups || [];
        const sig = [
          currentConversationId,
          createNewMode,
          sidebarViewMode,
          filterSearchText,
          [...collapsedGroupPaths].join(','),
          convos.map(c => c.conversationId + ':' + c.title + ':' + c.isRunning + ':' + c.updatedAtMs).join(',')
        ].join('|');
        if (sig === lastSidebarSig) return;
        lastSidebarSig = sig;

        document.getElementById('wsSummaryCount').textContent = '会话 (' + convos.length + ')';
        const container = document.getElementById('workspaceGroupsContainer');

        if (sidebarViewMode === 'flat') {
          container.innerHTML = convos.map(renderConvoRowHtml).join('') ||
            '<div style="padding:14px 12px;font-size:12.5px;color:var(--agy-text-muted);">没有匹配的未归档会话</div>';
        } else {
          container.innerHTML = groups.map(g => {
            const isCollapsed = collapsedGroupPaths.has(g.path);
            const gTasks = (g.tasks || []).filter(t => !filterSearchText || (t.title || '').toLowerCase().includes(filterSearchText));
            return '<div class="ws-folder-group ' + (isCollapsed ? 'collapsed' : '') + '">' +
              '<div class="ws-folder-head" data-toggle-ws="' + escapeHtml(g.path) + '">' +
                '<span>📁 ' + escapeHtml(g.name) + '</span>' +
                '<span style="font-size:11px;color:var(--agy-text-muted);">' + gTasks.length + '</span>' +
              '</div>' +
              '<div class="ws-folder-children">' + gTasks.map(renderConvoRowHtml).join('') + '</div>' +
            '</div>';
          }).join('');
        }

        container.querySelectorAll('[data-toggle-ws]').forEach(head => {
          head.addEventListener('click', () => {
            const p = head.dataset.toggleWs;
            if (collapsedGroupPaths.has(p)) collapsedGroupPaths.delete(p);
            else collapsedGroupPaths.add(p);
            lastSidebarSig = '';
            renderSidebarList(st);
          });
        });

        container.querySelectorAll('.convo-row').forEach(row => {
          row.addEventListener('click', () => {
            createNewMode = false;
            currentConversationId = row.dataset.id;
            lastRev = '';
            setMobilePage('chat');
            const cachedConvo = localConvoCache.get(currentConversationId);
            if (cachedConvo) {
              applyStateData({
                ...(lastLatestState || {}),
                activeConversationId: currentConversationId,
                title: cachedConvo.title,
                turns: cachedConvo.turns
              }, true);
            }
            pollState(true);
            api('/api/chat/switch', { method: 'POST', body: JSON.stringify({ conversationId: currentConversationId }) }).catch(() => {});
          });
        });
      }

      function renderDiffLinesHtml(snippet) {
        if (!snippet) return '<div style="color:var(--agy-text-muted);">已完成文件修改</div>';
        return snippet.split('\\n').map(line => {
          if (line.startsWith('+')) return '<div class="diff-line-add">' + escapeHtml(line) + '</div>';
          if (line.startsWith('-')) return '<div class="diff-line-del">' + escapeHtml(line) + '</div>';
          return '<div style="color:var(--agy-text-muted);padding:1px 6px;">' + escapeHtml(line) + '</div>';
        }).join('');
      }

      function buildStepsChecklistHtml(stepsChecklist) {
        if (!Array.isArray(stepsChecklist) || !stepsChecklist.length) return '';
        const doneCount = stepsChecklist.filter(s => s.status === 'done').length;
        const rowsHtml = stepsChecklist.map(s => {
          const st = s.status || 'pending';
          const iconHtml = st === 'done'
            ? '<span class="step-icon-done">✓</span>'
            : (st === 'in_progress'
              ? '<span class="step-icon-prog">●</span>'
              : '<span class="step-icon-pend"></span>');
          return '<div class="agy-step-row ' + escapeHtml(st) + '">' +
            iconHtml +
            '<span>' + escapeHtml(s.title) + '</span>' +
          '</div>';
        }).join('');
        return '<div class="agy-steps-card">' +
          '<div class="agy-steps-header">' +
            '<span>Steps</span>' +
            '<span>' + doneCount + ' / ' + stepsChecklist.length + '</span>' +
          '</div>' +
          '<div class="agy-steps-list">' + rowsHtml + '</div>' +
        '</div>';
      }

      function buildTurnHtml(turn) {
        const toolCount = turn.tools ? turn.tools.length : 0;
        const thinkCount = turn.thinkings ? turn.thinkings.length : 0;
        const updateCount = turn.updates ? turn.updates.length : 0;
        const isRunning = turn.status === 'running' && !turn.finalResponse;

        // 1:1 AGY Thought & Tool Calls Collapsible Bar
        let thoughtBoxHtml = '';
        if (toolCount > 0 || thinkCount > 0) {
          const summaryTitle = isRunning
            ? (turn.focusText || ('正在执行 ' + (turn.tools?.at(-1)?.label || '任务') + '...'))
            : ('Thought' + (toolCount ? (' and ran ' + toolCount + (toolCount === 1 ? ' action' : ' actions')) : ''));
          const pulseDot = isRunning ? '<span class="thought-pulse-dot"></span>' : '<span style="color:var(--agy-text-muted);">▸</span>';

          const thinkBlocks = (turn.thinkings || []).map(th =>
            '<div class="agy-thinking-block">' + escapeHtml(th) + '</div>'
          ).join('');

          const toolPills = (turn.tools || []).map(t =>
            '<details class="agy-tool-pill">' +
              '<summary>' +
                '<span>' + escapeHtml(t.icon) + ' ' + escapeHtml(t.label) + '</span>' +
                (t.isEdit ? '<span class="stat-add">+' + (t.addedLines || 0) + '</span>' : '') +
              '</summary>' +
              (t.detail || t.output
                ? '<div class="agy-tool-output">' + escapeHtml((t.detail ? '$ ' + t.detail + '\\n' : '') + (t.output || '')) + '</div>'
                : '') +
            '</details>'
          ).join('');

          thoughtBoxHtml = '<details class="agy-thought-box"' + (isRunning ? ' open' : '') + '>' +
            '<summary>' +
              '<div class="thought-summary-left">' +
                pulseDot +
                '<span class="thought-focus-text">' + escapeHtml(summaryTitle) + '</span>' +
              '</div>' +
              '<span style="font-size:11px;color:var(--agy-text-muted);">' + (toolCount ? (toolCount + ' 步') : '') + '</span>' +
            '</summary>' +
            '<div class="agy-thought-body">' + thinkBlocks + toolPills + '</div>' +
          '</details>';
        }

        // 1:1 AGY Steps Checklist Card
        const stepsCardHtml = buildStepsChecklistHtml(turn.stepsChecklist);

        // AGY Intermediate Visible Updates
        const updatesHtml = (isRunning && updateCount > 0)
          ? (turn.updates || []).slice(-2).map(u => '<div class="agy-progress-update md-prose">' + formatProse(u) + '</div>').join('')
          : '';

        const isQueued = turn.status === 'queued';
        // Main Assistant Markdown Response
        const proseText = turn.finalResponse || turn.liveText || '';
        const proseHtml = isQueued
          ? ('<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 11px;border-radius:8px;background:var(--agy-surface);border:1px dashed var(--agy-border-strong);font-size:12.5px;color:var(--agy-text-sec);">' +
               '<span>⏳ 队列中 (等待上一条执行完成后自动发送)</span>' +
               (turn.qid ? ('<button type="button" class="revert-btn" data-cancel-qid="' + turn.qid + '">✕ 取消</button>') : '') +
             '</div>')
          : (proseText
            ? '<div class="md-prose" data-testid="agent-response">' + formatProse(proseText) + '</div>'
            : (isRunning && !updatesHtml ? '<div style="font-size:13px;color:var(--agy-accent);">● Antigravity 正在处理...</div>' : ''));

        // Edited Files Bar with Line Diff & Revert
        const editedCount = turn.editedFiles ? turn.editedFiles.length : 0;
        const realAdd = Number(turn.addedLines || 0);
        const realDel = Number(turn.deletedLines || 0);
        const reversibleChange = (turn.fileChanges || []).find(fc => fc.revertInfo);
        const revertPayloadAttr = reversibleChange
          ? (' data-revert-json="' + escapeHtml(JSON.stringify(reversibleChange.revertInfo)) + '"')
          : '';

        const diffItemsHtml = (turn.fileChanges || []).map(fc =>
          '<div class="diff-file-item">' +
            '<div class="diff-file-head" data-open-file="' + escapeHtml(fc.filePath || '') + '">' +
              '<span>📄 ' + escapeHtml(fc.fileBase) + ' (点击在编辑器打开)</span>' +
              '<span><span class="stat-add">+' + fc.addedLines + '</span> <span class="stat-del">-' + fc.deletedLines + '</span></span>' +
            '</div>' +
            renderDiffLinesHtml(fc.diffSnippet) +
          '</div>'
        ).join('');

        const filesChangedHtml = editedCount > 0
          ? '<div class="files-changed-card">' +
              '<div class="files-changed-bar" data-toggle-diff="1">' +
                '<div class="files-changed-left">' +
                  '<svg class="diff-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6"/></svg>' +
                  '<span>已编辑 ' + editedCount + ' 个文件</span>' +
                  '<span class="stat-add">+' + realAdd + '</span>' +
                  '<span class="stat-del">-' + realDel + '</span>' +
                '</div>' +
                '<button type="button" class="revert-btn"' + revertPayloadAttr + ' data-revert-btn="1">↩ 撤销修改</button>' +
              '</div>' +
              '<div class="files-diff-drawer">' + diffItemsHtml + '</div>' +
            '</div>'
          : '';

        const clockStr = formatClockTime(turn.completedAt || turn.createdAt);
        const footerHtml = '<div class="turn-footer-bar">' +
          '<button type="button" class="turn-action-icon" data-copy-turn="' + escapeHtml(proseText || turn.userText || '') + '" title="复制内容"><svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>复制</span></button>' +
          '<button type="button" class="turn-action-icon" data-expand-turn="1" title="展开全部步骤与 Diff"><svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg><span>详情</span></button>' +
          (clockStr ? '<span>' + clockStr + '</span>' : '') +
        '</div>';

        return '<div class="agy-user-row"><div class="agy-user-bubble">' + escapeHtml(turn.userText) + '</div></div>' +
          '<div class="agy-agent-row">' +
            thoughtBoxHtml + stepsCardHtml + updatesHtml + proseHtml + filesChangedHtml + footerHtml +
          '</div>';
      }

      function bindTurnInteractions(containerEl) {
        containerEl.querySelectorAll('[data-toggle-diff="1"]').forEach(bar => {
          if (bar.dataset.bound) return;
          bar.dataset.bound = '1';
          bar.addEventListener('click', (e) => {
            if (e.target.closest('[data-revert-btn]')) return;
            const card = bar.closest('.files-changed-card');
            if (card) card.classList.toggle('expanded');
          });
        });

        containerEl.querySelectorAll('[data-revert-btn="1"]').forEach(btn => {
          if (btn.dataset.bound) return;
          btn.dataset.bound = '1';
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const rawJson = btn.dataset.revertJson;
            if (!rawJson) {
              document.getElementById('codeDrawer').classList.add('open');
              showToast('已打开代码浏览器');
              return;
            }
            if (!confirm('确定要撤销该步骤对文件的修改吗？')) return;
            try {
              const payload = JSON.parse(rawJson);
              await api('/api/fs/revert', { method: 'POST', body: JSON.stringify(payload) });
              showToast('↩ 已撤销该文件修改');
            } catch (err) {
              showToast('撤销失败: ' + err.message);
            }
          });
        });

        containerEl.querySelectorAll('[data-open-file]').forEach(el => {
          if (el.dataset.bound) return;
          el.dataset.bound = '1';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const fullPath = el.dataset.openFile || '';
            document.getElementById('codeDrawer').classList.add('open');
            if (fullPath && currentRoot) {
              const normRoot = currentRoot.replace(/\\\\/g, '/');
              const normFull = fullPath.replace(/\\\\/g, '/');
              if (normFull.toLowerCase().startsWith(normRoot.toLowerCase())) {
                const rel = normFull.slice(normRoot.length).replace(/^\\/+/, '');
                if (rel) openFile(currentRoot, rel);
              }
            }
          });
        });

        containerEl.querySelectorAll('[data-copy-turn]').forEach(btn => {
          if (btn.dataset.bound) return;
          btn.dataset.bound = '1';
          btn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(btn.dataset.copyTurn || '');
              btn.classList.add('active');
              showToast('已复制内容');
              setTimeout(() => btn.classList.remove('active'), 1200);
            } catch {}
          });
        });

        containerEl.querySelectorAll('[data-copy-code]').forEach(btn => {
          if (btn.dataset.bound) return;
          btn.dataset.bound = '1';
          btn.addEventListener('click', async () => {
            const code = btn.parentElement?.querySelector('code')?.innerText || '';
            try {
              await navigator.clipboard.writeText(code);
              btn.textContent = '已复制';
              setTimeout(() => { btn.textContent = '复制'; }, 1200);
            } catch {}
          });
        });

        containerEl.querySelectorAll('[data-cancel-qid]').forEach(btn => {
          if (btn.dataset.bound) return;
          btn.dataset.bound = '1';
          btn.addEventListener('click', async () => {
            const qid = Number(btn.dataset.cancelQid || 0);
            btn.closest('.agy-turn')?.remove();
            try {
              await api('/api/chat/queue-cancel', { method: 'POST', body: JSON.stringify({ conversationId: currentConversationId, qid }) });
              showToast('已从发送队列移除');
              pollState(false);
            } catch {}
          });
        });

        containerEl.querySelectorAll('[data-expand-turn]').forEach(btn => {
          if (btn.dataset.bound) return;
          btn.dataset.bound = '1';
          btn.addEventListener('click', () => {
            const turnEl = btn.closest('.agy-turn');
            if (!turnEl) return;
            const detailsList = turnEl.querySelectorAll('details');
            const anyClosed = [...detailsList].some(d => !d.open);
            detailsList.forEach(d => { d.open = anyClosed; });
            const diffCard = turnEl.querySelector('.files-changed-card');
            if (diffCard) diffCard.classList.toggle('expanded', anyClosed);
          });
        });
      }

      function updateSendStopButtonState(running) {
        isCurrentConvoRunning = Boolean(running);
        const stopBtn = document.getElementById('stopRunBtn');
        if (stopBtn) {
          stopBtn.style.display = isCurrentConvoRunning ? 'inline-flex' : 'none';
        }
      }

      const clientOptimisticSet = new Set();

      function applyStateData(st, forceScroll = false) {
        if (!st || st.unchanged) return;
        if (st.rev) lastRev = st.rev;

        // Fast-path merge when server sends a 1.2KB deltaOnly packet
        if (st.deltaOnly && lastLatestState && Array.isArray(st.deltaTurns)) {
          const validIds = Array.isArray(st.allTurnIds) ? new Set(st.allTurnIds) : null;
          let baseTurns = (lastLatestState.turns || []).filter(t => {
            const tid = String(t.turnId || '');
            if (tid.startsWith('turn-q-') || tid.startsWith('turn-pending-')) {
              return validIds ? validIds.has(tid) : false;
            }
            return validIds ? validIds.has(tid) : true;
          });
          for (const dt of st.deltaTurns) {
            const idx = baseTurns.findIndex(t => t.turnId === dt.turnId);
            if (idx >= 0) baseTurns[idx] = dt;
            else baseTurns.push(dt);
          }
          st = {
            ...lastLatestState,
            ...st,
            turns: baseTurns,
            deltaOnly: false
          };
        }

        // Deduplicate turns in case a synthetic turn-q-* and a real disk turn-* have the exact same userText at the tail
        if (Array.isArray(st.turns) && st.turns.length > 1) {
          const realDiskTexts = new Set(
            st.turns
              .filter(t => !String(t.turnId || '').startsWith('turn-q-'))
              .slice(-4)
              .map(t => (t.userText || '').trim())
          );
          st.turns = st.turns.filter(t => {
            const tid = String(t.turnId || '');
            if (tid.startsWith('turn-q-') && t.status !== 'queued' && realDiskTexts.has((t.userText || '').trim())) {
              return false;
            }
            return true;
          });
        }

        // Clear any client-side optimistic bubbles whose text is now present in server turns (either active or queued)
        const serverTailTexts = new Set((st.turns || []).slice(-6).map(t => (t.userText || '').trim()));
        for (const optItem of [...clientOptimisticSet]) {
          if (serverTailTexts.has(optItem.text) || (Date.now() - optItem.sentAt > 12000)) {
            clientOptimisticSet.delete(optItem);
            document.getElementById(optItem.domId)?.remove();
          }
        }

        lastLatestState = st;
        if (st.activeConversationId && st.turns) {
          localConvoCache.set(st.activeConversationId, { title: st.title, turns: st.turns });
        }

        document.getElementById('connSubtitle').textContent = st.client?.connected
          ? '已同步桌面 AGY 窗口'
          : '已连接本地会话';

        const activeModelLabel = st.client?.model || (st.turns?.at(-1)?.model) || 'Antigravity Default';
        document.getElementById('modelBadgeText').textContent = activeModelLabel;

        const clientModels = Array.isArray(st.client?.models) && st.client.models.length > 0
          ? st.client.models
          : [{ label: activeModelLabel, modelId: activeModelLabel }];
        const modelListEl = document.getElementById('dynamicModelList');
        const modelsSig = activeModelLabel + '|' + clientModels.map(m => m.label).join(',');
        if (modelListEl && modelListEl.dataset.sig !== modelsSig) {
          modelListEl.dataset.sig = modelsSig;
          modelListEl.innerHTML = clientModels.map(m => {
            const isCurr = m.label === activeModelLabel;
            return '<button type="button" class="popover-item ' + (isCurr ? 'active' : '') + '" data-model="' + escapeHtml(m.label) + '">' +
              '<span>' + escapeHtml(m.label) + '</span>' +
              (isCurr ? '<span style="font-size:11px;color:var(--agy-green);">✓ 当前</span>' : '') +
            '</button>';
          }).join('');
          modelListEl.querySelectorAll('[data-model]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const chosen = btn.dataset.model;
              togglePopover('');
              document.getElementById('modelBadgeText').textContent = chosen;
              showToast('正在同步切换桌面端模型为 ' + chosen + '...');
              try {
                await api('/api/chat/model', { method: 'POST', body: JSON.stringify({ model: chosen }) });
                showToast('✅ 桌面端模型已切换为: ' + chosen);
                setTimeout(() => pollState(false), 300);
              } catch (err) {
                showToast('模型切换失败: ' + err.message);
              }
            });
          });
        }

        const desktopActiveId = st.client?.activeConversationId || '';
        if (desktopActiveId && desktopActiveId !== lastDesktopConvoId) {
          lastDesktopConvoId = desktopActiveId;
          if (!createNewMode && currentConversationId !== desktopActiveId) {
            currentConversationId = desktopActiveId;
            lastRev = '';
          }
        }
        if (!createNewMode && !currentConversationId && st.activeConversationId) {
          currentConversationId = st.activeConversationId;
        }

        renderSidebarList(st);

        const turns = st.turns || [];
        document.getElementById('statTurnsCount').textContent = turns.length + ' 轮';
        document.getElementById('statStepsCount').textContent = (st.stepCount || turns.reduce((a, t) => a + (t.tools?.length || 1), 0)) + ' 步';
        const kb = ((st.byteSize || JSON.stringify(turns).length) / 1024).toFixed(1);
        document.getElementById('statBytesSize').textContent = kb + ' KB';

        const hasRunningTurn = turns.some(t => t.status === 'running' && !t.finalResponse);
        updateSendStopButtonState(hasRunningTurn);

        const streamEl = document.getElementById('chatStream');
        if (createNewMode) {
          renderedConvoId = '__new__';
          turnSigMap.clear();
          document.getElementById('activeConvoTitle').textContent = '新建 Antigravity 会话';
          streamEl.innerHTML = '<div class="agy-turn" style="margin-top:12vh;text-align:center;color:var(--agy-text-sec);">' +
            '<div style="font-size:20px;font-weight:600;color:var(--agy-text);margin-bottom:6px;">有什么我可以帮你的？</div>' +
            '<div style="font-size:13.5px;color:var(--agy-text-muted);">在下方输入框发送指令，桌面端 Antigravity 将同步开启新对话并执行。</div>' +
          '</div>';
          return;
        }

        const convoTitle = st.title || 'Antigravity 会话';
        document.getElementById('activeConvoTitle').textContent = convoTitle;

        const nearBottom = streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 150;

        if (renderedConvoId !== st.activeConversationId) {
          renderedConvoId = st.activeConversationId;
          turnSigMap.clear();
          streamEl.innerHTML = '';
        }

        // Strict DOM Reconciliation: remove any .agy-turn node not in current turns or active clientOptimisticSet!
        const validDomIds = new Set(turns.map(t => 'dom-' + t.turnId));
        for (const optItem of clientOptimisticSet) validDomIds.add(optItem.domId);
        streamEl.querySelectorAll('.agy-turn').forEach(el => {
          if (!validDomIds.has(el.id)) {
            turnSigMap.delete(el.id.replace(/^dom-/, ''));
            el.remove();
          }
        });

        let anyChanged = false;
        for (const turn of turns) {
          const stepsSig = (turn.stepsChecklist || []).map(s => s.status).join(',');
          const sig = [
            turn.turnId,
            turn.status,
            turn.focusText || '',
            stepsSig,
            turn.thinkings?.length || 0,
            turn.tools?.length || 0,
            turn.tools?.at(-1)?.output?.length || 0,
            turn.updates?.length || 0,
            turn.finalResponse?.length || 0,
            turn.liveText?.length || 0,
            turn.editedFiles?.length || 0,
            turn.addedLines || 0
          ].join(':');

          let itemEl = document.getElementById('dom-' + turn.turnId);
          if (!itemEl) {
            itemEl = document.createElement('div');
            itemEl.className = 'agy-turn';
            itemEl.id = 'dom-' + turn.turnId;
            itemEl.innerHTML = buildTurnHtml(turn);
            streamEl.appendChild(itemEl);
            bindTurnInteractions(itemEl);
            turnSigMap.set(turn.turnId, sig);
            anyChanged = true;
          } else if (turnSigMap.get(turn.turnId) !== sig) {
            itemEl.innerHTML = buildTurnHtml(turn);
            bindTurnInteractions(itemEl);
            turnSigMap.set(turn.turnId, sig);
            anyChanged = true;
          }
        }

        // Keep any remaining client optimistic bubbles at the very bottom
        for (const optItem of clientOptimisticSet) {
          const pendingEl = document.getElementById(optItem.domId);
          if (pendingEl && pendingEl.parentElement === streamEl) {
            streamEl.appendChild(pendingEl);
          }
        }

        if ((anyChanged && nearBottom) || forceScroll) {
          streamEl.scrollTop = streamEl.scrollHeight;
        }

        const wsSelect = document.getElementById('workspaceSelect');
        if (!wsSelect.options.length && st.workspaces?.length) {
          const allWs = [...new Set([...(st.workspaceHints || []), ...st.workspaces])];
          wsSelect.innerHTML = allWs.map(w => '<option value="' + escapeHtml(w) + '">' + escapeHtml(w) + '</option>').join('');
          currentRoot = allWs[0];
          loadDirectory(currentRoot, '');
        }
      }

      // Popovers
      const allPopovers = ['plusMenuPopover', 'contextMenuPopover', 'modelMenuPopover'];
      function togglePopover(targetId) {
        for (const id of allPopovers) {
          const el = document.getElementById(id);
          if (!el) continue;
          if (id === targetId) el.classList.toggle('open');
          else el.classList.remove('open');
        }
      }
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.popover-sheet') && !e.target.closest('#plusToolBtn') && !e.target.closest('#contextToolBtn') && !e.target.closest('#modelToolBtn')) {
          allPopovers.forEach(id => document.getElementById(id)?.classList.remove('open'));
        }
      });

      document.getElementById('plusToolBtn').addEventListener('click', () => togglePopover('plusMenuPopover'));
      document.getElementById('contextToolBtn').addEventListener('click', () => togglePopover('contextMenuPopover'));
      document.getElementById('modelToolBtn').addEventListener('click', () => togglePopover('modelMenuPopover'));

      document.getElementById('thinkingToolBtn').addEventListener('click', (e) => {
        thinkingEnabled = !thinkingEnabled;
        e.currentTarget.classList.toggle('thinking-on', thinkingEnabled);
        showToast(thinkingEnabled ? '🧠 Thinking 模式已开启' : 'Thinking 模式已关闭');
      });

      document.querySelectorAll('#plusMenuPopover [data-plus-action], #plusMenuPopover [data-plus-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
          togglePopover('');
          if (btn.dataset.plusAction === 'new') {
            startNewTask();
          } else if (btn.dataset.plusAction === 'files') {
            document.getElementById('codeDrawer').classList.add('open');
          } else if (btn.dataset.plusCmd) {
            const input = document.getElementById('promptInput');
            input.value = btn.dataset.plusCmd + input.value;
            input.focus();
          }
        });
      });

      document.querySelectorAll('#modelMenuPopover [data-model]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const chosen = btn.dataset.model;
          togglePopover('');
          document.getElementById('modelBadgeText').textContent = chosen;
          showToast('正在同步切换桌面模型为 ' + chosen + '...');
          try {
            await api('/api/chat/model', { method: 'POST', body: JSON.stringify({ model: chosen }) });
            showToast('✅ 已切换模型: ' + chosen);
          } catch (err) {
            showToast('模型切换提示: ' + err.message);
          }
        });
      });

      let pollInFlight = false;
      async function pollState(forceScroll = false) {
        if (pollInFlight && !forceScroll) return;
        pollInFlight = true;
        try {
          const revParam = forceScroll ? '' : ('&rev=' + encodeURIComponent(lastRev));
          const hasBase = !forceScroll && lastLatestState && lastLatestState.activeConversationId === currentConversationId && Array.isArray(lastLatestState.turns) && lastLatestState.turns.length > 0;
          const deltaParams = hasBase
            ? ('&baseConvo=' + encodeURIComponent(currentConversationId) + '&baseTurns=' + lastLatestState.turns.length)
            : '';
          const st = await api('/api/state?conversationId=' + encodeURIComponent(currentConversationId) + revParam + deltaParams);
          if (!st.unchanged) applyStateData(st, forceScroll);
        } catch {} finally {
          pollInFlight = false;
        }
      }

      if (window.__INITIAL_STATE__) {
        const initRaw = window.__INITIAL_STATE__;
        if (initRaw && initRaw.e2ee && initRaw.iv && initRaw.data) {
          decryptE2eeEnvelope(initRaw).then(dec => applyStateData(dec, true)).catch(() => pollState(true));
        } else {
          applyStateData(initRaw, true);
        }
      } else {
        pollState(true);
      }

      function startNewTask() {
        createNewMode = true;
        currentConversationId = '';
        lastRev = '';
        setMobilePage('chat');
        applyStateData(lastLatestState || {}, true);
        document.getElementById('promptInput').focus();
      }

      document.getElementById('sidebarNewConvoBtn').addEventListener('click', startNewTask);
      document.getElementById('refreshListBtn').addEventListener('click', () => {
        lastRev = '';
        pollState(false);
        showToast('已同步最新会话列表');
      });

      document.getElementById('stopRunBtn').addEventListener('click', async () => {
        try {
          await api('/api/chat/stop', { method: 'POST', body: JSON.stringify({ conversationId: currentConversationId }) });
          showToast('⏹ 已停止当前生成');
          setTimeout(() => pollState(false), 180);
        } catch (err) {
          showToast('停止失败: ' + err.message);
        }
      });

      let optCounter = 0;
      async function handleSendPrompt() {
        const input = document.getElementById('promptInput');
        const text = input.value.trim();
        if (!text) return;
        const wasCreateNew = createNewMode;
        input.value = '';
        input.focus();
        createNewMode = false;

        // 0ms Multi-Message Optimistic Queue UI: You can keep typing & sending multiple messages in a row!
        const domId = 'dom-opt-' + (++optCounter);
        const optItem = { domId, text, sentAt: Date.now() };
        clientOptimisticSet.add(optItem);
        try {
          const streamEl = document.getElementById('chatStream');
          const optEl = document.createElement('div');
          optEl.className = 'agy-turn';
          optEl.id = domId;
          const statusMsg = isCurrentConvoRunning
            ? '⏳ 已加入发送队列 (等待上一条执行完成)...'
            : '● Antigravity 正在思考并处理...';
          optEl.innerHTML = '<div class="agy-user-row"><div class="agy-user-bubble">' + escapeHtml(text) + '</div></div>' +
            '<div class="agy-agent-row"><div style="font-size:13px;color:var(--agy-accent);">' + statusMsg + '</div></div>';
          streamEl.appendChild(optEl);
          streamEl.scrollTop = streamEl.scrollHeight;
        } catch {}

        try {
          const res = await api('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({
              conversationId: wasCreateNew ? '' : currentConversationId,
              text,
              createNew: wasCreateNew
            })
          });
          if (res.conversationId) currentConversationId = res.conversationId;
          lastRev = '';
          setTimeout(() => pollState(true), 80);
        } catch (err) {
          clientOptimisticSet.delete(optItem);
          document.getElementById(domId)?.remove();
          showToast('发送失败: ' + err.message);
        }
      }

      document.getElementById('sendPromptBtn').addEventListener('click', handleSendPrompt);
      document.getElementById('promptInput').addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (!e.shiftKey && window.innerWidth > 860))) {
          e.preventDefault();
          handleSendPrompt();
        }
      });

      // Code Drawer
      document.getElementById('openCodeDrawerBtn').addEventListener('click', () => {
        document.getElementById('codeDrawer').classList.add('open');
      });
      document.getElementById('sidebarOpenFilesBtn').addEventListener('click', () => {
        document.getElementById('codeDrawer').classList.add('open');
      });
      document.getElementById('closeCodeDrawerBtn').addEventListener('click', () => {
        document.getElementById('codeDrawer').classList.remove('open');
      });

      async function loadDirectory(root, sub) {
        try {
          const data = await api('/api/fs/list?root=' + encodeURIComponent(root) + '&path=' + encodeURIComponent(sub));
          currentRoot = data.root;
          currentSubDir = data.relativePath || '';
          const listEl = document.getElementById('fileList');
          listEl.innerHTML = (data.entries || []).map(e =>
            '<div style="padding:5px 8px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;" data-path="' + escapeHtml(e.path) + '" data-dir="' + e.isDirectory + '">' +
            '<span>' + (e.isDirectory ? '📁 ' : '📄 ') + escapeHtml(e.name) + '</span>' +
            '<span style="color:var(--agy-text-muted);font-size:11px;">' + (e.isDirectory ? '' : (e.size > 1024 ? (e.size / 1024).toFixed(1) + 'KB' : e.size + 'B')) + '</span></div>'
          ).join('');
          listEl.querySelectorAll('[data-path]').forEach(el => {
            el.addEventListener('click', () => {
              if (el.dataset.dir === 'true') loadDirectory(currentRoot, el.dataset.path);
              else openFile(currentRoot, el.dataset.path);
            });
          });
        } catch {}
      }

      async function openFile(root, relPath) {
        try {
          const data = await api('/api/fs/read?root=' + encodeURIComponent(root) + '&path=' + encodeURIComponent(relPath));
          activeFileRel = data.path;
          document.getElementById('activeFilePath').textContent = data.fullPath;
          document.getElementById('codeEditor').value = data.content;
        } catch (err) {
          showToast('读取文件失败: ' + err.message);
        }
      }

      document.getElementById('saveFileBtn').addEventListener('click', async () => {
        if (!activeFileRel) return;
        const btn = document.getElementById('saveFileBtn');
        btn.textContent = '保存中...';
        try {
          await api('/api/fs/write', {
            method: 'POST',
            body: JSON.stringify({
              root: currentRoot,
              path: activeFileRel,
              content: document.getElementById('codeEditor').value
            })
          });
          btn.textContent = '✅ 已保存';
          showToast('文件已保存');
          setTimeout(() => { btn.textContent = '💾 保存修改'; }, 1500);
        } catch (err) {
          showToast('保存失败: ' + err.message);
          btn.textContent = '💾 保存修改';
        }
      });

      document.getElementById('workspaceSelect').addEventListener('change', e => loadDirectory(e.target.value, ''));
      document.getElementById('upDirBtn').addEventListener('click', () => {
        if (!currentSubDir) return;
        const parts = currentSubDir.split('/').filter(Boolean);
        parts.pop();
        loadDirectory(currentRoot, parts.join('/'));
      });

      // Real-time Server-Sent Events (SSE) push channel (0-RTT direct encrypted state frames!) + fallback polling
      let sseConnected = false;
      try {
        const es = new EventSource('/api/events');
        es.addEventListener('open', () => {
          sseConnected = true;
          const el = document.getElementById('statSseState');
          if (el) el.textContent = 'SSE 0ms 直推';
        });
        es.addEventListener('state', async (evt) => {
          if (!evt.data) return;
          try {
            let payload = JSON.parse(evt.data);
            if (payload && payload.e2ee && payload.iv && payload.data) {
              payload = await decryptE2eeEnvelope(payload);
            }
            if (payload && (!currentConversationId || payload.activeConversationId === currentConversationId)) {
              applyStateData(payload, false);
            } else if (payload && payload.rev !== lastRev) {
              pollState(false);
            }
          } catch {}
        });
        es.addEventListener('rev', (evt) => {
          if (evt.data && evt.data !== lastRev) {
            pollState(false);
          }
        });
        es.addEventListener('error', () => {
          sseConnected = false;
        });
      } catch {}

      (function loopPoll() {
        setTimeout(async () => {
          await pollState(false);
          loopPoll();
        }, sseConnected ? 2500 : 750);
      })();
    })();
  </script>
</body>
</html>`;
}
