# Agent 安装指南 (INSTALL_AGENT.md)

适用于 Antigravity、Codex、Claude Code 等支持执行本地命令的 AI Agent。

## 自动安装步骤

1. 如果用户提供的是 `agy-remote-*.zip` 压缩包，请先将其解压到临时目录。
2. 确认解压目录内包含 `plugin.json`（`name` 为 `agy-remote`）。
3. **Windows** 在解压目录执行：
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File ./install.ps1
   ```
   （或执行 `cmd.exe /c install.bat`）
   **macOS / Linux** 在解压目录执行：
   ```sh
   sh ./install.sh
   ```
4. 安装脚本零外部 npm 依赖（无需运行 `npm install`），会自动将插件部署至 `~/.gemini/config/plugins/agy-remote`，并自动为 Antigravity 快捷方式开启本地 CDP 调试端口（`--remote-debugging-port=0`）。
5. 安装完成后，Antigravity 会自动启动 `agy-remote` 后台服务（自动配置 Cloudflare 高速边缘隧道与内置 Tailscale 组件），并在客户端左下角设置齿轮旁注入绿色小手机扫码图标。
