---
name: dream
description: |-
  Dream memory consolidation for OpenCode — inspects SQLite trajectory database (opencode.db),
  analyzes patterns and decisions, writes findings into MEMORY.md files.
  Uses bash for read-only SQLite inspection plus memory_search/read/edit for memory operations.
  7-phase process (MiMo-Code inspired): LOCATE → ORIENT → GATHER → VERIFY → CONSOLIDATE → PRUNE → REPORT.
  Output: structured MEMORY.md sections written directly to project's memory file.
  
  Use proactively when user asks to: run dream consolidation, consolidate memory,
  process trajectories, run memory pass, analyze sessions, find patterns in history,
  or at session close.
  
  Examples:
  - user: "run dream consolidation" → full 7-phase dream cycle
  - user: "consolidate memory" → full dream pass
  - user: "process my trajectories" → LOCATE + ORIENT + GATHER phases
  - user: "what patterns do you see" → ANALYZE phase only
  - user: "close session" → CYCLE 3 END → dream pass
---
# Dream — Memory Consolidation Pass (MiMo-Code Inspired)

Консолидация памяти через анализ траекторий OpenCode.
Пишет результат в MEMORY.md файлы в ~/.local/share/opencode/memory/.

## Архитектура (MiMo-Code)

```
┌───────────────────────────────────────────────────────────────────────┐
│                         DREAM CYCLE (7 фаз)                           │
├────────┬────────┬────────┬──────────┬──────────────┬───────┬─────────┤
│ LOCATE │ ORIENT │ GATHER │ VERIFY   │ CONSOLIDATE  │ PRUNE │ REPORT  │
│ БД+файл│текущий │ из     │ через    │ запись в     │удалить│ сэру    │
│ ы      │MEMORY  │memory  │ SQLite   │ MEMORY.md    │старое │         │
│        │.md     │файлов  │ запросы  │              │       │         │
├────────┴────────┴────────┴──────────┴──────────────┴───────┴─────────┤
│  Инструменты: bash (SQLite) + dream_inspect.sh + dream_consolidate.py │
│  + memory_search (MCP) + edit (через делегирование)                   │
└───────────────────────────────────────────────────────────────────────┘
```

## Проектный хэш

Хэш проекта вычисляется как SHA256(абсолютный путь)[:12]:
```bash
PROJECT_HASH=$(echo -n "$(pwd)" | sha256sum | cut -c1-12)
MEMORY_FILE="$HOME/.local/share/opencode/memory/projects/$PROJECT_HASH/MEMORY.md"
```

## Фазы

### Фаза 0: LOCATE — Поиск данных (MiMo-Code: Phase 0 - Locate Data)

**Цель:** Определить пути к opencode.db и MEMORY.md файлам.

**Действия:**
1. Проверить opencode.db:
```bash
ls -la ~/.local/share/opencode/opencode.db
```
2. Прочитать текущий MEMORY.md через memory_search или read
3. Если память пуста и БД не содержит сессий — сообщить "Nothing to consolidate" и остановиться

**Проверка возраста проекта (MiMo-Code):**
Если проект слишком молод (< 7 дней с первой сессии) — пропустить консолидацию:
```
task(subagent_type="memory-agent", prompt="Выполни SQLite запрос: SELECT min(datetime(time_created/1000,'unixepoch')) as first_session FROM session WHERE agent IS NOT NULL AND agent != '' и верни результат. Если первая сессия была менее 7 дней назад — скажи 'too young'.")
```
Если проект моложе 7 дней — сообщить "Сэр, проект слишком молод для консолидации (менее 7 дней)" и остановиться.

### Фаза 1: ORIENT — Ориентация (MiMo-Code: Phase 1 - Orient)

**Цель:** Понять текущее состояние памяти и последние сессии.

**Действия:**
1. Прочитать текущий MEMORY.md (через read или memory_search)
2. Запустить dream_inspect.sh для обзора:
```
task(subagent_type="memory-agent", prompt="Запусти bash ~/.config/opencode/skills/dream/scripts/dream_inspect.sh --sessions 10 и верни полный вывод")
```
3. Записать структуру секций MEMORY.md перед редактированием (чтобы избежать дубликатов)

### Фаза 2: GATHER — Сбор кандидатов (MiMo-Code: Phase 2 - Gather From Memory Files)

**Цель:** Извлечь потенциальные durable факты из траекторий.

**Действия:**
1. Делегировать general запуск dream_consolidate.py:
```
task(subagent_type="memory-agent", prompt="Запусти python3 ~/.config/opencode/skills/dream/scripts/dream_consolidate.py --days 7 --report и верни полный JSON")
```
2. Прочитать candidate факты: model/agent usage patterns, file changes, error topics, token usage
3. **Прочитать checkpoint.md последних сессий (MiMo-Code style):**
   ```
   task(subagent_type="memory-agent", prompt="Прочитай checkpoint.md из последних 5 сессий: ls -t ~/.local/share/opencode/memory/sessions/ | head -5 | while read d; do echo \"=== $d ===\"; cat ~/.local/share/opencode/memory/sessions/\"$d\"/checkpoint.md 2>/dev/null || echo \"(no checkpoint)\"; done")
   ```
   Извлечь повторяющиеся паттерны, решения, ошибки из checkpoint.
4. Дополнительно: проверить tool sequences через distill_analyze.py (переиспользование)
```
task(subagent_type="memory-agent", prompt="Запусти python3 ~/.config/opencode/skills/distill/scripts/distill_analyze.py --days 7 --min-occurrences 2 --max-patterns 5 и верни JSON")
```

### Фаза 3: VERIFY — Проверка через SQLite (MiMo-Code: Phase 3 - Verify Against Raw Trajectory)

**Цель:** Подтвердить кандидатов прямыми SQLite запросами.

**SQLite Schema:**
```sql
-- message: role в json_extract(data, '$.role') = 'assistant' | 'user'
-- part: type в json_extract(data, '$.type') = 'text' | 'tool' | 'step-start' | 'step-finish'
-- tool: json_extract(data, '$.tool') — имя инструмента
```

**Шаблон запроса для траектории сессии:**
```sql
SELECT m.id, m.agent_id,
       json_extract(p.data, '$.type') as part_type,
       json_extract(p.data, '$.tool') as tool,
       substr(p.data, 1, 800) as preview
FROM message m
JOIN part p ON p.message_id = m.id
WHERE m.session_id = '<SESSION_ID>'
  AND json_extract(m.data, '$.role') = 'assistant'
ORDER BY m.time_created, p.time_created;
```

**Полезные поиски в user-сообщениях:**
- "always", "never", "remember", "rule" — правила
- "decision", "decided", "tradeoff", "reason" — решения
- "repeat", "again", "every time", "workflow" — паттерны
- Ошибки, failed команды, повторяющиеся пути файлов

**Действия:**
Для каждого кандидата:
1. Делегировать general SQLite проверку:
```
task(subagent_type="memory-agent", prompt="Выполни SQLite запрос к ~/.local/share/opencode/opencode.db: [запрос] и верни результат")
```
2. Консолидировать ТОЛЬКО если подтверждено:
   - Явным утверждением сэра
   - Чётким архитектурным решением
   - Повторяющимся evidence через сессии

### Фаза 4: CONSOLIDATE — Запись в MEMORY.md (MiMo-Code: Phase 4 - Consolidate)

**Цель:** Записать подтверждённые паттерны/решения/уроки в MEMORY.md.

**Секции:**
- `## Rules` — проектные правила от сэра
- `## Architecture decisions` — решение + дата + rationale
- `## Discovered durable knowledge` — меж-сессионные факты
- `## Patterns` — повторяющиеся проблемы и решения
- `## Gotchas` — легкопропускаемые грабли

**Принципы:**
- Сливать дубликаты вместо добавления
- Конвертировать относительные даты ("вчера") в YYYY-MM-DD
- Максимум 1-3 строки на запись
- Сохранять session_id в конце записи: `[ses_xxx]`

**Действия:**
Для каждой новой записи делегировать general:
```
task(subagent_type="memory-agent", prompt="Добавь запись в MEMORY.md [путь] в секцию ## [секция]: '- [YYYY-MM-DD] запись [ses_xxx]'. Проверь что нет дубликата.")
```

### Фаза 5: PRUNE — Очистка (MiMo-Code: Phase 5 - Prune And Verify)

**Цель:** Удалить устаревшие и низкосигнальные записи.

**Действия:**
1. Держать MEMORY.md ≤200 строк и ≤10KB
2. Удалять записи, устаревшие из-за новых решений
3. Удалять детали, важные только для одной сессии
4. Удалять низкосигнальные записи
5. Проверить упомянутые пути файлов через Glob/read
6. Проверить упомянутые функции/классы через rg
7. Неподтверждаемое пометить `[unverified]`

### Фаза 6: REPORT — Отчёт сэру

**Формат:**
```
Сэр, dream-консолидация завершена.

📊 Инспекция: [N] сессий
🔍 Новые паттерны: [список]
📝 MEMORY.md: [путь]
✨ Добавлено: [N] записей в [секции]
🗑️ Удалено: [N] устаревших
📏 Health: [N]/200 строк, [N]/10KB

Рекомендации: [что стоит запомнить на будущее]
```

## Важные правила (MiMo-Code)

1. **НЕ изменять SQLite базу** — только SELECT
2. **НЕ использовать agentmemory** — только MEMORY.md файлы
3. **Raw trajectory authoritative** — SQLite истина, MEMORY.md — структурированный кэш
4. **Предпочитать read-only bash/SQLite** для discovery
5. **Не трогать исходники** — только память
6. **Пустая консолидация — нормально** — "Nothing to consolidate" валидный результат
7. **Информационная плотность > полноты** — меньше, но плотнее
8. **Повторяющиеся workflow → /distill** — не делать здесь
9. **J.A.R.V.I.S. не редактирует файлы** — делегировать general
10. **После записи проверить через memory_search**

## Структура файлов скилла

```
~/.config/opencode/skills/dream/
├── SKILL.md                    # этот файл
└── scripts/
    ├── dream_inspect.sh        # bash — read-only SQLite инспекция
    └── dream_consolidate.py    # python — анализ траекторий, генерация MEMORY.md секций
```

## Связь с MiMo-Code

Этот скилл — адаптация MiMo-Code `/dream` команды (XiaomiMiMo/MiMo-Code).
Оригинал использует выделенного агента `dream-consolidator` с прямым SQL-доступом.
В OpenCode dream реализован как skill с 7 фазами и Python-помощниками для пре-анализа.
