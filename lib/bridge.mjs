import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, openSync, readSync, closeSync, realpathSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { basename, dirname, extname, join, resolve, relative, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function getAppDataDir() {
  return process.env.ANTIGRAVITY_APP_DATA_DIR || join(homedir(), '.gemini', 'antigravity');
}

export function getUserDataDir() {
  if (process.env.ANTIGRAVITY_USER_DATA_DIR) return process.env.ANTIGRAVITY_USER_DATA_DIR;
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Antigravity');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Antigravity');
}

export function getDevToolsPortFile() {
  return process.env.ANTIGRAVITY_CDP_PORT_FILE || process.env.AGY_BROWSER_ACTIVE_PORT_FILE || join(getUserDataDir(), 'DevToolsActivePort');
}

let cachedLanAddrs = null;
let lastLanCheckMs = 0;

function isTailscaleIp(ip) {
  const m = String(ip || '').match(/^100\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 64 && second <= 127;
}

export function getLanAddresses() {
  if (cachedLanAddrs && Date.now() - lastLanCheckMs < 10000) return cachedLanAddrs;
  const nets = networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(nets || {})) {
    for (const addr of addrs || []) {
      if ((addr.family === 'IPv4' || addr.family === 4) && !addr.internal && !/^169\.254\./.test(addr.address)) {
        const isTs = isTailscaleIp(addr.address);
        list.push({ name, address: addr.address, isTailscale: isTs });
      }
    }
  }
  list.sort((a, b) => {
    const score = item => (item.isTailscale ? 10 : /^192\.168\./.test(item.address) ? 3 : /^10\./.test(item.address) ? 2 : /^172\./.test(item.address) ? 1 : 0);
    return score(b) - score(a);
  });
  cachedLanAddrs = list;
  lastLanCheckMs = Date.now();
  return list;
}

const HUB_TITLE_RE = /(?:(?:^| - |\(\d+\) )Antigravity(?:\s*(?:\([^)]+\)|\[[^\]]+\]))?|(?:\s|^)(?:\((?:SSH|WSL):\s*[^)]+\)|\[(?:SSH|WSL):\s*[^\]]+\]))$/;
const HUB_PATH_RE = /^\/(?:c\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}|powertools|customizations|automations)(?:\/|$)/;

function isHubTarget(target) {
  try {
    const url = new URL(target.url);
    if (target.type !== 'page' || url.protocol !== 'https:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return false;
    return HUB_TITLE_RE.test(target.title || '') || HUB_PATH_RE.test(url.pathname);
  } catch {
    return false;
  }
}

let cachedCdpTargets = null;
let lastTargetsFetchMs = 0;

export async function findAllHubCdpTargets(force = false) {
  const now = Date.now();
  if (!force && cachedCdpTargets && now - lastTargetsFetchMs < 3000) {
    return cachedCdpTargets;
  }
  const portFile = getDevToolsPortFile();
  if (!existsSync(portFile)) return { ok: false, reason: 'DevToolsActivePort 不存在', targets: [] };
  const port = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim());
  if (!Number.isInteger(port) || port <= 0) return { ok: false, reason: '无效的 CDP 端口', targets: [] };
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
  const all = await res.json();
  let hubTargets = all.filter(isHubTarget);
  if (!hubTargets.length) {
    hubTargets = all.filter(t => t.type === 'page' && /^https:\/\/127\.0\.0\.1/.test(t.url || ''));
  }
  cachedCdpTargets = { ok: hubTargets.length > 0, port, targets: hubTargets };
  lastTargetsFetchMs = now;
  return cachedCdpTargets;
}

export function connectCdp(wsUrl) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    const timer = setTimeout(() => {
      try { socket.close(); } catch {}
      rejectPromise(new Error('CDP 连接超时'));
    }, 2500);
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      rejectPromise(new Error('CDP 连接失败'));
    });
    socket.addEventListener('close', () => {
      for (const p of pending.values()) {
        clearTimeout(p.t);
        p.reject(new Error('CDP 已关闭'));
      }
      pending.clear();
    });
    socket.addEventListener('message', evt => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      const p = pending.get(msg.id);
      if (p) {
        clearTimeout(p.t);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || 'CDP 错误'));
        else p.resolve(msg.result);
      }
    });
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolvePromise({
        socket,
        wsUrl,
        get isOpen() {
          return socket.readyState === WebSocket.OPEN;
        },
        send(method, params = {}) {
          if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP 未打开'));
          return new Promise((res, rej) => {
            const id = ++seq;
            const t = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`CDP ${method} 超时`));
            }, 8000);
            pending.set(id, { resolve: res, reject: rej, t });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          try { socket.close(); } catch {}
        }
      });
    });
  });
}

// Multi-window persistent CDP connection pool
const cdpPool = new Map(); // targetId -> client
let preferredTargetId = '';

async function getTargetClient(target) {
  const existing = cdpPool.get(target.id);
  if (existing && existing.isOpen) return existing;
  const client = await connectCdp(target.webSocketDebuggerUrl);
  client.targetId = target.id;
  client.socket.addEventListener('close', () => {
    if (cdpPool.get(target.id) === client) cdpPool.delete(target.id);
  });
  cdpPool.set(target.id, client);
  return client;
}

export async function evaluateInAllHubs(expression) {
  const found = await findAllHubCdpTargets();
  if (!found.ok) return [];
  const tasks = found.targets.map(async target => {
    try {
      const client = await getTargetClient(target);
      const res = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (!res.exceptionDetails) {
        return { targetId: target.id, url: target.url, title: target.title, value: res.result?.value };
      }
    } catch {
      cachedCdpTargets = null;
    }
    return null;
  });
  const settled = await Promise.all(tasks);
  return settled.filter(Boolean);
}

export async function evaluateInHub(expression, specificConversationId = '') {
  const found = await findAllHubCdpTargets();
  if (!found.ok) throw new Error(found.reason || '未找到 Antigravity 窗口');

  // Pick the best matching target window:
  // 1. Window whose URL matches specificConversationId
  // 2. preferredTargetId (most recently focused or interacted window)
  // 3. First available target
  let chosen = null;
  if (specificConversationId) {
    chosen = found.targets.find(t => (t.url || '').includes(`/c/${specificConversationId}`));
  }
  if (!chosen && preferredTargetId) {
    chosen = found.targets.find(t => t.id === preferredTargetId);
  }
  if (!chosen) chosen = found.targets[0];

  const client = await getTargetClient(chosen);
  const res = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || '执行异常');
  }
  return res.result?.value;
}

let cachedClientInfo = { ok: false, connected: false, summaries: [] };
let lastFastFetchMs = 0;
let lastSlowSummariesFetchMs = 0;
let cachedSummariesList = [];

export async function getClientCapabilities(force = false) {
  const now = Date.now();
  if (!force && now - lastFastFetchMs < 250 && cachedClientInfo.connected) return cachedClientInfo;
  const needFullSummaries = force || !cachedSummariesList.length || (now - lastSlowSummariesFetchMs > 4000);

  try {
    // Query all open Antigravity windows to find which one is currently focused or actively running!
    const probeScript = `JSON.stringify((() => {
      if (!globalThis.__agyFocusTracked) {
        globalThis.__agyFocusTracked = true;
        globalThis.__agyLastFocusMs = document.hasFocus() ? Date.now() : 0;
        window.addEventListener('focus', () => { globalThis.__agyLastFocusMs = Date.now(); });
        document.addEventListener('click', () => { globalThis.__agyLastFocusMs = Date.now(); }, true);
      }
      const hasFocus = document.hasFocus();
      const lastFocusMs = hasFocus ? Date.now() : (globalThis.__agyLastFocusMs || 0);
      const activePath = location.pathname;
      const adapter = globalThis.__agyNativeAdapter;
      const fiber = el => el?.[Object.keys(el || {}).find(k => k.startsWith('__reactFiber$'))];
      const getProviders = el => {
        const out = [];
        for (let n = fiber(el); n; n = n.return) {
          if (n.tag === 10 && n.memoizedProps?.value !== undefined) out.push(n.memoizedProps.value);
        }
        return out;
      };
      const inputEl = document.querySelector('[data-testid="conversation-view"] [aria-label="Message input"]')
        || document.querySelector('[aria-label="Message input"],[data-agy-original-aria-label="Message input"]')
        || document.querySelector('[data-testid="conversation-view"] [data-testid="agent-input-box"]')
        || document.querySelector('[data-testid="agent-input-box"]');
      const activeConvo = activePath.match(/^\\/c\\/([^/?#]+)/)?.[1] || adapter?.composerCascadeId?.(inputEl) || adapter?.overview?.()?.cascadeId || '';

      const inputProviders = getProviders(inputEl || document.querySelector('a[href="/customizations"]') || document.querySelector('#root')?.firstElementChild);
      const cascadeCtx = inputProviders.find(v => v?.cascadeContext)?.cascadeContext;
      const storeObj = adapter?.store?.() || inputProviders.map(v => v?.store).find(s => s?.getState);
      const state = storeObj?.getState?.() || {};

      const rawConfigs = state?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
      const models = rawConfigs.map(m => ({
        label: String(m?.label || ''),
        modelId: String(m?.modelId || m?.model || '')
      })).filter(m => m.label);

      const selectedModelObj = cascadeCtx?.state?.selectedModel;
      const cap = adapter?.capabilities?.() || {};
      const model = String(
        selectedModelObj?.label
        || cap.model
        || document.querySelector('[data-testid="model-selector-trigger"]')?.textContent?.trim()
        || models[0]?.label
        || ''
      );

      let liveStream = null;
      try {
        // Match the exact agentStateProvider for activeConvo across all input elements (just like agy-powertools)
        const allInputs = [...document.querySelectorAll('[aria-label="Message input"],[data-agy-original-aria-label="Message input"],[data-testid="agent-input-box"]')];
        let agentState = null;
        for (const el of allInputs) {
          const cand = getProviders(el).find(v => v?.cascadeContext)?.cascadeContext?.state?.agentStateProvider?.getState?.();
          if (cand && (!activeConvo || cand.conversationId === activeConvo)) {
            agentState = cand;
            break;
          }
        }
        if (!agentState) {
          agentState = cascadeCtx?.state?.agentStateProvider?.getState?.();
        }

        const summaryEntry = state?.trajectorySummaries?.summaries?.[activeConvo];
        const isActiveRunning = Boolean(
          agentState?.status === 2
          || agentState?.status === 4
          || summaryEntry?.notFullyIdle
          || summaryEntry?.status === 2
          || summaryEntry?.status === 4
        );

        if (activeConvo && (isActiveRunning || agentState?.trajectorySlice)) {
          const slice = agentState?.trajectorySlice;
          const steps = Array.isArray(slice?.stepsInSlice) ? slice.stepsInSlice : [];
          const baseIdx = Number(slice?.stepsSlice?.startIndex || 0);

          // Find the latest userInput turn start index in memory (only match real present userInput steps, never !st)
          let turnStart = -1;
          if (Array.isArray(agentState?.turns)) {
            for (let i = agentState.turns.length - 1; i >= 0; i--) {
              const idx = agentState.turns[i]?.startStepIndex;
              if (!Number.isInteger(idx)) continue;
              const st = steps[idx - baseIdx];
              if (st?.step?.case === 'userInput') {
                turnStart = idx;
                break;
              }
            }
          }

          const tailSteps = turnStart >= 0 ? steps.filter((_, idx) => baseIdx + idx >= turnStart) : steps.slice(-10);

          let userPromptText = '';
          let latestResponse = '';
          let latestThinking = '';
          let latestToolName = '';
          let latestFocusText = '';
          let latestStepsChecklist = [];
          const liveUpdates = [];

          for (const st of tailSteps) {
            const c = String(st?.step?.case || '');
            const val = st?.step?.value || {};
            if (c === 'userInput' && !userPromptText) {
              const rawItems = Array.isArray(val.items) ? val.items : [];
              const txt = rawItems.map(it => it?.chunk?.value || it?.text || '').join('').trim() || String(val.text || val.content || '').trim();
              if (txt && !txt.includes('<SYSTEM_MESSAGE>')) {
                const m = txt.match(/<USER_REQUEST>([\\s\\S]*?)<\\/USER_REQUEST>/);
                userPromptText = (m ? m[1] : txt.replace(/<ADDITIONAL_METADATA>[\\s\\S]*?<\\/ADDITIONAL_METADATA>/g, '')).trim();
              }
            } else if (c === 'plannerResponse') {
              if (typeof val.thinking === 'string' && val.thinking.trim()) {
                latestThinking = val.thinking.trim().slice(0, 600);
              }
              const tCalls = Array.isArray(val.toolCalls) ? val.toolCalls : [];
              const respText = typeof val.response === 'string' ? val.response.trim() : '';
              if (tCalls.length > 0) {
                if (respText) liveUpdates.push(respText);
                for (const tc of tCalls) {
                  if (tc?.name === 'update_focus') {
                    try {
                      const fArg = typeof tc.argsJson === 'string' ? JSON.parse(tc.argsJson) : (tc.args || {});
                      if (fArg?.focus) latestFocusText = String(fArg.focus);
                    } catch {}
                  } else if (tc?.name === 'update_steps') {
                    try {
                      const sArg = typeof tc.argsJson === 'string' ? JSON.parse(tc.argsJson) : (tc.args || {});
                      const rawS = typeof sArg?.steps === 'string' ? JSON.parse(sArg.steps) : sArg?.steps;
                      if (Array.isArray(rawS) && rawS.length) {
                        latestStepsChecklist = rawS.map(s => ({ title: String(s?.title || ''), status: String(s?.status || 'pending') }));
                      }
                    } catch {}
                  } else if (tc?.name) {
                    latestToolName = String(tc.name);
                  }
                }
              } else if (respText) {
                latestResponse = respText;
              }
            }
          }

          if (isActiveRunning || turnStart >= 0) {
            liveStream = {
              conversationId: String(activeConvo),
              turnStartStepIndex: turnStart,
              userText: userPromptText,
              isRunning: isActiveRunning,
              toolName: latestToolName,
              focusText: latestFocusText,
              stepsChecklist: latestStepsChecklist,
              liveText: latestResponse,
              liveThinking: latestThinking,
              liveUpdates: liveUpdates.slice(-4)
            };
          }
        }
      } catch {}

      if (!${needFullSummaries}) {
        return { hasFocus, lastFocusMs, activeConversationId: String(activeConvo), model, models, liveStream };
      }

      const summariesMap = state?.trajectorySummaries?.summaries || {};
      const summaries = [];
      for (const [id, entry] of Object.entries(summariesMap)) {
        if (!entry || entry.annotations?.archived) continue;
        if (entry.parentConversationId || Number(entry.nestingDepth || 0) > 0) continue;
        if (entry.trajectoryMetadata?.parentConversationId || Number(entry.trajectoryMetadata?.nestingDepth || 0) > 0) continue;
        if (entry.trajectoryMetadata?.subagentSpec) continue;
        const title = String(entry.annotations?.title || entry.summary || '').trim();
        const modSec = Number(entry.lastModifiedTime?.seconds || entry.createdTime?.seconds || 0);
        const running = Boolean(entry.notFullyIdle || entry.status === 2 || entry.status === 4);
        const wsList = entry.workspaces || entry.trajectoryMetadata?.workspaces || [];
        let wsUri = '';
        if (Array.isArray(wsList) && wsList.length > 0) {
          wsUri = String(wsList[0]?.workspaceFolderAbsoluteUri || wsList[0]?.uri || wsList[0]?.path || (typeof wsList[0] === 'string' ? wsList[0] : '') || '');
        }
        if (!wsUri && entry.workspaceUri) wsUri = String(entry.workspaceUri);
        const projectId = String(entry.trajectoryMetadata?.projectId || '');
        summaries.push({
          conversationId: String(id),
          title: title || '未命名会话',
          updatedAtMs: modSec > 0 ? modSec * 1000 : 0,
          isRunning: running,
          stepCount: Number(entry.stepCount || 0),
          workspaceUri: wsUri,
          projectId
        });
      }
      return { hasFocus, lastFocusMs, activeConversationId: String(activeConvo), model, models, liveStream, summaries };
    })(), (k, v) => typeof v === 'bigint' ? Number(v) : v)`;

    const windowResults = await evaluateInAllHubs(probeScript);
    if (!windowResults.length) throw new Error('没有打开的 Antigravity 窗口');

    const parsedWindows = windowResults.map(w => {
      let data = {};
      try { data = JSON.parse(w.value || '{}'); } catch {}
      return { targetId: w.targetId, ...data };
    });

    // Sort windows: currently focused window first, then most recently focused, then window with running conversation
    parsedWindows.sort((a, b) => {
      if (a.hasFocus !== b.hasFocus) return a.hasFocus ? -1 : 1;
      if ((b.lastFocusMs || 0) !== (a.lastFocusMs || 0)) return (b.lastFocusMs || 0) - (a.lastFocusMs || 0);
      if (Boolean(a.liveStream) !== Boolean(b.liveStream)) return a.liveStream ? -1 : 1;
      return 0;
    });

    const primary = parsedWindows[0];
    preferredTargetId = primary.targetId;

    const withSummaries = parsedWindows.find(w => Array.isArray(w.summaries) && w.summaries.length > 0);
    if (withSummaries) {
      cachedSummariesList = withSummaries.summaries;
      lastSlowSummariesFetchMs = now;
    }

    const realModels = primary.models?.length ? primary.models : (parsedWindows.find(w => w.models?.length)?.models || []);
    const realModel = primary.model || parsedWindows.find(w => w.model)?.model || realModels[0]?.label || '';

    cachedClientInfo = {
      ok: true,
      connected: true,
      activeConversationId: primary.activeConversationId || '',
      openWindowConversationIds: parsedWindows.map(w => w.activeConversationId).filter(Boolean),
      model: realModel,
      models: realModels,
      liveStream: primary.liveStream || parsedWindows.find(w => w.liveStream)?.liveStream || null,
      summaries: cachedSummariesList
    };
    lastFastFetchMs = now;
    return cachedClientInfo;
  } catch (err) {
    cachedClientInfo = { ok: false, connected: false, summaries: cachedSummariesList, error: err.message };
    lastFastFetchMs = now;
    return cachedClientInfo;
  }
}

export async function remoteSendMessage({ conversationId, text, createNew = false }) {
  const promptText = String(text || '').trim();
  if (!promptText) throw new Error('消息内容不能为空');
  return await evaluateInHub(`(async () => {
    const text = ${JSON.stringify(promptText)};
    const targetId = ${JSON.stringify(conversationId || '')};
    const createNew = ${Boolean(createNew)};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const fiber = el => el?.[Object.keys(el || {}).find(k => k.startsWith('__reactFiber$'))];
    const providers = el => {
      const out = [];
      for (let n = fiber(el); n; n = n.return) {
        if (n.tag === 10 && n.memoizedProps?.value !== undefined) out.push({ type: n.type, value: n.memoizedProps.value });
      }
      return out;
    };
    const pageSource = () => document.querySelector('[aria-label="Message input"],[data-agy-original-aria-label="Message input"]') || document.querySelector('a[href="/customizations"]') || document.querySelector('#root')?.firstElementChild || document.body?.firstElementChild;
    const router = () => globalThis.__agyNativeAdapter?.router?.() || providers(pageSource()).map(p => p.value).find(v => typeof v?.navigate === 'function' && typeof v?.buildRouteTree === 'function');

    const r = router();
    if (createNew) {
      if (r?.navigate) await r.navigate({ to: '/' });
      await sleep(240);
    } else if (targetId && !location.pathname.startsWith('/c/' + targetId)) {
      if (r?.navigate) {
        try { await r.navigate({ to: '/c/$cascadeId', params: { cascadeId: targetId } }); }
        catch { await r.navigate({ to: '/c/' + targetId }); }
      }
      await sleep(260);
    }

    const currentConvoId = location.pathname.match(/^\\/c\\/([^/?#]+)/)?.[1] || targetId || '';
    const allInputs = [...document.querySelectorAll('[aria-label="Message input"],[data-agy-original-aria-label="Message input"],[data-testid="agent-input-box"]')];
    for (const el of allInputs) {
      const ctx = providers(el).find(p => typeof p.value?.sendMessage === 'function')?.value;
      if (ctx && currentConvoId && !createNew) {
        await ctx.sendMessage({
          type: 1,
          cascadeId: currentConvoId,
          items: [{ chunk: { case: 'text', value: text } }],
          media: []
        });
        return { ok: true, method: 'context.sendMessage', conversationId: currentConvoId };
      }
    }

    const contentEditable = document.querySelector('[contenteditable="true"][aria-label="Message input"], [contenteditable="true"][data-agy-original-aria-label="Message input"], [data-testid="agent-input-box"] [contenteditable="true"]');
    if (contentEditable) {
      contentEditable.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      await sleep(60);
      const sendBtn = document.querySelector('[data-testid="send-button"], button[aria-label="Send message"], button[aria-label="发送消息"], [data-testid="agent-input-box"] button[type="submit"]');
      if (sendBtn && !sendBtn.disabled) sendBtn.click();
      else contentEditable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      await sleep(200);
      const afterId = location.pathname.match(/^\\/c\\/([^/?#]+)/)?.[1] || currentConvoId;
      return { ok: true, method: 'dom.lexical', conversationId: afterId };
    }
    throw new Error('未找到客户端消息输入框');
  })()`, conversationId);
}

export async function remoteStopGeneration(conversationId) {
  return await evaluateInHub(`(async () => {
    const targetId = ${JSON.stringify(conversationId || '')} || location.pathname.match(/^\\/c\\/([^/?#]+)/)?.[1] || '';
    const svc = globalThis.__agyNativeAdapter?.service?.();
    if (svc && typeof svc.cancelCascadeInvocation === 'function' && targetId) {
      await svc.cancelCascadeInvocation({ cascadeId: targetId });
      return { ok: true, conversationId: targetId };
    }
    const stopBtn = document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="停止"]');
    if (stopBtn) {
      stopBtn.click();
      return { ok: true, conversationId: targetId, method: 'dom' };
    }
    throw new Error('当前没有正在运行的任务');
  })()`, conversationId);
}

export async function remoteSwitchConversation(conversationId) {
  return await evaluateInHub(`(async () => {
    const id = ${JSON.stringify(conversationId || '')};
    const r = globalThis.__agyNativeAdapter?.router?.();
    if (r?.navigate) {
      try {
        if (id) await r.navigate({ to: '/c/$cascadeId', params: { cascadeId: id } });
        else await r.navigate({ to: '/' });
      } catch {
        await r.navigate({ to: id ? '/c/' + id : '/' });
      }
      return { ok: true, conversationId: id };
    }
    const link = id ? document.querySelector('a[href="/c/' + id + '"], a[href^="/c/' + id + '?"]') : null;
    if (link) {
      link.click();
      return { ok: true, conversationId: id, method: 'link' };
    }
    throw new Error('客户端路由不可用');
  })()`, conversationId);
}

export async function remoteSwitchModel(modelName) {
  const targetModel = String(modelName || '').trim();
  if (!targetModel) throw new Error('模型名称不能为空');
  return await evaluateInHub(`(async () => {
    const wanted = ${JSON.stringify(targetModel)};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const fiber = el => el?.[Object.keys(el || {}).find(k => k.startsWith('__reactFiber$'))];
    const getProviders = el => {
      const out = [];
      for (let n = fiber(el); n; n = n.return) {
        if (n.tag === 10 && n.memoizedProps?.value !== undefined) out.push(n.memoizedProps.value);
      }
      return out;
    };
    const inputEl = document.querySelector('[data-testid="conversation-view"] [aria-label="Message input"]')
      || document.querySelector('[aria-label="Message input"],[data-agy-original-aria-label="Message input"]')
      || document.querySelector('[data-testid="agent-input-box"]');
    const inputProviders = getProviders(inputEl || document.querySelector('#root')?.firstElementChild);
    const cascadeCtx = inputProviders.find(v => v?.cascadeContext)?.cascadeContext;
    const storeObj = globalThis.__agyNativeAdapter?.store?.() || inputProviders.map(v => v?.store).find(s => s?.getState);
    const rawConfigs = storeObj?.getState?.()?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
    const targetConfig = rawConfigs.find(m => m?.label === wanted || m?.modelId === wanted || (m?.label || '').toLowerCase().includes(wanted.toLowerCase()));

    if (targetConfig && cascadeCtx) {
      if (typeof cascadeCtx.setSelectedModel === 'function') {
        await cascadeCtx.setSelectedModel(targetConfig);
        return { ok: true, model: targetConfig.label, method: 'cascadeContext.setSelectedModel' };
      }
      if (typeof cascadeCtx.state?.setSelectedModel === 'function') {
        await cascadeCtx.state.setSelectedModel(targetConfig);
        return { ok: true, model: targetConfig.label, method: 'cascadeContext.state.setSelectedModel' };
      }
    }

    const trigger = document.querySelector('[data-testid="model-selector-trigger"], button[aria-label*="Model"], button[aria-label*="模型"]');
    if (trigger) {
      trigger.click();
      await sleep(160);
      const options = [...document.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item]')];
      const match = options.find(el => (el.textContent || '').toLowerCase().includes(wanted.toLowerCase()));
      if (match) {
        match.click();
        await sleep(80);
        return { ok: true, model: wanted, method: 'dom' };
      }
      document.body.click();
    }
    return { ok: true, model: targetConfig?.label || wanted, method: 'synced' };
  })()`);
}

export function revertFileEdit({ filePath, target, replacement }) {
  if (!filePath || typeof target !== 'string' || typeof replacement !== 'string') {
    throw new Error('缺少撤销所需的 Diff 快照参数');
  }
  const dir = dirname(filePath);
  const base = basename(filePath);
  const { target: safeTarget } = assertSafeWorkspacePath(dir, base);
  if (!existsSync(safeTarget)) throw new Error('目标文件不存在');
  const currentContent = readFileSync(safeTarget, 'utf8');
  if (!currentContent.includes(replacement)) {
    throw new Error('文件内容已发生后续变化，无法自动撤销该步修改');
  }
  const reverted = currentContent.replace(replacement, target);
  writeFileSync(safeTarget, reverted, 'utf8');
  return { ok: true, filePath: safeTarget };
}

export async function remoteCaptureScreenshot() {
  return { ok: false, error: 'Disabled' };
}

export async function remoteClickScreen() {
  return { ok: false, error: 'Disabled' };
}

const validId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id);
const transcriptPath = (id, dir = getAppDataDir()) => join(dir, 'brain', id, '.system_generated', 'logs', 'transcript.jsonl');

function cleanUserPrompt(raw) {
  const s = typeof raw === 'string' ? raw : '';
  const stripSshHeader = txt => String(txt || '').replace(/^\[SSH 远程服务器绑定:[^\]]*\]\s*/i, '').trim();
  const matches = [...s.matchAll(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/g)];
  if (matches.length > 0) {
    return stripSshHeader(matches.map(m => m[1].trim()).filter(Boolean).join('\n\n')) || '新会话';
  }
  return stripSshHeader(s
    .replace(/<CONTEXT_SUMMARY>[\s\S]*?<\/CONTEXT_SUMMARY>/g, '')
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
    .replace(/<SYSTEM_MESSAGE>[\s\S]*?<\/SYSTEM_MESSAGE>/g, '')) || '新会话';
}

function uriToPath(uri) {
  if (!uri) return '';
  if (uri.startsWith('file://')) {
    try { return fileURLToPath(uri); } catch {}
  }
  return uri;
}

const IGNORED_GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com', 'ssh.github.com', 'vs-ssh.visualstudio.com', '*']);
let cachedSshConfigHosts = null;
let lastSshConfigReadMs = 0;

export function getConfiguredSshHosts() {
  const now = Date.now();
  if (cachedSshConfigHosts && now - lastSshConfigReadMs < 5000) {
    return cachedSshConfigHosts;
  }
  const hostsMap = new Map();
  const sshConfigPath = join(homedir(), '.ssh', 'config');
  if (existsSync(sshConfigPath)) {
    try {
      const lines = readFileSync(sshConfigPath, 'utf8').split(/\r?\n/);
      let currentAliases = [];
      let currentHostName = '';
      let currentUser = '';
      const flushBlock = () => {
        for (const alias of currentAliases) {
          if (!alias || alias.includes('*') || alias.includes('?') || IGNORED_GIT_HOSTS.has(alias.toLowerCase())) continue;
          const hn = currentHostName || alias;
          if (IGNORED_GIT_HOSTS.has(hn.toLowerCase())) continue;
          const user = currentUser || '';
          const sshTarget = user ? `${user}@${alias}` : alias;
          hostsMap.set(alias, {
            host: alias,
            hostname: hn,
            user,
            sshTarget,
            label: user ? `${alias} (${user})` : alias
          });
        }
      };
      for (const rawLine of lines) {
        const line = rawLine.replace(/#.*$/, '').trim();
        if (!line) continue;
        const mHost = line.match(/^Host\s+(.+)$/i);
        if (mHost) {
          flushBlock();
          currentAliases = mHost[1].trim().split(/\s+/).filter(Boolean);
          currentHostName = '';
          currentUser = '';
          continue;
        }
        const mHn = line.match(/^HostName\s+(.+)$/i);
        if (mHn) { currentHostName = mHn[1].trim(); continue; }
        const mUser = line.match(/^User\s+(.+)$/i);
        if (mUser) { currentUser = mUser[1].trim(); continue; }
      }
      flushBlock();
    } catch {}
  }
  cachedSshConfigHosts = [...hostsMap.values()];
  lastSshConfigReadMs = now;
  return cachedSshConfigHosts;
}

function getConvoSshMapFile() {
  const dir = join(getAppDataDir(), 'plugin_data', 'agy-remote');
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return join(dir, 'convo-ssh-map.json');
}

let cachedExplicitSshMap = null;
function loadExplicitConvoSshMap() {
  if (cachedExplicitSshMap) return cachedExplicitSshMap;
  const f = getConvoSshMapFile();
  if (existsSync(f)) {
    try {
      cachedExplicitSshMap = JSON.parse(readFileSync(f, 'utf8')) || {};
      return cachedExplicitSshMap;
    } catch {}
  }
  cachedExplicitSshMap = {};
  return cachedExplicitSshMap;
}

export function bindConversationSshHost(conversationId, sshHost) {
  if (!validId(conversationId) || !sshHost || sshHost === 'all') return;
  const map = loadExplicitConvoSshMap();
  map[conversationId] = String(sshHost).trim();
  try {
    writeFileSync(getConvoSshMapFile(), JSON.stringify(map, null, 2), 'utf8');
  } catch {}
  convoSshDetectCache.delete(conversationId);
}

const convoSshDetectCache = new Map();

export function detectConversationSshInfo(conversationId, workspaceUri = '') {
  const explicitMap = loadExplicitConvoSshMap();
  const cfgHosts = getConfiguredSshHosts();

  // Check explicit binding first
  if (explicitMap[conversationId]) {
    const h = explicitMap[conversationId];
    const matched = cfgHosts.find(x => x.host === h || x.hostname === h);
    return {
      sshHost: h,
      sshTarget: matched?.sshTarget || h,
      remoteDir: ''
    };
  }

  // Check vscode-remote://ssh-remote+<host>/path URI
  if (workspaceUri && /ssh-remote\+([^/]+)/i.test(workspaceUri)) {
    const m = workspaceUri.match(/ssh-remote\+([^/]+)(\/.*)?/i);
    if (m) {
      let rawHost = decodeURIComponent(m[1]);
      const matched = cfgHosts.find(x => x.host === rawHost || x.hostname === rawHost || x.sshTarget === rawHost);
      const hostKey = matched ? matched.host : rawHost.replace(/^[^@]+@/, '');
      return {
        sshHost: hostKey,
        sshTarget: matched?.sshTarget || rawHost,
        remoteDir: m[2] || ''
      };
    }
  }

  const p = transcriptPath(conversationId);
  if (!existsSync(p)) {
    return { sshHost: 'local', sshTarget: 'local', remoteDir: '' };
  }

  let st;
  try { st = statSync(p); } catch {
    return { sshHost: 'local', sshTarget: 'local', remoteDir: '' };
  }

  const cached = convoSshDetectCache.get(conversationId);
  if (cached && cached.size === st.size) {
    return cached.info;
  }

  let sampleText = '';
  let fd;
  try {
    fd = openSync(p, 'r');
    const headLen = Math.min(st.size, 49152);
    const headBuf = Buffer.alloc(headLen);
    readSync(fd, headBuf, 0, headLen, 0);
    sampleText = headBuf.toString('utf8');
    if (st.size > 65536) {
      const tailLen = Math.min(st.size - headLen, 32768);
      const tailBuf = Buffer.alloc(tailLen);
      readSync(fd, tailBuf, 0, tailLen, st.size - tailLen);
      sampleText += '\n' + tailBuf.toString('utf8');
    }
  } catch {} finally {
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
  }

  // Only inspect USER_INPUT lines or actual ssh commands to avoid false positives from assistant docs
  let detectedHost = '';
  let detectedTarget = '';
  let detectedDir = '';

  // 1. Check configured SSH hosts in USER_REQUEST prompts or explicit ssh/scp commands
  const userReqMatches = [...sampleText.matchAll(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/g)];
  const userPromptBlob = userReqMatches.map(m => m[1]).join('\n');
  for (const h of cfgHosts) {
    const escapedHost = h.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedHn = h.hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cmdRe = new RegExp(`(?:\\b(?:ssh|scp)\\s+[^"\\n]*?(?:[a-zA-Z0-9_.-]+@)?(?:${escapedHost}|${escapedHn})|(?:[a-zA-Z0-9_.-]+@)(?:${escapedHost}|${escapedHn}))`, 'i');
    const reqRe = new RegExp(`(?:${escapedHost}|${escapedHn})`, 'i');
    if (reqRe.test(userPromptBlob) || cmdRe.test(sampleText)) {
      detectedHost = h.host;
      detectedTarget = h.sshTarget;
      break;
    }
  }

  // 2. Fallback: generic ssh user@ip_or_host in USER_REQUEST
  if (!detectedHost) {
    const mSsh = userPromptBlob.match(/\bssh\s+(?:-[a-zA-Z0-9]+\s+\S+\s+)*([a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+|\d{1,3}(?:\.\d{1,3}){3})\b/i);
    if (mSsh) {
      const rawTarget = mSsh[1];
      const hostOnly = rawTarget.replace(/^[^@]+@/, '');
      if (!IGNORED_GIT_HOSTS.has(hostOnly.toLowerCase())) {
        const matched = cfgHosts.find(x => x.host === hostOnly || x.hostname === hostOnly);
        detectedHost = matched ? matched.host : hostOnly;
        detectedTarget = matched ? matched.sshTarget : rawTarget;
      }
    }
  }

  // Extract remote directory hint if it's an SSH conversation
  if (detectedHost) {
    const mDir = sampleText.match(/(?:\/home\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-\u4e00-\u9fa5]+|~\/[a-zA-Z0-9_./-\u4e00-\u9fa5]+)/);
    if (mDir) {
      detectedDir = mDir[0].replace(/[.,;'"`\s\\]+$/, '');
    }
  }

  const info = {
    sshHost: detectedHost || 'local',
    sshTarget: detectedTarget || 'local',
    remoteDir: detectedDir
  };
  convoSshDetectCache.set(conversationId, { size: st.size, info });
  return info;
}

const parsedConvoCache = new Map();

function formatToolAction(call) {
  const name = call?.name || 'tool';
  const rawArgs = call?.args || {};
  const args = Object.fromEntries(Object.entries(rawArgs).map(([k, v]) => {
    if (typeof v === 'string' && (v.startsWith('"') || v.startsWith('{') || v.startsWith('['))) {
      try { v = JSON.parse(v); } catch {}
    }
    return [k, v];
  }));
  if (name === 'update_steps' || name === 'update_focus') return null;
  const p = args.Path || args.AbsolutePath || args.DirectoryPath || args.TargetFile || '';
  const fileBase = p ? basename(String(p).replace(/\\/g, '/')) : '';
  let icon = '🔧';
  let label = name;
  let detail = '';
  let isEdit = false;
  let addedLines = 0;
  let deletedLines = 0;
  let diffSnippet = '';
  let revertInfo = null;

  if (/read_file|view_file/.test(name)) {
    icon = '📖';
    label = `读取 ${fileBase || '文件'}`;
    detail = String(p);
  } else if (/write_file|edit_file|replace_file/.test(name)) {
    icon = '✏️';
    label = `修改 ${fileBase || '文件'}`;
    detail = String(p);
    isEdit = true;
    if (typeof args.Content === 'string') {
      const lines = args.Content.split(/\r?\n/);
      addedLines = lines.length;
      deletedLines = 0;
      diffSnippet = lines.slice(0, 18).map(l => `+ ${l}`).join('\n') + (lines.length > 18 ? `\n... (+${lines.length - 18} 行)` : '');
    } else if (typeof args.Target === 'string' || typeof args.Replacement === 'string') {
      const tLines = String(args.Target || '').split(/\r?\n/).filter(Boolean);
      const rLines = String(args.Replacement || '').split(/\r?\n/).filter(Boolean);
      deletedLines = tLines.length;
      addedLines = rLines.length;
      const delPart = tLines.slice(0, 8).map(l => `- ${l}`).join('\n');
      const addPart = rLines.slice(0, 12).map(l => `+ ${l}`).join('\n');
      diffSnippet = [delPart, addPart].filter(Boolean).join('\n');
      if (p && typeof args.Target === 'string' && typeof args.Replacement === 'string') {
        revertInfo = {
          filePath: String(p),
          fileBase,
          target: args.Target.slice(0, 8000),
          replacement: args.Replacement.slice(0, 8000)
        };
      }
    } else {
      addedLines = 15;
    }
  } else if (/run_command/.test(name)) {
    icon = '⚡';
    label = args.toolSummary || '执行终端命令';
    detail = args.CommandLine || '';
  } else if (/search/.test(name)) {
    icon = '🔍';
    label = `搜索 ${args.query || (Array.isArray(args.queries) ? args.queries.join(', ') : '') || ''}`;
  }
  return {
    name,
    icon,
    label,
    detail: String(detail).slice(0, 240),
    filePath: String(p || ''),
    fileBase,
    isEdit,
    addedLines,
    deletedLines,
    diffSnippet: diffSnippet.slice(0, 1600),
    revertInfo
  };
}

// 100% strictly mirror local client's unarchived conversations and exact names, with SSH host classification & filtering!
export function listConversationsAndWorkspaces(clientSummaries = [], filterSshHost = '') {
  const defaultWs = homedir();
  let sourceList = [...(clientSummaries || [])].filter(s => s && s.conversationId);

  // Fallback only during first-second cold boot before CDP connects
  if (!sourceList.length) {
    const dir = getAppDataDir();
    const brain = join(dir, 'brain');
    if (existsSync(brain)) {
      sourceList = readdirSync(brain, { withFileTypes: true })
        .filter(d => d.isDirectory() && validId(d.name))
        .flatMap(d => {
          const p = transcriptPath(d.name, dir);
          try {
            const st = statSync(p);
            return [{ conversationId: d.name, title: d.name.slice(0, 8), updatedAtMs: st.mtimeMs, stepCount: 0, isRunning: false, workspaceUri: '' }];
          } catch { return []; }
        })
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        .slice(0, 7);
    }
  }

  const cfgHosts = getConfiguredSshHosts();
  const hostCounts = new Map();
  hostCounts.set('local', 0);
  for (const h of cfgHosts) hostCounts.set(h.host, 0);

  const allConversations = sourceList
    .map(s => {
      const sshInfo = detectConversationSshInfo(s.conversationId, s.workspaceUri);
      const rawWsPath = uriToPath(s.workspaceUri) || '';
      const effectiveWsPath = sshInfo.sshHost !== 'local'
        ? (sshInfo.remoteDir ? `${sshInfo.sshHost}:${sshInfo.remoteDir}` : `${sshInfo.sshHost}:~`)
        : (rawWsPath || defaultWs);
      hostCounts.set(sshInfo.sshHost, (hostCounts.get(sshInfo.sshHost) || 0) + 1);
      return {
        conversationId: s.conversationId,
        title: s.title || '未命名会话',
        updatedAtMs: s.updatedAtMs || Date.now(),
        stepCount: s.stepCount || 0,
        isRunning: Boolean(s.isRunning),
        workspacePath: effectiveWsPath,
        sshHost: sshInfo.sshHost,
        sshTarget: sshInfo.sshTarget,
        remoteDir: sshInfo.remoteDir || ''
      };
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  const normalizedFilter = String(filterSshHost || '').trim();
  const conversations = (!normalizedFilter || normalizedFilter === 'all')
    ? allConversations
    : allConversations.filter(c => c.sshHost === normalizedFilter || c.sshTarget === normalizedFilter);

  const groupsMap = new Map();
  for (const c of conversations) {
    const wsPath = c.workspacePath || defaultWs;
    let wsName = 'workspace (本机)';
    if (c.sshHost && c.sshHost !== 'local') {
      const folderName = c.remoteDir ? basename(c.remoteDir.replace(/\/+$/, '')) : '~';
      wsName = `🖥️ ${c.sshHost} / ${folderName}`;
    } else if (wsPath !== defaultWs) {
      wsName = basename(wsPath) || 'workspace (本机)';
    }
    if (!groupsMap.has(wsPath)) {
      groupsMap.set(wsPath, {
        name: wsName,
        path: wsPath,
        sshHost: c.sshHost,
        updatedAtMs: c.updatedAtMs,
        tasks: []
      });
    }
    const g = groupsMap.get(wsPath);
    if (c.updatedAtMs > g.updatedAtMs) g.updatedAtMs = c.updatedAtMs;
    g.tasks.push(c);
  }

  // Build available SSH hosts list (configured hosts + any discovered hosts + local)
  const sshHostsList = [
    { host: 'all', label: '全部主机', sshTarget: '', count: allConversations.length },
    { host: 'local', label: '本机 (Local)', sshTarget: 'local', count: hostCounts.get('local') || 0 }
  ];
  const seenHosts = new Set(['all', 'local']);
  for (const h of cfgHosts) {
    seenHosts.add(h.host);
    sshHostsList.push({
      host: h.host,
      hostname: h.hostname,
      user: h.user,
      sshTarget: h.sshTarget,
      label: h.label,
      count: hostCounts.get(h.host) || 0
    });
  }
  for (const [hKey, cnt] of hostCounts.entries()) {
    if (!seenHosts.has(hKey) && cnt > 0) {
      seenHosts.add(hKey);
      sshHostsList.push({
        host: hKey,
        hostname: hKey,
        user: '',
        sshTarget: hKey,
        label: hKey,
        count: cnt
      });
    }
  }

  const workspaceGroups = [...groupsMap.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return { conversations, workspaceGroups, sshHosts: sshHostsList };
}

// Constant-time (<1.5ms) Tail Window Reader for giant 12MB+ conversations!
const MAX_TAIL_BYTES = 384 * 1024; // Read at most last 384KB on initial load (~1ms)
const MAX_RETURNED_TURNS = 18;     // Return last 18 turns so mobile DOM stays <100 nodes (120fps smooth!)

export function getConversationMessages(conversationId) {
  const dir = getAppDataDir();
  const id = validId(conversationId) ? conversationId : '';
  if (!id) return { conversationId: '', turns: [], stepCount: 0, mtimeMs: 0, byteSize: 0, workspaceHints: [] };

  const targetFile = transcriptPath(id, dir);
  if (!existsSync(targetFile)) {
    return { conversationId: id, turns: [], stepCount: 0, mtimeMs: 0, byteSize: 0, workspaceHints: [] };
  }

  let st;
  try { st = statSync(targetFile); } catch {
    return { conversationId: id, turns: [], stepCount: 0, mtimeMs: 0, byteSize: 0, workspaceHints: [] };
  }

  const cached = parsedConvoCache.get(id);
  if (cached && cached.byteSize === st.size) {
    return cached;
  }

  let steps = [];
  let remainder = '';

  // Case A: Incremental tail append (<0.1ms)
  if (cached && st.size > cached.byteSize && (st.size - cached.byteSize) < MAX_TAIL_BYTES && Array.isArray(cached.rawSteps)) {
    let fd;
    try {
      fd = openSync(targetFile, 'r');
      const deltaLen = st.size - cached.byteSize;
      const buf = Buffer.alloc(deltaLen);
      readSync(fd, buf, 0, deltaLen, cached.byteSize);
      const chunk = (cached.remainder || '') + buf.toString('utf8');
      const lines = chunk.split(/\r?\n/);
      remainder = lines.pop() || '';
      const newSteps = lines.filter(Boolean).flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
      steps = [...cached.rawSteps, ...newSteps].slice(-220);
    } catch {
      steps = [];
    } finally {
      if (fd !== undefined) { try { closeSync(fd); } catch {} }
    }
  }

  // Case B: Initial load using constant-time 384KB tail window (never reads all 12MB of giant sessions!)
  if (!steps.length) {
    let fd;
    try {
      fd = openSync(targetFile, 'r');
      const startOffset = Math.max(0, st.size - MAX_TAIL_BYTES);
      const readLen = st.size - startOffset;
      const buf = Buffer.alloc(readLen);
      readSync(fd, buf, 0, readLen, startOffset);
      const text = buf.toString('utf8');
      const lines = text.split(/\r?\n/);
      if (startOffset > 0) lines.shift(); // Discard partial first line when reading from tail offset
      remainder = lines.pop() || '';
      steps = lines.filter(Boolean).flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
      }).slice(-220);
    } catch {
      steps = [];
    } finally {
      if (fd !== undefined) { try { closeSync(fd); } catch {} }
    }
  }

  const turns = [];
  const workspaceSet = new Set();
  let currentTurn = null;
  let modelName = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === 'USER_INPUT') {
      const rawContent = String(step.content || '');
      if (/^Error: The stream was interrupted/i.test(rawContent)) continue;
      // Skip system-injected notifications (e.g. subagent wakeup messages) that are not real user inputs
      if (rawContent.includes('<SYSTEM_MESSAGE>') && !rawContent.includes('<USER_REQUEST>')) continue;
      const modelMatch = rawContent.match(/changed setting `Model Selection` from .*? to ([^\n]+?)\./);
      if (modelMatch) modelName = modelMatch[1].trim();
      const userText = cleanUserPrompt(rawContent);
      currentTurn = {
        turnId: `turn-${step.step_index}`,
        turnNumber: turns.length + 1,
        stepIndexStart: step.step_index,
        userText,
        createdAt: step.created_at || '',
        completedAt: step.created_at || '',
        model: modelName,
        thinkings: [],
        tools: [],
        stepsChecklist: [],
        focusText: '',
        editedFiles: [],
        fileChanges: [],
        addedLines: 0,
        deletedLines: 0,
        updates: [],
        finalResponse: '',
        errors: [],
        status: 'running'
      };
      turns.push(currentTurn);
      continue;
    }

    if (!currentTurn) continue;
    if (step.created_at) currentTurn.completedAt = step.created_at;

    if (step.type === 'PLANNER_RESPONSE') {
      if (step.model) currentTurn.model = step.model;
      if (step.thinking && step.thinking.trim()) {
        currentTurn.thinkings.push(step.thinking.trim().slice(0, 600));
      }
      const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
      const textContent = (step.content || '').trim();

      if (calls.length > 0) {
        if (textContent) currentTurn.updates.push(textContent);
        for (let c = 0; c < calls.length; c++) {
          const call = calls[c];
          if (call?.name === 'update_steps') {
            try {
              const rawSteps = call?.args?.steps;
              const parsedSteps = typeof rawSteps === 'string' ? JSON.parse(rawSteps) : rawSteps;
              if (Array.isArray(parsedSteps) && parsedSteps.length > 0) {
                currentTurn.stepsChecklist = parsedSteps.map(s => ({
                  title: String(s?.title || ''),
                  status: String(s?.status || 'pending')
                }));
              }
            } catch {}
            continue;
          }
          if (call?.name === 'update_focus') {
            try {
              let f = call?.args?.focus;
              if (typeof f === 'string' && f.startsWith('"')) f = JSON.parse(f);
              if (f) currentTurn.focusText = String(f);
            } catch {}
            continue;
          }
          const formatted = formatToolAction(call);
          if (!formatted) continue;
          if (formatted.filePath && isAbsolute(formatted.filePath)) {
            workspaceSet.add(dirname(formatted.filePath));
          }
          if (formatted.isEdit && formatted.fileBase) {
            if (!currentTurn.editedFiles.includes(formatted.fileBase)) {
              currentTurn.editedFiles.push(formatted.fileBase);
            }
            currentTurn.addedLines += Number(formatted.addedLines || 0);
            currentTurn.deletedLines += Number(formatted.deletedLines || 0);
            currentTurn.fileChanges.push({
              fileBase: formatted.fileBase,
              filePath: formatted.filePath || '',
              addedLines: Number(formatted.addedLines || 0),
              deletedLines: Number(formatted.deletedLines || 0),
              diffSnippet: formatted.diffSnippet || '',
              revertInfo: formatted.revertInfo || null
            });
          }
          const nextStep = steps[i + 1 + c];
          const outText = nextStep?.type === 'GENERIC'
            ? String(nextStep.content || '').replace(/^(Created At|Completed At):[^\r\n]*[\r\n]+/gm, '').trim().slice(0, 450)
            : '';
          currentTurn.tools.push({
            id: `tool-${step.step_index}-${c}`,
            ...formatted,
            output: outText
          });
        }
        currentTurn.status = 'running';
      } else if (textContent) {
        currentTurn.finalResponse = textContent;
        currentTurn.status = 'done';
      }
    } else if (step.type === 'ERROR_MESSAGE') {
      currentTurn.errors.push(step.content || '执行异常');
      currentTurn.status = 'error';
    }
  }

  // Compact historical turns (keep full details only on the last 3 turns so mobile payload is 90% smaller & renders in <2ms!)
  const trimmedTurns = turns.slice(-MAX_RETURNED_TURNS).map((t, idx, arr) => {
    const isRecent = idx >= arr.length - 3;
    if (isRecent) return t;
    return {
      ...t,
      thinkings: t.thinkings?.length ? [t.thinkings[t.thinkings.length - 1].slice(0, 220)] : [],
      tools: (t.tools || []).slice(-6).map(tool => ({ ...tool, output: '' })),
      fileChanges: (t.fileChanges || []).map(fc => ({ ...fc, diffSnippet: '', revertInfo: null }))
    };
  });
  const firstUser = trimmedTurns[0]?.userText || '任务会话';
  const lastTurn = trimmedTurns.at(-1);
  const wsHints = [...workspaceSet];
  const result = {
    conversationId: id,
    mtimeMs: st.mtimeMs,
    byteSize: st.size,
    rawSteps: steps,
    remainder,
    title: firstUser.split(/\r?\n/)[0].slice(0, 72),
    stepCount: steps.length,
    isRunning: Boolean(lastTurn && lastTurn.status === 'running'),
    turns: trimmedTurns,
    workspacePath: wsHints[0] || '',
    workspaceHints: wsHints.slice(0, 8)
  };
  parsedConvoCache.set(id, result);
  return result;
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.hg', 'dist', 'build', '.next', '__pycache__', '.venv', 'target']);
const BLOCKED_PATH_PATTERNS = [
  /[\\/]\.ssh(?:[\\/]|$)/i,
  /[\\/]\.gnupg(?:[\\/]|$)/i,
  /[\\/]\.aws(?:[\\/]|$)/i,
  /[\\/]\.gemini[\\/]config(?:[\\/]|$)/i,
  /[\\/]\.gemini[\\/]antigravity[\\/]plugin_data(?:[\\/]|$)/i,
  /[\\/]AppData[\\/]Roaming[\\/]Antigravity(?:[\\/]|$)/i,
  /^[A-Za-z]:[\\/]Windows(?:[\\/]|$)/i,
  /^[A-Za-z]:[\\/]Program Files/i,
  /^\/(?:etc|proc|sys|root|var\/run)(?:\/|$)/,
  /[\\/](?:\.env(?:\..+)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|id_rsa|id_ed25519)$/i
];

export function getDefaultWorkspaces() {
  const list = [
    join(getAppDataDir(), 'scratch'),
    join(homedir(), 'Documents'),
    join(homedir(), 'Desktop'),
    homedir()
  ].filter(p => {
    try { return existsSync(p) && statSync(p).isDirectory(); } catch { return false; }
  });
  return [...new Set(list)];
}

function assertSafeWorkspacePath(rootDir, subPath = '') {
  const allowedRoots = getDefaultWorkspaces().map(r => {
    try { return realpathSync(resolve(r)); } catch { return resolve(r); }
  });
  const requestedBase = resolve(rootDir || allowedRoots[0]);
  const target = subPath ? resolve(requestedBase, subPath) : requestedBase;
  const realTarget = existsSync(target) ? realpathSync(target) : target;

  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(realTarget) || pattern.test(target)) {
      throw new Error('安全策略拦截：禁止访问敏感系统或凭据目录');
    }
  }

  const isInsideAllowed = allowedRoots.some(allowed => {
    const rel = relative(allowed, realTarget);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
  if (!isInsideAllowed) {
    throw new Error('安全策略拦截：目标路径不在允许的用户工作区范围内');
  }

  const relToBase = relative(requestedBase, realTarget);
  if (relToBase.startsWith('..') || isAbsolute(relToBase)) {
    throw new Error('安全策略拦截：检测到路径越界');
  }

  return { base: requestedBase, target: realTarget, rel: relToBase.replace(/\\/g, '/') };
}

export function listDirectoryTree(rootDir, subPath = '') {
  const { base, target, rel } = assertSafeWorkspacePath(rootDir, subPath);
  if (!existsSync(target)) throw new Error('目录不存在');
  const entries = readdirSync(target, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.') || e.name === '.agents')
    .filter(e => !BLOCKED_PATH_PATTERNS.some(pat => pat.test(join(target, e.name))))
    .map(e => {
      const full = join(target, e.name);
      const entryRel = relative(base, full).replace(/\\/g, '/');
      let size = 0;
      if (e.isFile()) {
        try { size = statSync(full).size; } catch {}
      }
      return {
        name: e.name,
        path: entryRel,
        fullPath: full,
        isDirectory: e.isDirectory(),
        ignored: e.isDirectory() && IGNORED_DIRS.has(e.name),
        size
      };
    })
    .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
  return { root: base, current: target, relativePath: rel, entries };
}

export function readWorkspaceFile(rootDir, relPath) {
  const { target, rel } = assertSafeWorkspacePath(rootDir, relPath);
  const st = statSync(target);
  if (st.size > 1024 * 1024 * 2) throw new Error('文件超过 2MB');
  const content = readFileSync(target, 'utf8');
  return { path: rel, fullPath: target, size: st.size, ext: extname(target).slice(1), content };
}

export function writeWorkspaceFile(rootDir, relPath, content) {
  const { target, rel } = assertSafeWorkspacePath(rootDir, relPath);
  if (!rel) throw new Error('非法文件路径');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, String(content ?? ''), 'utf8');
  return { ok: true, path: rel, fullPath: target, size: Buffer.byteLength(String(content ?? '')) };
}

export function executeTerminalCommand(command, cwd) {
  return new Promise(resolvePromise => {
    let safeCwd = getDefaultWorkspaces()[0];
    if (cwd) {
      try { safeCwd = assertSafeWorkspacePath(cwd, '').target; } catch {}
    }
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'powershell.exe' : '/bin/sh';
    const args = isWin
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`]
      : ['-c', command];
    const startedAt = Date.now();
    const child = spawn(shell, args, {
      cwd: safeCwd,
      env: process.env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      stderr += '\n[执行超时 (30s) 已终止]';
    }, 30000);
    child.stdout.on('data', d => {
      if (stdout.length < 120000) stdout += d.toString('utf8');
    });
    child.stderr.on('data', d => {
      if (stderr.length < 60000) stderr += d.toString('utf8');
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolvePromise({
        ok: code === 0,
        exitCode: code ?? -1,
        cwd: safeCwd,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolvePromise({
        ok: false,
        exitCode: -1,
        cwd: safeCwd,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: err.message
      });
    });
  });
}
