import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const targetDir = join(homedir(), '.gemini', 'config', 'plugins', 'agy-remote');
const dataDir = join(homedir(), '.gemini', 'antigravity', 'plugin_data', 'agy-remote');

try {
  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
  if (!process.argv.includes('--keep-settings') && existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  console.log('✅ 已卸载 AGY Remote 插件。');
} catch (err) {
  console.error('卸载失败: ' + err.message);
  process.exitCode = 1;
}
