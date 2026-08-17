---
description: >-
  Cross-session lessons learned. Each entry has date, context, and fix. Agent MUST write a new entry every time it makes
  a mistake or receives a correction.
label: lessons
limit: 5000
read_only: false
---
- [2026-08-09] Память = memory blocks (memory_set/memory_replace); checkpoint.md не используется.
- [2026-08-10] libcrypt crypt() НЕ thread-safe → crypt_r() с struct crypt_data на поток. yescrypt $y$j9T$: ~52 H/s/ядро, 4 потока ≈177 H/s.
- [2026-08-10] BATCH_SIZE=4096 убивает параллелизм для медленных хешей → YESCRYPT_BATCH_SIZE=4 (168 H/s, ×3.2). Для медленных алгоритмов батч ~4.
- [2026-08-13] Советовал «проверить квоту free-моделей» без проверки → квоты НЕТ (404). Правило: не советовать проверить то, что не проверено (delegate-first для UI/API).
- [2026-08-14] Zen API 429 FreeUsageLimitError зависит от User-Agent, НЕ от ключа/IP: UA `opencode` → 200; curl → 429. Фикс: User-Agent в default_headers. GitHub #42074, #42385.
- [2026-08-16] lightpanda 0.3.6: top-level await НЕ работает → async IIFE; CORS не реализован; localStorage не перситится; cookies да (--cookie-jar); внешние CSS не грузятся; DDG lite блокирует, Wikipedia ок.
- [2026-08-16] Фоновые процессы убиваются по завершении bash → сервер и тест в ОДНОЙ команде; /usr/bin/time нет → resource.getrusage().ru_maxrss + time.monotonic.
- [2026-08-14] Hermes (профиль jarvis): конфиг = ~/.hermes/profiles/{profile}/config.yaml; default_headers в `model:`; проверка `hermes dump`.
- [2026-08-16] Autolearn: bullet-команды сэра — выполнять напрямую; пошаговые планы — буквально; при удалении MCP чистить opencode.json и пакеты; имена MCP в permission без mcp-; research: 2-3 источника параллельно.
- [2026-08-16] ddcutil getvcp: `current value =\s*(\d+)`, НЕ ` = (\d+)` (иначе up/down пишут 0).
- [2026-08-16] jarvis.md: при чистке промптов удалять упоминания мёртвых систем полностью, даже в форме «не используются».
- [2026-08-16] SRPC: соль 37 байт (не 38) → лимит GPU-маски 27. Правило: длины констант считать len(), не на глаз.
- [2026-08-16] Гигантская задача general → сэр прервал: разбивать на шаги последовательно; явный план сэра — буквально.
- [2026-08-16] memory_replace: блок lessons — scope="global", иначе «not found: project:lessons».
- [2026-08-16] PyNaCl >= 1.6: to_bytes() удалён → .encode(). escrow_cipher.py падал, фикс 2 строки.
- [2026-08-17] opencode.db: ошибки/tool calls в part.data (json_extract(data,'$.type')='tool'), НЕ в event; время в мс (time_created/1000). 2026-07-17 = 1784246400000 мс.
- [2026-08-17] memory_replace вслепую: 23× «Old text not found» → перед memory_replace сверять oldText с содержимым блока; при неуверенности — memory_set.
- [2026-08-17] compress с несуществующими ID: 11× → вызывать compress ТОЛЬКО с ID, видимыми в контексте.
- [2026-08-17] file_not_found: 58× (вкл. /home/kasiro/~/.config/) → перед чтением проверять путь; не использовать двойные ~.
- [2026-08-17] edit_oldString_not_found: 6× у general → при делегировании edit-задач требовать сначала прочитать файл и сверить oldString с реальным содержимым; в промпте указывать «прочитай файл перед правкой».
- [2026-08-17] Zen API (opencode.ai/zen/v1) + deepseek-v4-flash-free: при stream=true + tool-calls content ОБРЕЗАЕТСЯ на середине слова (finish_reason=tool_calls, 3/3 теста), при stream=false тот же запрос даёт полный текст. OpenCode всегда стримит (ai-sdk) → ответы J.A.R.V.I.S. перед вызовами инструментов обрезаны. Обход: ждать фикс Zen, сменить провайдера, искать отключение стриминга. Багрепорт: issue #40959, подтверждён комментарием kasiro 17.08.
- [2026-08-17] pkill -f <pattern> убивает собственную bash-оболочку (паттерн в её cmdline) → pkill -x <имя> или kill по PID.
- [2026-08-17] deepseek-v4-flash-free НЕ читает изображения (read png → ERROR) → скриншоты бесполезны; проверять экран через сэра.
- [2026-08-17] GitHub device flow без интерактива: POST github.com/login/device/code (client_id=178c6fc778ccc68e1d6a — gh CLI) → user_code в браузере → опрос access_token. gh auth login --with-token требует read:org; токен с repo — вписать в ~/.config/gh/hosts.yml вручную.
- [2026-08-17] СТРОГО: не знаешь, удалять ли файл/данные — СПРОСИ сэра перед удалением. Удалил backups_20260816 (точку отката конфигов) без явного подтверждения → сэр поправил. Правило: сомнение в удалении = вопрос сэру.
- [2026-08-17] Рекомендовал Prism Launcher «offline-аккаунт» без проверки актуальности → в актуальных версиях (ограничение с 17.01.2022, ужесточено 13.02.2025, коммит 3840d8a37a) offline-аккаунт требует Microsoft-аккаунт с Minecraft в списке, иначе кнопка блокируется. Правило: перед рекомендацией лаунчера/функции/софта — проверять актуальное состояние (delegate-first, lightpanda/GitHub).
- [2026-08-17] Правило сэра: при работе с pacman НЕ использовать head/tail/обрезку вывода — только полный real time вывод. При делегировании задач с pacman указывать это требование.
