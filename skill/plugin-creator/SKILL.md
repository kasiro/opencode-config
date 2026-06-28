---
name: plugin-creator
description: |-
  Создание OpenCode плагинов (TypeScript/JavaScript) с нуля. Шаблоны, хуки, тулы,
  правила размещения и известные грабли. Использовать при создании нового плагина,
  добавлении кастомного tool, настройке event/хуков, диагностике почему плагин не работает.

  Примеры:
  - user: "создай плагин для отслеживания лимитов" → scaffold + tool + event hooks + save
  - user: "добавь кастомный tool в OpenCode" → tool() helper с args и exec
  - user: "плагин не загружается" → проверить расположение, import, export, конфиг
  - user: "как сделать хук на событие" → event() хук с типами
  - user: "куда класть самописный плагин" → ~/.config/opencode/plugins/ (auto-discovery)
---

# Plugin Creator — руководство по созданию OpenCode плагинов

## Куда класть плагины (auto-discovery)

| Тип | Путь | Регистрация |
|-----|------|------------|
| **Самописный глобально** | `~/.config/opencode/plugins/*.ts` | Auto-discovery — не писать в opencode.json |
| **Самописный в проекте** | `.opencode/plugins/*.ts` | Auto-discovery — не писать в opencode.json |
| **Чужой npm пакет** | `opencode.json → plugin: ["package-name"]` | Явно в конфиг |

> Правило: самописные плагины — только в `plugins/` директории (auto-discovery).
> В `opencode.json` прописываем только чужие npm плагины.

## Базовая структура плагина

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin";

export default (async ({ $, client }) => {
  // $ — Bun shell (доступен только здесь, замыкать внутрь)
  // client — API OpenCode

  // Инициализация (чтение файлов, состояния)
  // ...

  return {
    tool: {
      mytool: tool({
        description: "Что делает tool",
        args: {
          // tool.schema — обёртка над Zod
          name: tool.schema.string().optional().describe("Имя"),
          count: tool.schema.number().describe("Количество"),
        },
        async execute(args) {
          // args.name, args.count
          return `Результат: ${args.count}`;
        },
      }),
    },

    event: async ({ event }) => {
      // События OpenCode
      if (event.type === "session.error") {
        // ...
      }
    },

    // tool.execute.after — после каждого tool
    "tool.execute.after": async (input, output) => {
      // input.tool — имя выполненного tool
      // output.args — переданные аргументы
    },
  };
}) satisfies Plugin;
```

## Доступные хуки

| Хук | Сигнатура | Когда срабатывает |
|-----|-----------|-------------------|
| `tool: { name: tool({...}) }` | — | Регистрирует кастомный tool |
| `event` | `({ event }) => void` | Любое системное событие |
| `"tool.execute.before"` | `(input, output) => void` | Перед выполнением любого tool |
| `"tool.execute.after"` | `(input, output) => void` | После выполнения любого tool |
| `config` | `(config) => void` | При загрузке конфига |
| `"chat.message"` | `(input, output) => void` | Новое сообщение в чате |
| `"permission.ask"` | `(perm, output) => void` | Запрос разрешения |
| `"shell.env"` | `(input, output) => void` | Переменные окружения |
| `"chat.params"` | `(input, output) => void` | Параметры чата |

## Типы событий (event.type)

- `session.error` — ошибка сессии (содержит error.data.message)
- `session.idle` — сессия бездействует
- `message.updated` — сообщение обновлено (role, error, content)
- `message.part.updated` — часть сообщения (tool call completion)
- `permission.updated` — запрос подтверждения от пользователя

## Известные грабли (gotchas)

### 1. `writeFile` из `node:fs/promises` НЕ РАБОТАЕТ
```typescript
// ❌ НЕ РАБОТАЕТ
import { writeFile } from "node:fs/promises";
await writeFile(path, data);

// ✅ РАБОТАЕТ
await Bun.write(path, data);
```

### 2. `readFile` из `node:fs/promises` — не проверено, используйте Bun
```typescript
// ✅ РАБОТАЕТ
const file = Bun.file(path);
const exists = await file.exists();
const text = await file.text();
const json = JSON.parse(text);
```

### 3. `homedir` из `node:os` работает
```typescript
import { homedir } from "node:os";
const path = `${homedir()}/.local/share/...`;
```

### 4. `$` (Bun shell) доступен ТОЛЬКО во внешней функции
```typescript
export default (async ({ $ }) => {
  // ✅ $ доступен
  const sh = $;  // замкнуть для использования внутри

  return {
    tool: {
      mytool: tool({
        async execute(args) {
          // ✅ работает через замыкание
          const r = await sh`sqlite3 ...`.quiet().nothrow();
        },
      }),
    },

    event: async ({ event }) => {
      // ✅ тоже через замыкание
      const vpn = await sh`ip addr show tun+`.quiet().nothrow();
    },
  };
}) satisfies Plugin;
```

### 5. `catch { /* silent */ }` скрывает ошибки
```typescript
// ❌ ПЛОХО — не видно ошибок
try { ... } catch { /* silent */ }

// ✅ ХОРОШО — логировать
try { ... } catch (e) {
  void client.app.log({
    body: { service: "my-plugin", level: "error", message: String(e) }
  });
}
```

### 6. `satisfies Plugin` работает с TypeScript
```typescript
export default (async ({ $ }) => {
  return { tool: {}, event: async () => {} };
}) satisfies Plugin;
```

### 7. `.quiet().nothrow()` для shell
```typescript
// .quiet() — подавляет stderr
// .nothrow() — возвращает результат вместо исключения при ошибке
const r = await sh`sqlite3 ${db} "SELECT 1"`.quiet().nothrow();
const output = r.stdout?.toString() || "";
```

## Структура JSON логов
```typescript
void client.app.log({
  body: {
    service: "my-plugin",   // имя плагина
    level: "info" | "warn" | "error",
    message: "текст лога",
  },
});
```

## Готовый пример: quota-monitor.ts

Полноценный плагин в `~/.config/opencode/plugins/quota-monitor.ts`:
- tool `quota` с опциональным аргументом `history`
- event хук: ловит `free usage exceeded` (rate limit OpenCode Free Tier)
- `tool.execute.after` хук: детект смены VPN по tun-интерфейсам
- Сохранение снепшотов в JSON через `Bun.write()`
- Определение страны VPN через `ip-api.com`
- Shell (`$`) для sqlite3 чтения opencode.db и ip addr
- `catch` с логированием через `client.app.log`

**Ключевые приёмы**:
- Замыкание `$` для использования в tool.execute и event
- `client.app.log()` для логирования (не silent catch)
- `Bun.write()` вместо `writeFile` из node:fs
- `Bun.file(path).exists()` + `.text()` + `JSON.parse()`
- Дедупликация событий (vpn not changed)

Полный код: `references/quota-monitor.ts`

## Пример: плагин с tool + event + shell

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin";
import { homedir } from "node:os";

const DB = `${homedir()}/.local/share/opencode/opencode.db`;

interface Stats {
  msgs: number;
  input: number;
}

export default (async ({ $, client }) => {
  async function getStats(): Promise<Stats> {
    const r = await $`sqlite3 -separator '|' ${DB} "
      SELECT COUNT(*),
        COALESCE(SUM(json_extract(m.data,'$.tokens.input')),0)
      FROM message m
    "`.quiet().nothrow();
    const p = r.stdout?.toString().trim().split("|") || [];
    return {
      msgs: parseInt(p[0]) || 0,
      input: parseInt(p[1]) || 0,
    };
  }

  return {
    tool: {
      stats: tool({
        description: "Показать статистику",
        args: {},
        async execute() {
          const s = await getStats();
          return `Сообщений: ${s.msgs}, Input: ${s.input}`;
        },
      }),
    },

    event: async ({ event }) => {
      try {
        if (event.type === "session.error") {
          const err = (event.properties as any)?.error?.data?.message || "";
          if (err.toLowerCase().includes("free usage exceeded")) {
            await client.app.log({
              body: { service: "stats", level: "info", message: "Limit hit!" }
            });
          }
        }
      } catch (e) {
        void client.app.log({
          body: { service: "stats", level: "error", message: String(e) }
        });
      }
    },
  };
}) satisfies Plugin;
```
