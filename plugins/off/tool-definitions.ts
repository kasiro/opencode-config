/**
 * tool-definitions — Модификация описаний инструментов для LLM
 *
 * Prevention-уровень: агент знает ограничения ДО вызова инструмента.
 * tool.definition хук меняет описание bash, добавляя список
 * доступных и запрещённых команд.
 */

import { type Plugin } from "@opencode-ai/plugin";

export default (async () => {
  return {
    "tool.definition": async (input, output) => {
      if (input.toolID === "bash") {
        output.description =
          "Execute shell commands in a restricted environment.\n\n"
          + "ДОСТУПНЫЕ КОМАНДЫ:\n"
          + "  fd, rg, bun, bunx — быстрые аналоги find, grep, npm, npx\n"
          + "  ls, cat, echo, pwd, curl, mkdir, rm (осторожно), cp, mv, cd\n"
          + "  head, tail, wc, sort, uniq, tee, xargs, printf, test\n"
          + "  git, docker, doas, chmod, chown\n"
          + "  ps, df, du, free, uname, whoami, id, uptime\n"
          + "  python3, node, nvim\n\n"
          + "ЗАПРЕЩЕНЫ И БУДУТ ЗАБЛОКИРОВАНЫ:\n"
          + "  find → используй fd\n"
          + "  grep → используй rg (ripgrep)\n"
          + "  npm  → используй bun\n"
          + "  npx  → используй bunx\n"
          + "  glob → используй fd";
      }
    },
  };
}) satisfies Plugin;
