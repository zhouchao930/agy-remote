# 版本迭代记录 (CHANGELOG) — AGY Remote (`agy-remote`)

本文档完整记录了 **AGY Remote** 从 `v2.1.0` 到 `v2.7.0` 的架构演进、手机端性能优化、安全性与隐私审计以及核心问题修复历程。

---

## [v2.7.0] — 2026-11-25
### 新增功能
- **多 SSH 远程服务器专属独立链接 (`?ssh=<host>`)**：
  - 自动解析本机 `~/.ssh/config` 中配置的全部业务服务器（如 `58.61.156.10`、`192.168.1.36`）以及 `本机 (local)`，并为每个 SSH Host 生成专属独立远程链接（`&ssh=<host>`）和专属二维码。
  - **左下角扫码弹窗支持一键切换 SSH Host 二维码**：在客户端左下角 380px 扫码弹窗中新增 SSH 主机切换胶囊栏（`🌐 全部` / `💻 本机` / `🖥️ <SSH主机>`），点击对应主机即刻切换二维码与复制链接。
  - **会话自动归类与按链接隔离展示**：通过快速扫描会话转录日志与工作区 URI，自动识别每条历史会话所属的 SSH 服务器及远程工作目录；打开某个 SSH 主机的专属链接（如 `?ssh=58.61.156.10`）时，手机端仅展示归属于该主机的对话，顶部固定显示 `🖥️ SSH: <host>` 专属徽章。
  - **在专属链接下新建会话自动绑定并连接目标 SSH 服务器**：在 `?ssh=<host>` 专属链接下点击“新建会话”并发送指令时，后端自动将该新会话持久化绑定至该 SSH Host，并自动注入目标 SSH 服务器上下文（如 `ssh user@host`），无需在手机上重复手打 `ssh` 连接命令。

---

## [v2.6.0] — 2026-11-25
### 新增功能
- **多消息连续输入队列 (`convoQueues`)**：
  - 在 `lib/web-ui.mjs` 中将手机端/网页端的**停止按钮 (`⏹`)** 与**发送按钮 (`↑`)** 彻底分离。
  - 即使 AI 正在思考或执行工具，用户也可以像在桌面版 Antigravity 客户端一样，在手机输入框连续输入并发送多条指令进入排队队列。
  - 在 `sidecars/remote/main.mjs` 中新增会话级有序队列 `convoQueues`：当上一轮任务仍在执行时，`POST /api/chat/send` 自动将新消息标记为 `queued`（排队中）；后台调度器 `processConversationQueues()` 会在上一轮结束后的 `280ms` 内自动按序将队列中的下一条指令推入桌面端执行；支持通过 `POST /api/chat/queue-cancel` 随时取消排队中的消息。
  - 手机聊天流底部实时展示排队状态条（`⏳ 队列中 (等待上一条执行完成后自动发送)` + `✕ 取消` 按钮）。

### 问题修复
- **彻底解决“过去已输出内容在屏幕底部重复渲染一次”的 Bug**：
  - 修复了 `lib/bridge.mjs` 在扫描桌面端内存 `agentState.turns` 时，将分片边界外缺失的步骤（`!st`）或系统后台消息（`<SYSTEM_MESSAGE>`）误判为新的 `userInput` 轮次起点（导致 `memTurnStart > diskLastStart` 误触发），从而在已完成轮次下方又追加一遍重复气泡的问题。
  - 在 `lib/web-ui.mjs` 中加入严格的 **DOM 轮次对账（Reconciliation）与同文本自动去重机制**：一旦磁盘真实轮次（`turn-<step_index>`）落盘生成，立即销毁临时乐观占位节点（`turn-pending-*` / `turn-q-*`），确保每个问答轮次在屏幕上唯一显示。

---

## [v2.5.1] — 2026-11-25
### 问题修复与性能优化
- **消除发送消息后短暂闪现“未渲染原始文字”的问题**：
  - 移除了 `lib/bridge.mjs` 中旧版通过 `document.querySelectorAll('[data-markdown-root]')` 抓取 `.innerText` 的兜底逻辑（该逻辑在首轮结构化步骤尚未生成的前几秒会把不带格式的 DOM 纯文本直接刷到屏幕上）。
  - 在 `cleanUserPrompt` 中过滤掉 `<SYSTEM_MESSAGE>` 和 `<ADDITIONAL_METADATA>` 标签，并在 `getConversationMessages` 中跳过非用户发起的系统通知步骤。
- **单轮增量传输协议 (`deltaOnly: true`)**：
  - 将手机端高频轮询与 SSE 推送的数据包从全量历史（约 `85KB`）瘦身为仅包含最后活跃轮次的增量包（`deltaTurns` + `allTurnIds`，仅约 `1.2KB`），大幅降低手机 5G 网络下的解析耗时。
- **跨更新/重启复用 Cloudflare 持久隧道 (`tunnel-session.json`)**：
  - 将独立后台进程 `cloudflared.exe` 的会话信息（`pid`、`url`、`port`）持久化到 `plugin_data/agy-remote/tunnel-session.json`。插件热更新或重启时直接毫秒级复用已有公网隧道，无需重新等待 8~15 秒的公网 DNS 注册。

---

## [v2.4.0] — 2026-11-25
### 新增功能与架构提速
- **0-RTT 首屏加密数据直出与 280ms 级 SSE 实时帧推送**：
  - 在首次请求 `/remote/v4` 返回 HTML 时，直接将 AES-256-GCM 加密后的首屏状态注入到 `window.__AGY_INITIAL_STATE__`，省去首屏加载后的 3 次串行网络往返（0-RTT 秒开）。
  - 升级 `/api/events` SSE 通道，当检测到 AI 正在输出时，以 `280ms` 间隔主动推送加密后的 `event: state` 增量帧。
- **CDP 目标缓存与全窗口并行查询**：
  - 在 `lib/bridge.mjs` 中为 `findAllHubCdpTargets()` 增加 3 秒热缓存，并将 `evaluateInAllHubs` 从串行 `for...of` 改为 `Promise.all` 并行执行。
- **手机端 `requestAnimationFrame` 帧级合并渲染**：
  - 在 `lib/web-ui.mjs` 中引入内容指纹比对（`lastRenderHash`）与 `requestAnimationFrame` 合并渲染，配合发送瞬间的前端乐观预渲染（Optimistic UI），实现点击发送即刻上屏。

---

## [v2.3.1] — 2026-11-25
### 问题修复
- **微信扫码一键跳转手机系统浏览器免输 Token**：
  - 保留 URL 地址栏中的 `?sid=...&hash=...` 签名参数（不再用 `history.replaceState` 抹除），并在 `sidecars/remote/main.mjs` 的 `checkAuth()` 中支持校验 `sid`（`d_<hash>`）签名。微信扫码后点击右上角“在默认浏览器中打开”可直接免密进入，不再弹窗要求手输安全 Token。
- **Windows 双击一键安装器 (`install.bat` & `uninstall.bat`)**：
  - 新增批处理启动器，自动携带 `-NoProfile -ExecutionPolicy Bypass` 调用 PowerShell，完美绕过 Windows 默认禁止直接运行 `.ps1` 脚本的策略限制。

---

## [v2.3.0] — 2026-11-25
### 优化与安全加固
- **左下角极简 380px 扫码弹窗 (`lib/sidebar-inject.mjs`)**：
  - 彻底移除弹窗中无法点击的虚拟渠道卡片（微信/飞书/Lark/Telegram 占位按钮）以及多余的局域网切换按钮，仅保留最核心的二维码、公网/Tailscale 状态标签与一键复制链接按钮。
  - 引入全局单例观察者 `globalThis.__agyRemoteObs`，彻底解决多次热注入导致左下角出现多个重复绿色小手机图标的问题。
- **Codex 安全性与隐私全量审查通过 (`PRIVACY_LEAK_COUNT = 0`)**：
  - 确保源码与分享安装包中**零个人隐私信息**（不包含任何机器名、个人 Tailscale IP、静态 Token 或会话历史）；所有运行期密钥与隧道状态均在安装者本机的 `~/.gemini/antigravity/plugin_data/agy-remote/` 中动态生成。
  - 启用 `crypto.timingSafeEqual` 防时序攻击 Token 校验、`HttpOnly; SameSite=Lax` 会话 Cookie、严格 CSP 响应头以及 AES-256-GCM 端到端载荷加密。

---

## [v2.1.0 – v2.2.0] — 2026-11-24
### 核心架构发布
- **1:1 复刻 Antigravity 原生暗黑 UI + ZCode 极速内核 (`lib/web-ui.mjs`)**：
  - 完整复刻桌面端 `#0e0f12` / `#131418` 原生暗黑配色、左侧扁平会话列表 + 按工作区分组视图、顶部 `Steps` 步骤进度卡片、可折叠 `Thought` 思考过程与工具调用胶囊、真实文件 Diff 抽屉（支持 `↩ 撤销修改` 一键回滚）以及桌面端 Redux 真实模型列表同步切换。
- **内嵌 Tailscale 组件 + Cloudflare High-Speed Edge 公网隧道 (`lib/tailscale.mjs`, `lib/tunnel.mjs`)**：
  - 彻底移除不稳定的 Pinggy 隧道。
  - 支持在宿主机自动检测与静默部署 Tailscale 组件（动态读取安装者本机的 `tailscale status --json` 虚拟网卡地址），并配备守护进程级 `cloudflared.exe` 高速边缘公网隧道与 Serveo 443 端口自动兜底。
