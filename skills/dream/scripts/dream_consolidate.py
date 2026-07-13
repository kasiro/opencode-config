#!/usr/bin/env python3
"""
dream_consolidate.py — Read-only trajectory analyzer for dream memory consolidation.

Reads opencode.db (read-only), analyzes sessions/messages/parts,
extracts patterns, decisions, and durable information.

Output: structured JSON with MEMORY.md sections ready for writing.

Usage:
  python3 dream_consolidate.py [--db PATH] [--days N] [--analyze-only] [--report] [--write]
  --db PATH        path to opencode.db (default: ~/.local/share/opencode/opencode.db)
  --days N         look back N days (default: 7)
  --analyze-only   only analyze, output raw analysis (for ANALYZE phase)
  --report         full report mode with MEMORY.md content (default)
  --memory-file    path to existing MEMORY.md (default: auto-detect from cwd)
  --write          write MEMORY.md via Bun.write() subprocess
"""

import json
import sqlite3
import sys
import os
from datetime import datetime, timezone
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_DB = os.path.expanduser("~/.local/share/opencode/opencode.db")

def connect_db(db_path):
    """Read-only connection to SQLite database."""
    if not os.path.isfile(db_path):
        print(f"ERROR: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn

def get_sessions(conn, days=7, limit=20):
    """Get recent sessions."""
    cutoff = int(datetime.now(timezone.utc).timestamp() * 1000) - days * 86400 * 1000
    cursor = conn.execute("""
        SELECT id, title, agent, model, directory, slug,
               tokens_input, tokens_output,
               datetime(time_created/1000, 'unixepoch') as created_ts,
               time_created
        FROM session
        WHERE time_created > ?
        ORDER BY time_created DESC
        LIMIT ?
    """, (cutoff, limit))
    return [dict(row) for row in cursor.fetchall()]

def get_messages_for_sessions(conn, session_ids):
    """Get messages for given session IDs."""
    if not session_ids:
        return []
    placeholders = ",".join("?" * len(session_ids))
    cursor = conn.execute(f"""
        SELECT id, session_id, time_created, data
        FROM message
        WHERE session_id IN ({placeholders})
        ORDER BY time_created ASC
    """, session_ids)
    return [dict(row) for row in cursor.fetchall()]

def get_parts_for_sessions(conn, session_ids):
    """Get parts (text, reasoning, tool-calls) for given session IDs."""
    if not session_ids:
        return []
    placeholders = ",".join("?" * len(session_ids))
    cursor = conn.execute(f"""
        SELECT id, message_id, session_id, time_created, data
        FROM part
        WHERE session_id IN ({placeholders})
        ORDER BY time_created ASC
    """, session_ids)
    return [dict(row) for row in cursor.fetchall()]

def get_model_switches(conn, session_ids):
    """Get model switch events for sessions."""
    if not session_ids:
        return []
    placeholders = ",".join("?" * len(session_ids))
    cursor = conn.execute(f"""
        SELECT session_id, type, time_created, data
        FROM session_message
        WHERE session_id IN ({placeholders}) AND type = 'model-switched'
        ORDER BY time_created ASC
    """, session_ids)
    return [dict(row) for row in cursor.fetchall()]

def extract_patterns(sessions, messages):
    """Extract recurring patterns from session data."""
    patterns = []
    model_usage = Counter()
    agent_usage = Counter()
    file_changes = Counter()
    error_topics = Counter()

    for s in sessions:
        if s.get("agent"):
            agent_usage[s["agent"]] += 1
        model_id = s.get("model")
        if model_id and isinstance(model_id, str):
            try:
                m = json.loads(model_id)
                if isinstance(m, dict) and "id" in m:
                    model_usage[m["id"]] += 1
            except json.JSONDecodeError:
                pass

    for m in messages:
        try:
            data = json.loads(m["data"]) if isinstance(m["data"], str) else m["data"]
        except (json.JSONDecodeError, TypeError):
            data = {}

        msg_text = data.get("message", "")
        if isinstance(msg_text, str) and len(msg_text) > 20:
            # Detect error mentions
            for keyword in ["error", "fail", "bug", "warning", "deprecated"]:
                if keyword in msg_text.lower():
                    error_topics[keyword] += 1

        # File changes
        summary = data.get("summary", {})
        if summary:
            files = summary.get("filesChanged", [])
            if isinstance(files, list):
                for f in files:
                    if isinstance(f, str):
                        ext = os.path.splitext(f)[1]
                        if ext:
                            file_changes[ext] += 1

    patterns = []
    if model_usage:
        patterns.append({
            "type": "pattern",
            "content": f"Model usage distribution: {dict(model_usage.most_common(5))}",
            "concepts": "models, usage-pattern",
            "confidence": 0.8 if len(model_usage) > 1 else 0.4
        })
    if agent_usage:
        patterns.append({
            "type": "pattern",
            "content": f"Agent usage: {dict(agent_usage.most_common(5))}",
            "concepts": "agents, delegation",
            "confidence": 0.8
        })
    if file_changes:
        patterns.append({
            "type": "pattern",
            "content": f"File type change frequency: {dict(file_changes.most_common(10))}",
            "concepts": "file-types, changes",
            "confidence": 0.7
        })
    if error_topics:
        patterns.append({
            "type": "pattern",
            "content": f"Error topic frequency: {dict(error_topics.most_common(5))}",
            "concepts": "errors, debugging",
            "confidence": 0.6
        })

    # Tool-specific patterns from session titles
    for s in sessions:
        title = s.get("title", "")
        title_lower = title.lower()
        # Session type detection from title
        if "bug" in title_lower or "fix" in title_lower or "error" in title_lower:
            patterns.append({
                "type": "pattern",
                "content": f"Debug/fix session: '{title[:60]}'",
                "concepts": "debugging, bug-fix",
                "confidence": 0.7
            })
        elif "refactor" in title_lower or "clean" in title_lower or "improve" in title_lower:
            patterns.append({
                "type": "pattern",
                "content": f"Refactoring session: '{title[:60]}'",
                "concepts": "refactoring, code-quality",
                "confidence": 0.7
            })
        elif "research" in title_lower or "search" in title_lower or "find" in title_lower or "look" in title_lower:
            patterns.append({
                "type": "pattern",
                "content": f"Research session: '{title[:60]}'",
                "concepts": "research, investigation",
                "confidence": 0.7
            })
        elif "test" in title_lower:
            patterns.append({
                "type": "pattern",
                "content": f"Testing session: '{title[:60]}'",
                "concepts": "testing, qa",
                "confidence": 0.7
            })

    return patterns

def extract_decisions(sessions, messages, model_switches):
    """Extract decisions made during sessions."""
    decisions = []

    for s in sessions:
        # Session with specific title and agent indicates a decision
        title = s.get("title", "").strip()
        if title and len(title) > 10 and s.get("agent"):
            decisions.append({
                "type": "decision",
                "content": f"Session '{title[:60]}' was performed by agent '{s.get('agent')}'",
                "concepts": "session, decision",
                "confidence": 0.5
            })
            break  # one per session is enough

    # Model switches indicate provider decisions
    for ms in model_switches:
        try:
            data = json.loads(ms["data"]) if isinstance(ms["data"], str) else ms["data"]
            model_info = data.get("model", {})
            if isinstance(model_info, dict) and "id" in model_info:
                decisions.append({
                    "type": "decision",
                    "content": f"Model switch: {model_info.get('id')} via {model_info.get('providerID', 'unknown')}",
                    "concepts": "model-selection, provider",
                    "confidence": 0.7
                })
        except (json.JSONDecodeError, TypeError):
            pass

    return decisions

def extract_lessons(sessions, messages):
    """Extract potential lessons from session activity."""
    lessons = []

    for s in sessions:
        title = s.get("title", "")
        tokens_in = s.get("tokens_input", 0) or 0
        tokens_out = s.get("tokens_output", 0) or 0

        if tokens_in + tokens_out > 500_000:
            lessons.append({
                "content": f"High token session ({tokens_in + tokens_out:,} tokens): {title[:60]}",
                "context": "token-usage",
                "confidence": 0.5,
                "tags": "token-heavy, performance"
            })

    # Count agent retries from messages
    agent_retry_count = 0
    for m in messages:
        try:
            data = json.loads(m["data"]) if isinstance(m["data"], str) else m["data"]
        except (json.JSONDecodeError, TypeError):
            data = {}
        if data.get("role") == "assistant" and "retry" in str(data.get("message", "")).lower():
            agent_retry_count += 1

    if agent_retry_count > 2:
        lessons.append({
            "content": f"Agent retry detected {agent_retry_count} times in analyzed sessions",
            "context": "agent-reliability",
            "confidence": 0.6,
            "tags": "retry, recovery"
        })

    return lessons


def get_tool_patterns(conn, session_ids):
    """Analyze tool call patterns from part data. Uses same JSON format as distill_analyze.py."""
    if not session_ids:
        return []

    placeholders = ",".join("?" * len(session_ids))
    cursor = conn.execute(f"""
        SELECT m.session_id, json_extract(p.data, '$.tool') as tool, count(*) as n
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE m.session_id IN ({placeholders})
          AND json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
        GROUP BY m.session_id, tool
        ORDER BY m.session_id, n DESC
    """, session_ids)

    rows = [dict(row) for row in cursor.fetchall()]

    # Group by session
    session_tools = defaultdict(list)
    for r in rows:
        tool = r["tool"]
        if tool and isinstance(tool, str) and tool not in {"read","rg","fd","ls","cat","head","tail","echo","pwd","cd","which","date","clear"}:
            session_tools[r["session_id"]].append({"tool": tool, "count": r["n"]})

    # Find dominant tools per session
    patterns = []
    for sid, tools in session_tools.items():
        if tools:
            top = tools[0]
            if top["count"] >= 3:
                patterns.append({
                    "type": "pattern",
                    "content": f"Session {sid[:16]}... primarily used '{top['tool']}' ({top['count']} calls)",
                    "concepts": f"tool-usage, {top['tool']}",
                    "confidence": min(0.9, 0.3 + top["count"] / 20)
                })

    # Find tools used across multiple sessions
    tool_sessions = defaultdict(list)
    for r in rows:
        tool = r["tool"]
        if tool and isinstance(tool, str):
            tool_sessions[tool].append(r["session_id"])

    for tool, sids in tool_sessions.items():
        unique_sessions = len(set(sids))
        if unique_sessions >= 3 and tool not in {"read","rg","fd","ls","cat","head","tail","echo","pwd","cd","which","date","clear"}:
            patterns.append({
                "type": "pattern",
                "content": f"'{tool}' used across {unique_sessions} sessions — recurring tool",
                "concepts": f"cross-session, {tool}",
                "confidence": min(0.85, 0.3 + unique_sessions / 10)
            })

    return patterns


def format_memory_md(patterns, decisions, lessons, existing_content=""):
    """Format findings as MEMORY.md sections."""
    sections = {
        "## Rules": [],
        "## Architecture decisions": [],
        "## Discovered durable knowledge": [],
        "## Patterns": [],
        "## Gotchas": []
    }

    today = datetime.now().strftime("%Y-%m-%d")

    for p in patterns:
        if p["type"] == "pattern":
            sections["## Patterns"].append(f"- {today} — {p['content']}")
        elif p["type"] == "fact":
            sections["## Discovered durable knowledge"].append(f"- {today} — {p['content']}")

    for d in decisions:
        if d["type"] == "decision":
            sections["## Architecture decisions"].append(f"- {today} — {d['content']}")

    for l in lessons:
        sections["## Rules"].append(f"- {today} — {l['content']} (context: {l.get('context', '')})")

    # Формируем новый MEMORY.md
    # Сохраняем существующие секции, добавляем новые
    result_parts = []

    # Parse existing content to preserve old entries
    existing_sections = defaultdict(list)
    current_section = None
    for line in existing_content.split("\n"):
        if line.startswith("## "):
            current_section = line
        elif line.strip().startswith("- ") and current_section:
            existing_sections[current_section].append(line)

    # Собираем финальный файл
    header = "# Project Memory\n\n"
    body = ""

    all_sections = [
        "## Rules",
        "## Architecture decisions",
        "## Discovered durable knowledge",
        "## Patterns",
        "## Gotchas"
    ]

    for sec in all_sections:
        if existing_sections[sec] or sections[sec]:
            body += f"{sec}\n\n"
            # Сначала новые, потом старые (новые сверху)
            for item in sections[sec]:
                if item not in existing_sections[sec]:
                    body += f"{item}\n"
            for item in existing_sections[sec]:
                body += f"{item}\n"
            body += "\n"

    return {
        "content": header + body,
        "added": sum(len(v) for v in sections.values()),
        "sections_updated": [sec for sec in all_sections if sections[sec]]
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Dream Consolidation — trajectory analyzer")
    parser.add_argument("--db", default=DEFAULT_DB, help="Path to opencode.db")
    parser.add_argument("--days", type=int, default=7, help="Look back N days")
    parser.add_argument("--analyze-only", action="store_true", help="Only analyze, output raw analysis")
    parser.add_argument("--report", action="store_true", default=True, help="Full report mode (default)")
    parser.add_argument("--memory-file", default=None, help="Path to existing MEMORY.md (default: auto-detect from cwd)")
    parser.add_argument("--write", action="store_true", help="Write MEMORY.md using Bun.write() via subprocess")
    args = parser.parse_args()

    conn = connect_db(args.db)

    sessions = get_sessions(conn, days=args.days)
    if not sessions:
        print(json.dumps({"status": "empty", "message": f"No sessions found in last {args.days} days"}, indent=2))
        sys.exit(0)

    session_ids = [s["id"] for s in sessions]
    messages = get_messages_for_sessions(conn, session_ids)
    parts = get_parts_for_sessions(conn, session_ids)
    model_switches = get_model_switches(conn, session_ids)

    patterns = extract_patterns(sessions, messages)
    decisions = extract_decisions(sessions, messages, model_switches)
    lessons = extract_lessons(sessions, messages)

    # Tool pattern analysis
    tool_patterns = get_tool_patterns(conn, session_ids)
    patterns.extend(tool_patterns)

    if args.analyze_only:
        result = {
            "status": "analyzed",
            "sessions_count": len(sessions),
            "messages_count": len(messages),
            "parts_count": len(parts),
            "patterns": patterns,
            "decisions": decisions,
            "lessons": lessons
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        conn.close()
        return

    # Определяем MEMORY.md путь
    if args.memory_file:
        memory_file = Path(args.memory_file)
    else:
        project_hash = os.popen("echo -n \"$(pwd)\" | sha256sum | cut -c1-12").read().strip()
        memory_dir = Path.home() / ".local/share/opencode/memory/projects" / project_hash
        memory_file = memory_dir / "MEMORY.md"

    # Читаем существующий MEMORY.md
    existing_content = ""
    if memory_file.exists():
        existing_content = memory_file.read_text(encoding="utf-8")

    # Форматируем как MEMORY.md
    md_result = format_memory_md(patterns, decisions, lessons, existing_content)

    if args.write:
        # Запись через Bun.write() — пользователь явно запросил
        memory_file.parent.mkdir(parents=True, exist_ok=True)
        import subprocess
        bun_script = f"""
const content = {json.dumps(md_result['content'])};
Bun.write({json.dumps(str(memory_file))}, content);
"""
        proc = subprocess.run(
            ["bun", "-e", bun_script],
            capture_output=True, text=True, timeout=30
        )
        if proc.returncode != 0:
            # Fallback на Python write если Bun не доступен
            memory_file.write_text(md_result["content"], encoding="utf-8")

    # Формируем полный результат
    result = {
        "status": "consolidation_ready",
        "sessions_analyzed": len(sessions),
        "messages_analyzed": len(messages),
        "parts_analyzed": len(parts),
        "patterns_found": len(patterns),
        "decisions_found": len(decisions),
        "lessons_found": len(lessons),
        "patterns": patterns,
        "decisions": decisions,
        "lessons": lessons,
        "memory_file": str(memory_file),
        "memory_file_exists": memory_file.exists(),
        "memory_md": md_result
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

    conn.close()

if __name__ == "__main__":
    main()
