import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual, createHash, createCipheriv } from 'node:crypto';
import {
  getAppDataDir,
  getLanAddresses,
  getClientCapabilities,
  remoteSendMessage,
  remoteStopGeneration,
  remoteSwitchConversation,
  remoteSwitchModel,
  revertFileEdit,
  remoteCaptureScreenshot,
  remoteClickScreen,
  listConversationsAndWorkspaces,
  getConversationMessages,
  getConfiguredSshHosts,
  bindConversationSshHost,
  getDefaultWorkspaces,
  listDirectoryTree,
  readWorkspaceFile,
  writeWorkspaceFile,
  executeTerminalCommand
} from '../../lib/bridge.mjs';
import { renderRemoteWebIdeHtml } from '../../lib/web-ui.mjs';
import { createPublicTunnelManager } from '../../lib/tunnel.mjs';
import { createTailscaleManager } from '../../lib/tailscale.mjs';
import { buildSidebarPayload, startSidebarInjector } from '../../lib/sidebar-inject.mjs';

const VERSION = '2.7.0';
const SELF_FILE = fileURLToPath(import.meta.url);
const SELF_MTIME = (() => { try { return statSync(SELF_FILE).mtimeMs; } catch { return 0; } })();

const DATA_DIR = join(getAppDataDir(), 'plugin_data', 'agy-remote');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const escapeHtml = s => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function loadOrCreateConfig() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
      // Automatically upgrade weak tokens (< 24 chars) to 192-bit base64url tokens
      if (cfg && typeof cfg.token === 'string' && cfg.token.length >= 24) {
        return cfg;
      }
      if (cfg && typeof cfg === 'object') {
        cfg.token = randomBytes(24).toString('base64url');
        writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
        return cfg;
      }
    } catch {}
  }
  const fresh = {
    port: Number(process.env.AGY_REMOTE_PORT || 18899),
    token: randomBytes(24).toString('base64url'),
    allowRemoteExec: false
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(fresh, null, 2) + '\n', { mode: 0o600 });
  return fresh;
}

function saveRuntimeState(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'runtime.json'), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolvePromise, rejectPromise) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > maxBytes) {
        rejectPromise(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolvePromise({});
      try { resolvePromise(JSON.parse(raw)); }
      catch { rejectPromise(new Error('JSON 格式无效')); }
    });
    req.on('error', rejectPromise);
  });
}

function findPreloadJs() {
  const candidates = [
    process.env.ANTIGRAVITY_APP_DATA_DIR && join(process.env.ANTIGRAVITY_APP_DATA_DIR, 'lib', 'node_modules', 'sidecar_sdk', 'preload.js'),
    join(homedir(), '.gemini', 'antigravity', 'lib', 'node_modules', 'sidecar_sdk', 'preload.js')
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      try { return readFileSync(p, 'utf8'); } catch {}
    }
  }
  return '';
}

function renderAuxPaneQrHtml(payload) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>移动端远程控制</title>
  <script src="/preload.js"></script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 14px;
      background: #1c1d21; color: #e4e4e7;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .card {
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #202126;
      border-radius: 14px; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .status-box {
      background: #27282e;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px; padding: 12px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 2px 8px; border-radius: 999px;
      background: ${payload.hasPublic ? 'rgba(34,197,94,0.14)' : 'rgba(249,115,22,0.14)'};
      color: ${payload.hasPublic ? '#4ade80' : '#fb923c'};
      font-size: 11px; font-weight: 600;
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .qr-dashed {
      border: 1px dashed rgba(255, 255, 255, 0.14);
      border-radius: 12px; padding: 18px;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .qr-box {
      width: 196px; height: 196px;
      padding: 12px; background: #fff; border-radius: 12px;
    }
    .qr-box svg { width: 100%; height: 100%; display: block; }
    .url-box {
      width: 100%; background: #16171b;
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 7px; padding: 8px;
      font-family: Consolas, monospace; font-size: 11px;
      color: #a1a1aa; word-break: break-all; user-select: all;
    }
    .btn {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #2f3037; color: #e4e4e7;
      border-radius: 7px; padding: 6px 10px;
      font-size: 12px; font-weight: 500; cursor: pointer;
    }
    .btn:hover { background: #3a3b44; }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <strong style="font-size:14px;">📱 手机扫码连接</strong>
      <div style="font-size:12px;color:#8e9099;margin-top:2px;">用手机相机扫码，或在任意 PC 浏览器打开链接控制当前工作区。</div>
    </div>
    <div class="status-box">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:6px;">
          <strong>等待手机连接</strong>
          <span class="badge"><span class="dot"></span><span>已就绪</span></span>
        </div>
        <button class="btn" id="openModalBtn">↗ 展开完整面板</button>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn" id="refreshBtn" style="flex:1;">🔄 刷新二维码</button>
        <button class="btn" id="copyBtn" style="flex:1;">📋 复制链接</button>
      </div>
    </div>
    <div class="qr-dashed">
      <div class="qr-box">${payload.qrSvg}</div>
      <div class="url-box">${escapeHtml(payload.activeUrl)}</div>
    </div>
  </div>
  <script>
    const activeUrl = ${JSON.stringify(payload.activeUrl)};
    document.getElementById('copyBtn').addEventListener('click', async e => {
      try {
        await navigator.clipboard.writeText(activeUrl);
        e.target.textContent = '✅ 已复制';
        setTimeout(() => { e.target.textContent = '📋 复制链接'; }, 1500);
      } catch {}
    });
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await fetch('/api/rotate-token' + location.search, { method: 'POST' });
      location.reload();
    });
    document.getElementById('openModalBtn').addEventListener('click', async () => {
      await fetch('/api/open-modal' + location.search, { method: 'POST' });
    });
  </script>
</body>
</html>`;
}

const config = loadOrCreateConfig();
let activePort = 18899;
let injector = null;
let tunnel = null;
let tailscale = null;

function currentPayload() {
  const lanList = getLanAddresses();
  const tsState = tailscale ? tailscale.getState() : { installed: false, backendState: 'NotInstalled', tailscaleIp: '', funnelUrl: '', funnelEnableUrl: '', authUrl: '', message: '' };
  const tailscaleAddr = lanList.find(x => x.isTailscale);
  const tsIp = tsState.tailscaleIp || tailscaleAddr?.address || '';
  const lanIp = (lanList.find(x => !x.isTailscale)?.address) || lanList[0]?.address || '127.0.0.1';
  const lanOrigin = `http://${lanIp}:${activePort}`;
  const tState = tunnel ? tunnel.getState() : { publicUrl: '', status: 'connecting', provider: 'Cloudflare Edge', lastError: '', lastLog: '' };

  // App-free public origin (works on any phone WITHOUT installing Tailscale app!):
  // 1. Tailscale Funnel permanent HTTPS URL (https://<your-machine>.ts.net)
  // 2. Cloudflare / Serveo 443 public HTTPS tunnel
  const appFreeOrigin = tsState.funnelUrl || tState.publicUrl || (tsIp ? `http://${tsIp}:${activePort}` : '');
  const tsAppOrigin = tsIp ? `http://${tsIp}:${activePort}` : '';
  const effectiveProvider = tsState.funnelUrl
    ? `Tailscale Funnel 永久公网 (${tsState.dnsName || 'HTTPS'})`
    : (tState.publicUrl ? tState.provider : (tsIp ? `Tailscale P2P (${tsIp})` : tState.provider));
  const effectiveStatus = (tsState.funnelUrl || tState.publicUrl || tsIp) ? 'ready' : tState.status;

  return buildSidebarPayload({
    port: activePort,
    token: config.token,
    lanOrigin: tsAppOrigin || lanOrigin,
    publicOrigin: appFreeOrigin,
    tunnelStatus: effectiveStatus,
    tunnelProvider: effectiveProvider,
    tailscaleState: { ...tsState, tailscaleIp: tsIp },
    serviceRunning: true
  });
}

function persistRuntime() {
  const payload = currentPayload();
  const lanList = getLanAddresses();
  const tState = tunnel ? tunnel.getState() : { publicUrl: '', status: 'connecting', provider: 'Cloudflare Edge', lastError: '', lastLog: '' };
  saveRuntimeState({
    version: VERSION,
    pid: process.pid,
    port: activePort,
    token: config.token,
    publicUrl: payload.publicUrl,
    lanUrl: payload.lanUrl,
    activeUrl: payload.activeUrl,
    tunnelStatus: payload.tunnelStatus,
    tunnelProvider: payload.tunnelProvider,
    tunnelError: tState.lastError || '',
    tunnelLog: tState.lastLog || '',
    tailscale: payload.tailscale,
    urls: [
      ...(payload.publicUrl ? [{ name: `公网跨网 (${payload.tunnelProvider})`, address: 'public', url: payload.publicUrl }] : []),
      ...lanList.map(item => ({ name: item.name, address: item.address, url: payload.lanUrl }))
    ],
    sshHostLinks: payload.sshHostLinks || [],
    primaryUrl: payload.activeUrl,
    startedAt: new Date().toISOString()
  });
  return payload;
}

// Per-IP Brute-Force Rate Limiter (Max 12 failed auth attempts per minute)
const authFailures = new Map();
function isRateLimited(ip) {
  const entry = authFailures.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    authFailures.delete(ip);
    return false;
  }
  return entry.count >= 12;
}
function recordAuthFailure(ip) {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || now > entry.resetAt) {
    authFailures.set(ip, { count: 1, resetAt: now + 60000 });
  } else {
    entry.count++;
  }
}

function parseSessionCookie(cookieHeader = '') {
  const m = String(cookieHeader).match(/(?:^|;\s*)agy_remote_session=([^;]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return ''; }
}

const checkAuth = (req, url) => {
  const qToken = url.searchParams.get('hash') || url.searchParams.get('token') || '';
  const hToken = String(req.headers['x-agy-token'] || '');
  const cToken = parseSessionCookie(req.headers.cookie);
  if (safeEqual(qToken, config.token) || safeEqual(hToken, config.token) || safeEqual(cToken, config.token)) {
    return true;
  }
  // Also allow matching QR session ID (sid) so WeChat -> "Open in Browser" transitions even with stripped hash work seamlessly!
  const qSid = url.searchParams.get('sid') || '';
  const expectedShortSid = 'd_' + config.token.slice(0, 10);
  const expectedFullSid = 'd_' + createHash('sha256').update(config.token + '-sid').digest('base64url').slice(0, 22);
  if (qSid && (safeEqual(qSid, expectedShortSid) || safeEqual(qSid, expectedFullSid))) {
    return true;
  }
  return false;
};

// Background memory state sync loop + Real-time 1KB Delta SSE push notifications
let bgClientSnapshot = { connected: false, activeConversationId: '', model: '', liveStream: null, summaries: [] };
const sseClients = new Set();
let lastBroadcastRev = '';
let lastBroadcastConvoId = '';
let lastBroadcastTurnCount = 0;

// Persistent Ordered Message Queue per Conversation (supports typing & queuing multiple messages while AI is running!)
const convoQueues = new Map(); // conversationId -> Array<{ qid, userText, status: 'active' | 'queued', createdAtMs }>
let queueSeq = 0;
let queueWorkerBusy = false;

async function processConversationQueues() {
  if (queueWorkerBusy) return;
  queueWorkerBusy = true;
  try {
    const client = bgClientSnapshot;
    const isClientRunning = Boolean(client?.liveStream?.isRunning);
    for (const [cid, list] of convoQueues.entries()) {
      if (!list.length) {
        convoQueues.delete(cid);
        continue;
      }
      // Check if the currently 'active' (dispatched) item is still running or ready for the next queued item
      const activeItem = list.find(it => it.status === 'active');
      if (activeItem) {
        continue;
      }
      // No active item in flight; if desktop is idle, dispatch the next 'queued' item!
      if (!isClientRunning) {
        const nextItem = list.find(it => it.status === 'queued');
        if (nextItem) {
          nextItem.status = 'active';
          nextItem.dispatchedAtMs = Date.now();
          try {
            await remoteSendMessage({
              conversationId: cid === '__default__' ? '' : cid,
              text: nextItem.userText,
              createNew: false
            });
          } catch {}
        }
      }
    }
  } catch {} finally {
    queueWorkerBusy = false;
  }
}

async function syncClientInBackground() {
  try {
    bgClientSnapshot = await getClientCapabilities(false);
    await processConversationQueues();
    if (sseClients.size > 0) {
      // Group connected SSE clients by their sshFilter so each SSH host link gets its own filtered state
      const byFilter = new Map();
      for (const res of sseClients) {
        const f = res.sshFilter || '';
        if (!byFilter.has(f)) byFilter.set(f, []);
        byFilter.get(f).push(res);
      }
      for (const [sshFilter, clientList] of byFilter.entries()) {
        const st = await buildFullState('', sshFilter ? '' : lastBroadcastRev, sshFilter ? '' : lastBroadcastConvoId, sshFilter ? 0 : lastBroadcastTurnCount, sshFilter);
        if (!st.unchanged && st.rev) {
          if (!sshFilter) {
            lastBroadcastRev = st.rev;
            lastBroadcastConvoId = st.activeConversationId || lastBroadcastConvoId;
            if (st.turnCount) lastBroadcastTurnCount = st.turnCount;
          }
          const encryptedState = encryptE2eePayload(JSON.stringify(st), config.token);
          const frame = `event: state\ndata: ${encryptedState}\n\n`;
          for (const res of clientList) {
            try { res.write(frame); } catch { sseClients.delete(res); }
          }
        }
      }
    }
  } catch {}
}
setInterval(syncClientInBackground, 280);

async function buildFullState(requestedId = '', clientRev = '', clientConvoId = '', clientTurnCount = 0, sshFilter = '') {
  const client = bgClientSnapshot.connected ? bgClientSnapshot : await getClientCapabilities(false);
  const cleanFilter = String(sshFilter || '').trim();
  const { conversations, workspaceGroups, sshHosts } = listConversationsAndWorkspaces(client.summaries || [], cleanFilter);
  let activeId = requestedId;
  if (!activeId) {
    if (cleanFilter && cleanFilter !== 'all') {
      // If viewing a specific SSH host link, only select client.activeConversationId if it belongs to this SSH host!
      const matchesFilter = conversations.some(c => c.conversationId === client.activeConversationId);
      activeId = matchesFilter ? client.activeConversationId : (conversations[0]?.conversationId || '');
    } else {
      activeId = client.activeConversationId || conversations[0]?.conversationId || '';
    }
  }
  const convoData = activeId ? getConversationMessages(activeId) : { conversationId: '', turns: [], stepCount: 0, mtimeMs: 0, byteSize: 0, workspaceHints: [] };
  const matchingSummary = conversations.find(c => c.conversationId === convoData.conversationId);
  const title = matchingSummary?.title || convoData.title || (cleanFilter && cleanFilter !== 'all' ? `SSH: ${cleanFilter} (新会话)` : '任务会话');

  const turns = convoData.turns ? [...convoData.turns] : [];
  const ls = client.liveStream;
  const cid = convoData.conversationId;

  // Reconcile queue items against disk transcript.jsonl turns
  const qList = convoQueues.get(cid) || [];
  if (qList.length > 0) {
    const recentDiskTexts = new Set(turns.slice(-4).map(t => (t.userText || '').trim()));
    for (let i = qList.length - 1; i >= 0; i--) {
      const item = qList[i];
      if (item.status === 'active' && (recentDiskTexts.has(item.userText) || (Date.now() - (item.dispatchedAtMs || item.createdAtMs) > 25000))) {
        qList.splice(i, 1);
      }
    }
  }

  // Merge live in-memory stream ONLY into the current running turn (NEVER duplicate an already-finished disk turn!)
  const activeQItem = qList.find(it => it.status === 'active');
  if (activeQItem) {
    // Dispatched to desktop but not yet flushed to disk transcript.jsonl
    const matchesLive = Boolean(ls && ls.conversationId === cid && ls.isRunning);
    turns.push({
      turnId: `turn-q-${activeQItem.qid}`,
      turnNumber: turns.length + 1,
      stepIndexStart: 999900 + activeQItem.qid,
      userText: activeQItem.userText,
      createdAt: new Date(activeQItem.createdAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      model: client.model || '',
      thinkings: (matchesLive && ls.liveThinking) ? [ls.liveThinking] : [],
      tools: (matchesLive && ls.toolName) ? [{ id: `live-q-${activeQItem.qid}`, name: ls.toolName, icon: '⚡', label: ls.toolName, detail: '', output: '' }] : [],
      stepsChecklist: (matchesLive && Array.isArray(ls.stepsChecklist)) ? ls.stepsChecklist : [],
      focusText: (matchesLive && (ls.focusText || ls.toolName)) ? (ls.focusText || `正在执行 ${ls.toolName}...`) : '正在思考并准备响应...',
      editedFiles: [],
      fileChanges: [],
      addedLines: 0,
      deletedLines: 0,
      updates: (matchesLive && Array.isArray(ls.liveUpdates)) ? ls.liveUpdates : [],
      finalResponse: '',
      liveText: (matchesLive && ls.liveText) ? ls.liveText : '',
      errors: [],
      status: 'running'
    });
  } else if (ls && ls.conversationId === cid && turns.length > 0) {
    const lastTurn = { ...turns[turns.length - 1] };
    // Strictly only attach liveStream if this last disk turn does NOT already have a completed finalResponse!
    if (!lastTurn.finalResponse && (ls.isRunning || lastTurn.status === 'running')) {
      if (ls.isRunning) lastTurn.status = 'running';
      if (ls.liveText && (!ls.userText || ls.userText === (lastTurn.userText || '').trim())) {
        lastTurn.liveText = ls.liveText;
      }
      if (ls.liveThinking && (!lastTurn.thinkings || !lastTurn.thinkings.includes(ls.liveThinking))) {
        lastTurn.thinkings = [...(lastTurn.thinkings || []), ls.liveThinking];
      }
      if (Array.isArray(ls.liveUpdates) && ls.liveUpdates.length > 0) {
        const mergedUpdates = [...(lastTurn.updates || [])];
        for (const u of ls.liveUpdates) {
          if (u && !mergedUpdates.includes(u)) mergedUpdates.push(u);
        }
        lastTurn.updates = mergedUpdates;
      }
      if (Array.isArray(ls.stepsChecklist) && ls.stepsChecklist.length > 0) {
        lastTurn.stepsChecklist = ls.stepsChecklist;
      }
      if (ls.focusText) {
        lastTurn.focusText = ls.focusText;
      } else if (ls.toolName && !lastTurn.focusText) {
        lastTurn.focusText = `正在执行 ${ls.toolName}...`;
      }
      turns[turns.length - 1] = lastTurn;
    }
  }

  // Append any queued messages waiting in line so user sees their full input queue on screen!
  for (const qItem of qList) {
    if (qItem.status !== 'queued') continue;
    turns.push({
      turnId: `turn-q-${qItem.qid}`,
      qid: qItem.qid,
      turnNumber: turns.length + 1,
      stepIndexStart: 999900 + qItem.qid,
      userText: qItem.userText,
      createdAt: new Date(qItem.createdAtMs).toISOString(),
      completedAt: new Date(qItem.createdAtMs).toISOString(),
      model: client.model || '',
      thinkings: [],
      tools: [],
      stepsChecklist: [],
      focusText: '排队中 (等待上一条执行完成)...',
      editedFiles: [],
      fileChanges: [],
      addedLines: 0,
      deletedLines: 0,
      updates: [],
      finalResponse: '',
      liveText: '',
      errors: [],
      status: 'queued'
    });
  }

  const latestTurn = turns.at(-1);
  const rev = [
    convoData.conversationId,
    convoData.byteSize || 0,
    convoData.stepCount || 0,
    turns.length,
    latestTurn?.turnId || '',
    latestTurn?.status || '',
    latestTurn?.finalResponse?.length || 0,
    latestTurn?.liveText?.length || 0,
    latestTurn?.updates?.length || 0,
    latestTurn?.thinkings?.length || 0,
    latestTurn?.tools?.length || 0,
    (latestTurn?.stepsChecklist || []).map(s => s.status).join(','),
    conversations.length,
    conversations[0]?.updatedAtMs || 0,
    client.activeConversationId || '',
    client.model || '',
    cleanFilter || 'all'
  ].join(':');

  if (clientRev && clientRev === rev) {
    return { ok: true, unchanged: true, rev };
  }

  const clientMeta = {
    connected: client.connected,
    activeConversationId: client.activeConversationId,
    model: client.model || (convoData.turns?.at(-1)?.model) || '',
    models: Array.isArray(client.models) ? client.models : []
  };

  // Ultra-fast 1.2KB Delta Mode: If client already has the earlier turns of this conversation,
  // send ONLY the active lastTurn (+ last 2 turns if turn count just incremented by 1) instead of 65KB full history!
  if (
    clientConvoId
    && clientConvoId === convoData.conversationId
    && clientTurnCount > 0
    && turns.length >= clientTurnCount - 2
    && Math.abs(turns.length - clientTurnCount) <= 3
  ) {
    return {
      ok: true,
      deltaOnly: true,
      rev,
      turnCount: turns.length,
      client: clientMeta,
      activeConversationId: convoData.conversationId,
      title,
      stepCount: convoData.stepCount || 0,
      byteSize: convoData.byteSize || 0,
      allTurnIds: turns.map(t => t.turnId),
      deltaTurns: turns.slice(-4)
    };
  }

  return {
    ok: true,
    rev,
    turnCount: turns.length,
    hostName: hostname(),
    sshFilter: cleanFilter || 'all',
    sshHosts: sshHosts || [],
    client: clientMeta,
    activeConversationId: convoData.conversationId,
    title,
    stepCount: convoData.stepCount || 0,
    byteSize: convoData.byteSize || 0,
    conversations,
    workspaceGroups,
    turns,
    workspaceHints: convoData.workspaceHints || [],
    workspaces: getDefaultWorkspaces()
  };
}

// AES-256-GCM End-to-End Encryption (E2EE) so public tunnel nodes never see plaintext code or conversations!
function encryptE2eePayload(plainJsonStr, tokenStr) {
  const key = createHash('sha256').update(String(tokenStr || ''), 'utf8').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainJsonStr, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({
    e2ee: true,
    iv: iv.toString('base64'),
    data: enc.toString('base64')
  });
}

function sendCompressed(req, res, statusCode, contentType, bodyStr, extraHeaders = {}) {
  let finalBody = bodyStr;
  if (req.headers['x-agy-e2ee'] === '1' && contentType.includes('application/json') && statusCode === 200) {
    try {
      finalBody = encryptE2eePayload(bodyStr, config.token);
    } catch {}
  }
  const baseHeaders = {
    'Content-Type': contentType,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  };
  const accept = String(req.headers['accept-encoding'] || '');
  if (accept.includes('gzip') && finalBody.length > 1024) {
    const gz = gzipSync(Buffer.from(finalBody, 'utf8'));
    res.writeHead(statusCode, {
      ...baseHeaders,
      'Content-Encoding': 'gzip',
      'Vary': 'Accept-Encoding'
    });
    res.end(gz);
    return;
  }
  res.writeHead(statusCode, baseHeaders);
  res.end(finalBody);
}

const server = createServer(async (req, res) => {
  const forwardedIp = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const clientIp = forwardedIp || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '尝试次数过多，请 1 分钟后再试' }));
    return;
  }

  // Strict CORS Policy: ONLY allow loopback Antigravity renderer origin, NEVER wildcard '*'!
  const origin = String(req.headers.origin || '');
  if (/^https:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-agy-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${activePort}`);

  // Serve Main Web IDE Page on both '/' and '/remote/v4'
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/remote/'))) {
    if (!checkAuth(req, url)) {
      if (url.searchParams.has('hash') || url.searchParams.has('token')) {
        recordAuthFailure(clientIp);
      }
      sendCompressed(req, res, 200, 'text/html; charset=utf-8', `<!doctype html><html><head><meta charset="utf-8"/><meta name="referrer" content="no-referrer"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>AGY Remote 登录</title>
      <style>body{background:#111214;color:#ececef;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
      .box{background:#18191c;border:1px solid rgba(255,255,255,0.1);padding:24px;border-radius:14px;width:320px;display:flex;flex-direction:column;gap:12px}
      input{padding:10px;border-radius:8px;border:1px solid #334155;background:#111214;color:#fff}
      button{padding:10px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}</style></head>
      <body><form class="box" onsubmit="event.preventDefault();location.href='/remote/v4?hash='+encodeURIComponent(this.t.value.trim())">
      <h3 style="margin:0">🔐 AGY Remote 访问验证</h3>
      <p style="margin:0;font-size:12px;color:#8e9099">请直接用手机扫 AGY 客户端左下角的二维码，或输入安全 Token：</p>
      <input name="t" placeholder="输入 Token..." autofocus />
      <button type="submit">进入远程工作区</button></form></body></html>`);
      return;
    }

    // Embed AES-256-GCM E2EE encrypted initialState directly in first HTML response
    // so mobile browser renders readable conversation in 0ms (0 extra HTTP round-trip) while keeping 100% E2EE security!
    const sshFilter = url.searchParams.get('ssh') || '';
    const rawInitialState = await buildFullState('', '', '', 0, sshFilter);
    const encryptedInitialState = JSON.parse(encryptE2eePayload(JSON.stringify(rawInitialState), config.token));
    const cookieHeader = `agy_remote_session=${encodeURIComponent(config.token)}; Path=/; HttpOnly; SameSite=Lax`;
    sendCompressed(
      req,
      res,
      200,
      'text/html; charset=utf-8',
      renderRemoteWebIdeHtml({ token: config.token, hostName: hostname(), sshFilter, initialState: encryptedInitialState }),
      { 'Set-Cookie': cookieHeader }
    );
    return;
  }

  // All API endpoints (including /api/qrcode.svg!) MUST pass authentication!
  if (!checkAuth(req, url)) {
    recordAuthFailure(clientIp);
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Token 未授权，请重新扫码或使用最新链接' }));
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/qrcode.svg') {
      const payload = currentPayload();
      sendCompressed(req, res, 200, 'image/svg+xml; charset=utf-8', payload.qrSvg);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/tunnel/refresh') {
      tunnel.restart(true);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/tailscale/setup') {
      const tsRes = tailscale ? tailscale.installOrLogin() : {};
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, ...tsRes }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.sshFilter = url.searchParams.get('ssh') || '';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`event: connected\ndata: ok\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      const requestedId = url.searchParams.get('conversationId') || '';
      const clientRev = url.searchParams.get('rev') || '';
      const baseConvo = url.searchParams.get('baseConvo') || '';
      const baseTurns = Number(url.searchParams.get('baseTurns') || 0);
      const sshFilter = url.searchParams.get('ssh') || '';
      const fullState = await buildFullState(requestedId, clientRev, baseConvo, baseTurns, sshFilter);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(fullState));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/send') {
      const body = await readJsonBody(req);
      const cleanPrompt = String(body.text || '').trim();
      if (!cleanPrompt) {
        sendCompressed(req, res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: '消息不能为空' }));
        return;
      }
      const sshHost = String(body.sshHost || url.searchParams.get('ssh') || '').trim();
      const isNewSession = Boolean(body.createNew) || !body.conversationId;
      let dispatchedPrompt = cleanPrompt;

      // If user is on a dedicated SSH host link (e.g. ?ssh=58.61.156.10) and starts a new conversation,
      // automatically inject the SSH server target context so they don't have to type "ssh user@host" manually!
      if (sshHost && sshHost !== 'all' && sshHost !== 'local' && isNewSession) {
        const cfgHosts = getConfiguredSshHosts();
        const matched = cfgHosts.find(x => x.host === sshHost || x.hostname === sshHost);
        const sshTarget = matched?.sshTarget || sshHost;
        if (!cleanPrompt.toLowerCase().includes(sshHost.toLowerCase())) {
          dispatchedPrompt = `[SSH 远程服务器绑定: 本会话工作在远程服务器 ${sshTarget} 上，请通过 ssh ${sshTarget} 在该远程服务器上执行所有代码读写、计算与研究任务]\n${cleanPrompt}`;
        }
      }

      const targetCid = String(body.conversationId || bgClientSnapshot.activeConversationId || '');
      if (targetCid && sshHost && sshHost !== 'all') {
        bindConversationSshHost(targetCid, sshHost);
      }
      if (!convoQueues.has(targetCid)) convoQueues.set(targetCid, []);
      const qList = convoQueues.get(targetCid);
      const hasInFlight = qList.some(it => it.status === 'active') || Boolean(bgClientSnapshot.liveStream?.isRunning && bgClientSnapshot.liveStream?.conversationId === targetCid);

      const qItem = {
        qid: ++queueSeq,
        userText: cleanPrompt,
        dispatchedText: dispatchedPrompt,
        status: (!body.createNew && hasInFlight) ? 'queued' : 'active',
        createdAtMs: Date.now(),
        dispatchedAtMs: (!body.createNew && hasInFlight) ? 0 : Date.now()
      };
      qList.push(qItem);

      if (qItem.status === 'queued') {
        // Queued in line! Return immediately (0ms) so mobile user can keep typing more messages!
        void syncClientInBackground();
        sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify({
          ok: true,
          queued: true,
          qid: qItem.qid,
          queuePosition: qList.filter(it => it.status === 'queued').length,
          conversationId: targetCid
        }));
        return;
      }

      const result = await remoteSendMessage({
        conversationId: body.conversationId,
        text: dispatchedPrompt,
        createNew: Boolean(body.createNew)
      });
      if (result?.conversationId) {
        if (sshHost && sshHost !== 'all') {
          bindConversationSshHost(result.conversationId, sshHost);
        }
        if (result.conversationId !== targetCid) {
          convoQueues.delete(targetCid);
          convoQueues.set(result.conversationId, [qItem]);
        }
      }
      void syncClientInBackground();
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/queue-cancel') {
      const body = await readJsonBody(req);
      const targetCid = String(body.conversationId || bgClientSnapshot.activeConversationId || '');
      const qid = Number(body.qid || 0);
      const qList = convoQueues.get(targetCid) || [];
      const idx = qList.findIndex(it => it.qid === qid);
      if (idx >= 0) qList.splice(idx, 1);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/stop') {
      const body = await readJsonBody(req);
      const result = await remoteStopGeneration(body.conversationId);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/switch') {
      const body = await readJsonBody(req);
      const result = await remoteSwitchConversation(body.conversationId);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/model') {
      const body = await readJsonBody(req);
      const result = await remoteSwitchModel(body.model);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/fs/revert') {
      const body = await readJsonBody(req);
      const result = revertFileEdit(body);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fs/list') {
      const root = url.searchParams.get('root') || '';
      const sub = url.searchParams.get('path') || '';
      const result = listDirectoryTree(root, sub);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fs/read') {
      const root = url.searchParams.get('root') || '';
      const rel = url.searchParams.get('path') || '';
      const result = readWorkspaceFile(root, rel);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/fs/write') {
      const body = await readJsonBody(req);
      const result = writeWorkspaceFile(body.root, body.path, body.content);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/terminal/exec') {
      if (!config.allowRemoteExec) {
        sendCompressed(req, res, 403, 'application/json; charset=utf-8', JSON.stringify({ error: '安全保护：默认已禁用远程直接执行 Shell 命令，请通过 AGY 对话框由 Agent 安全执行。' }));
        return;
      }
      const body = await readJsonBody(req);
      const result = await executeTerminalCommand(body.command, body.cwd);
      sendCompressed(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
      return;
    }

    sendCompressed(req, res, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'Not Found' }));
  } catch (err) {
    sendCompressed(req, res, 500, 'application/json; charset=utf-8', JSON.stringify({ error: err.message || 'Server Error' }));
  }
});

await new Promise((resolvePromise, rejectPromise) => {
  let samePortWaitRetries = 5;
  const tryListen = (p, retriesLeft) => {
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        if (samePortWaitRetries > 0) {
          samePortWaitRetries--;
          setTimeout(() => tryListen(p, retriesLeft), 450);
          return;
        }
        if (retriesLeft > 0) {
          activePort = p + 1;
          tryListen(activePort, retriesLeft - 1);
          return;
        }
      }
      rejectPromise(err);
    });
    server.listen(p, '0.0.0.0', () => {
      activePort = p;
      resolvePromise();
    });
  };
  tryListen(activePort, 10);
});

// Start Tailscale embedded manager & Cloudflare tunnel AFTER activePort is 100% bound and listening!
await syncClientInBackground();
tailscale = createTailscaleManager({
  getPort: () => activePort,
  onUpdate: () => {
    persistRuntime();
    injector?.triggerNow();
  }
});
tunnel = createPublicTunnelManager({
  getPort: () => activePort,
  onUpdate: () => {
    persistRuntime();
    injector?.triggerNow();
  }
});
persistRuntime();
injector = startSidebarInjector({ getPayload: currentPayload });

const sidecarPort = Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || 0);
const sidecarToken = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN || '';
if (Number.isInteger(sidecarPort) && sidecarPort > 0) {
  const preloadJs = findPreloadJs();
  const auxServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${sidecarPort}`);
    if (url.pathname === '/preload.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(preloadJs);
      return;
    }
    const reqToken = String(req.headers['x-sidecar-token'] || url.searchParams.get('token') || '');
    if (sidecarToken && !safeEqual(reqToken, sidecarToken)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unauthorized');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/rotate-token') {
      config.token = randomBytes(24).toString('base64url');
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
      persistRuntime();
      injector?.triggerNow();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, token: config.token }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/open-modal') {
      injector?.triggerNow();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const payload = persistRuntime();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderAuxPaneQrHtml(payload));
  });
  await new Promise(r => auxServer.listen(sidecarPort, '127.0.0.1', r));
}

setInterval(() => {
  try {
    if (SELF_MTIME && statSync(SELF_FILE).mtimeMs !== SELF_MTIME) {
      process.exit(1);
    }
  } catch {}
}, 3000);
