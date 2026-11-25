import { hostname } from 'node:os';
import { createHash } from 'node:crypto';
import { evaluateInAllHubs } from './bridge.mjs';
import { renderQrSvg } from './qrcode.mjs';

const MACHINE_ID = createHash('md5')
  .update(hostname() + '-agy-remote')
  .digest('hex')
  .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

let fixedTimestamp = Date.now();
let lastTokenForTs = '';

export function bumpUrlTimestamp() {
  fixedTimestamp = Date.now();
}

export function formatZcodeUrl(baseOrigin, token) {
  if (token !== lastTokenForTs) {
    lastTokenForTs = token;
    fixedTimestamp = Date.now();
  }
  const host = hostname();
  const sid = 'd_' + createHash('sha256').update(token + '-sid').digest('base64url').slice(0, 22);
  const hash = encodeURIComponent(token);
  return `${baseOrigin}/remote/v4?sid=${sid}&hash=${hash}&t=${fixedTimestamp}&mid=${MACHINE_ID}&name=${encodeURIComponent(host)}&app_version=3.11.2`;
}

const qrCache = new Map();
function getCachedQrSvg(url) {
  if (!url) return '';
  if (qrCache.has(url)) return qrCache.get(url);
  const svg = renderQrSvg(url, { margin: 2, darkColor: '#000000', lightColor: '#ffffff' });
  qrCache.set(url, svg);
  return svg;
}

export function buildSidebarPayload({ port, token, lanOrigin, publicOrigin, tunnelStatus, tunnelProvider, tailscaleState = null, serviceRunning = true }) {
  const cleanPublicOrigin = publicOrigin && !publicOrigin.includes('dashboard.pinggy.io') ? publicOrigin : '';
  const zcodePublicUrl = cleanPublicOrigin ? formatZcodeUrl(cleanPublicOrigin, token) : '';
  const zcodeLanUrl = formatZcodeUrl(lanOrigin || `http://127.0.0.1:${port}`, token);
  const activeUrl = zcodePublicUrl || zcodeLanUrl;

  const shortPublicQrUrl = cleanPublicOrigin ? `${cleanPublicOrigin}/remote/v4?hash=${encodeURIComponent(token)}&sid=d_${token.slice(0, 10)}` : '';
  const shortLanQrUrl = `${lanOrigin || `http://127.0.0.1:${port}`}/remote/v4?hash=${encodeURIComponent(token)}&sid=d_${token.slice(0, 10)}`;

  const qrSvg = serviceRunning ? getCachedQrSvg(shortPublicQrUrl || shortLanQrUrl) : '';
  const lanQrSvg = serviceRunning ? getCachedQrSvg(shortLanQrUrl) : '';

  return {
    port,
    token,
    hostName: hostname(),
    machineId: MACHINE_ID,
    serviceRunning,
    publicUrl: zcodePublicUrl,
    lanUrl: zcodeLanUrl,
    activeUrl,
    hasPublic: Boolean(zcodePublicUrl),
    tunnelStatus,
    tunnelProvider,
    tailscale: tailscaleState || { installed: false, backendState: 'NotInstalled', tailscaleIp: '', funnelUrl: '', funnelEnableUrl: '', authUrl: '', message: '' },
    qrSvg,
    lanQrSvg
  };
}

export function buildClientMountScript(payload) {
  return `(() => {
    const incoming = ${JSON.stringify(payload)};
    const UI_VER = 'v2.3.0';
    if (globalThis.__agyRemoteUiVersion === UI_VER && typeof globalThis.__agyRemoteUpdateUi === 'function') {
      globalThis.__agyRemoteUpdateUi(incoming);
      return { ok: true, mode: 'updated' };
    }
    try { globalThis.__agyRemoteObs?.disconnect(); } catch {}
    const prevOverlays = [...document.querySelectorAll('[data-testid="zcode-remote-overlay"]')];
    const wasModalOpen = prevOverlays.some(el => el.dataset?.open === 'true');
    prevOverlays.forEach(el => el.remove());

    const existingBtns = [...document.querySelectorAll('[data-testid="zcode-phone-icon-trigger"]')];
    for (let i = 1; i < existingBtns.length; i++) {
      existingBtns[i].style.setProperty('display', 'none', 'important');
      existingBtns[i].style.setProperty('width', '0px', 'important');
      existingBtns[i].style.setProperty('pointer-events', 'none', 'important');
    }

    globalThis.__agyRemoteUiVersion = UI_VER;
    globalThis.__agyRemotePayload = incoming;

    const escapeHtml = s => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const STYLE_ID = 'agy-remote-clean-style-v23';
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    st.textContent = \`
      .zcode-phone-icon-btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 7px;
        border: 1px solid transparent;
        background: transparent;
        color: #22c55e;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        transition: background 120ms ease, border-color 120ms ease;
      }
      .zcode-phone-icon-btn:hover, .zcode-phone-icon-btn[data-active="true"] {
        background: rgba(34, 197, 94, 0.14);
        border-color: rgba(34, 197, 94, 0.32);
        color: #4ade80;
      }
      .zcode-overlay {
        position: fixed;
        inset: 0;
        z-index: 99998;
        background: rgba(8, 9, 12, 0.72);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }
      .zcode-overlay[data-open="true"] {
        display: flex;
      }
      .agy-clean-modal {
        width: 100%;
        max-width: 380px;
        background: #141519;
        color: #eceef2;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 20px 22px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
        display: flex;
        flex-direction: column;
        gap: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .agy-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .agy-modal-title-group {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .agy-modal-title {
        font-size: 15px;
        font-weight: 600;
        color: #f4f4f5;
        margin: 0;
      }
      .agy-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(34, 197, 94, 0.14);
        color: #4ade80;
      }
      .agy-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .agy-close-x {
        appearance: none;
        border: 0;
        background: transparent;
        color: #8e9099;
        width: 28px;
        height: 28px;
        border-radius: 7px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
      }
      .agy-close-x:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
      .agy-seg-tabs {
        display: flex;
        background: #1c1e24;
        padding: 3px;
        border-radius: 9px;
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .agy-seg-tab {
        flex: 1;
        appearance: none;
        border: 0;
        background: transparent;
        color: #9ca0ab;
        font-size: 12px;
        font-weight: 500;
        padding: 6px 8px;
        border-radius: 7px;
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
      }
      .agy-seg-tab.active {
        background: #282b34;
        color: #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
      }
      .agy-qr-stage {
        background: #191b20;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 13px;
        padding: 20px 16px 14px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .agy-qr-white {
        width: 204px;
        height: 204px;
        padding: 12px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .agy-qr-white svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .agy-url-line {
        width: 100%;
        padding: 7px 10px;
        border-radius: 7px;
        background: #111216;
        border: 1px solid rgba(255, 255, 255, 0.06);
        font-family: Consolas, monospace;
        font-size: 11px;
        color: #9ca0ab;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: all;
      }
      .agy-btn-row {
        display: flex;
        gap: 8px;
      }
      .agy-primary-btn {
        flex: 1;
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #23262f;
        color: #eceef2;
        border-radius: 9px;
        height: 36px;
        padding: 0 12px;
        font-size: 12.5px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background 0.12s;
      }
      .agy-primary-btn:hover {
        background: #2d313d;
      }
      .agy-primary-btn.accent {
        background: #2563eb;
        border-color: #3b82f6;
        color: #fff;
      }
      .agy-primary-btn.accent:hover {
        background: #1d4ed8;
      }
      .agy-sub-tip {
        font-size: 11.5px;
        color: #8e9099;
        text-align: center;
        line-height: 1.45;
      }
      .agy-sub-tip a {
        color: #60a5fa;
        text-decoration: none;
      }
      .agy-sub-tip a:hover {
        text-decoration: underline;
      }
    \`;

    let modalOpen = wasModalOpen;
    let modeTab = 'public'; // 'public' (免装App公网) | 'tailscale' (100.x P2P固定IP)
    let phoneBtn = null;
    let overlayEl = null;
    let lastRenderedSignature = '';

    function bindPhoneBtnClick(btn) {
      if (btn.dataset.agyBoundVer === UI_VER) return;
      btn.dataset.agyBoundVer = UI_VER;
      btn.style.removeProperty('display');
      btn.addEventListener('click', e => {
        if (globalThis.__agyRemoteUiVersion !== UI_VER) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        modalOpen = !modalOpen;
        lastRenderedSignature = '';
        renderAll(true);
      }, true);
    }

    function createPhoneButton() {
      const existing = document.querySelector('[data-testid="zcode-phone-icon-trigger"]');
      if (existing) {
        bindPhoneBtnClick(existing);
        return existing;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zcode-phone-icon-btn';
      btn.dataset.testid = 'zcode-phone-icon-trigger';
      btn.title = '远程控制';
      btn.innerHTML = \`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="2" width="12" height="20" rx="2.5"></rect>
          <circle cx="12" cy="18" r="1" fill="currentColor"></circle>
        </svg>
      \`;
      bindPhoneBtnClick(btn);
      return btn;
    }

    function ensureMounted() {
      if (phoneBtn && phoneBtn.isConnected && overlayEl && overlayEl.isConnected) {
        return;
      }
      if (!overlayEl || !overlayEl.isConnected) {
        overlayEl = document.createElement('div');
        overlayEl.className = 'zcode-overlay';
        overlayEl.dataset.testid = 'zcode-remote-overlay';
        overlayEl.addEventListener('click', e => {
          if (e.target === overlayEl) {
            modalOpen = false;
            lastRenderedSignature = '';
            renderAll(true);
          }
        });
        document.body.appendChild(overlayEl);
      }
      if (!phoneBtn) phoneBtn = createPhoneButton();

      const acctTrigger = document.querySelector('[data-testid="agy-account-switcher-trigger"], .pt-acct-trigger');
      if (acctTrigger && acctTrigger.offsetParent !== null) {
        const lastChild = acctTrigger.lastElementChild;
        if (phoneBtn.parentElement !== acctTrigger) {
          acctTrigger.insertBefore(phoneBtn, lastChild || null);
        }
        return;
      }

      const settingsBtn = document.querySelector('[data-testid="settings-button"]');
      if (settingsBtn && settingsBtn.parentElement) {
        const parent = settingsBtn.parentElement;
        const pStyle = getComputedStyle(parent);
        if (pStyle.display.includes('flex') && pStyle.flexDirection === 'row') {
          if (phoneBtn.parentElement !== parent || phoneBtn.nextSibling !== settingsBtn) {
            parent.insertBefore(phoneBtn, settingsBtn);
          }
          return;
        }
        settingsBtn.style.display = 'flex';
        settingsBtn.style.alignItems = 'center';
        if (phoneBtn.parentElement !== settingsBtn) {
          phoneBtn.style.marginLeft = 'auto';
          settingsBtn.appendChild(phoneBtn);
        }
        return;
      }

      const navItems = document.querySelector('[data-testid="sidebar-navigation-items"]') || document.querySelector('a[href="/customizations"]')?.parentElement;
      if (navItems && phoneBtn.parentElement !== navItems) {
        navItems.appendChild(phoneBtn);
      }
    }

    function renderAll(force = false) {
      ensureMounted();
      const data = globalThis.__agyRemotePayload || {};
      const ts = data.tailscale || {};
      const hasPublic = Boolean(data.publicUrl);
      const hasTsIp = Boolean(ts.tailscaleIp);

      const useTsTab = (modeTab === 'tailscale' && hasTsIp) || (!hasPublic && hasTsIp);
      const displayUrl = useTsTab ? data.lanUrl : (data.publicUrl || data.lanUrl);
      const displayQr = useTsTab ? data.lanQrSvg : (data.qrSvg || data.lanQrSvg);

      if (phoneBtn) {
        phoneBtn.dataset.active = String(modalOpen);
      }

      if (overlayEl) {
        overlayEl.dataset.open = String(modalOpen);
        if (!modalOpen) return;

        const sig = [modalOpen, modeTab, displayUrl, ts.tailscaleIp, ts.funnelUrl, ts.funnelEnableUrl, ts.authUrl].join('|');
        if (!force && sig === lastRenderedSignature) return;
        lastRenderedSignature = sig;

        const tabsHtml = (hasPublic && hasTsIp)
          ? \`<div class="agy-seg-tabs">
               <button type="button" class="agy-seg-tab \${!useTsTab ? 'active' : ''}" data-tab="public">📱 免装 App 扫码</button>
               <button type="button" class="agy-seg-tab \${useTsTab ? 'active' : ''}" data-tab="tailscale">🔒 Tailscale (\${escapeHtml(ts.tailscaleIp)})</button>
             </div>\`
          : '';

        const tipHtml = ts.authUrl
          ? \`<div class="agy-sub-tip"><a href="\${escapeHtml(ts.authUrl)}" target="_blank" rel="noopener noreferrer">🔑 点击绑定 Tailscale 账号获取固定 IP →</a></div>\`
          : (ts.funnelEnableUrl && !ts.funnelUrl
            ? \`<div class="agy-sub-tip">已开启 AES-256-GCM 端到端加密 · <a href="\${escapeHtml(ts.funnelEnableUrl)}" target="_blank" rel="noopener noreferrer">开启永久固定域名</a></div>\`
            : \`<div class="agy-sub-tip">已开启 AES-256-GCM 端到端加密 · 手机扫码即连</div>\`);

        overlayEl.innerHTML = \`
          <div class="agy-clean-modal">
            <div class="agy-modal-header">
              <div class="agy-modal-title-group">
                <h2 class="agy-modal-title">远程控制</h2>
                <span class="agy-status-pill"><span class="agy-status-dot"></span><span>已就绪</span></span>
              </div>
              <button type="button" class="agy-close-x" id="zcodeCloseModalBtn" title="关闭">✕</button>
            </div>

            \${tabsHtml}

            <div class="agy-qr-stage">
              <div class="agy-qr-white">
                \${displayQr || '<span style="color:#000;font-size:12px;">正在生成...</span>'}
              </div>
              <div class="agy-url-line" title="\${escapeHtml(displayUrl || '')}">\${escapeHtml(displayUrl || '')}</div>
            </div>

            <div class="agy-btn-row">
              <button type="button" class="agy-primary-btn accent" id="zcodeCopyLinkBtn">📋 复制链接</button>
              <button type="button" class="agy-primary-btn" id="zcodeOpenWebStudioItem">↗ 浏览器打开</button>
            </div>

            \${tipHtml}
          </div>
        \`;

        overlayEl.querySelector('#zcodeCloseModalBtn')?.addEventListener('click', () => {
          modalOpen = false;
          lastRenderedSignature = '';
          renderAll(true);
        });

        overlayEl.querySelectorAll('[data-tab]').forEach(tabBtn => {
          tabBtn.addEventListener('click', () => {
            modeTab = tabBtn.dataset.tab;
            renderAll(true);
          });
        });

        overlayEl.querySelector('#zcodeCopyLinkBtn')?.addEventListener('click', async e => {
          const btnEl = e.currentTarget;
          if (!displayUrl) return;
          try {
            await navigator.clipboard.writeText(displayUrl);
            btnEl.textContent = '✅ 已复制';
            setTimeout(() => { btnEl.textContent = '📋 复制链接'; }, 1500);
          } catch {}
        });

        overlayEl.querySelector('#zcodeOpenWebStudioItem')?.addEventListener('click', () => {
          if (displayUrl) window.open(displayUrl, '_blank', 'noopener,noreferrer');
        });
      }
    }

    globalThis.__agyRemoteUpdateUi = nextPayload => {
      globalThis.__agyRemotePayload = nextPayload;
      renderAll(false);
    };

    globalThis.__agyRemoteOpenModal = () => {
      modalOpen = true;
      renderAll(true);
    };

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalOpen) {
        modalOpen = false;
        lastRenderedSignature = '';
        renderAll(true);
      }
    });

    let mountDebounce = null;
    const obs = new MutationObserver(() => {
      if (globalThis.__agyRemoteUiVersion !== UI_VER) {
        obs.disconnect();
        return;
      }
      if (phoneBtn && phoneBtn.isConnected) return;
      if (mountDebounce) return;
      mountDebounce = setTimeout(() => {
        mountDebounce = null;
        ensureMounted();
      }, 250);
    });
    globalThis.__agyRemoteObs = obs;
    obs.observe(document.body, { childList: true, subtree: true });
    renderAll(true);
    return { ok: true, mode: 'mounted-v23' };
  })()`;
}

export function startSidebarInjector({ getPayload }) {
  let timer = null;
  let stopped = false;
  let lastPushedSig = '';

  async function tick(forcePush = false) {
    if (stopped) return;
    try {
      const payload = getPayload();
      const sig = `${payload.activeUrl}|${payload.tunnelStatus}|${payload.port}|v23`;

      if (!forcePush && sig === lastPushedSig) {
        const checks = await evaluateInAllHubs(`Boolean(globalThis.__agyRemoteUiVersion === 'v2.3.0' && typeof globalThis.__agyRemoteUpdateUi === 'function' && document.querySelector('[data-testid="zcode-phone-icon-trigger"]')?.isConnected)`);
        if (checks.length > 0 && checks.every(c => c.value === true)) return;
      }

      await evaluateInAllHubs(buildClientMountScript(payload));
      lastPushedSig = sig;
    } catch {}
  }

  void tick(true);
  timer = setInterval(() => void tick(false), 6000);

  return {
    triggerNow: () => void tick(true),
    stop: () => {
      stopped = true;
      clearInterval(timer);
    }
  };
}
