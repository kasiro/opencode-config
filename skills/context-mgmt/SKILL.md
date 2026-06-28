---
name: context-mgmt
description: |-
  Context window management for OpenCode free tier (deepseek-v4-flash-free).
  When to compress, how to format output, DCP auto-compression, compact format for memory recall,
  subagent delegation to save context, aggressive deduplication.
  Use proactively when context feels full, after closing a task block, or when planning steps ahead.
  
  Examples:
  - user: "у меня лагает" → context full → compress closed blocks, use compact format
  - user: complex research → delegate to researcher (экономит ~50% контекста)
  - user: "сделай А, Б, В" → делай последовательно, не параллельно (экономит)
  - user: долгий разговор → compress каждые 20-30 сообщений или при смене темы
  - user: "найди в памяти" → use format="compact" в recall
---
# Context Management (Free Tier Optimization)

**Free модель (deepseek-v4-flash-free):** ограниченный контекст. Экономия критична.

## WHEN TO COMPRESS

- После закрытого блока работы (задача завершена, исследование закончено)
- При смене темы
- Когда чувствуешь что контекст тяжёлый
- После 20-30 сообщений без компрессии
- **НЕ надо:** в середине активной задачи, если нужны точные ссылки на код/ошибки

## DCP (Dynamic Compression Protocol) — Configuration

Плагин `@tarquinen/opencode-dcp@3.1.13` установлен. DCP — **гибко настраиваемый** инструмент управления контекстом, не оставляй его с дефолтами когда пользователь явно просит оптимизации.

### Когда настраивать DCP (а не "не мешать")

- Пользователь спрашивает про DCP настройки → **ответь с деталями**, не говори "оставь как есть"
- Пользователь хочет оптимизировать под 1M/200K контекст → предложи конкретные значения
- Пользователь меняет модель с разным контекстом → адаптируй DCP под новый лимит

### Основные настройки DCP

| Параметр | Назначение | Тип |
|----------|-----------|-----|
| `maxContextLimit` | Процент занятого контекста при котором DCP начинает сжатие | процент (строка, e.g. '80%') |
| `minContextLimit` | Процент до которого DCP сжимает контекст | процент (строка, e.g. '50%') |
| `turnProtection.turns` | Сколько последних сообщений НЕ сжимать — защищает текущий диалог | число (int) |
| `compress.mode` | Режим сжатия: 'range' — диапазонный | строка |
| `compress.summaryBuffer` | Буферизация суммаризации | boolean |
| `strategies.deduplication` | Удаление дублирующегося контента | boolean |
| `strategies.purgeErrors` | Удаление старых ошибок/выводов тулов | boolean |

### Взаимодействие DCP и OpenCode compaction

`opencode.json` секция `compaction` (tail_turns, preserve_recent_tokens, reserved) — **встроенное сжатие OpenCode**. DCP — **плагин**.

- Они **могут работать вместе**, но при активном DCP compaction OpenCode лучше отключить или сделать минимальным
- Если оба активны — DCP может сжимать то, что compaction уже проредил (избыточно)
- **Рекомендация:** используй ОДИН основной механизм

### Настройка под контекст модели

**deepseek-v4-flash-free (200K):**
- `maxContextLimit: '75%'` → сжатие при 150K
- `minContextLimit: '40%'` → до 80K
- `turnProtection.turns: 3-4`
- `preserve_recent_tokens: 20000`
- `reserved: 40000`

**DeepSeek V4 Flash / иные с 1M контекстом:**
- `maxContextLimit: '80%'` → при 800K
- `minContextLimit: '50%'` → до 500K
- `turnProtection.turns: 5-6`
- `preserve_recent_tokens: 100000`
- `reserved: 100000`

### Формат dcp.jsonc

```jsonc
{
  "$schema": "...",
  "maxContextLimit": "80%",
  "minContextLimit": "50%",
  "turnProtection": { "turns": 4 },
  "strategies": {
    "deduplication": true,
    "purgeErrors": true
  },
  "compress": {
    "mode": "range",
    "summaryBuffer": true
  }
}
```

## COMPACT FORMAT

В `agentmemory_memory_recall()` используй `format="compact"` где возможно — это сокращает объём результатов в 3-5 раз.

## SUBAGENTS ДЛЯ ЭКОНОМИИ

- Крупную задачу (>5 шагов) делегируй через `task()` — сабагент использует свой контекст
- **Не держи в голове** — сохраняй в agentmemory, не пытайся всё помнить
- researcher и executor экономят ~50% твоего контекста

## АГРЕССИВНАЯ ДЕДУПЛИКАЦИЯ

- Не повторяй то что уже в system prompt
- Не дублируй содержимое файлов если читал их недавно
- Используй `format="compact"` в recall
- В ответах — кратко, без пересказа того что сэр сам написал

## ЧЕГО НЕ ДЕЛАТЬ

- Не жать в середине активной задачи
- Не жать если через 2-3 шага задача закончится
- Не использовать compress чаще 2 раз за сессию (предпочтение сэра)
- Не сохранять в agentmemory временные/одноразовые данные
