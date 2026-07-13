import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";

const MEMORY_ROOT = `${homedir()}/.local/share/opencode/memory`;

interface PathEntry {
  path: string;
  rel: string;
  type: "file" | "dir";
  size?: number;
}

export async function listMemoryPaths(): Promise<{
  root: string;
  entries: PathEntry[];
}> {
  const entries: PathEntry[] = [];

  async function walk(dir: string) {
    try {
      const items = await readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const full = join(dir, item.name);
        const rel = relative(MEMORY_ROOT, full);

        if (item.isDirectory()) {
          entries.push({ path: full, type: "dir", rel });
          await walk(full);
        } else {
          const s = await stat(full);
          entries.push({ path: full, type: "file", rel, size: s.size });
        }
      }
    } catch {}
  }

  await walk(MEMORY_ROOT);
  return { root: MEMORY_ROOT, entries };
}
