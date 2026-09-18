---
description: Долговременная память. Держать кратко и по делу.
label: knowledge
limit: 6000
read_only: false
---
## Технические знания
- opencode.db: вызовы инструментов в json_extract(data, '$.type') = 'tool' (не 'toolCall')
- Расположение скиллов: ~/.agents/skills/ (новые), ~/.config/opencode/skills/ (устаревшие)
- ses CLI: обёртка в ~/.local/bin/ses (перед использованием ses --help)
- ocdb errors --days N зависает на БД >1ГБ
- ID сессии: определяется через parent_id в SQLite

## Паттерны и статистика
- general — основной исполнитель (~92%); deepseek-v4-flash-free — базовая, big-pickle — легкая но не очень умная модель (исполнитель/саб агент - это максимум)
- Систематический пропуск CYCLE 1: 24/25 сессий (критично); невалидные вызовы инструментов 40+/14д

## Справочник инструментов
- Память: memory blocks (memory_set/memory_replace/memory_list).
- ses CLI: поиск сессий через SQLite FTS5 — ses search/list/inspect
- ocdb: универсальный самописный CLI для opencode.db — sessions, search, tools, errors, stats
- Консолидация знаний: пересмотр memory blocks вручную.

## Справочник системы
- CPU: Intel Core i5-4430 (4 ядра, 4 потока)
- RAM: 7.7 GiB (узкое место)
- GPU: NVIDIA GTX 950 (2 GiB VRAM) — десктоп, монитор Samsung SMB2330 (DVI-I-1)
- Диск: 466 GiB HDD (52% занято, ~224 GiB свободно)
- ОС: CachyOS Linux, ядро 6.18.42-1-cachyos-lts
- Python 3.14.5, Node v22.22.2, Docker 29.5.1
- Десктоп:
	- GNOME на Wayland (сессия 23, tty2);
	- doas nopass:kasiro; kasiro в группе video; группы i2c нет

## Обнаружено
- [2026-08-10] rust-hashcat: симптом «неизвестный токен чарсета '?L'» при свежих исходниках → release-бинар старее правок (бинарь в ~/.cargo/build/release). Диагностика: stat -c '%y' бинаря vs src/*.rs; фикс: cargo build --release.
- [2026-08-15] whitepeach: WP+deepseek-v4-flash-free → 503; hy3-free+WP → 200; анонимно → 200; платные → 401; UA curl → 429, opencode → ок.
- [2026-08-17] Баг Zen API: stream=true + tool-calls → content обрезается (finish_reason=tool_calls); stream=false → полный текст. OpenCode всегда стримит → ответы J.A.R.V.I.S. перед tool-calls обрезаны.
- [2026-08-16] Оптимизация kasiro: bore-tunnel/opencrabs/xray-checker остановлены, Docker остановлен (не disable), ydotoold починен. MCP остались: deepwiki, sequential-thinking, context7, youtube-transcript, lightpanda (~18 МБ RSS, ЕДИНСТВЕННЫЙ интернет: Bing через fetch; search мёртв — DDG CAPTCHA, Google 429; Notion/WB не читаются).
- [2026-08-16] Яркость kasiro: НЕТ /sys/class/backlight, D-Bus пуст. Путь — DDC/CI: ddcutil 2.2.7, doas НЕ нужен (udev uaccess). SMB2330: /dev/i2c-0, DVI-I-1, VCP 2.0. Команды: ddcutil detect/getvcp 10/setvcp 10 <0-100>. xrandr на Wayland не работает.
- [2026-08-18] KVM на kasiro: VT-x включена, виртуализация есть
- [2026-08-18] NixOS ISO: все 3 образа целые (SHA256 = официальные). #1 — 26.05.7813; #2/#3 — nixos-unstable (26.11pre1057119). channels.nixos.org отдают IPv6 → curl --resolve 151.101.65.91.
- [2026-08-20] NixOS для тестов: решение — установка на флешку /dev/sdb (USB 2.0, 117 ГБ, live ISO на ней). Флешка и виртуалка отвергнуты ранее (скорость), покупка диска отвергнута (без трат), ужатие btrfs на /dev/sda отвергнуто (риск). Схема: tmpfs root (система в RAM — «летает»), /nix + /home + /persist на btrfs subvolumes флешки, /boot — ESP. Плата ASUS H81M-E: USB 3.0 xHCI есть, 3/4 SATA свободны. Загрузчик: systemd-boot (UEFI) или GRUB (BIOS) — canTouchEfiVariables = false. Сэр выполняет установку сам, команды выданы.
- [2026-08-20] Флешка /dev/sdb (ProductCode, ID 346d:5678, USB 2.0, ноунейм) ФИЗИЧЕСКИ ДЕГРАДИРОВАЛА: чтение 5.6 MB/s (провалы до 44-130 kB/s на первых 40 МБ — ECC-ретраи), запись w_await 2458 мс (~186 KiB/s на мелких файлах с fsync), write-through без кэша, без SMART. disko-install «Copying store paths» завис на 2% (8:44 remaining). btrfs чиста (0 ошибок), порт USB не виноват. Вывод: флешка негодна как носитель NixOS. Остались: раздел на HDD sda (сэр отказывался), виртуалка (отказывался), покупка SSD (без трат).

## rust-hashcat (\$HOME/Документы/rust_project)
- SRPC -m 9900: взлом ключа SRPC по MAC (без расшифровки). salted_key = key + "srpc_v2_salt_2024_secure_random_bytes" (37 байт); mac_key = HMAC-SHA256(salted_key, "mac_key_derivation"); expected = HMAC-SHA256(mac_key, body)[:16] vs base36_decode(MAC) (A-Z0-9: A=0..Z=25, 0=26..9=35, 16 байт BE). CPU+GPU (srpc.wgsl: много-блочный SHA256+HMAC). Скорость: CPU ~1.23 MH/s, GPU ~0.2 MH/s (на GTX 950 CPU быстрее — 3 SHA256/кандидата). 99 тестов. Potfile: цель содержит ':' → rsplit_once.
- --no-repeat: перестановки без повторов (Lehmer code), только -a 3, одинаковый чарсет, CPU-only (~1.77 MH/s).
- WGSL грабли: runtime-массивы нельзя передавать в функции; write_buffer требует кратности 4; SHA256-padding 0x80 через OR (не затирая байты до boff); wgpu не проверяет неинициализированные WGSL-массивы.

## Правила поведения
- [2026-08-16] Поиск информации: единственный канал — lightpanda (Bing через fetch).

## Уроки
- [2026-07-21] Паттерн инструментов: повторяющиеся операции (>1-2 раз) → создать утилиту. Статус: активен
- [2026-07-29] Сэр предпочитает простые объяснения и не любит сложных терминов в архитектуре. Статус: активен
- Урок ≠ действие. Запись ошибки не исправляет её автоматически. Статус: активен
- [2026-07-31] OpenCode Zen Free API (https://opencode.ai/zen/v1) работает БЕЗ ключа: /models и /chat/completions → 200, cost "0". deepseek-v4-flash-free есть в списке. Reasonix (v1.18.0): провайдер zen-free (base_url opencode.ai/zen/v1, api_key_env ZEN_API_KEY, ключ в ~/.reasonix/.env), default_model = "zen-free". Работает.
