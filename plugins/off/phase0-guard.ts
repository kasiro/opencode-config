/**
 * phase0-guard — Static Pre-flight Plugin
 *
 * Механический барьер на уровне до LLM.
 * При старте читает deny-правила через client.app.agents() (официальный API),
 * в config хуке модифицирует cfg.agent[name].tools для каждого агента.
 * OpenCode сам не отправляет модели инструменты с tools[name] = false.
 *
 * Агент не видит запрещённый инструмент → не вызывает → не тратит шаг.
 */

import { type Plugin } from "@opencode-ai/plugin";

const AGENTS_CACHE_TTL = 30_000; // 30 секунд

export default (async ({ client }) => {
  let agentsCache: any[] | null = null;
  let agentsCacheTime = 0;

  async function loadAgents(): Promise<any[]> {
    const now = Date.now();
    if (agentsCache && now - agentsCacheTime < AGENTS_CACHE_TTL) {
      return agentsCache;
    }
    try {
      const result = await client.app.agents();
      agentsCache = result.data;
      agentsCacheTime = now;
      return result.data;
    } catch (e) {
      void client.app.log({
        body: { service: "phase0-guard", level: "error", message: `agents API: ${e}` },
      });
      return agentsCache || [];
    }
  }

  // Initial load — гарантирует что данные готовы до config хука
  let agents = await loadAgents();

  // Periodic refresh
  const timer = setInterval(async () => {
    agents = await loadAgents();
  }, AGENTS_CACHE_TTL);

  return {
    config: (cfg) => {
      if (!agents || agents.length === 0) return;

      const agentConfigs = cfg.agent;
      if (!agentConfigs) return;

      for (const [agentName, agentCfg] of Object.entries(agentConfigs)) {
        const apiAgent = agents.find((a: any) => a.name === agentName);
        if (!apiAgent) continue;

        const denyNames = new Set<string>();

        // 1. Из permission: edit: "deny" → tools.edit = false
        if (apiAgent.permission) {
          for (const [key, rule] of Object.entries(apiAgent.permission)) {
            if (rule === "deny") denyNames.add(key);
            else if (typeof rule === "object" && rule !== null) {
              for (const [pat, action] of Object.entries(rule)) {
                if (action === "deny") denyNames.add(pat);
              }
            }
          }
        }

        // 2. Из tools: { "edit": false } — уже есть, но на всякий случай проверяем
        if (apiAgent.tools) {
          for (const [key, val] of Object.entries(apiAgent.tools)) {
            if (val === false) denyNames.add(key);
          }
        }

        if (denyNames.size === 0) continue;

        // Применяем к конфигу
        const currentTools: Record<string, boolean> = (agentCfg as any).tools || {};
        let modified = false;

        for (const name of denyNames) {
          if (currentTools[name] !== false) {
            currentTools[name] = false;
            modified = true;
          }
        }

        if (modified) {
          (agentCfg as any).tools = currentTools;
        }
      }
    },

    dispose: async () => {
      clearInterval(timer);
    },
  };
}) satisfies Plugin;
