/**
 * recall — Поиск по истории сессий OpenCode
 */

import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "recall",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      // ── общие помощники (recall_search / recall_read) ────────────────────
      const MAX_CONTEXT_SCANS = 50 // сколько сессий разрешено читать за один вызов
      const SNIPPET_RADIUS = 100 // символов до/после совпадения в сниппете
      const MAX_MESSAGE_CHARS = 2000 // предел текста одного сообщения в recall_read

      // ctx.session.context() возвращает массив сообщений; обёртки понимаем на всякий случай.
      const normalizeMessages = (raw: any): any[] => {
        if (Array.isArray(raw)) return raw
        if (Array.isArray(raw?.messages)) return raw.messages
        if (Array.isArray(raw?.data)) return raw.data
        if (Array.isArray(raw?.data?.messages)) return raw.data.messages
        return []
      }

      // Роль сообщения: в v2 это поле type ("user"/"assistant"/"system"/...), старый вид — role.
      const messageRole = (m: any): string => {
        const role = m?.role ?? m?.type
        return role ? String(role) : "unknown"
      }

      // Текст сообщения: v2 — text / content[] (text, reasoning), shell — command+output,
      // compaction — summary; legacy — content строкой или parts[].
      const messageText = (m: any): string => {
        if (!m) return ""
        if (typeof m.text === "string" && m.text) return m.text
        if (typeof m.summary === "string" && m.summary) return m.summary
        if (typeof m.command === "string") {
          const out = m?.output?.output
          return typeof out === "string" ? `${m.command}\n${out}` : m.command
        }
        if (typeof m.content === "string") return m.content
        const parts: any[] = Array.isArray(m.content)
          ? m.content
          : Array.isArray(m.parts)
            ? m.parts
            : []
        const chunks: string[] = []
        for (const p of parts) {
          if (!p) continue
          if (typeof p === "string") {
            chunks.push(p)
            continue
          }
          if (typeof p.text === "string" && p.text) chunks.push(p.text)
        }
        return chunks.join("\n")
      }

      // Контекст сессии: актуальный ключ API — sessionID, старый вызов использовал session_id.
      const loadMessages = async (sessionID: string): Promise<any[]> => {
        let lastError: unknown
        for (const input of [{ sessionID }, { session_id: sessionID }]) {
          try {
            const raw = await ctx.session.context(input as any)
            return normalizeMessages(raw)
          } catch (e) {
            lastError = e
          }
        }
        throw lastError ?? new Error("контекст сессии недоступен")
      }

      // Фрагмент вокруг первого совпадения, ~SNIPPET_RADIUS символов с каждой стороны.
      const makeSnippet = (text: string, needle: string): string => {
        const at = text.toLowerCase().indexOf(needle)
        if (at < 0) return ""
        const from = Math.max(0, at - SNIPPET_RADIUS)
        const to = Math.min(text.length, at + needle.length + SNIPPET_RADIUS)
        let out = text.slice(from, to).replace(/\s+/g, " ").trim()
        if (from > 0) out = `…${out}`
        if (to < text.length) out = `${out}…`
        return out
      }

      // recall_search
      editor.add({
        name: "recall_search",
        description:
          "Поиск по истории сессий: заголовок, агент и содержимое сообщений. " +
          "Приоритет 1 — совпадение в заголовке (без чтения сообщений). " +
          "Приоритет 2 — подстрока без учёта регистра в тексте сообщений (user/assistant/system и др.), " +
          "в результат прилагается сниппет, роль и номер сообщения. " +
          "Ограничения: только сессии текущей директории (до 100 последних), " +
          "контекст читается не более чем у 50 сессий за вызов.",
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

          const needle = String(query ?? "").toLowerCase()
          if (!needle) {
            return { content: "❌ Пустой поисковый запрос" }
          }
          const maxResults = Math.max(1, Math.floor(Number(limit) || 10))

          try {
            const sessions = await ctx.session.list({
              directory: ctx.location.directory,
              limit: 100,
            })

            const candidates = (sessions.data || []).filter(
              (s) => !agent || s.agent === agent,
            )

            type Hit = {
              session: any
              via: "title" | "content"
              snippet?: string
              role?: string
              index?: number
            }

            const results: Hit[] = []
            const byTitle = new Set<string>()

            // Приоритет 1: заголовок — сообщения не читаем.
            for (const s of candidates) {
              if (results.length >= maxResults) break
              if ((s.title || "").toLowerCase().includes(needle)) {
                results.push({ session: s, via: "title" })
                byTitle.add(s.id)
              }
            }

            // Приоритет 2: содержимое сообщений, с потолком на число чтений.
            let scanned = 0
            let failed = 0
            for (const s of candidates) {
              if (results.length >= maxResults) break
              if (byTitle.has(s.id)) continue
              if (scanned >= MAX_CONTEXT_SCANS) break
              scanned++
              try {
                const messages = await loadMessages(s.id)
                for (let i = 0; i < messages.length; i++) {
                  const text = messageText(messages[i])
                  if (!text || !text.toLowerCase().includes(needle)) continue
                  results.push({
                    session: s,
                    via: "content",
                    snippet: makeSnippet(text, needle),
                    role: messageRole(messages[i]),
                    index: i + 1,
                  })
                  break
                }
              } catch {
                failed++ // сессия удалена / контекст недоступен — поиск продолжаем
              }
            }

            const scanCapped = scanned >= MAX_CONTEXT_SCANS && results.length < maxResults
            const viewed = byTitle.size + scanned

            if (results.length === 0) {
              let empty = `🔍 Ничего не найдено по запросу "${query}"`
              empty += `\nПросмотрено сессий: ${viewed} из ${candidates.length}`
              if (scanCapped) empty += ` (лимит чтения контекста: ${MAX_CONTEXT_SCANS})`
              if (failed > 0) empty += `\n⚠️ Пропущено из-за ошибок чтения: ${failed}`
              return { content: empty }
            }

            let output = `📋 Найдено сессий: ${results.length}\n`
            if (scanCapped) {
              output += `⚠️ Просмотрено ${viewed} сессий из ${candidates.length} (лимит чтения контекста: ${MAX_CONTEXT_SCANS})\n`
            }
            output += `\n`

            for (const hit of results) {
              const s = hit.session
              output += `🔹 ${s.agent} — ${s.title}\n`
              output += `   ID: ${s.id}\n`
              if (s.time?.created) {
                output += `   Создана: ${new Date(s.time.created).toLocaleString("ru-RU")}\n`
              }
              if (hit.via === "content") {
                output += `   Совпадение: [${hit.role} #${hit.index}] ${hit.snippet}\n`
              } else {
                output += `   Совпадение: заголовок\n`
              }
              output += `\n`
            }

            if (failed > 0) {
              output += `⚠️ Пропущено из-за ошибок чтения: ${failed}\n`
            }

            return { content: output }
          } catch (e) {
            return {
              content: `❌ Ошибка поиска: ${String(e)}`,
              isError: true,
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
        description:
          "Прочитать сообщения конкретной сессии по её ID. " +
          "Роль берётся из поля type (user/assistant/system, а также tool/shell/compaction), " +
          "текст — из text / content[] (для shell: command+output, для compaction: summary). " +
          "Сообщения нумеруются исходными индексами сессии (1-based) — по ним сопоставляется recall_search. " +
          "limit — последние N сообщений; role — фильтр по роли (только user/assistant/system). " +
          "Ограничения: одно сообщение обрезается до 2000 символов, сообщения без текста " +
          "показываются как «(без текста)», доступ только к сессиям текущей директории.",
        input: {
          type: "object",
          properties: {
            session_id: { type: "string", description: "ID сессии (например, ses_abc123)" },
            limit: { type: "number", description: "Последние N сообщений (по умолчанию все)" },
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

          if (!session_id) {
            return { content: "❌ Не указан session_id" }
          }

          try {
            const messages = await loadMessages(session_id)

            // Индексы 1-based сохраняем исходные — чтобы номера совпадали с recall_search.
            const indexed = messages.map((m, i) => ({ m, index: i + 1 }))
            const matched = role
              ? indexed.filter((x) => messageRole(x.m) === role)
              : indexed

            const wanted = Number(limit)
            const hasLimit = Number.isFinite(wanted) && wanted > 0
            const shown = hasLimit ? matched.slice(-Math.floor(wanted)) : matched

            if (shown.length === 0) {
              let empty = `📭 Нет сообщений`
              empty += role ? ` с ролью ${role}` : ""
              empty += ` в сессии ${session_id}`
              empty += `\nВсего сообщений в сессии: ${messages.length}`
              return { content: empty }
            }

            let output = `📖 Сессия: ${session_id}\n`
            output += `Показано сообщений: ${shown.length} из ${matched.length}`
            if (role) output += ` (фильтр по роли: ${role})`
            output += `, всего в сессии: ${messages.length}`
            if (hasLimit) output += ` — последние ${shown.length}`
            output += `\n\n`

            for (const { m, index } of shown) {
              const msgRole = messageRole(m)
              const text = messageText(m).trim()
              if (!text) {
                output += `[${msgRole} #${index}] (без текста)\n---\n`
                continue
              }
              const body =
                text.length > MAX_MESSAGE_CHARS
                  ? `${text.slice(0, MAX_MESSAGE_CHARS)}… (обрезано, всего ${text.length} символов)`
                  : text
              output += `[${msgRole} #${index}] ${body}\n---\n`
            }

            return { content: output }
          } catch (e) {
            return {
              content: `❌ Ошибка чтения: ${String(e)}`,
              isError: true,
            }
          }
        },
      })
    })
    
    console.log(`✅ recall plugin loaded — поиск по сессиям OpenCode`)
  },
})
