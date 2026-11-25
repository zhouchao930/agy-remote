import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, renameSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const TAILSCALE_WIN_URL = 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe';

export function findTailscaleCli() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Tailscale\\tailscale.exe',
      'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
      join(process.env.LOCALAPPDATA || '', 'Tailscale', 'tailscale.exe')
    ];
    for (const p of candidates) {
      if (p && existsSync(p)) return p;
    }
    return '';
  }
  for (const p of ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']) {
    if (existsSync(p)) return p;
  }
  return '';
}

export function createTailscaleManager({ getPort, dataDir, onUpdate } = {}) {
  const dir = dataDir || join(homedir(), '.gemini', 'antigravity', 'plugin_data', 'agy-remote');
  mkdirSync(dir, { recursive: true });
  const installerPath = join(dir, 'tailscale-setup-latest.exe');

  let state = {
    installed: false,
    installing: false,
    backendState: 'NotInstalled',
    tailscaleIp: '',
    dnsName: '',
    funnelUrl: '',
    funnelEnableUrl: '',
    funnelLog: '',
    authUrl: '',
    message: '正在检测 Tailscale...'
  };

  const notify = () => {
    try { onUpdate?.({ ...state }); } catch {}
  };

  async function downloadAndInstallWindows() {
    if (state.installing) return;
    const existingCli = findTailscaleCli();
    if (existingCli) {
      state.installed = true;
      await refreshStatus();
      return;
    }

    state.installing = true;
    state.backendState = 'Installing';
    state.message = '正在下载官方 Tailscale 组件...';
    notify();

    try {
      const needDownload = !existsSync(installerPath) || (() => {
        try { return statSync(installerPath).size < 20 * 1024 * 1024; } catch { return true; }
      })();

      if (needDownload) {
        const tmpPath = installerPath + '.tmp';
        try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
        const res = await fetch(TAILSCALE_WIN_URL, { redirect: 'follow', signal: AbortSignal.timeout(300000) });
        if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}`);
        const expectedBytes = Number(res.headers.get('content-length') || 0);
        let downloaded = 0;
        const fileStream = createWriteStream(tmpPath);
        for await (const chunk of Readable.fromWeb(res.body)) {
          downloaded += chunk.length;
          fileStream.write(chunk);
          if (expectedBytes > 0) {
            const pct = Math.min(99, Math.round((downloaded / expectedBytes) * 100));
            state.message = `正在下载官方 Tailscale 组件 (${pct}%, ${(downloaded / 1048576).toFixed(1)}MB)...`;
          }
        }
        await new Promise((r, j) => { fileStream.end(() => r()); fileStream.on('error', j); });
        if (existsSync(tmpPath) && statSync(tmpPath).size >= (expectedBytes > 0 ? expectedBytes : 10 * 1024 * 1024)) {
          try { if (existsSync(installerPath)) unlinkSync(installerPath); } catch {}
          renameSync(tmpPath, installerPath);
        } else {
          throw new Error(`下载未完成 (${(downloaded / 1048576).toFixed(1)}MB)`);
        }
      }

      state.message = '正在本机静默安装 Tailscale 虚拟网卡服务...';
      notify();

      await new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(installerPath, ['/quiet', '/norestart'], {
          windowsHide: true,
          stdio: 'ignore'
        });
        const timer = setTimeout(() => {
          try { child.kill(); } catch {}
          rejectPromise(new Error('安装超时'));
        }, 120000);
        child.on('close', code => {
          clearTimeout(timer);
          if (code === 0 || code === 3010 || findTailscaleCli()) resolvePromise();
          else rejectPromise(new Error(`安装退出码 ${code}`));
        });
        child.on('error', err => {
          clearTimeout(timer);
          rejectPromise(err);
        });
      });

      state.installing = false;
      state.installed = Boolean(findTailscaleCli());
      state.message = state.installed ? 'Tailscale 安装完成，正在检查登录状态...' : 'Tailscale 安装未完成';
      notify();
      await refreshStatus();
    } catch (err) {
      state.installing = false;
      state.message = `Tailscale 自动安装提示: ${err.message}`;
      notify();
    }
  }

  let funnelAttempted = false;
  let funnelProc = null;
  function tryEnableFunnel(cli) {
    if (state.funnelUrl || funnelProc) return;
    const port = typeof getPort === 'function' ? getPort() : Number(getPort) || 18899;

    // First check funnel status
    try {
      const st = spawnSync(cli, ['funnel', 'status'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      const out = String(st.stdout || '') + String(st.stderr || '');
      const mUrl = out.match(/https:\/\/[a-zA-Z0-9.-]+\.ts\.net\b/);
      if (mUrl && /Funnel on/i.test(out)) {
        state.funnelUrl = mUrl[0];
        state.funnelEnableUrl = '';
        notify();
        return;
      }
    } catch {}

    if (funnelAttempted) return;
    funnelAttempted = true;

    try {
      const child = spawn(cli, ['funnel', '--bg', '--yes', String(port)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      funnelProc = child;
      let buf = '';
      const onChunk = chunk => {
        buf += chunk.toString('utf8').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        state.funnelLog = buf.slice(-600);
        const mEnable = buf.match(/https:\/\/login\.tailscale\.com\/f\/[a-zA-Z0-9?=&_-]+/);
        if (mEnable) {
          state.funnelEnableUrl = mEnable[0];
          state.message = '点击一键开启 Tailscale Funnel (手机免装 App 永久直连)';
          notify();
        }
        const mReady = buf.match(/https:\/\/[a-zA-Z0-9.-]+\.ts\.net\b/);
        if (mReady && /Available on the internet|Funnel on/i.test(buf)) {
          state.funnelUrl = mReady[0];
          state.funnelEnableUrl = '';
          state.message = `Tailscale Funnel 免 App 直连已就绪 (${mReady[0]})`;
          notify();
        }
      };
      child.stdout.on('data', onChunk);
      child.stderr.on('data', onChunk);
      child.on('close', () => {
        funnelProc = null;
        // Re-allow attempt every 12s in case user just clicked the enable URL
        setTimeout(() => { funnelAttempted = false; }, 12000);
      });
    } catch {
      funnelProc = null;
    }
  }

  let loginProcess = null;
  function triggerTailscaleLogin(cli) {
    if (loginProcess) return;
    try {
      const child = spawn(cli, ['up', '--qr=false'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      loginProcess = child;
      let buf = '';
      const onChunk = chunk => {
        buf += chunk.toString('utf8');
        const m = buf.match(/https:\/\/login\.tailscale\.com\/a\/[a-zA-Z0-9]+/);
        if (m && m[0] !== state.authUrl) {
          state.authUrl = m[0];
          state.backendState = 'NeedsLogin';
          state.message = '请点击授权链接登录你的 Tailscale 账号';
          notify();
        }
      };
      child.stdout.on('data', onChunk);
      child.stderr.on('data', onChunk);
      child.on('close', () => {
        loginProcess = null;
        setTimeout(refreshStatus, 1000);
      });
    } catch {
      loginProcess = null;
    }
  }

  async function refreshStatus() {
    if (state.installing) return state;
    const cli = findTailscaleCli();
    if (!cli) {
      state.installed = false;
      state.backendState = 'NotInstalled';
      if (process.platform === 'win32') {
        downloadAndInstallWindows().catch(() => {});
      }
      return state;
    }

    state.installed = true;
    try {
      const res = spawnSync(cli, ['status', '--json'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 4000
      });
      if (res.stdout) {
        const data = JSON.parse(res.stdout);
        const bState = String(data.BackendState || 'Unknown');
        state.backendState = bState;
        const ips = Array.isArray(data.TailscaleIPs) ? data.TailscaleIPs : (Array.isArray(data.Self?.TailscaleIPs) ? data.Self.TailscaleIPs : []);
        const ipv4 = ips.find(ip => /^100\./.test(ip)) || '';
        state.tailscaleIp = ipv4;
        state.dnsName = String(data.Self?.DNSName || '').replace(/\.$/, '');
        if (data.AuthURL) {
          state.authUrl = String(data.AuthURL);
        }

        if (bState === 'Running' && ipv4) {
          state.authUrl = '';
          tryEnableFunnel(cli);
          if (state.funnelUrl) {
            state.message = `Tailscale Funnel 免 App 公网直连已就绪 (${state.funnelUrl})`;
          } else if (state.funnelEnableUrl) {
            state.message = `点击右侧开启 Tailscale Funnel 即可手机免装 App 永久直连`;
          } else {
            state.message = `Tailscale P2P 已就绪 (${ipv4})`;
          }
        } else if (bState === 'NeedsLogin' || bState === 'NoState') {
          state.message = state.authUrl
            ? '点击下方链接完成 Tailscale 账号绑定'
            : '正在获取 Tailscale 账号绑定链接...';
          if (!state.authUrl) triggerTailscaleLogin(cli);
        } else if (bState === 'Stopped') {
          state.message = '正在启动 Tailscale 节点...';
          triggerTailscaleLogin(cli);
        }
        notify();
      }
    } catch {}
    return state;
  }

  // Initial check & periodic 6s status poll
  refreshStatus().catch(() => {});
  const pollTimer = setInterval(() => {
    refreshStatus().catch(() => {});
  }, 6000);

  return {
    getState() {
      return { ...state };
    },
    installOrLogin() {
      const cli = findTailscaleCli();
      if (!cli) {
        downloadAndInstallWindows().catch(() => {});
      } else {
        triggerTailscaleLogin(cli);
      }
      return { ...state };
    },
    stop() {
      clearInterval(pollTimer);
    }
  };
}
