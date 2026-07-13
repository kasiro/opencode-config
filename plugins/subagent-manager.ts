/**
 * Плагин subagent-manager для OpenCode.
 *
 * Предоставляет инструменты:
 * - get_subagents_in_background — просмотр активных фоновых сабагентов через прямой SQLite
 * - stop_subagent — graceful shutdown сабагента по ID сессии
 *
 * Особенности:
 * - Не использует client.session.status() — SQLite как основной источник
 * - Фильтр: parent_id IS NOT NULL (только дочерние сессии)
 * - Фильтр: time_updated > 30 секунд назад (только живые)
 * - stop_subagent не удаляет сессию, только отправляет сигнал отмены
 */

import { type Plugin, tool } from "@opencode-ai/plugin";
import { homedir } from "node:os";

const DB = `${homedir()}/.local/share/opencode/opencode.db`;

export default (async ({ $, client }) => {
  const sh = $;

  return {
    tool: {
      get_subagents_in_background: tool({
        description: "Список запущенных в фоне сабагентов (только активные, running)",
        args: {},
        async execute() {
          const r = await sh`sqlite3 -json ${DB} "
            SELECT
              id,
              agent,
              title,
              parent_id,
              datetime(time_updated/1000, 'unixepoch', 'localtime') as updated,
              tokens_input,
              tokens_output
            FROM session
            WHERE parent_id = (
                SELECT id FROM session 
                WHERE parent_id IS NULL 
                ORDER BY time_updated DESC 
                LIMIT 1
              )
              AND time_updated > (unixepoch('now','-30 seconds') * 1000)
            ORDER BY time_updated DESC
          "`.quiet().nothrow();

          const rows = r.stdout?.toString().trim();

          if (!rows || rows === "[]") {
            return "Нет запущенных фоновых сабагентов.";
          }

          const data = JSON.parse(rows);
          let result = `📋 Фоновые сабагенты (запущены сейчас):\n\n`;

          for (const row of data) {
            result += `🔹 ${row.agent} — ${row.title}\n`;
            result += `   ID: ${row.id}\n`;
            result += `   Обновлён: ${row.updated}\n`;
            result += `   Токены: ${row.tokens_input} in / ${row.tokens_output} out\n\n`;
          }

          result += `Всего активных: ${data.length}`;
          return result;
        },
      }),

      stop_subagent: tool({
        description: "Завершить фонового сабагента по ID сессии (graceful shutdown, без удаления)",
        args: {
          task_id: tool.schema.string().describe("ID сессии сабагента (ses_...)"),
        },
        async execute(args) {
          if (!args.task_id || !args.task_id.startsWith("ses_")) {
            return "Ошибка: task_id должен быть ID сессии вида ses_...";
          }

          try {
            // Проверяем что это действительно сабагент (есть parent_id)
            const check = await sh`sqlite3 -json ${DB} "
              SELECT id, agent, title
              FROM session
              WHERE id = '${args.task_id.replace(/'/g, "''")}'
                AND parent_id IS NOT NULL
            "`.quiet().nothrow();

            const checkData = check.stdout?.toString().trim();
            if (!checkData || checkData === "[]") {
              return `Сессия ${args.task_id} не найдена или не является фоновым сабагентом.`;
            }

            const info = JSON.parse(checkData)[0];

            // Graceful shutdown через Plugin API — кооперативный сигнал отмены
            await client.session.abort({ path: { id: args.task_id } });

            // Обновляем time_updated, чтобы сабагент исчез из списка активных
            await sh`sqlite3 ${DB} "UPDATE session SET time_updated = 0 WHERE id = '${args.task_id.replace(/'/g, "''")}'"`.quiet().nothrow();

            return `✅ Сабагент ${info.agent} (${args.task_id}) завершён.\n   Заголовок: ${info.title}\n   Сессия сохранена, данные не удалены.`;
          } catch (e) {
            void client.app.log({
              body: { service: "subagent-manager", level: "error", message: String(e) }
            });
            return `Ошибка при завершении: ${String(e)}`;
          }
        },
      }),
    },
  };
}) satisfies Plugin;
