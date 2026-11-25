param(
  [ValidateSet('Install','Uninstall')][string]$Mode='Install',
  [switch]$KeepSettings,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments
)
$ErrorActionPreference='Stop'

$sourceRoot = $PSScriptRoot
$targetDir = Join-Path $HOME '.gemini\config\plugins\agy-remote'
$dataDir = Join-Path $HOME '.gemini\antigravity\plugin_data\agy-remote'

if ($Mode -eq 'Uninstall') {
  if (Test-Path -LiteralPath $targetDir) {
    Remove-Item -LiteralPath $targetDir -Recurse -Force
  }
  if (-not $KeepSettings -and (Test-Path -LiteralPath $dataDir)) {
    try { Remove-Item -LiteralPath $dataDir -Recurse -Force } catch {}
  }
  Write-Host "✅ 已卸载 AGY Remote 插件 ($targetDir)" -ForegroundColor Green
  exit 0
}

# 1. Copy plugin files to ~/.gemini/config/plugins/agy-remote
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetDir) | Out-Null
if ((Resolve-Path -LiteralPath $sourceRoot).Path -ne (New-Item -ItemType Directory -Force -Path $targetDir).FullName) {
  Copy-Item -Path (Join-Path $sourceRoot '*') -Destination $targetDir -Recurse -Force
}

# 2. Patch Antigravity desktop/start-menu shortcuts with --remote-debugging-port=0
try {
  $dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
  $ws = New-Object -ComObject WScript.Shell
  foreach ($d in $dirs) {
    if (-not (Test-Path -LiteralPath $d)) { continue }
    Get-ChildItem -LiteralPath $d -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $s = $ws.CreateShortcut($_.FullName)
        if ((Split-Path -Leaf $s.TargetPath) -match '^antigravity\.exe$') {
          if ($s.Arguments -notmatch '--remote-debugging-port') {
            $s.Arguments = ("$($s.Arguments) --remote-debugging-port=0").Trim()
            $s.Save()
          }
        }
      } catch {}
    }
  }
} catch {}

# 3. Check embedded Tailscale installation status
$pkgJson = Get-Content -LiteralPath (Join-Path $targetDir 'package.json') -Raw | ConvertFrom-Json
$tsBin = 'C:\Program Files\Tailscale\tailscale.exe'

Write-Host "✅ 已成功安装 AGY Remote v$($pkgJson.version) 到 $targetDir" -ForegroundColor Green
if (Test-Path -LiteralPath $tsBin) {
  Write-Host "🔒 检测到本机已安装 Tailscale 组件 ($tsBin)" -ForegroundColor Cyan
} else {
  Write-Host "⏳ Tailscale 将由 AGY Remote 后台服务在启动时自动静默下载并安装" -ForegroundColor Yellow
}
Write-Host "📱 客户端左下角设置按钮旁已启用绿色小手机扫码入口！" -ForegroundColor Green
exit 0
