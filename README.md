# AGY Remote Web Studio (`v2.6.0`)

**AGY Remote** 是一款专为 **Antigravity 2.0 (AGY)** 打造的手机/异地电脑远程控制插件。采用 **1:1 原生 Antigravity 暗黑界面 + ZCode 极速通信内核**，让你在外出、通勤或异地办公时，通过手机 5G（微信扫码或手机浏览器）即可随时查看办公室电脑上的 AI 任务进度、连续下发多条排队指令、审查代码 Diff 变更并一键撤销修改。

---

## ✨ 核心特性

1. **1:1 还原 Antigravity 原生界面**
   - 原生 `#0e0f12` / `#131418` 暗黑主题、左侧对话列表（支持全部扁平对话与按工作区分组切换）。
   - 原生顶部 **Steps 步骤清单卡片**、可展开的 **Thought 思考过程与工具调用胶囊**。
   - **真实代码 Diff 审查抽屉**：在手机上直接查看本轮新增/删除的每一行代码高亮对比，并支持点击 **`↩ 撤销修改`** 一键回滚文件。
   - **真实模型同步与切换**：直接从桌面端 Redux 状态同步可用模型列表，手机端切换即时生效。
2. **手机端多消息连续输入队列（Message Queue）**
   - **停止按钮 (`⏹`) 与发送按钮 (`↑`) 独立分离**：AI 正在运行期间，发送按钮保持随时可用，支持连续输入多条后续指令进入队列（显示 `⏳ 队列中` 状态条与 `✕ 取消` 按钮）。
   - 上一条任务执行完毕后，后端在 `280ms` 内自动按顺序将队列中的下一条指令推入桌面端执行。
3. **0-RTT 秒开 + 1.2KB 单轮增量流 + AES-256-GCM 端到端加密**
   - 首屏 HTML 直接内嵌 AES-256-GCM 加密的初始状态（0-RTT 秒开，省去多次握手请求）。
   - 采用 `280ms` 级 SSE 增量流推送（`deltaOnly: true`，单次传输仅约 `1.2KB`）与前端 `requestAnimationFrame` 帧级合并渲染，彻底杜绝未渲染纯文本闪烁与重复气泡输出。
4. **微信扫码无缝跳手机浏览器 + 跨网免配置直连**
   - **Cloudflare High-Speed Edge 公网隧道**：自带后台常驻守护进程，无需公网 IP 即可在手机 5G 网络下直接扫码连接；支持从微信内直接点击“在默认浏览器中打开”而无需手输安全 Token。
   - **内置 Tailscale 组件集成**：自动检测并支持静默安装宿主机 Tailscale（动态读取每台电脑各自的 Tailscale 虚拟 IP，不同用户完全隔离、绝不互通或泄密）。
5. **左下角极简 380px 扫码入口**
   - 在 Antigravity 客户端左下角设置齿轮旁注入绿色小手机按钮，点击即弹出极简二维码卡片，一键扫码或复制链接。

---

## 🚀 快速安装

### 方式一：Windows 双击一键安装（推荐）
解压安装包后，直接双击运行目录中的 **`install.bat`** 即可自动完成安装、启动后台边车服务并在客户端左下角挂载绿色小手机图标。

### 方式二：PowerShell 命令行安装
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

### 方式三：让你的 Antigravity AI 助手自动安装
将以下提示词发送给你的 Antigravity AI 助手：
> 请帮我安装位于当前目录下的 `agy-remote` 插件：阅读其中的 `docs/INSTALL_AGENT.md`，执行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./install.ps1`，并确认 `~/.gemini/antigravity/plugin_data/agy-remote/runtime.json` 已生成且客户端左下角已注入绿色小手机扫码按钮。

---

## 🔒 安全性与隐私保障

- **零个人隐私打包**：本仓库及分享安装包中不包含任何机器名、个人 IP、静态 Token 或会话历史（已通过 Codex 安全与隐私全量审计，`PRIVACY_LEAK_COUNT = 0`）。
- **每机独立密钥与会话隔离**：每台电脑首次启动时在本地 `~/.gemini/antigravity/plugin_data/agy-remote/` 中自动使用 `crypto.randomBytes(24)` 生成独立的 192-bit 安全 Token，并使用 PBKDF2 + AES-256-GCM 加密实时传输内容。

---

## 📂 目录结构

- `sidecars/remote/main.mjs` — 核心边车服务（HTTP/SSE 服务、AES-256-GCM 加密、有序消息队列 `convoQueues`、增量状态聚合）
- `lib/web-ui.mjs` — 手机/网页端 1:1 原生 Antigravity 暗黑 UI 与增量 DOM 渲染引擎
- `lib/bridge.mjs` — 桌面端 CDP 桥接层（Redux 状态读取、转录日志解析、快照与 Git Diff 回滚、并行多窗口通信）
- `lib/sidebar-inject.mjs` — 桌面客户端左下角绿色小手机图标与 380px 极简二维码弹窗注入脚本
- `lib/tunnel.mjs` — Cloudflare High-Speed Edge 常驻公网隧道守护与 Serveo 443 自动兜底
- `lib/tailscale.mjs` — 宿主机 Tailscale 状态动态探测、自动静默部署与 Funnel 管理
- `CHANGELOG.md` — `v2.1.0` 至 `v2.6.0` 完整中文版本迭代记录
- `docs/INSTALL_AGENT.md` — AI 智能体自动化安装与排障指南
