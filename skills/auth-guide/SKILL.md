---
name: auth-guide
description: >-
  Справочник по файлу auth.json (API ключи OpenCode).
  Где находится: ~/.local/share/opencode/auth.json
  Структура: {provider: {key: "sk-...", type: "...", ...}}
  Как читать ключи: jq -r '.PROVIDER.key // ""' auth.json
  Используй когда нужен API ключ для curl, классификатора, MCP, плагинов.
metadata:
  audience: jarvis
license: MIT
---

# 🔑 Auth Guide — API ключи OpenCode

## Где лежит файл

**Путь:** `~/.local/share/opencode/auth.json`

Все API ключи OpenCode хранятся в одном файле. UI OpenCode автоматически читает/пишет сюда.

## Структура файла

```json
{
  "openrouter": {
    "key": "sk-or-v1-...",
    "type": "..."
  },
  "groq": {
    "key": "gsk_...",
    "type": "..."
  },
  "anthropic": {
    "key": "sk-ant-...",
    "type": "..."
  },
  "opencode": {
    "key": "sk-...",
    "type": "..."
  }
}
```

**Ключи лежат в `.$PROVIDER.key`** — не в `.$PROVIDER` напрямую!

## Как читать ключи

### Из bash:
```bash
# Правильно (через .key):
jq -r '.openrouter.key // ""' ~/.local/share/opencode/auth.json

# НЕПРАВИЛЬНО (без .key — вернёт объект):
jq -r '.openrouter // ""' ~/.local/share/opencode/auth.json
```

### Пример: получить ключ для curl
```bash
OR_KEY=$(jq -r '.openrouter.key // ""' ~/.local/share/opencode/auth.json)
curl -s -H "Authorization: Bearer $OR_KEY" https://openrouter.ai/api/v1/models
```

### Пример: проверить все провайдеры
```bash
cat ~/.local/share/opencode/auth.json | jq -r '
  to_entries[] |
  "\(.key): exists=\(.value | has("key")) type=\(.value | type)"
'
```

### Пример: безопасно прочитать (с fallback)
```bash
get_key() {
  jq -r ".$1.key // \"\"" "$HOME/.local/share/opencode/auth.json" 2>/dev/null || echo ""
}
OPENROUTER_KEY=$(get_key "openrouter")
```

## Какие провайдеры доступны

| Провайдер | Формат ключа | Endpoint | Бесплатно? |
|-----------|-------------|----------|:----------:|
| **openrouter** | `sk-or-v1-...` | openrouter.ai/api/v1 | 50/day (free tier) |
| **anthropic** | `sk-ant-...` | api.anthropic.com | ❌ |
| **opencode** | `sk-...` | opencode.ai/zen/v1 | ✅ (модели free) |
| **groq** | `gsk_...` | api.groq.com | 1000/day |
| **google** | AIza... | generativelanguage.googleapis.com | 5-15 RPM |
| **mistral** | ... | api.mistral.ai | ~1B tok/мес |
| **openai** | `sk-...` | api.openai.com | ❌ |

## Как добавить/обновить ключ

1. Открыть OpenCode → Settings → API Keys
2. Ввести ключ
3. OpenCode автоматически запишет в `auth.json`

**НЕ редактируй auth.json вручную** — это может сломать целостность. Используй UI.

## Как использовать в скриптах

```bash
get_key() { jq -r ".$1.key // \"\"" "$HOME/.local/share/opencode/auth.json" 2>/dev/null || echo ""; }
OR_KEY=$(get_key "openrouter")
```

## Безопасность

- **Не коммить auth.json** в git — содержит секретные ключи
- **Не логируй ключи** — только первые/последние символы
- **Не публикуй** — файл содержит все ваши API ключи
- **.gitignore** должен содержать `auth.json`
