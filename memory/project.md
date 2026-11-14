---
description: Архитектура проекта, соглашения, правила и грабли
label: project
limit: 5000
read_only: false
---
## Правила (обязательные)
- [2026-07-14] Перед удалением любых данных — показать полное содержимое сэру и получить подтверждение.
- [2026-07-22] CYCLE 1 (STOP→RECALL→ORIENT→ACT→VERIFY→SAVE) на КАЖДОЕ сообщение. Механически, без исключений.
- [2026-08-09] Память = memory blocks (memory_set/memory_replace/memory_list): блоки lessons/knowledge/project/human/persona. checkpoint.md и Memory MCP больше не используются.

## Архитектурные решения
- [2026-08-09] rust-hashcat: флаги --force-cpu/--force-gpu (enum ForcePath в cli.rs, Auto/Cpu/Gpu). --force-cpu: GPU не инициализируется вовсе. --force-gpu: ошибка если атака не -a 3, маска >55 или целей >64, GPU недоступен. README обновлён, 66 тестов зелёные.
- [2026-08-09] Память переведена на memory blocks: global (кросс-проектно) + project (по проектам); блоки lessons/knowledge/project/human/persona. J.A.R.V.I.S. пишет в память напрямую (memory_set/memory_replace) — делегирование касается только файлов.
- [2026-07-22] Фаза 0 защиты CYCLE 1 — выполнять механически, без самодисциплины

## Чеклисты (соглашение сэра)
- [2026-10-21] Легенда статусов: [x] выполнено; [ ] не выполнено; [-] не имеет смысла делать; [/] есть невыполненные подпункты. Работать строго по категориям-заголовкам.

## Грабли
- Вывод инструмента Read НЕ показывается пользователю — выводить в текстовом ответе.
- Лимит строки Read 2000 символов — использовать jq/python3 для минифицированного JSON.
- Невалидный вызов инструмента: проверять allowed-tools перед вызовом.
- 100% потеря пакетов на ping ≠ нет интернета.
- Урок ≠ действие. Запись ошибки не исправляет её.

## Региональные ограничения
- [2026-07-29] Западный хостинг (Oracle Cloud, Fly.io, Render, Hetzner, GitHub Codespaces) — оплата недоступна с российских карт. Альтернативы: Selectel, Beget, Timeweb (от 300₽/мес), Oracle Cloud Free Tier (если карта дружественной страны).

## dsh (deepseek-harness)
- [2026-08-17] dsh 0.1.0-rc.6 (bun, ~/.bun/bin/dsh). TUI НЕТ (только web/headless; web = алиас на автоинициализируемый профиль). UA зашит в APP_IDENTITY пакета dsh-llm (lib/index.js + lib/types/attribution.js) → заменён на opencode/1.18.18 (Zen API отдаёт 429 для чужих UA; headers провайдера фильтруются, user-agent зарезервирован). Правка слетит при bun update. Провайдер Zen: llm-pi-ai.providers.opencode, apiKeyEnv OPENCODE_API_KEY, baseURL opencode.ai/zen/v1 (встроенный каталог pi-ai).

## Noctalia ↔ Hyprland (2026-11-14)
- Бордеры Hyprland теперь из шаблона `hyprland` noctalia: в конец hyprland.lua добавлен `require("noctalia").apply_theme()` — Hyprland сам reload'ит файлы, загруженные через require() (inotify), смена обоев = живой цвет бордера без rebuild.
- Шаблон рендерит ~/.config/hypr/noctalia.lua (обычный файл, не store). Не рендерит decoration.
- Kitty-шаблон: полный ANSI + SIGUSR1 → мгновенно. В programs.kitty.extraConfig добавлен `include themes/noctalia.conf` (extraConfig идёт ПОСЛЕ settings в kitty.conf → перекрывает цвета HM; apply.sh идемпотентен, при наличии строки store-файл не трогает).
- Starship переведён на live-файл: programs.starship.settings удалён (HM не генерит starship.toml при settings={} + presets=[]), seed-активация home.activation.starshipSeed в home/kasiro/shell/starship.nix: симлинк→конвертирует в обычный файл, отсутствующий→seит из pkgs.writeText, обычный файл→не трогает. ~/.config/starship.toml теперь ВНЕ HM — править конфиг starship через nix больше нельзя (чтобы вернуть — убрать активацию + вернуть settings).

## lightpanda MCP — исправление
- [2026-09-20] Ошибка "connection closed -32000" — проблема stdio/opencode, не бинарника. Фикс: увеличить timeout до 120000, проверить permission для агента.
