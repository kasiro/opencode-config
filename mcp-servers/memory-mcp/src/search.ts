import { homedir } from "node:os";
import { Database } from "bun:sqlite";
import { reconcileMemory } from "./reconcile.js";

const MEMORY_ROOT = `${homedir()}/.local/share/opencode/memory`;
const DB_PATH = `${MEMORY_ROOT}/memory.db`;

interface SearchResult {
  path: string;
  scope: string;
  scope_id: string;
  type: string;
  content: string;
  score: number;
}

interface SearchResults {
  query: string;
  results: SearchResult[];
  total: number;
}

/**
 * Преобразует пользовательский запрос в FTS5 MATCH.
 * Как в MiMo Code: извлекаем unicode-токены, обрамляем кавычками, склеиваем через OR.
 */
function buildFtsQuery(raw: string): string | null {
  // Извлекаем unicode-буквы, цифры, подчёркивания (как в MiMo Code)
  const tokens = raw.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens || tokens.length === 0) return null;
  // Обрамляем кавычками для защиты от спецсимволов FTS5
  const quoted = tokens.map(t => `"${t}"`);
  return quoted.join(" OR ");
}

export async function searchMemory(
  query: string,
  project?: string,
  limit: number = 20,
): Promise<SearchResults> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) {
    return { query, results: [], total: 0 };
  }

  const db = new Database(DB_PATH);

  // Авто-реконсилиация: проверяем что все .md файлы проиндексированы
  try {
    await reconcileMemory();
  } catch (e) {
    console.error("[memory-mcp] reconcile failed before search:", e);
  }

  try {
    // Проверяем есть ли FTS5 таблица
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'",
    ).get();

    if (!tableExists) {
      return { query, results: [], total: 0 };
    }

    // MiMo-Code style: возвращаем path + полный body вместо snippet
    const sql = `
      SELECT 
        path,
        scope,
        scope_id,
        type,
        body,
        rank
      FROM memory_fts
      WHERE body MATCH ?
      ORDER BY rank
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(ftsQuery, limit + 50) as any[];

    if (rows.length === 0) {
      return { query, results: [], total: 0 };
    }

    // Score floor: отсекаем ниже 0.15 от top hit (как в MiMo Code)
    const topRank = rows[0].rank;
    const threshold = Math.abs(topRank) * 0.15;

    const results: SearchResult[] = [];
    for (const row of rows) {
      // Нормализованный score: 1.0 для best, падает к 0
      const score =
        topRank !== 0
          ? Math.max(0, 1 - (row.rank - topRank) / Math.abs(topRank))
          : 1.0;

      if (score < 0.15) continue; // score floor

      results.push({
        path: row.path,
        scope: row.scope,
        scope_id: row.scope_id,
        type: row.type,
        content: row.body,
        score: Math.round(score * 1000) / 1000,
      });

      if (results.length >= limit) break;
    }

    return {
      query,
      results,
      total: results.length,
    };
  } finally {
    db.close();
  }
}
