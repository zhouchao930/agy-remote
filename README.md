# AGY Remote (Mobile & Web Remote Control for Antigravity 2.0)

当人不在办公室时，通过手机 5G 或异地电脑浏览器扫码/打开固定链接，随时随地安全远程操控你的 **Google Antigravity 2.0** 客户端。

## ✨ 核心特性

- **📱 左下角极简扫码面板**：在 Antigravity 客户端左下角设置齿轮旁注入**翠绿色小手机图标**，点击弹出极简居中二维码卡片，二维码固定不闪烁，支持一键复制链接或在浏览器打开。
- **🔒 内置 Tailscale 自动部署 + Cloudflare 高速公网双引擎**：
  - **免装 App 公网直连**：自动配置常驻 `Cloudflare High-Speed Edge` (`*.trycloudflare.com`) / `Tailscale Funnel` (`*.ts.net`) HTTPS 边缘通道，手机无需安装任何 App 直接扫码即用。
  - **Tailscale P2P 异地直连**：插件启动时自动检测并在后台静默安装官方 Tailscale 组件，支持一键绑定账号获得永久固定 `100.x.y.z` P2P 直连地址。
- **🛡️ AES-256-GCM 端到端加密 (E2EE) + 严格安全沙箱**：
  - 所有经过公网隧道的会话、思考过程与代码载荷均采用 **AES-256-GCM 端到端加密**（仅浏览器本地 WebCrypto 可解密，中间节点零明文可见）。
  - 配备 192-bit 高强度 Token、`timingSafeEqual` 防时序攻击、`HttpOnly` 同源 Cookie、单 IP 防爆破速率限制及工作区敏感文件（`.ssh` / `.env` / 密钥等）路径沙箱保护。
- **🎨 1:1 还原 Antigravity 原生界面 + 双向实时同步**：
  - **会话与模型 100% 同步**：实时同步桌面端未归档会话列表、当前激活会话、以及账号下真实可用的全部 AI 模型列表（支持远程一键切换桌面端模型）。
  - **原生组件复刻**：完整呈现 AGY 原生 `Steps` 步骤进度卡片、`Thought` 思考与工具调用药丸、逐行红绿 File Diff 预览、一键撤销文件修改（`↩ 撤销修改`）及 SSE (`EventSource`) 毫秒级流式推送。

---

## 🚀 安装方法

### 方式一：把安装包发给 AI Agent 自动安装（最推荐）
将压缩包（或解压后的文件夹）发给你的 Antigravity / Codex / Claude Code，复制发送以下提示词：

> 请帮我安装这个 AGY Remote 远程控制插件（路径：`<替换为你的压缩包或解压目录路径>`）。如果还是 `.zip` 压缩包请先解压，然后阅读里面的 `docs/INSTALL_AGENT.md`，执行项目自带的 `install.bat` / `install.ps1`（Windows）或 `install.sh`（macOS/Linux）完成安装，不要影响其他已安装插件。

### 方式二：双击或终端一键安装
- **Windows（双击即装）**：
  解压后直接双击运行根目录下的 **`install.bat`**，或在 PowerShell 执行：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File ./install.ps1
  ```
- **macOS / Linux**：
  ```sh
  sh ./install.sh
  ```

---

## 🗑️ 卸载方法
- **Windows**：双击运行 `uninstall.bat`，或执行 `powershell -NoProfile -ExecutionPolicy Bypass -File ./uninstall.ps1 -Mode Uninstall`
- **macOS / Linux**：`sh ./uninstall.sh`
