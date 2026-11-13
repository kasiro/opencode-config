/**
 * recall — Поиск по истории сессий OpenCode
 */

import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "recall",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      // recall_search
      editor.add({
        name: "recall_search",
        description: "Поиск по истории сессий (заголовки, агенты, содержимое)",
        input: {
          type: "object",
          properties: {
            query: { type: "string", description: "Поисковый запрос" },
            limit: { type: "number", description: "Максимум результатов" },
            agent: { type: "string", description: "Фильтр по агенту (опционально)" },
          },
          required: ["query"],
          additionalProperties: false,
        },
        async execute(input, context) {
          const { query, limit = 10, agent } = input as { 
            query: string
            limit?: number
            agent?: string
          }
          
          try {
            const sessions = await ctx.session.list({ 
              directory: ctx.location.directory,
              limit: 100 
            })
            
            const results = (sessions.data || [])
              .filter(s => {
                const matchQuery = s.title?.toLowerCase().includes(query.toLowerCase()) ||
                                   s.agent?.toLowerCase().includes(query.toLowerCase())
                const matchAgent = !agent || s.agent === agent
                return matchQuery && matchAgent
              })
              .slice(0, limit)
            
            if (results.length === 0) {
              return { content: `🔍 Ничего не найдено по запросу "${query}"` }
            }
            
            let output = `📋 Найдено сессий: ${results.length}\n\n`
            for (const s of results) {
              output += `🔹 ${s.agent} — ${s.title}\n`
              output += `   ID: ${s.id}\n`
              if (s.time?.created) {
                output += `   Создана: ${new Date(s.time.created).toLocaleString("ru-RU")}\n`
              }
              output += `\n`
            }
            
            return { content: output }
          } catch (e) {
            return { 
              content: `❌ Ошибка поиска: ${String(e)}`,
              isError: true 
            }
          }
        },
      })
      
      // recall_list
      editor.add({
        name: "recall_list",
        description: "Список последних сессий в текущей директории",
        input: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Максимум результатов" },
            includeChildren: { type: "boolean", description: "Включая дочерние сессии" },
          },
          additionalProperties: false,
        },
        async execute(input, context) {
          const { limit = 10, includeChildren = false } = input as {
            limit?: number
            includeChildren?: boolean
          }
          
          const sessions = await ctx.session.list({
            directory: ctx.location.directory,
            limit,
          })
          
          if (!sessions.data || sessions.data.length === 0) {
            return { content: "📭 Нет сессий в этой директории" }
          }
          
          let output = `📋 Последние сессии (${sessions.data.length}):\n\n`
          for (const s of sessions.data) {
            if (!includeChildren && s.parentID) continue
            output += `🔹 ${s.agent} — ${s.title}\n`
            output += `   ID: ${s.id}`
            if (s.parentID) output += ` (parent: ${s.parentID})`
            output += `\n`
          }
          
          return { content: output }
        },
      })
      
      // recall_read
      editor.add({
        name: "recall_read",
        description: "Прочитать сообщения из конкретной сессии",
        input: {
          type: "object",
          properties: {
            session_id: { type: "string", description: "ID сессии (например, ses_abc123)" },
            limit: { type: "number", description: "Максимум сообщений (по умолчанию все)" },
            role: { type: "string", description: "Фильтр по роли: user/assistant/system", enum: ["user", "assistant", "system"] },
          },
          required: ["session_id"],
          additionalProperties: false,
        },
        async execute(input, context) {
          const { session_id, limit, role } = input as {
            session_id: string
            limit?: number
            role?: "user" | "assistant" | "system"
          }
          
          try {
            const context_data = await ctx.session.context({ session_id })
            const messages = context_data?.data?.messages || []
            const filtered = role ? messages.filter(m => m.role === role) : messages
            const limited = limit ? filtered.slice(-limit) : filtered
            
            if (limited.length === 0) {
              return { content: `📭 Нет сообщений в сессии ${session_id}` }
            }
            
            let output = `📖 Сессия: ${session_id}\n`
            output += `Сообщений: ${limited.length}`
            if (limit) output += ` (лимит: ${limit})`
            if (role) output += ` (роль: ${role})`
            output += `\n\n`
            
            for (const m of limited) {
              output += `[${m.role}] ${m.content?.substring(0, 200) || 'нет содержимого'}\n`
              output += `---\n`
            }
            
            return { content: output }
          } catch (e) {
            return { 
              content: `❌ Ошибка чтения: ${String(e)}`,
              isError: true 
            }
          }
        },
      })
    })
    
    console.log(`✅ recall plugin loaded — поиск по сессиям OpenCode`)
  },
})
