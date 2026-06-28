---
name: agent-delegation
description: |-
  Agent delegation system for J.A.R.V.I.S. — who does what. executor (code, edits, git),
  researcher (web research, deepwiki, exa), sysadmin (system diagnostics, monitoring),
  general (multistep code+research hybrid), explore (fast read-only navigation).
  Use proactively when a task matches an agent's specialization.
  
  Examples:
  - user: "напиши парсер для JSON" → delegate to executor (edit/write code)
  - user: "найди новую библиотеку для PDF" → delegate to researcher (exa+deepwiki)
  - user: "проверь нагрузку на диск" → delegate to sysadmin (bash diagnostics)
  - user: "отрефактори этот модуль" → delegate to executor (complex edits)
  - user: "исследуй структуру репозитория" → delegate to explore (fast read-only)
  - user: "найди баг в API и почини" → delegate to general (research+code)
---
# Agent Delegation System

## Правило: один вызов = один сабагент

Не отправляй две задачи разным агентам одновременно если они зависят друг от друга.

## Железное правило: ВСЕ сабагенты ТОЛЬКО в фоне

Любой `task()` должен иметь `background=true`. Фоновый сабагент:
- Не блокирует диалог с сэром
- Работает параллельно
- Уведомит когда закончит
- Не занимает контекст основного агента

**Никогда** не используй `task()` без `background=true`.

## Суб-агенты

### executor — Разработчик кода
- **Инструменты:** edit, write, read, bash
- **Когда:** рефакторинг, написание кода, git операции
- **Не давать:** веб-поиск, исследования, глубокий анализ
- **Запрещено:** grep, find, npm в bash (но это в его промпте прописано)

### researcher — Исследователь
- **Инструменты:** exa, deepwiki, context7, websearch
- **Когда:** найти библиотеку, изучить GitHub репозиторий, документацию
- **Не давать:** редактирование кода, bash с системными командами
- **Заблокирован:** pty, bash с тяжелыми операциями

### sysadmin — Системщик
- **Инструменты:** bash (неограниченно, системные утилиты)
- **Когда:** диагностика системы, memory/disk/cpu, docker, systemd
- **Не давать:** редактирование кода, веб-поиск
- **Имеет:** доступ ко всем системным утилитам

### general — Многошаговый агент
- **Инструменты:** rg, fd, bun, read, bash, edit, write
- **Когда:** задача требует и исследования, и правки кода
- **Быстрее:** чем 2 отдельных вызова executor + researcher (экономит контекст)
- **Не имеет:** веб-инструментов (exa, deepwiki, context7)

### explore — Быстрый навигатор
- **Инструменты:** rg, fd, bun (только read-only, быстрые аналоги)
- **Когда:** быстро посмотреть структуру проекта, найти файл, grep по коду
- **Самый лёгкий:** минимальное потребление контекста

## Decision Tree

```
Запрос сэра
├── Только код (edit/write/read)
│   → task(background=true, subagent_type="executor")
├── Только веб-исследование
│   → task(background=true, subagent_type="researcher")
├── Только системная диагностика
│   → task(background=true, subagent_type="sysadmin")
├── Код + исследование (связаны)
│   → task(background=true, subagent_type="general")
├── Быстрый поиск в проекте (read-only)
│   → task(background=true, subagent_type="explore")
├── Тяжелая подзадача (>10 шагов что я сам могу)
│   → task(background=true, subagent_type="...")
└── Непонятно / нужна координация
    → делай сам (J.A.R.V.I.S.)
```
