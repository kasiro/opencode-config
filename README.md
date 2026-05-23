# OpenCode Configuration — J.A.R.V.I.S.

Персональный AI-оркестратор на базе opencode.

## Структура

```
├── opencode.json           # Основной конфиг
├── agents/                 # Агенты (5 шт)
│   ├── jarvis.md           # Оркестратор
│   ├── executor.md         # Разработчик
│   ├── scout.md            # Исследователь
│   ├── obsidian.md         # Синхронизация с Obsidian
│   └── sysadmin.md         # Системная диагностика
└── commands/               # Кастомные команды
    └── search-intelligently.md
```

## Установка

```bash
# 1. Установить opencode
curl -fsSL https://opencode.ai/install | bash

# 2. Скопировать конфиг
cp opencode.json ~/.config/opencode/
mkdir -p ~/.config/opencode/agents
cp agents/*.md ~/.config/opencode/agents/

# 3. Заменить плейсхолдеры в ~/.config/opencode/opencode.json
# <YOUR_EXA_API_KEY>, <YOUR_CONTEXT7_API_KEY>, <PATH_TO_OBSIDIAN_VAULT_CONFIG>

# 4. Запустить
opencode
```

## Требования

- [opencode](https://opencode.ai) — AI-платформа
- [bun](https://bun.sh) — для запуска MCP-серверов
- [agentmemory](https://npmjs.com/package/agentmemory) — долговременная память
- API-ключи: Exa, Context7

## Архитектура

J.A.R.V.I.S. — оркестратор, который делегирует задачи специализированным саб-агентам:

| Агент | Роль | Инструменты |
|-------|------|-------------|
| J.A.R.V.I.S. | Оркестратор | agentmemory, sequential-thinking |
| E.X.E.C.U.T.O.R. | Разработчик | context7, sequential-thinking |
| S.C.O.U.T. | Исследователь | exa, context7, deepwiki |
| O.B.S.I.D.I.A.N. | Синхронизация | mcpvault (Obsidian) |
| S.Y.S.A.D.M.I.N. | Диагностика | системные команды |
