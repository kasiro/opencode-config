---
name: opencode-healthcheck
description: |-
  Диагностика и проверка всех MCP серверов и плагинов OpenCode.
  Использовать при: подозрении что что-то не работает, после обновления конфига,
  после установки новых MCP/плагинов, при старте сессии.

  Проверяет:
  - MCP: agentmemory (health + recall), exa (поиск), obsidian (чтение), 
    deepwiki (структура), sequential-thinking, context7 (resolve)
  - Плагины: goal-plugin, intellisearch, DCP, ELF (БД + записи), autolearn (проверка)
  - Систему: port listening, process alive, journalctl errors

  Примеры:
  - user: "проверь всё" → последовательный healthcheck всех MCP и плагинов
  - user: "всё сломалось" → быстрая диагностика agentmemory + ELF + systemd
  - user: "проверь MCP" → только MCP серверы
  - user: "что с плагинами?" → только плагины
  - user: "healthcheck" → полный прогон
---
# opencode-healthcheck

## Общий протокол

Всегда на старте: `skill("opencode-healthcheck")` не загружается сам — только по явному запросу сэра.

Порядок прогона:
1. System-level (systemd, процессы, порты)
2. MCP серверы (по списку из opencode.json)
3. Плагины (по списку из opencode.json)
4. ELF (БД, learnings, авто-обучение)
5. Итоговый отчёт

---

## 1. System-level

```bash
# Проверить процессы MCP (agentmemory)
ps aux | python3 -c "import sys; [print(l.strip()) for l in sys.stdin if 'agentmemory' in l or 'iii' in l]"

# Проверить порты
ss -tlnp | python3 -c "import sys; [print(l.strip()) for l in sys.stdin if '311' in l or '321' in l]"

# Проверить systemd сервисы
systemctl --user status agentmemory 2>&1 | head -8
doas systemctl status agentmemory-whitepeach 2>&1 | head -8
```



### MCP Process Check (all servers)

Before testing any MCP API, check if the server process is actually running.
MCP servers are external daemons — session restart does NOT restart them.
If an MCP tool fails persistently across session restarts, the server process
is likely stuck or crashed.

```bash
# Scan for ALL configured MCP servers from opencode.json
python3 -c "
import json
with open('$HOME/.config/opencode/opencode.json') as f:
    cfg = json.load(f)
mcps = list(cfg.get('mcpServers', {}).keys())
print('Configured MCP servers:', ', '.join(mcps))
"

# Find running MCP-related processes
ps aux | python3 -c "
import sys
for l in sys.stdin:
    for kw in ['bunx', 'uvx', 'agentmemory', 'mcp-server']:
        if kw in l:
            print(l.strip())
            break
"
```

For MCP servers exposed via Unix socket, test responsiveness directly:

```bash
# Direct MCP ping (replace socket path as needed)
echo '{"jsonrpc":"2.0","method":"ping","id":1}' | nc -U /tmp/mcp-server.sock 2>/dev/null || echo "Socket not found"
```

---

## 2. MCP Healthchecks

### agentmemory
```bash
# REST API health
curl -s --connect-timeout 3 http://127.0.0.1:3111/health 2>/dev/null

# MCP tool test — recall
agentmemory_memory_recall(query="healthcheck test", limit=1, format="compact")

# Проверка standalone.json размер
ls -la ~/.agentmemory/standalone.json
```

### exa
```bash
exa_web_search_exa(query="healthcheck test ping", numResults=1)
```

### obsidian
```bash
obsidian_get_vault_stats(recentCount=1)
```

### deepwiki
```bash
deepwiki_read_wiki_structure(repoName="facebook/react")
```

### context7
```bash
context7_resolve-library-id(libraryName="React", query="hooks")
```

### sequential-thinking
```bash
sequential-thinking(thought="healthcheck test", nextThoughtNeeded=false, thoughtNumber=1, totalThoughts=1)
```

---

## 3. Plugin Healthchecks

### ELF
```bash
# БД существует?
test -f ~/.opencode/elf/memory.db && echo "ELF DB: OK" || echo "ELF DB: MISSING"

# Размер БД
ls -la ~/.opencode/elf/memory.db

# Есть ли learnings? (SQLite check)
python3 -c "
import sqlite3
conn = sqlite3.connect('$HOME/.opencode/elf/memory.db')
cur = conn.execute('SELECT category, COUNT(*) FROM learnings GROUP BY category')
rows = cur.fetchall()
print(f'Learnings: {sum(r[1] for r in rows)} total')
for r in rows: print(f'  {r[0]}: {r[1]}')
cur = conn.execute('SELECT COUNT(*) FROM golden_rules')
print(f'Golden rules: {cur.fetchone()[0]}')
conn.close()
"
```

### Autolearn

```bash
# Plugin file exists?
test -f ~/.config/opencode/plugins/autolearn.js && echo "autolearn.js: OK" || echo "autolearn.js: MISSING"

# Store exists with memory?
test -f ~/.autolearn/memory.md && echo "memory.md: OK" || echo "memory.md: MISSING"

# Agent configured?
grep -q autolearn-reviewer ~/.config/opencode/opencode.json && echo "agent: OK" || echo "agent: MISSING"

# CLI работает?
uv run ~/.agents/skills/autolearn-reviewer/scripts/autolearn.py memory list

# Есть ли observations?
wc -l ~/.autolearn/observations.jsonl 2>/dev/null || echo "no observations yet"

# Проверка логов на ошибки плагина
journalctl --user -u opencode* --no-pager -n 20 2>/dev/null | grep -i "autolearn" || echo "No autolearn entries in logs (normal if no errors)"
```

Примечания:
- Локальные .js плагины (с путём `./plugins/...`) НЕ отображаются в `plugin-meta.json` — это нормально
- Observations.jsonl пуст сразу после старта — заполняется при событиях (user_message, tool_call, session_end)
- По умолчанию первое ревью после 10 сообщений ассистента (review_threshold: 10)
- При рестарте сессии: проверять ERROR логи OpenCode — если их нет, плагин загружен
### DCP
```bash
# DCP плагин загружен? Проверить по логам
journalctl --user -u opencode* --no-pager -n 5 2>/dev/null | python3 -c "import sys; d=sys.stdin.read(); print('DCP found:', 'dcp' in d.lower() or 'tarquinen' in d)"
```

### Goal-plugin
```bash
# Проверить есть ли /goal команда
# (через тестовый вызов get_goal)
get_goal
```

### intellisearch
```bash
# Проверить что инструменты доступны
# (через пробный вызов)
```

---

## 4. Multi-user check (если whitepeach)

```bash
# whitepeach agentmemory
curl -s --connect-timeout 3 http://127.0.0.1:3211/health 2>/dev/null
doas systemctl status agentmemory-whitepeach 2>&1 | head -5
doas ls -la /home/whitepeach/.agentmemory/standalone.json 2>/dev/null

# whitepeach ELF (если есть)
doas test -f /home/whitepeach/.opencode/elf/memory.db && echo "WP ELF DB: OK" || echo "WP ELF DB: no"
```

---

## 5. Итоговый отчёт

Формат:
```
┌─ Healthcheck ───────────────────────
│  systemd:  kasiro ✓ | whitepeach ✓
│  ports:    3111 ✓ 3112 ✓ 3211 ✓ 3212 ✓
│  agentmemory:  kasiro ✓ | whitepeach ✓
│  exa:     ✓
│  obsidian: ✓
│  deepwiki: ✓
│  context7: ✓
│  sequential-thinking: ✓
│  ELF DB:  золотые правила ✓ learnings: N
│  DCP:     загружен
│  goal-plugin: работает
└─────────────────────────────────────
```
