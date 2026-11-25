# AI 智能体自动安装指南 (AGY Remote `v2.6.0`)

当用户要求你（Antigravity AI 助手）安装或更新 **AGY Remote** 插件时，请严格按以下步骤自动执行：

---

## 第一步：执行一键安装脚本

- **Windows 系统（推荐）**：
  使用命令行工具执行：
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<解压目录路径>\install.ps1"
  ```
- **macOS / Linux 系统**：
  ```bash
  bash "<解压目录路径>/install.sh"
  ```

> **说明**：安装脚本会自动将插件文件同步至 `~/.gemini/config/plugins/agy-remote`，启动常驻后台边车服务（监听 `127.0.0.1:18899`），通过本地 CDP 接口在 Antigravity 客户端左下角（设置齿轮旁）注入绿色小手机扫码按钮，并在 Windows 宿主机未安装 Tailscale 时后台静默配置 Tailscale 组件。

---

## 第二步：校验运行状态

安装命令执行完成后，请读取 `~/.gemini/antigravity/plugin_data/agy-remote/runtime.json` 文件，确认以下字段均已正常就绪：
1. `"version"` 为 `"2.6.0"`
2. `"port"` 为 `18899` 且进程 `"pid"` 正在运行
3. `"primaryUrl"`（或 `"publicUrl"` / `"lanUrl"`）已生成包含 `?sid=...&hash=...` 的完整免密直连地址

---

## 第三步：向用户汇报安装结果

确认 `runtime.json` 正常后，请用简明中文告知用户：
1. **客户端左下角入口**：可以直接点击 Antigravity 左下角设置齿轮旁的**绿色小手机图标**，打开极简二维码卡片，用手机微信或系统相机扫码即可远程控制。
2. **微信转浏览器免输 Token**：微信扫码后如需点击右上角“在默认浏览器中打开”，可直接无缝跳转，无需手动输入安全 Token。
3. **支持多条消息连续排队输入**：在手机端 AI 回答期间，可随时连续输入并发送多条后续指令进入队列，系统将在上一条任务完成后自动按序执行。
