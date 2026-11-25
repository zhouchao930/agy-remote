import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
const targetDir = join(homedir(), '.gemini', 'config', 'plugins', 'agy-remote');

function patchWindowsShortcuts() {
  if (process.platform !== 'win32') return;
  const psScript = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    '$dirs = @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))',
    '$ws = New-Object -ComObject WScript.Shell',
    'foreach ($d in $dirs) {',
    '  if (-not (Test-Path -LiteralPath $d)) { continue }',
    '  Get-ChildItem -LiteralPath $d -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {',
    '    try {',
    '      $s = $ws.CreateShortcut($_.FullName)',
    '      if ((Split-Path -Leaf $s.TargetPath) -match "^antigravity\\.exe$") {',
    '        if ($s.Arguments -notmatch "--remote-debugging-port") {',
    '          $s.Arguments = ("$($s.Arguments) --remote-debugging-port=0").Trim()',
    '          $s.Save()',
    '        }',
    '      }',
    '    } catch {}',
    '  }',
    '}'
  ].join('\n');
  try {
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
      windowsHide: true,
      timeout: 6000
    });
  } catch {}
}

try {
  mkdirSync(dirname(targetDir), { recursive: true });
  if (resolve(sourceRoot) !== resolve(targetDir)) {
    cpSync(sourceRoot, targetDir, { recursive: true, force: true });
  }
  patchWindowsShortcuts();
  console.log(`✅ 已成功安装 AGY Remote v${pkg.version} 到 ${targetDir}`);
  console.log('📱 客户端左下角设置按钮旁已启用绿色小手机扫码入口（如首次开启调试端口，请重启一次 Antigravity 客户端）。');
} catch (err) {
  console.error('安装失败: ' + err.message);
  process.exitCode = 1;
}
