---
name: how_use_memory
description: >-
  Полный справочник памяти J.A.R.V.I.S. — agentmemory с 53 инструментами.
  Decision matrix: ситуация → инструмент → когда НЕ использовать.
  Используй когда нужно сохранить, найти, проанализировать или диагностировать память.
metadata:
  audience: jarvis
license: MIT
---

# Память J.A.R.V.I.S. — agentmemory (SQLite, 53 инструмента)

Единственная система памяти. Все инструменты agentmemory разделены на NATIVE (встроенные, без префикса) и MCP (через сервер, с префиксом `mcp-agentmemory-`).



---

## 📋 NATIVE инструменты (без префикса)

Вызываются напрямую, всегда доступны (даже если MCP сервер упал).

| Инструмент | Назначение | Ключевые параметры |
|-----------|-----------|-------------------|
| `agentmemory_memory_sessions()` | Здоровье памяти | — |
| `agentmemory_memory_recall(query, limit, format)` | Поиск контекста | `query` (обяз), `limit` (10), `format` ("compact") |
| `agentmemory_memory_smart_search(query, expandIds)` | Гибридный поиск | `query` (обяз), `expandIds` (IDs для раскрытия) |
| `agentmemory_memory_save(type, content, concepts, files)` | Сохранить | `type`: pattern/preference/architecture/bug/workflow/fact |
| `agentmemory_memory_audit(operation, limit)` | Логи операций | `operation` (фильтр), `limit` (50) |
| `agentmemory_memory_export()` | Экспорт JSON | — |
| `agentmemory_memory_governance_delete(memoryIds, reason)` | Удаление | `memoryIds` (ID через запятую), `reason` (обяз) |

## 🏗️ MCP инструменты (с префиксом `mcp-agentmemory-`)

Доступны только когда agentmemory сервер запущен. Для продвинутых операций.

| Категория | Инструменты | Когда |
|-----------|------------|-------|
| Поиск | `search`, `smart_search`, `recall`, `file_history`, `timeline`, `patterns` | Продвинутый поиск |
| Граф | `graph_query`, `relations`, `facet_query`, `facet_tag` | Связи и теги |
| Профиль/Диагностика | `profile`, `diagnose` | Состояние системы |
| Консолидация | `consolidate`, `reflect`, `crystallize` | Аналитика |
| Уроки | `lesson_save`, `lesson_recall` | Обучение на ошибках |
| Действия | `action_create/update`, `frontier`, `next`, `lease`, `checkpoint` | Управление задачами |
| Сигналы | `signal_send/read`, `team_share/feed` | Меж-агентная связь |
| Управление | `audit`, `governance_delete`, `export`, `snapshot_create`, `compress_file` | Администрирование |
| Слоты | `slot_create/get/list/replace/append/delete` | ⚠️ Баг v0.9.27 (500 error) |
| Спец | `verify`, `heal`, `commit_lookup`, `commits`, `claude_bridge_sync`, `vision_search`, `obsidian_export`, `mesh_sync`, `routine_run`, `sentinel_create/trigger`, `sketch_create/promote` | Специализированные (редко) |



