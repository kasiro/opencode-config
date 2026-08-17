---
description: Codebase architecture, conventions, rules, and gotchas
label: project
limit: 5000
read_only: false
---
## ses CLI (session-search)
- [2026-08-17] ses search/fts: добавлен флаг --session-id <ID> (поиск только в конкретной сессии; FTS: AND fts.session_id = ?; LIKE-fallback: AND s.id = ?)
- [2026-08-17] ses current [--method {auto|activity|process}] [--json]: auto=process→фолбэк activity. process: /proc/self/cmdline → part running-записи (60с) → подстрока → ближайший time.start к starttime. activity: OPENCODE_SESSION_ID → последняя по time_updated. В выводе/JSON поле method.
- [2026-08-17] Бонус-фикс: snippet() не работает с GROUP BY в SQLite 3.53.4 → заменено на make_snippet() в Python.
- [2026-08-17] Архитектура: сабагенты НЕ отдельные процессы — выполняются внутри главного opencode (SessionRunCoordinator). Session ID не передаётся в env/cmdline/файлы. Надёжное определение сессии процесса: /proc/self/cmdline → part WHERE type='tool' AND tool='bash' AND state.status='running' AND time.start>now-60s → подстрока cmdline в state.input.command → фолбэк ближайший time.start к starttime процесса (0.78с на БД 1.6ГБ). Ограничение: работает только из выполняющейся команды.

## Rules (must follow)
- [2026-07-14] before deleting any data — show full content to sir and get confirmation
- [2026-07-22] CYCLE 1 (STOP→RECALL→ORIENT→ACT→VERIFY→SAVE) on EVERY message. Mechanical, no exceptions.
- [2026-08-09] Память = memory blocks (memory_set/memory_replace/memory_list): блоки persona/human/project/knowledge/lessons, scopes global/project. checkpoint.md и Memory MCP больше не используются.

## Architecture decisions
- [2026-08-09] rust-hashcat: флаги --force-cpu/--force-gpu (enum ForcePath в cli.rs, Auto/Cpu/Gpu). --force-cpu: GPU не инициализируется вовсе. --force-gpu: ошибка если атака не -a 3, маска >55 или целей >64, GPU недоступен. README обновлён, 66 тестов зелёные.
- [2026-08-09] Память переведена на memory blocks: global (кросс-проектно) + project (по проектам); блоки lessons/knowledge/project/human/persona. J.A.R.V.I.S. пишет в память напрямую (memory_set/memory_replace) — делегирование касается только файлов.
- [2026-07-22] Phase 0 guard for CYCLE 1 — execute mechanically, no self-discipline

## Gotchas
- Read tool output is NOT shown to user — print in text response
- Read tool 2000 char line limit — use jq/python3 for minified JSON
- Invalid tool call: check allowed-tools before invoking
- 100% packet loss on ping ≠ no internet
- Lesson ≠ action. Logging an error doesn't fix it.

## Regional constraints
- [2026-07-29] Western hosting (Oracle Cloud, Fly.io, Render, Hetzner, GitHub Codespaces) — payment unavailable from Russian cards. Alternatives: Selectel, Beget, Timeweb (from 300₽/mo), Oracle Cloud Free Tier (if card from friendly country).

## dsh (deepseek-harness)
- [2026-08-17] dsh 0.1.0-rc.6 (bun, ~/.bun/bin/dsh). TUI НЕТ (только web/headless; web = алиас на автоинициализируемый профиль). UA зашит в APP_IDENTITY пакета dsh-llm (lib/index.js + lib/types/attribution.js) → заменён на opencode/1.18.18 (Zen API отдаёт 429 для чужих UA; headers провайдера фильтруются, user-agent зарезервирован). Правка слетит при bun update. Провайдер Zen: llm-pi-ai.providers.opencode, apiKeyEnv OPENCODE_API_KEY, baseURL opencode.ai/zen/v1 (встроенный каталог pi-ai).
