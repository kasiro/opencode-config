# phase0-guard — Static Pre-flight Plugin

## Назначение

Механический барьер на уровне **до LLM**. Запрещённые инструменты не попадают к модели — агент их не видит, не вызывает, не тратит шаг.

## Как это работает

```
opencode.json → OpenCode → client.app.agents() → phase0-guard → config hook → модифицированный конфиг → LLM
```

1. При старте OpenCode плагин вызывает `client.app.agents()` (официальный HTTP API)
2. Получает deny-правила для каждого агента (из permission и tools)
3. В `config` хуке модифицирует `cfg.agent[name].tools`, устанавливая `false` для запрещённых инструментов
4. OpenCode сам не включает эти инструменты в запрос к LLM для данного агента
5. Агент не видит инструмент → не вызывает → не тратит шаг

## Источник данных

- **`client.app.agents()`** — официальное OpenCode API (GET /api/agent). Не читает opencode.json напрямую.
- Данные кэшируются на 30 секунд, обновляются в фоне.
- При ошибке API плагин работает в degraded mode (без блокировок).

## Какие deny-правила применяются

Из `agent.permission`:
- `edit: "deny"` → `cfg.agent[name].tools.edit = false`
- `bash: { "*": "ask" }` → (ask не блокируется, только deny)
- `bash: { "rm *": "deny" }` → `cfg.agent[name].tools.bash = false` (только точное имя)

Из `agent.tools`:
- `{ "edit": false }` → уже есть в конфиге, плагин дублирует

**Важно:** плагин конвертирует deny-правила из permission в tools. Tools с `false` — единственный способ убрать инструмент до LLM механически.

## Что НЕ делает

- Не блокирует runtime (нет tool.execute.before)
- Не отслеживает сессии (нет SQLite, event hooks)
- Не управляет состоянием Phase 0 / Checkpoint
- Не добавляет кастомных инструментов (phase0_complete, checkpoint_done)
- Не обрабатывает wildcard-паттерны (`searxng_*`) — только точные имена инструментов

Wildcard-паттерны и MCP-инструменты с префиксами требуют runtime-проверки (планируется).

## Для кого работает

Для **всех агентов**, включая сабагентов:
- primary (jarvis)
- subagent (general, explore и др.)

Плагин загружается один раз на InstanceState. config хук модифицирует конфиг для всех агентов.

## Логи

Ошибки и события через `client.app.log`.
- `service: "phase0-guard"`
- `level: "error"` — ошибка загрузки deny-правил
- `level: "info"` — успешная загрузка / применение

## Файлы

- `~/.config/opencode/plugins/phase0-guard.ts` — плагин (101 строка)
- `~/.config/opencode/plugins/phase0-guard.README.md` — этот файл

## Зависимости

- `@opencode-ai/plugin` — V1 Plugin API
- `client.app.agents()` — OpenCode API

Никаких SQLite, Bun.file, homedir, tool.execute.before, event hooks.
