---
applyTo: '.progress/**'
---
# DevFlow .progress/ 目录守卫

⛔ R1: `INBOX.md` 的 `当前系统模式` 字段 — **仅人类可改**，AI 严禁自行切换模式
⛔ R2: `PROGRESS_STATUS.json` — AI 可更新 `current_mode`，但 INBOX 是唯一权威来源
⛔ R3: **子 Agent 禁止写入 `.progress/`**（只有主 Agent 可更新状态文件）
✅ 读取 `.progress/` 文件以理解上下文是允许的
⚠️ 修改 `AI_INSTRUCTIONS.md` / `00-START-HERE.md` / `scripts/standby.sh` 后必须同步到 `templates/` 目录
