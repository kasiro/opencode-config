---
description: Долговременная память. Держать кратко и по делу.
label: knowledge
limit: 6000
read_only: false
---
## Технические знания
- opencode.db: json_extract(data, '$.type') = 'tool' (не 'toolCall')
- Скиллы: ~/.agents/skills/ (новые), ~/.config/opencode/skills/ (устаревшие)
- ydotool: нет UTF-8 → clipboard-метод (wl-copy + Ctrl+V)

## Паттерны
- general: ~92% задач; deepseek-v4-flash-free — базовая модель; CYCLE 1 пропускается (24/25 сессий)

## Инструменты
- Память: memory_set/memory_replace/memory_list

## Система
- CPU: i5-4430 (4c/4t); RAM: 7.7 GiB; GPU: GTX 950 (2 GiB)
- Диск: 466 GiB HDD (52%); ОС: NixOS
- Python 3.14.5, Node v22.22.2, Docker 29.5.1
- GNOME/Wayland, doas nopass:kasiro

## Обнаружено
- [2026-08-17] Zen API: stream=true + tool-calls → content обрезается
- [2026-08-16] Яркость: DDC/CI (ddcutil), doas не нужен; xrandr на Wayland не работает
- [2026-10-24] "Model access disabled" — сервер Zen; брать mimo-v2.6-flash-free
- [2026-08-20] Флешка /dev/sdb деградировала (44-130 kB/s) → NixOS установлен
- [2026-10-26] swayfx-enhanced 0.5.3 + NVIDIA: animation_duration_ms=0 + corner_radius=0

## rust-hashcat
- SRPC -m 9900: HMAC-SHA256(salted_key, body)[:16] vs base36_decode(MAC); salted_key = key + "srpc_v2_salt_2024_secure_random_bytes"
- --no-repeat: Lehmer code, -a 3, CPU-only (~1.77 MH/s)
- WGSL: runtime-массивы не в функции; write_buffer кратность 4; padding 0x80 через OR

## Правила поведения
- [2026-08-16] Поиск информации: единственный канал — lightpanda (Bing через fetch).

## Недоступные инструменты (v2)
- **deny**: glob, grep, websearch, webfetch (заменён на lightpanda MCP)
- **bash pattern match**: *find*, *grep*, *npm*, *npx* (блокируется даже в URL)
- **ask**: *sqlite*, *opencode* (требуют подтверждения сэра)
- **Альтернативы**: fd вместо find, rg вместо grep, bun вместо npm, bunx вместо npx

## Миграция v1→v2 (2026-11-11)

### Инструменты
- `task` → `subagent`
- MCP через `execute` + `tools.*`
- Permission format v2: object с паттернами

### Синтаксис вызова инструментов

**Встроенные** (напрямую):
```javascript
read({path, limit, offset})
edit({path, oldString, newString})
bash({command})
memory_set({label, scope, value, limit})
memory_replace({label, scope, oldText, newText, edits})
subagent({agent, description, prompt, background})
skill({id})
compress({topic, content: [{startId, endId, summary}]})
```

**MCP** (через `execute`):
```javascript
await tools.lightpanda.fetch({url})
await tools.lightpanda.markdown({url})
await tools.deepwiki.read_wiki_structure({repoName})
await tools.context7["query-docs"]({libraryId, query})
await tools.deploychan.get_skill({skill_id})
```



## Уроки
- [2026-07-21] Паттерн инструментов: повторяющиеся операции (>1-2 раз) → создать утилиту. Статус: активен
- [2026-07-29] Сэр предпочитает простые объяснения и не любит сложных терминов в архитектуре. Статус: активен
- Урок ≠ действие. Запись ошибки не исправляет её автоматически. Статус: активен
- [2026-07-31] OpenCode Zen Free API работает БЕЗ ключа через zen-free провайдер. Работает.
