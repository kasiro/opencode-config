/**
 * Memory MCP Server — точка входа.
 * Запускает MCP сервер, который предоставляет инструменты
 * для индексации, поиска и управления памятью проекта.
 */

import { startServer } from './server.js';

await startServer();
