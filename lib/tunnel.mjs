import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, renameSync, unlinkSync, statSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SSH_BIN = existsSync('C:\\WINDOWS\\System32\\OpenSSH\\ssh.exe')
  ? 'C:\\WINDOWS\\System32\\OpenSSH\\ssh.exe'
  : 'ssh';

const CLOUDFLARED_URLS = [
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
];

async function ensureCloudflaredBinary(dataDir, onProgress) {
  mkdirSync(dataDir, { recursive: true });
  const binPath = join(dataDir, 'cloudflared.exe');
  try {
    if (existsSync(binPath) && statSync(binPath).size > 15 * 1024 * 1024) {
      return binPath;
    }
  } catch {}

  const tmpPath = join(dataDir, 'cloudflared.exe.tmp');
  for (const url of CLOUDFLARED_URLS) {
    try {
      onProgress?.('正在准备 Cloudflare 高速边缘引擎...');
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90000) });
      if (!res.ok || !res.body) continue;
      const fileStream = createWriteStream(tmpPath);
      await pipeline(Readable.fromWeb(res.body), fileStream);
      if (existsSync(tmpPath) && statSync(tmpPath).size > 15 * 1024 * 1024) {
        try { if (existsSync(binPath)) unlinkSync(binPath); } catch {}
        renameSync(tmpPath, binPath);
        return binPath;
      }
    } catch {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    }
  }
  return '';
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function createPublicTunnelManager({ getPort, dataDir, onUpdate } = {}) {
  const dir = dataDir || join(homedir(), '.gemini', 'antigravity', 'plugin_data', 'agy-remote');
  mkdirSync(dir, { recursive: true });
  const cfBinPath = join(dir, 'cloudflared.exe');
  const cfLogFile = join(dir, 'cloudflared.log');
  const sessionFile = join(dir, 'tunnel-session.json');
  const knownHostsFile = join(dir, 'known_hosts');

  let publicUrl = '';
  let provider = 'Cloudflare High-Speed Edge';
  let status = 'connecting';
  let lastError = '';
  let lastLog = '';
  let stopped = false;
  let pollTimer = null;
  let fallbackProcess = null;

  const notify = () => {
    try {
      onUpdate?.({ publicUrl, provider, status, lastError, lastLog: lastLog.slice(-400) });
    } catch {}
  };

  function saveTunnelSession(pid, port, url, prov) {
    try {
      writeFileSync(sessionFile, JSON.stringify({
        pid,
        port,
        publicUrl: url,
        provider: prov,
        savedAt: Date.now()
      }, null, 2));
    } catch {}
  }

  function tryAttachExistingSession() {
    const port = typeof getPort === 'function' ? getPort() : Number(getPort) || 18899;
    if (!existsSync(sessionFile)) return false;
    try {
      const sess = JSON.parse(readFileSync(sessionFile, 'utf8'));
      const pid = Number(sess?.pid || 0);
      if (sess && sess.port === port && isPidAlive(pid)) {
        let url = String(sess.publicUrl || '');
        if (!url && existsSync(cfLogFile)) {
          const logText = readFileSync(cfLogFile, 'utf8');
          const m = logText.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com\b/);
          if (m) url = m[0];
        }
        if (url && !url.includes('pinggy')) {
          publicUrl = url;
          provider = sess.provider || 'Cloudflare High-Speed Edge';
          status = 'ready';
          lastError = '';
          lastLog = `Reused persistent tunnel (PID ${pid}) -> ${url}`;
          saveTunnelSession(pid, port, url, provider);
          notify();
          startHealthMonitor(pid);
          return true;
        }
      }
    } catch {}
    return false;
  }

  function startHealthMonitor(pid) {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (stopped) {
        clearInterval(pollTimer);
        return;
      }
      if (!isPidAlive(pid)) {
        clearInterval(pollTimer);
        publicUrl = '';
        status = 'connecting';
        lastError = '隧道重连中...';
        notify();
        bootTunnel(false);
      }
    }, 4000);
  }

  function startServeoFallback() {
    if (stopped) return;
    if (fallbackProcess) {
      try { fallbackProcess.kill(); } catch {}
      fallbackProcess = null;
    }
    const port = typeof getPort === 'function' ? getPort() : Number(getPort) || 18899;
    provider = 'Serveo High-Speed Edge (443)';
    status = 'connecting';
    notify();

    const child = spawn(SSH_BIN, [
      '-o', 'StrictHostKeyChecking=no',
      '-o', `UserKnownHostsFile=${knownHostsFile}`,
      '-o', 'ServerAliveInterval=20',
      '-o', 'ExitOnForwardFailure=yes',
      '-p', '443',
      '-R', `80:127.0.0.1:${port}`,
      'serveo.net'
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    fallbackProcess = child;

    let buf = '';
    const onData = chunk => {
      if (fallbackProcess !== child) return;
      const s = chunk.toString('utf8').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      buf = (buf + s).slice(-8192);
      lastLog = buf;
      const m = buf.match(/https:\/\/[a-zA-Z0-9-]+\.(?:serveo\.net|serveousercontent\.com)\b/);
      if (m && m[0] !== publicUrl) {
        publicUrl = m[0];
        status = 'ready';
        lastError = '';
        saveTunnelSession(child.pid, port, publicUrl, provider);
      }
      notify();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  }

  function spawnDetachedCloudflared(binPath) {
    if (stopped) return;
    if (tryAttachExistingSession()) return;

    const port = typeof getPort === 'function' ? getPort() : Number(getPort) || 18899;
    provider = 'Cloudflare High-Speed Edge';
    status = 'connecting';
    publicUrl = '';
    notify();

    let outFd;
    try {
      outFd = openSync(cfLogFile, 'w');
    } catch {}

    const child = spawn(binPath, [
      'tunnel',
      '--url', `http://127.0.0.1:${port}`,
      '--no-autoupdate',
      '--protocol', 'http2'
    ], {
      detached: true,
      windowsHide: true,
      stdio: outFd !== undefined ? ['ignore', outFd, outFd] : 'ignore'
    });
    child.unref();
    if (outFd !== undefined) {
      try { closeSync(outFd); } catch {}
    }

    const pid = child.pid;
    saveTunnelSession(pid, port, '', provider);

    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (stopped) {
        clearInterval(pollTimer);
        return;
      }
      let logText = '';
      try {
        if (existsSync(cfLogFile)) logText = readFileSync(cfLogFile, 'utf8');
      } catch {}
      if (logText) lastLog = logText.slice(-800);

      const m = logText.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com\b/);
      if (m) {
        publicUrl = m[0];
        provider = 'Cloudflare High-Speed Edge';
        status = 'ready';
        lastError = '';
        saveTunnelSession(pid, port, publicUrl, provider);
        notify();
        startHealthMonitor(pid);
        return;
      }

      if (!isPidAlive(pid)) {
        clearInterval(pollTimer);
        const isRateLimit = /status 429|Too Many Requests/i.test(logText);
        if (isRateLimit) {
          lastError = 'Cloudflare 429 冷却中，已启用 Serveo (443) 边缘通道';
          startServeoFallback();
          // Retry Cloudflare after 90s cooldown so rate-limit window clears cleanly
          setTimeout(() => {
            if (!stopped && (!publicUrl || !publicUrl.includes('trycloudflare.com'))) {
              spawnDetachedCloudflared(binPath);
            }
          }, 90000);
        } else {
          setTimeout(() => {
            if (!stopped) spawnDetachedCloudflared(binPath);
          }, 6000);
        }
      }
    }, 700);
  }

  function bootTunnel(forceNew = false) {
    if (forceNew && existsSync(sessionFile)) {
      try {
        const sess = JSON.parse(readFileSync(sessionFile, 'utf8'));
        if (sess?.pid && isPidAlive(Number(sess.pid))) {
          try { process.kill(Number(sess.pid)); } catch {}
        }
        unlinkSync(sessionFile);
      } catch {}
    } else if (tryAttachExistingSession()) {
      return;
    }

    if (existsSync(cfBinPath) && (() => { try { return statSync(cfBinPath).size > 15 * 1024 * 1024; } catch { return false; } })()) {
      spawnDetachedCloudflared(cfBinPath);
    } else {
      ensureCloudflaredBinary(dir, msg => { lastLog = msg; notify(); }).then(bin => {
        if (bin && !stopped) {
          spawnDetachedCloudflared(bin);
        }
      }).catch(() => {});
    }
  }

  bootTunnel(false);

  return {
    getState() {
      return { publicUrl, provider, status, lastError, lastLog: lastLog.slice(-400) };
    },
    restart(forceNew = false) {
      bootTunnel(forceNew);
    },
    stop() {
      stopped = true;
      clearInterval(pollTimer);
      if (fallbackProcess) {
        try { fallbackProcess.kill(); } catch {}
      }
      status = 'stopped';
      notify();
    }
  };
}
