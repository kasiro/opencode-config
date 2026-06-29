---
name: how_use_memory
description: >-
  Полный справочник памяти J.A.R.V.I.S. — agentmemory с 53 инструментами.
  4-tier консолидация (Hermes-inspired): Working → Episodic → Semantic → Procedural.
  Frozen Snapshot Pattern — загрузка при старте, изоляция KV-кэша.
  Decision matrix: ситуация → инструмент → когда НЕ использовать.
  Используй когда нужно сохранить, найти, проанализировать, диагностировать или консолидировать память.
metadata:
  audience: jarvis
license: MIT
---

# 🧠 Память J.A.R.V.I.S. — agentmemory (Hermes-inspired)

Единственная система памяти. 53 инструмента через MCP на `localhost:3111`.
Архитектура повторяет успех Hermes Agent: 4-tier consolidation + Frozen Snapshot Pattern.

---

## 🔄 4-Tier Consolidation Pipeline

```
Working (сырые наблюдения от tool use)
    │ LLM-компрессия / session_summary
    ▼
Episodic (что произошло за сессию)
    │ Извлечение паттернов через reflect()
    ▼
Semantic (факты, концепты, предпочтения)
    │ Повторение и практика → consolidate()
    ▼
Procedural (уроки, навыки, how-to)
```

| Уровень | Функция | Когда запускать |
|---------|---------|----------------|
| **Working** | `save()` + `lesson_save()` | Каждое сообщение (CYCLE 1 → SAVE) |
| **Episodic** | `save(type="session_summary")` | Конец сессии (CYCLE 3 END) |
| **Semantic** | `consolidate(tier="semantic")` | Каждые 3-5 сессий |
| **Procedural** | `consolidate(tier="procedural")` | Каждые 10 сессий |

---

## ❄️ Frozen Snapshot Pattern (Hermes)

**Правило:** Один раз загрузил → заморозил → не меняй до конца сессии.

### При старте сессии (CYCLE 3 START):
1. `lesson_recall(query="error, pattern, preference", limit=5)` — ключевые уроки
2. `memory_recall(query="slot:persona, slot:project_state", limit=3)` — контекст проекта
3. `memory_profile()` / `memory_timeline()` — профиль и недавняя история

Эти данные формируют **Frozen Snapshot** — они в system prompt и не меняются.
KV-кэш модели не инвалидируется mid-session.

### НЕ делай:
- ❌ Не вызывай lesson_recall/memory_recall на каждое сообщение — это ломает KV-кэш
- ❌ Не сохраняй одну и ту же информацию дважды
- ❌ Не вызывай consolidate() чаще раза в сессию — это тяжелая операция

---

## 📋 DECISION MATRIX: когда что использовать

| Ситуация | Инструмент | Когда НЕ использовать |
|----------|-----------|----------------------|
| Вспомнить контекст сессии | `memory_recall(query, limit=5, format="compact")` | Если snapshot уже загружен при старте |
| Найти неточный факт | `memory_smart_search(query)` | При точном запросе — используй recall |
| Сохранить решение | `memory_save(type="decision", content, concepts)` | Для временных заметок — не надо |
| Сохранить баг/фикс | `memory_save(type="bug", content, files)` | Для косметических правок |
| Сохранить паттерн | `memory_save(type="pattern", content)` | Для разовых случаев |
| Извлечь урок | `lesson_save(content, confidence, tags)` | Если уверенность < 0.3 |
| Найти уроки | `lesson_recall(query, limit=5)` | Если нужно >5 — лучше consolidate |
| Связи между решениями | `graph_query(nodeType, query)` | Если нужен простой поиск |
| Диагностика памяти | `diagnose()` | В production реже 1 раза в день |
| Консолидация | `consolidate(tier)` | Чаще 1 раза в сессию — дорого |
| Рефлексия | `reflect()` | Если <5 session_summary |
| Что делать дальше | `frontier(project, limit)` | Для простых задач — сам план |
| Профиль проекта | `profile(project)` | Для быстрого вопроса — не надо |
| Проверить здоровье | `sessions()` | Если MCP отвечает — не надо |
| Удалить мусор | `governance_delete(memoryIds, reason)` | Без причины — никогда |

---

## 🔧 NATIVE инструменты (без префикса)

| Инструмент | Назначение | Параметры |
|-----------|-----------|-----------|
| `agentmemory_memory_sessions()` | Здоровье памяти | — |
| `agentmemory_memory_recall(query, limit, format)` | Поиск контекста | `query` (обяз), `limit` (10), `format` ("compact") |
| `agentmemory_memory_smart_search(query, expandIds)` | Гибридный поиск | `query` (обяз), `expandIds` |
| `agentmemory_memory_save(type, content, concepts, files)` | Сохранить | `type`: decision/architecture/bug/pattern/fact/preference/workflow/session_summary |
| `agentmemory_memory_governance_delete(memoryIds, reason)` | Удаление | `memoryIds` (через запятую), `reason` (обязателен) |

## 🔧 MCP инструменты (через сервер)

| Категория | Инструменты | Когда |
|-----------|------------|-------|
| **Поиск** | `recall`, `smart_search`, `timeline`, `patterns` | Продвинутый поиск |
| **Граф** | `graph_query`, `relations` | Связи между решениями |
| **Консолидация** | `consolidate`, `reflect` | Раз в несколько сессий |
| **Уроки** | `lesson_save`, `lesson_recall` | Каждый цикл |
| **Профиль** | `profile`, `diagnose` | При старте / проблемах |
| **Действия** | `action_create/update`, `frontier`, `next` | Управление задачами |
| **Сигналы** | `signal_send/read` | Меж-агентная связь |
| **Слоты** | `slot_*` | ⚠️ Баг v0.9.27 (500 error) |

---

## 📏 Best Practices

1. **Format="compact"** для recall — экономит контекст
2. **limit=5** для recall — больше редко нужно
3. **confidence >= 0.3** для lesson_save — иначе шум
4. **project поле** в save() — обязательно для фильтрации
5. **Не сохранять** одинаковое дважды — agentmemory сам дедуплицирует
6. **consolidate() не чаще 1 раза в сессию** — тяжелая операция
7. **diagnose() только при проблемах** — не для каждодневного использования
