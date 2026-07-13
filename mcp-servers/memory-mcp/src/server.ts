/**
 * MCP Сервер памяти — предоставляет FTS5-поиск по memory-файлам.
 *
 * Tools:
 *  search — полнотекстовый поиск (BM25) по MEMORY.md и другим .md файлам
 *  Возвращает path + полный content файла, не snippet
 *
 * Resources:
 *   memory://<rel-path> — чтение файлов памяти
 *
 * Resource Templates:
 *   memory://{scope}/{path} — шаблон доступа по scope (global, projects/<id>, sessions/<id>)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { reconcileMemory } from "./reconcile.js";
import { searchMemory } from "./search.js";
import { listMemoryPaths } from "./paths.js";

const MEMORY_ROOT = `${homedir()}/.local/share/opencode/memory`;

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "memory-mcp", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } },
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description: `Full-text search over project memory files (MEMORY.md).
Используется для поиска по сохранённым правилам, архитектурным решениям, паттернам.
Поиск: FTS5 with BM25 ranking, query tokens combined with OR.
Результат: path, scope, content (full), score.

Примеры запросов:
- "always use doas instead of sudo" — найдёт правила безопасности
- "project architecture decision" — найдёт архитектурные решения
- "error handling pattern" — найдёт паттерны обработки ошибок`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Поисковый запрос (plain text, авто-токенизация в FTS5)",
          },
          limit: {
            type: "number",
            description: "Максимум результатов (по умолчанию 20)",
            default: 20,
          },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search": {
        const query = String(args?.query ?? "");
        if (!query.trim()) {
          throw new McpError(ErrorCode.InvalidParams, "query is required");
        }
        const limit = Number(args?.limit ?? 20);
        const results = await searchMemory(query, undefined, limit);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(ErrorCode.InternalError, String(error));
  }
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const paths = await listMemoryPaths();
  const resources = paths.entries
    .filter((e) => e.type === "file")
    .map((e) => ({
      uri: `memory://${e.rel}`,
      name: e.rel,
      description: `Memory file: ${e.rel}`,
      mimeType: "text/markdown",
    }));
  return { resources };
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [
    {
      uriTemplate: "memory://{scope}/{path}",
      name: "Memory files by scope",
      description:
        "Доступ к файлам памяти по scope (global, projects/<id>, sessions/<id>)",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  // memory://global/MEMORY.md → global/MEMORY.md
  // memory://projects/<hash>/MEMORY.md → projects/<hash>/MEMORY.md
  if (!uri.startsWith("memory://")) {
    throw new McpError(ErrorCode.InvalidRequest, `Invalid URI: ${uri}`);
  }

  const relPath = uri.slice("memory://".length);

  // Security: path traversal check
  const resolved = join(MEMORY_ROOT, relPath);
  if (!resolved.startsWith(MEMORY_ROOT)) {
    throw new McpError(ErrorCode.InvalidRequest, "Path traversal denied");
  }

  try {
    const content = await readFile(resolved, "utf-8");
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Cannot read file: ${relPath}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

export async function startServer() {
  // При старте запускаем reconcile (сканирование .md файлов в FTS5)
  try {
    const result = await reconcileMemory();
    console.error(
      `[memory-mcp] Reconcile: ${result.indexed} indexed, ${result.pruned} pruned, db: ${result.total} bytes`,
    );
  } catch (error) {
    console.error(`[memory-mcp] Reconcile error:`, String(error));
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[memory-mcp] Server started via stdio");
}
