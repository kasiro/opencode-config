---
description: Durable memory block. Keep this concise and high-signal.
label: knowledge
limit: 5000
read_only: false
---
## Technical knowledge
- opencode.db: tool calls in json_extract(data, '$.type') = 'tool' (not 'toolCall')
- Skills locations: ~/.agents/skills/ (new), ~/.config/opencode/skills/ (legacy)
- ses CLI: wrapper at ~/.local/bin/ses
- Iskratel RT-GM2-9: Rostelecom GPON ONT, firmware 1.6.1381
- ocdb errors --days N hangs on DB >1GB
- Session ID: determined via parent_id in SQLite

## Patterns & stats
- general — main executor (~92%); deepseek-v4-flash-free — base, big-pickle — heavy
- Top tools: bash (2872), read (1235), task (460), edit (313)
- Systematic CYCLE 1 skip: 24/25 sessions (critical); invalid tool calls 40+/14d
- GPON router replaced — resolved

## Tools reference
- Память: memory blocks (memory_set/memory_replace/memory_list).
- ses CLI: session search via SQLite FTS5 — ses search/list/inspect
- ocdb: universal CLI for opencode.db — sessions, search, tools, errors, stats
- Консолидация знаний: пересмотр memory blocks вручную.

## System reference
- CPU: Intel Core i5-4430 (4 cores, 4 threads)
- RAM: 7.7 GiB (bottleneck)
- GPU: NVIDIA GTX 950 (2 GiB VRAM) — десктоп, монитор Samsung SMB2330 (DVI-I-1)
- Disk: 466 GiB HDD (52% used, ~224 GiB free)
- OS: CachyOS Linux, kernel 6.18.33-1-cachyos-lts
- Python 3.14.5, Node v22.22.2, Docker 29.5.1
- Desktop: GNOME на Wayland (сессия 23, tty2); doas nopass:kasiro; kasiro в группе video; группы i2c нет

## Discovered
- router-diagnostics skill created for Iskratel RT-GM2-9
- [2026-08-10] rust-hashcat: симптом «неизвестный токен чарсета '?L'» при свежих исходниках → release-бинар старее правок (бинарь в ~/.cargo/build/release). Диагностика: stat -c '%y' бинаря vs src/*.rs; фикс: cargo build --release.
- [2026-08-15] whitepeach: Zen «ключ WP + deepseek-v4-flash-free» → 503 (серверная проблема аккаунта); hy3-free+WP → 200; анонимно → 200; платные → 401; UA curl/* → 429, opencode/* → ок.
- [2026-08-17] Zen API баг: stream=true + tool-calls → content обрезается на середине слова (finish_reason=tool_calls); stream=false → полный текст. OpenCode 1.18.18 (актуальная) всегда стримит. Конфиг/лимиты/версия/TUI исключены. Причина обрезания ответов J.A.R.V.I.S. перед tool-calls — баг провайдера Zen.
- [2026-08-16] Оптимизация kasiro: bore-tunnel/opencrabs/xray-checker остановлены, Docker остановлен (не disable), ydotoold починен. MCP остались: deepwiki, sequential-thinking, context7, youtube-transcript, lightpanda (~18 МБ RSS, ЕДИНСТВЕННЫЙ интернет: Bing через fetch; search мёртв — DDG CAPTCHA, Google 429; Notion/WB не читаются).
- [2026-08-16] Яркость kasiro: НЕТ /sys/class/backlight, D-Bus пуст, brightnessctl бесполезен. Путь — DDC/CI: ddcutil 2.2.7 (16.08), doas НЕ нужен (udev: GROUP=i2c + TAG+="uaccess" → logind ACL). SMB2330: /dev/i2c-0, DVI-I-1, VCP 2.0, 100/100. Команды: ddcutil detect/getvcp 10/setvcp 10 <0-100>. Альтернатива gammastep (гамма, не физическая). xrandr на Wayland не работает.

## rust-hashcat (Документы/rust_project)
- SRPC -m 9900: взлом ключа SRPC по MAC (без расшифровки). salted_key = key + "srpc_v2_salt_2024_secure_random_bytes" (37 байт); mac_key = HMAC-SHA256(salted_key, "mac_key_derivation"); expected = HMAC-SHA256(mac_key, body)[:16] vs base36_decode(MAC) (A-Z0-9: A=0..Z=25, 0=26..9=35, 16 байт BE). CPU+GPU (srpc.wgsl: много-блочный SHA256+HMAC). Скорость: CPU ~1.23 MH/s, GPU ~0.2 MH/s (на GTX 950 CPU быстрее — 3 SHA256/кандидата). 99 тестов. Potfile: цель содержит ':' → rsplit_once.
- --no-repeat: перестановки без повторов (Lehmer code), только -a 3, одинаковый чарсет, CPU-only (~1.77 MH/s).
- WGSL грабли: runtime-массивы нельзя передавать в функции; write_buffer требует кратности 4; SHA256-padding 0x80 через OR (не затирая байты до boff); wgpu не проверяет неинициализированные WGSL-массивы.

- [2026-08-17] pacman: мусор прерванных -Syu (каталоги download-* + битые .part, до 2.1 ГБ) заставляет -Sc зависать → сначала rm download-* и .part, потом -Sc. Сироты: pacman -Qtdq | doas pacman -Rns -.

## Правила поведения
- [2026-08-16] Поиск информации: единственный канал — lightpanda (Bing через fetch).
- [2026-07-29] Проверка перед выводами: если нужно утверждать что-то о конфигах/системе/ошибках — сначала делегировать проверку general, потом делать вывод. Статус: active (из global-rules)

## Lessons
- [2026-07-21] Tooling pattern: repetitive operations (>1-2 times) → create a utility. Статус: active
- [2026-07-29] Сэр предпочитает простые объяснения и не любит сложных терминов в архитектуре. Статус: active
- Lesson ≠ action. Logging an error doesn't automatically fix it. Статус: active
- [2026-07-31] OpenCode Zen Free API (https://opencode.ai/zen/v1) работает БЕЗ ключа: /models и /chat/completions → 200, cost "0". deepseek-v4-flash-free есть в списке. Reasonix (v1.18.0): провайдер zen-free (base_url opencode.ai/zen/v1, api_key_env ZEN_API_KEY, ключ в ~/.reasonix/.env), default_model = "zen-free". Работает.
