---
name: distill
description: |-
  Distill — discovers repeated manual workflows in recent session trajectories
  and packages high-confidence candidates into reusable skills.
  
  7-phase process (MiMo-Code inspired): LOCATE → INVENTORY → DISCOVER → CONFIRM → 
  SHORTLIST → CHOOSE FORM → CREATE.
  Uses distill_analyze.py for data preparation, LLM for pattern analysis.
  Улучшенный алгоритм: cross-tool workflow detection (search→read→edit), MiMo-Code SQL GROUP BY, non-code pattern detection (skills, configs).
  
  Use proactively when user asks to: find patterns in work, create a skill from history,
  run distill, discover workflows, package repeated tasks, or improve efficiency.
  
  Examples:
  - user: "run distill" → full 7-phase distill cycle
  - user: "find repeated patterns" → DISCOVER + CONFIRM phases
  - user: "create a skill from my history" → full cycle with CREATE
  - user: "what workflows do I repeat" → DISCOVER phase only
---
# Distill — Workflow Discovery & Skill Creation

## Архитектура (MiMo-Code inspired)

### Отличия от MiMo-Code
MiMo-Code использует built-in агента с прямым SQL-доступом и LLM-анализом.
OpenCode distill — skill с Python-скриптом n-gram анализа + LLM для CONFIRM.

Улучшения против оригинального MiMo-Code distill:
- Cross-tool workflow detection: поиск цепочек РАЗНЫХ инструментов (search→read→edit), а не только каскадов одного (bash→bash)
- MiMo-Code SQL GROUP BY: группировка tool + input_preview (как в оригинале)
- Non-code pattern detection: скиллы, конфиги, диагностика — не только код
- min-occurrences=3 (вместо 2) — меньше шума
- Параллельные инструменты: поиск пар в одном сообщении
- Confidence scoring: математическая оценка вместо субъективной

```
┌──────────────────────────────────────────────────────────────────┐
│                      DISTILL CYCLE (7 фаз)                       │
├─────────┬──────────┬──────────┬────────┬──────────┬──────┬───────┤
│ LOCATE  │INVENTORY │ DISCOVER │CONFIRM │SHORTLIST │FORM  │CREATE │
│ БД+файлы│сущ.скиллы│ паттерны │SQLite  │приорит.  │выбор │артефак│
├─────────┴──────────┴──────────┴────────┴──────────┴──────┴───────┤
│  Инструменты: distill_analyze.py (данные) + LLM (анализ)         │
│  + bash/SQLite (верификация) + edit (создание)                   │
└──────────────────────────────────────────────────────────────────┘
```

## Фазы

### Фаза 0: LOCATE — Поиск данных

**Цель:** Определить пути к opencode.db и MEMORY.md файлам.

**Действия:**
1. opencode.db: `~/.local/share/opencode/opencode.db` (SQLite, read-only)
2. MEMORY.md: `~/.local/share/opencode/memory/`
3. Проверить что БД доступна: `ls -la ~/.local/share/opencode/opencode.db`

### Фаза 1: INVENTORY — Инвентаризация существующих скиллов

**Цель:** Не создавать дубликатов.

**Действия:**
1. Glob все существующие assets (чтобы не дублировать):
```
task(subagent_type="general", prompt="Собери инвентарь всех существующих assets OpenCode:
1. Skills: fd 'SKILL.md' ~/.agents/skills/ ~/.config/opencode/skills/ — для каждого прочитай name и description из frontmatter
2. Custom agents: fd '*.md' ~/.config/opencode/agents/ — для каждого прочитай name и description из frontmatter
3. Plugins: ls ~/.config/opencode/plugins/
Верни структурированный JSON со списком каждого типа и его описанием.")
```

### Фаза 2: DISCOVER — Поиск паттернов (через distill_analyze.py)

0. Загрузить скилл session-search для CLI доступа к БД:
```
Сначала загрузить session-search скилл (skill("session-search")), затем использовать ses CLI для всех SQLite запросов.
```

**Цель:** Найти повторяющиеся последовательности tool calls.

**Действия:**
0. Обзор через session-search скилл (поиск повторяющихся тем):
```
task(subagent_type="general", prompt="Загрузи скилл session-search и выполни ses search для поиска повторяющихся тем: выполни несколько ses fts запросов:
1. ses fts '\\\"always\\\" OR \\\"never\\\" OR \\\"remember\\\" OR \\\"rule\\\"' --days 30 --json
2. ses fts '\\\"repeat\\\" OR \\\"again\\\" OR \\\"every time\\\" OR \\\"workflow\\\"' --days 30 --json
Верни результаты.")
```

1. Делегировать general запуск distill_analyze.py:
```
task(subagent_type="general", prompt="Запусти python3 ~/.config/opencode/skills/distill/scripts/distill_analyze.py --days 30 --min-occurrences 2 --max-patterns 20 и верни полный JSON")
```

2. Получить:
   - tool_sequences — повторяющиеся цепочки (n-граммы)
   - tool_frequency — частота использования каждого инструмента
   - parallel_tools — инструменты в одном сообщении
   - sessions — какие сессии анализировались

3. Отфильтровать шум:
    - bash→bash→bash — это норма для general, не паттерн
    - read/rg/fd/ls/cd — уже отфильтрованы скриптом

4. NEW: Cross-tool workflow detection — находит последовательности РАЗНЫХ инструментов (search→read→edit, bash→edit→bash). Не то же самое что n-gram (который находит bash→bash→bash — шум).
5. NEW: MiMo-Code SQL GROUP BY — группировка по tool + input_preview для поиска повторяющихся операций с одинаковыми аргументами.
6. NEW: Non-code pattern detection — классификация типов сессии (skill_work, config_work, code_work, research, diagnostics). Позволяет находить паттерны не только в коде, но и в навыках, конфигах, диагностике.

### Фаза 3: CONFIRM — Проверка через SQLite

**Цель:** Подтвердить кандидатов через прямой SQLite запрос.

**Действия:**
Для каждого high-confidence кандидата:
1. Использовать ses search для подтверждения:
```
task(subagent_type="general", prompt="Загрузи скилл session-search и найди сессии связанные с паттерном [sequence]: выполни ses search \"[ключевые_слова]\" --days 30 --json и ses inspect для 2-3 найденных сессий. Верни детали.")
```

2. Проверить:
   - Повторяется ли в разных сессиях? (≥2)
   - Стабильный ли input? (одинаковые аргументы)
   - Экономит ли время? (>2 шагов)

### Фаза 4: SHORTLIST — Приоритизация

**Критерии отбора (MiMo-Code):**
- **High** (создать): ≥3 повторений (min-occurrences=3), ≥2 сессий, стабильный input, явная экономия времени
- **Medium** (рекомендовать): 2 повторения, ≥2 сессий
- **Low** (отложить): 1 повторение или только в 1 сессии

**Фильтры:**
- Не создавать если уже есть скилл (INVENTORY)
- Не создавать для очевидного (bash-каскады — это норма)
- Не создавать speculative/overbroad assets

### Фаза 5: CHOOSE FORM — Выбор формы (MiMo подход)

| Паттерн | Форма | Пример |
|---------|-------|--------|
| Повторяющаяся последовательность bash команд | Workflow script (SKILL.md) | `deploy-workflow` |
| Последовательность edit операций | SKILL.md описание | `refactor-pattern` |
| Исследовательский процесс (search→read→analyze) | SKILL.md + reference | `research-flow` |
| Диагностика системы (много bash проверок) | SKILL.md + scripts | `system-diag` |
| Комбинация инструментов для типовой задачи | SKILL.md | `bug-hunt` |

### Фаза 6: CREATE — Гибридное создание (smart auto-create)

**Правило:**
- Если НЕТ существующего скилла по той же теме → создать сразу (доложить после)
- Если ЕСТЬ существующий скилл по смежной теме → спросить сэра: улучшить или создать новый?

**Действия:**

#### Шаг 1: Проверить существующие скиллы на дубликаты

```
task(subagent_type="general", prompt="Проверь существование скиллов по теме паттерна.
Выполни:
1. rg -il '<ключевые_слова>' ~/.agents/skills/*/SKILL.md ~/.config/opencode/skills/*/SKILL.md 2>/dev/null
2. Прочитай name и description из frontmatter найденных скиллов
3. Оцени overlap: < 30% = новая тема, 30-70% = смежная, > 70% = дубликат
Верни: список найденных скиллов с name, description, overlap оценкой")
```

#### Шаг 2A: Если дубликатов нет (overlap < 30%) → автосоздание

```
task(subagent_type="general", prompt="Создай скилл в ~/.agents/skills/<name>/SKILL.md 
с frontmatter: name=<name>, description=<описание_паттерна_с_примерами>
и телом: описание workflow, триггеры, примеры использования.")
```

Затем:
- Проверить валидность через memory_search
- Сохранить факт в checkpoint.md
- Доложить: *«Сэр, создан скилл <name> для <описание>. Лежит в ~/.agents/skills/<name>/»*

#### Шаг 2B: Если есть смежный скилл (overlap 30-70%) → спросить сэра

Доложить сэру в формате:

*«Сэр, найден повторяющийся паттерн: [описание паттерна].*
*Уже есть скилл «[name]» — [кратко что делает].*
*Overlap: [~X%].*

*Варианты:*
*1. **Улучшить** существующий скилл: [конкретный план: какие секции добавить, какие примеры, какие скрипты]*
*2. **Создать новый** отдельный скилл: [конкретный план: имя, структура, почему отдельно лучше]*

*Ваше решение, сэр?»*

#### Шаг 2C: Если полный дубликат (overlap > 70%) → доложить + предложить улучшить

*«Сэр, найден повторяющийся паттерн: [описание паттерна].*
*Скилл «[name]» уже покрывает эту тему на >70%.*
*Однако можно **улучшить** существующий скилл: [конкретный план: какие секции добавить, какие примеры, какие скрипты, что расширить].*
*Имеет ли смысл доработать?»*

Если сэр согласен — выполнить улучшение по плану.
Если сэр отказывается — ничего не делать.

#### Шаг 3: После одобрения сэра (для шага 2B)

Выполнить выбранный вариант:
- Улучшить: добавить новые секции/примеры/скрипты
- Создать новый: создать SKILL.md в ~/.agents/skills/<name>/

Затем:
- Проверить через memory_search
- Сохранить факт в checkpoint.md
- Доложить о завершении

## Правила (MiMo-Code)

1. **Не создавать дубликаты** — проверять через INVENTORY
2. **Не упаковывать очевидное** — bash→bash, read→rg — это норма
3. **High-confidence только**: ≥3 повторений (min-occurrences=3) в ≥2 разных сессиях
4. **Создавать сразу (MiMo-Code style)** — не спрашивать разрешения. Создал → проверил → доложил.
5. **Ничего не создавать если нет уверенности** — «Created nothing» — валидный успешный результат
6. **J.A.R.V.I.S. не редактирует файлы** — создание SKILL.md делегировать general'у
7. **После создания — запустить dream** для консолидации факта создания

## Структура файлов скилла

```
~/.config/opencode/skills/distill/
├── SKILL.md
└── scripts/
    └── distill_analyze.py
```

## Связь с MiMo-Code

Этот скилл — адаптация MiMo-Code `/distill` команды (XiaomiMiMo/MiMo-Code).
Оригинал использует выделенного агента `distill-packager` с прямым SQL-доступом.
В OpenCode distill реализован как skill с 7 фазами и Python-помощником для пре-анализа.
