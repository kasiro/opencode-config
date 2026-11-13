[CRITICAL] ═══════════════════════════════════════════════
# Глобальные инструкции для агентов — CRITICAL ZONE
# Эти правила НИКОГДА не должны быть забыты.
═══════════════════════════════════════════════════════════

[LANGUAGE] ═══════════════════════════════════════════════
# Язык — CRITICAL ZONE
═══════════════════════════════════════════════════════════

## Русский язык
- **ВСЕГДА думай, рассуждай и отвечай только на русском языке.**
- Английский допускается ТОЛЬКО в:
  - коде и именах переменных
  - CLI-командах и их выводах
  - технических терминах без русского аналога (например, "MCP", "JSON", "API")
  - прямых цитатах из английских источников
- Внутренние размышления (Chain of Thought, планирование) — ТОЛЬКО на русском.


## 🛡️ SAFETY (критично — забудется = проблемы)
- **НИКОГДА** git push / deploy / commit без явного «делай» от сэра
- **Никогда не удалять `~/.opencode/`** — там лежит бинарный файл `opencode` (bin/opencode). Удаление ломает установку OpenCode полностью.
- **Никогда не удалять `~/.config/opencode/`** — основная конфигурация OpenCode.
- **Никогда не удалять `~/.agents/`** — установленные скиллы и реестр.
- **Система**: NixOS — использовать `nix-shell -p <пакет>` или configuration.nix для установки ПО.

---

## 🚫 НЕДОСТУПНЫЕ ИНСТРУМЕНТЫ (permissions deny/ask)

### Полностью недоступны (deny)
Следующие инструменты **заблокированы** в `opencode.json` — любые попытки вызова будут отклонены:

| Инструмент | Resource | Причина |
|------------|----------|---------|
| `glob` | `glob` | Медленный, есть `fd` через bash |
| `grep` | `grep` | Медленный, есть `rg` через bash |
| `websearch` | `websearch.use` | Мёртв (DDG CAPTCHA, Google 429) |
| `webfetch` | `webfetch.use` | Заменён на MCP `lightpanda` |

### Заблокированы в bash (pattern match)
Любое упоминание в команде блокирует **всю команду**, даже если текст в ссылке/аргументе:

| Паттерн | Пример блокировки | Альтернатива |
|---------|-------------------|--------------|
| `*find*` | `find /path` ❌<br>`https://example.com/find-me` ❌ | `fd 'pattern'` через bash |
| `*grep*` | `grep 'text'` ❌<br>`https://grep.dev/api` ❌ | `rg 'pattern'` через bash |
| `*npm*` | `npm install` ❌<br>`https://npmjs.com/package` ❌ | `bun add` / `bun install` |
| `*npx*` | `npx create-app` ❌ | `bunx` через bash |

**ВАЖНО:** Фильтр bash работает по **полному совпадению паттерна**. Даже если `grep` в URL — команда будет отклонена. Перед вызовом bash проверяй команду на запрещённые паттерны.

### Требуют подтверждения (ask)
| Паттерн | Пример | Действие |
|---------|--------|----------|
| `*sqlite*` | `sqlite3 opencode.db` | Спросить сэра перед выполнением |
| `*opencode*` | `opencode session list` | Спросить сэра перед выполнением |

---

## ✅ ДОСТУПНЫЕ ИНСТРУМЕНТЫ

### Встроенные (вызывать напрямую)
- `read`, `edit`, `bash` (с ограничениями выше)
- `memory_set`, `memory_replace`, `memory_list`
- `subagent`, `skill`, `compress`
- `sequentialthinking`

### MCP (через `execute`)
- `tools.lightpanda.fetch`, `tools.lightpanda.markdown`, `tools.lightpanda.goto`
- `tools.deepwiki.read_wiki_structure`, `tools.deepwiki.ask_question`
- `tools.context7["query-docs"]`
- `tools.deploychan.get_skill`, `tools.deploychan.search_knowledge`

---

## 🔒 Execute (Code Mode) — доступные инструменты

### Доступно в execute
Только следующие инструменты можно вызывать внутри `execute(code: string)`:

**MCP инструменты:**
- `tools.lightpanda.*` (fetch, markdown, goto, extract, tree, nodeDetails, findElement, click, fill, etc.)
- `tools.deepwiki.*` (read_wiki_structure, read_wiki_contents, ask_question)
- `tools.context7.*` (query-docs, resolve-library-id)
- `tools.deploychan.*` (get_skill, search_knowledge, list_skills, list_recommended)

**Встроенные:**
- `tools.memory_get`, `tools.memory_list`, `tools.memory_replace`, `tools.memory_set`
- `tools.opencode.*` (models, session_move, worktree_*, artifact_*, schedule_*)
- `tools["sequential-thinking"].sequentialthinking`

### НЕ доступно в execute
Следующие инструменты **НЕЛЬЗЯ** вызывать внутри execute:

- `tools.read`, `tools.edit`, `tools.bash` — использовать напрямую (не через execute)
- `tools.glob`, `tools.grep` — заблокированы permissions
- `tools.websearch`, `tools.webfetch` — заблокированы permissions
- `tools.subagent`, `tools.skill`, `tools.compress` — использовать напрямую
- Любые другие инструменты не из списка "Доступно" выше

**ВАЖНО:** execute предназначен ТОЛЬКО для MCP инструментов и ограниченного набора встроенных. Все остальные инструменты вызываются НАПРЯМУЮ (не через execute).


