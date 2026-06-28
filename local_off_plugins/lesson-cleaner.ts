import { type Plugin, tool } from "@opencode-ai/plugin";

const LESSONS_FILE = "/home/kasiro/data/state_store.db/mem%3Alessons.bin";

export default (async ({ $, client }) => {
  return {
    tool: {
      memory_lesson_delete: tool({
        description: "Удалить lessons из agentmemory по ID или по query",
        args: {
          lessonIds: tool.schema.string().optional().describe("IDs уроков через запятую"),
          query: tool.schema.string().optional().describe("Удалить все lessons, содержащие текст"),
        },

        async execute(args: { lessonIds?: string; query?: string }) {
          try {
            // Read current lessons file
            const raw = await $`cat ${LESSONS_FILE}`.quiet().nothrow();
            if (!raw.stdout || raw.stdout.length === 0) {
              return "Файл lessons пуст или не найден";
            }

            const content = raw.stdout.toString();
            // Find JSON end (before binary tail)
            const jsonEnd = content.lastIndexOf("}}");
            if (jsonEnd === -1) return "Некорректный формат lessons файла";

            const jsonStr = content.substring(0, jsonEnd + 2);
            const data = JSON.parse(jsonStr);
            const totalBefore = Object.keys(data).length;

            // Determine which keys to delete
            let keysToDelete: string[] = [];

            if (args.lessonIds) {
              keysToDelete = args.lessonIds.split(",").map((s: string) => s.trim()).filter(Boolean);
            } else if (args.query) {
              const q = args.query.toLowerCase();
              for (const [key, lesson] of Object.entries(data)) {
                const s = JSON.stringify(lesson).toLowerCase();
                if (s.includes(q)) keysToDelete.push(key);
              }
            }

            if (keysToDelete.length === 0) return "Нет lessons для удаления.";

            // Delete keys
            for (const key of keysToDelete) {
              delete (data as Record<string, unknown>)[key];
            }

            const deletedCount = totalBefore - Object.keys(data).length;
            const newJson = JSON.stringify(data, null as unknown as undefined, undefined as unknown as undefined) as unknown as string;

            // Get binary tail from original
            const binTail = content.substring(jsonEnd + 2);

            // Write back using python to preserve encoding
            const pyScript = `
import json, sys
data = json.loads("""${newJson.replace(/"/g, '\\"')}""")
with open("${LESSONS_FILE}", "wb") as f:
    f.write(json.dumps(data, ensure_ascii=False, separators=(",",":")).encode("utf-8"))
    f.write(${JSON.stringify(binTail)})
print("OK:" + str(len(data)))
`;
            const writeResult = await $`python3 -c ${pyScript}`.quiet().nothrow();
            void client.app.log({
              body: { service: "lesson-cleaner", level: "info", message: `Deleted ${deletedCount} lessons` },
            });

            return `Удалено ${deletedCount} lessons. Осталось: ${Object.keys(data).length}`;
          } catch (e) {
            void client.app.log({
              body: { service: "lesson-cleaner", level: "error", message: String(e) },
            });
            return `Ошибка: ${String(e)}`;
          }
        },
      }),
    },
  };
}) satisfies Plugin;
