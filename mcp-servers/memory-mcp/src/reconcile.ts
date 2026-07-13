import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import { Database } from "bun:sqlite";

const MEMORY_ROOT = `${homedir()}/.local/share/opencode/memory`;
const DB_PATH = `${MEMORY_ROOT}/memory.db`;

// FTS5 схема как в MiMo Code: path, scope, scope_id, type, body, fingerprint
const SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    path UNINDEXED,
    scope UNINDEXED,
    scope_id UNINDEXED,
    type UNINDEXED,
    body,
    fingerprint UNINDEXED,
    tokenize='unicode61 remove_diacritics 2'
  )
`;

interface ReconcileResult {
  indexed: number;
  pruned: number;
  total: number;
}

function extractType(filename: string): string {
  const name = filename.replace(/\.md$/i, "");
  if (name === "MEMORY" || name.startsWith("MEMORY-")) return "memory";
  return "free";
}

function detectScope(relPath: string): { scope: string; scope_id: string } {
  const parts = relPath.split("/").filter(Boolean);
  // memory/global/MEMORY.md → scope=global, scope_id=""
  // memory/projects/<hash>/MEMORY.md → scope=projects, scope_id=<hash>
  if (parts[0] === "global") return { scope: "global", scope_id: "" };
  if (parts[0] === "projects" && parts[1]) return { scope: "projects", scope_id: parts[1] };
  if (parts[0] === "sessions" && parts[1]) return { scope: "sessions", scope_id: parts[1] };
  return { scope: "unknown", scope_id: relPath };
}

export async function reconcileMemory(): Promise<ReconcileResult> {
  // Убедимся что memory директория существует
  await Bun.write(`${MEMORY_ROOT}/.keep`, "").catch(() => {});

  const db = new Database(DB_PATH);
  db.run(SCHEMA);

  // Собираем все .md файлы рекурсивно
  const mdFiles: string[] = [];

  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.name.endsWith(".md")) {
          mdFiles.push(full);
        }
      }
    } catch {}
  }

  // Создаём базовые директории если нет
  await Bun.write(`${MEMORY_ROOT}/global/.keep`, "").catch(() => {});
  await Bun.write(`${MEMORY_ROOT}/projects/.keep`, "").catch(() => {});

  await walk(MEMORY_ROOT);

  let indexed = 0;
  let pruned = 0;

  // Собираем fingerprint'ы проиндексированных файлов
  const existing = new Map<string, string>();
  const rows = db.prepare("SELECT path, fingerprint FROM memory_fts").all() as { path: string; fingerprint: string }[];
  for (const row of rows) {
    existing.set(row.path, row.fingerprint);
  }

  // Индексируем только изменившиеся файлы
  const upsert = db.prepare(`
    INSERT INTO memory_fts (path, scope, scope_id, type, body, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const file of mdFiles) {
    const relPath = relative(MEMORY_ROOT, file);
    const stats = await stat(file);
    const fp = `${stats.size}-${stats.mtimeMs}`;

    if (existing.get(relPath) === fp) continue; // не изменился

    const content = await readFile(file, "utf-8");
    const { scope, scope_id } = detectScope(relPath);
    const type = extractType(file);

    // Удаляем старую запись если была
    db.prepare("DELETE FROM memory_fts WHERE path = ?").run(relPath);

    upsert.run(relPath, scope, scope_id, type, content, fp);
    indexed++;
  }

  // Prune: удаляем записи, которых нет на диске
  const onDisk = new Set(mdFiles.map(f => relative(MEMORY_ROOT, f)));
  for (const [path] of existing) {
    if (!onDisk.has(path)) {
      db.prepare("DELETE FROM memory_fts WHERE path = ?").run(path);
      pruned++;
    }
  }

  // Оптимизируем индекс
  db.run("INSERT INTO memory_fts(memory_fts) VALUES('optimize')");

  db.close();

  const total = (await stat(DB_PATH)).size;

  return { indexed, pruned, total };
}
