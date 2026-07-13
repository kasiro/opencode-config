#!/usr/bin/env python3
"""
distill_analyze.py — Trajectory pattern analyzer for distill workflow discovery.
Adapted from MiMo-Code approach: reads opencode.db (read-only), extracts tool call
sequences per session/message, finds repeated n-gram patterns, and outputs
structured data for LLM-based analysis.

Usage:
  python3 distill_analyze.py [--db PATH] [--days N] [--min-occurrences N]
  --db PATH            path to opencode.db (default: ~/.local/share/opencode/opencode.db)
  --days N             look back N days (default: 30)
   --min-occurrences N  minimum pattern frequency (default: 3)
  --json               output as JSON (default)
  --table              output as markdown table
"""

import json
import sqlite3
import sys
import os
from datetime import datetime, timezone
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_DB = os.path.expanduser("~/.local/share/opencode/opencode.db")

# Tool calls that are noise (not workflow patterns)
SKIP_TOOLS = {"read", "rg", "fd", "ls", "cat", "head", "tail", "echo", "pwd",
              "cd", "which", "whoami", "date", "clear", "todowrite",
              "get_subagents_in_background", "list_mcp_resources",
              "list_mcp_resource_templates", "read_mcp_resource",
              "compress", "skill"}


def connect_db(db_path):
    if not os.path.isfile(db_path):
        print(json.dumps({"error": f"Database not found: {db_path}"}))
        sys.exit(1)
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def get_sessions(conn, days=30, limit=100):
    """Get sessions within the time window."""
    cutoff = int(datetime.now(timezone.utc).timestamp() * 1000) - days * 86400 * 1000
    cursor = conn.execute("""
        SELECT id, title, agent,
               datetime(time_created/1000, 'unixepoch') as created_ts,
               time_created
        FROM session
        WHERE time_created > ? AND agent IS NOT NULL AND agent != ''
        ORDER BY time_created DESC
        LIMIT ?
    """, (cutoff, limit))
    return [dict(row) for row in cursor.fetchall()]


def get_tool_sequences(conn, session_ids, skip_tools=None):
    """Extract tool call sequences using correct JSON format from MiMo-Code schema.
    
    Part types in opencode.db:
      - {"type":"text","text":"..."} - agent text output
      - {"type":"tool","tool":"...","state":{"input":...,"output":...}} - tool call+result
      - {"type":"step-start"} / {"type":"step-finish"} - step boundaries
    
    Message roles: json_extract(data, '$.role') = 'assistant' | 'user'
    """
    if skip_tools is None:
        skip_tools = SKIP_TOOLS
    
    if not session_ids:
        return {}, {}, {}
    
    placeholders = ",".join("?" * len(session_ids))
    
    # Get tool calls per message within sessions, ordered by time
    cursor = conn.execute(f"""
        SELECT 
            m.session_id,
            m.id as message_id,
            m.time_created as msg_time,
            json_extract(m.data, '$.role') as role,
            p.id as part_id,
            json_extract(p.data, '$.type') as part_type,
            json_extract(p.data, '$.tool') as tool_name,
            substr(json_extract(p.data, '$.state.input'), 1, 500) as tool_input,
            substr(json_extract(p.data, '$.state.output'), 1, 500) as tool_output,
            json_extract(p.data, '$.state.status') as tool_status,
            p.time_created as part_time
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE m.session_id IN ({placeholders})
          AND json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
        ORDER BY m.session_id, m.time_created, p.time_created
    """, session_ids)
    
    rows = [dict(row) for row in cursor.fetchall()]
    
    # Group tool calls per session
    session_tools = defaultdict(list)       # session_id -> [tool_name, ...]
    session_messages = defaultdict(list)    # session_id -> [(message_id, tool_name), ...]
    message_tools = defaultdict(list)       # message_id -> [tool_name, ...]
    tool_details = {}                       # (session_id, message_id, tool_name) -> details
    
    for r in rows:
        tool = r["tool_name"]
        if not tool or not isinstance(tool, str):
            continue
        if tool in skip_tools:
            continue
            
        session_id = r["session_id"]
        message_id = r["message_id"]
        
        session_tools[session_id].append(tool)
        session_messages[session_id].append((message_id, tool))
        message_tools[message_id].append(tool)
        
        # Store tool details (keep first occurrence)
        key = (session_id, message_id, tool)
        if key not in tool_details:
            tool_details[key] = {
                "tool": tool,
                "input_preview": r["tool_input"][:200] if r["tool_input"] else "",
                "output_preview": r["tool_output"][:200] if r["tool_output"] else "",
                "status": r["tool_status"] or "unknown",
                "session_id": session_id,
                "message_id": message_id,
            }
    
    return session_tools, message_tools, tool_details


def find_ngram_patterns(session_tools, min_occurrences=2):
    """Find repeated n-gram patterns across sessions (2-grams to 5-grams).
    
    Based on MiMo-Code approach: patterns are meaningful when they appear
    across multiple sessions and involve non-trivial tool sequences.
    """
    from collections import Counter
    
    ngram_counter = Counter()
    session_ngrams = defaultdict(set)  # session_id -> set of ngram tuples
    
    for sid, tools in session_tools.items():
        if len(tools) < 2:
            continue
        
        # 2-grams
        for i in range(len(tools) - 1):
            gram = tuple(tools[i:i + 2])
            ngram_counter[gram] += 1
            session_ngrams[gram].add(sid)
        
        # 3-grams
        for i in range(len(tools) - 2):
            gram = tuple(tools[i:i + 3])
            ngram_counter[gram] += 1
            session_ngrams[gram].add(sid)
        
        # 4-grams
        for i in range(len(tools) - 3):
            gram = tuple(tools[i:i + 4])
            ngram_counter[gram] += 1
            session_ngrams[gram].add(sid)
        
        # 5-grams (for complex workflows)
        for i in range(len(tools) - 4):
            gram = tuple(tools[i:i + 5])
            ngram_counter[gram] += 1
            session_ngrams[gram].add(sid)
    
    # Build patterns with metadata
    patterns = []
    for seq, count in ngram_counter.most_common(100):
        if count < min_occurrences:
            continue
        
        sessions_with = session_ngrams.get(seq, set())
        
        if len(sessions_with) >= 2:  # Must appear in >=2 sessions
            # Calculate confidence based on frequency and session diversity
            freq_score = min(1.0, count / 10)
            diversity_score = min(1.0, len(sessions_with) / 5)
            confidence = round((freq_score * 0.5 + diversity_score * 0.5), 2)
            
            # Determine if sequence has "hot" tools (actual work, not just navigation)
            hot_tools = {"task", "edit", "bash", "sequential-thinking", "memory_search",
                        "searxng_search", "deepwiki_read", "crawl4ai_*", 
                        }
            has_hot = any(t in hot_tools or "search" in t or "edit" in t or "bash" in t 
                         for t in seq)
            
            patterns.append({
                "sequence": list(seq),
                "frequency": count,
                "sessions_count": len(sessions_with),
                "length": len(seq),
                "confidence": confidence,
                "has_work_tools": has_hot,
            })
    
    # Sort by confidence then frequency
    patterns.sort(key=lambda p: (p["confidence"], p["frequency"]), reverse=True)
    return patterns


def find_cross_tool_patterns(session_tools, tool_details, min_occurrences=3):
    """Find cross-tool workflows — sequences where different tools chain together.
    Unlike n-grams which amplify same-tool cascades (bash→bash→bash),
    this focuses on diverse tool transitions like search→read→edit.
    """
    from collections import defaultdict, Counter
    
    # 1. Tool transition matrix: which tools follow which
    transitions = Counter()
    session_transitions = defaultdict(set)
    
    for sid, tools in session_tools.items():
        for i in range(len(tools) - 1):
            t1, t2 = tools[i], tools[i+1]
            # ONLY count transitions between DIFFERENT tools
            if t1 != t2:
                pair = (t1, t2)
                transitions[pair] += 1
                session_transitions[pair].add(sid)
    
    # 2. Cross-tool chains: look for 3-tool sequences where at least 2 different tools
    chains = Counter()
    session_chains = defaultdict(set)
    
    for sid, tools in session_tools.items():
        for i in range(len(tools) - 2):
            seq = tuple(tools[i:i+3])
            # Only interesting if at least 2 different tools
            if len(set(seq)) >= 2:
                chains[seq] += 1
                session_chains[seq].add(sid)
    
    # 3. Build patterns from transitions
    transition_patterns = []
    for (t1, t2), count in transitions.most_common(30):
        if count < min_occurrences:
            continue
        sessions_with = session_transitions.get((t1, t2), set())
        if len(sessions_with) < 2:
            continue
        
        freq_score = min(1.0, count / 10)
        diversity_score = min(1.0, len(sessions_with) / 5)
        confidence = round((freq_score * 0.5 + diversity_score * 0.5), 2)
        
        transition_patterns.append({
            "type": "cross-tool_transition",
            "sequence": [t1, t2],
            "frequency": count,
            "sessions_count": len(sessions_with),
            "length": 2,
            "confidence": confidence,
        })
    
    # 4. Build patterns from chains
    chain_patterns = []
    for seq, count in chains.most_common(30):
        if count < min_occurrences:
            continue
        sessions_with = session_chains.get(seq, set())
        if len(sessions_with) < 2:
            continue
        
        freq_score = min(1.0, count / 10)
        diversity_score = min(1.0, len(sessions_with) / 5)
        confidence = round((freq_score * 0.5 + diversity_score * 0.5), 2)
        
        # Categorize the workflow type
        tools_set = set(seq)
        has_search = any("search" in t for t in tools_set)
        has_edit = any("edit" in t for t in tools_set)
        has_bash = any("bash" in t for t in tools_set)
        has_read = any("read" in t for t in tools_set)
        
        if has_search and has_read:
            workflow_type = "research_workflow"
        elif has_edit and has_bash:
            workflow_type = "code_workflow"
        elif has_search and has_edit:
            workflow_type = "research_then_code"
        elif has_bash and has_read:
            workflow_type = "inspect_then_execute"
        else:
            workflow_type = "mixed_tools"
        
        chain_patterns.append({
            "type": f"cross-tool_{workflow_type}",
            "sequence": list(seq),
            "frequency": count,
            "sessions_count": len(sessions_with),
            "length": len(seq),
            "confidence": confidence,
            "workflow_type": workflow_type,
        })
    
    # Sort by confidence
    transition_patterns.sort(key=lambda p: (p["confidence"], p["frequency"]), reverse=True)
    chain_patterns.sort(key=lambda p: (p["confidence"], p["frequency"]), reverse=True)
    
    return transition_patterns, chain_patterns


def find_sql_grouped_patterns(conn, session_ids, min_occurrences=3):
    """MiMo-Code style: GROUP BY tool + input_preview to find repeated
    tool usage with similar inputs across sessions.
    """
    if not session_ids:
        return []
    
    placeholders = ",".join("?" * len(session_ids))
    
    cursor = conn.execute(f"""
        SELECT 
            json_extract(p.data, '$.tool') as tool,
            substr(json_extract(p.data, '$.state.input'), 1, 300) as input_preview,
            COUNT(*) as occurrences,
            COUNT(DISTINCT m.session_id) as sessions_count,
            GROUP_CONCAT(DISTINCT substr(m.session_id, 1, 20)) as session_ids
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE m.session_id IN ({placeholders})
          AND json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
          AND json_extract(p.data, '$.tool') IS NOT NULL
          AND json_extract(p.data, '$.tool') NOT IN ('read', 'rg', 'fd', 'ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'cd', 'which', 'whoami', 'date', 'clear', 'todowrite', 'get_subagents_in_background', 'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource', 'compress', 'skill')
        GROUP BY tool, input_preview
        HAVING occurrences >= ?
        ORDER BY occurrences DESC
        LIMIT 30;
    """, session_ids + [min_occurrences])
    
    rows = [dict(row) for row in cursor.fetchall()]
    patterns = []
    
    for r in rows:
        input_str = (r["input_preview"] or "")[:150]
        # Skip empty input
        if not input_str.strip():
            continue
        
        freq_score = min(1.0, r["occurrences"] / 10)
        diversity_score = min(1.0, r["sessions_count"] / 5)
        confidence = round((freq_score * 0.5 + diversity_score * 0.5), 2)
        
        patterns.append({
            "type": "grouped_pattern",
            "tool": r["tool"],
            "input_preview": input_str,
            "frequency": r["occurrences"],
            "sessions_count": r["sessions_count"],
            "confidence": confidence,
            "template": f"{r['tool']} with input: {input_str[:80]}"
        })
    
    return patterns


def analyze_tool_frequency(session_tools):
    """Analyze tool usage frequency across all sessions."""
    all_tools = []
    for tools in session_tools.values():
        all_tools.extend(tools)
    return Counter(all_tools).most_common(30)


def find_parallel_patterns(message_tools):
    """Find tools that are frequently used together in the same message."""
    parallel_counter = Counter()
    
    for mid, tools in message_tools.items():
        if len(tools) >= 2:
            # All pairs in same message
            for i in range(len(tools)):
                for j in range(i+1, len(tools)):
                    pair = tuple(sorted([tools[i], tools[j]]))
                    parallel_counter[pair] += 1
    
    return [{"pair": list(p), "frequency": c} 
            for p, c in parallel_counter.most_common(20) if c >= 2]


def classify_session_type(title, agent):
    """Classify session work type (code, config, skill, research, etc.)"""
    title_lower = (title or "").lower()
    
    if any(w in title_lower for w in ["skill", "skil"]):
        return "skill_work"
    elif any(w in title_lower for w in ["opencode.json", ".jsonc", "config"]):
        return "config_work"
    elif any(w in title_lower for w in ["refactor", "bug", "fix", "feature", "code", "test"]):
        return "code_work"
    elif any(w in title_lower for w in ["search", "find", "lookup", "research", "study"]):
        return "research"
    elif any(w in title_lower for w in ["diagnostic", "diagnosis", "check", "health", "audit"]):
        return "diagnostics"
    elif any(w in title_lower for w in ["deploy", "install", "setup", "config"]):
        return "operations"
    elif any(w in title_lower for w in ["dream", "distill", "consolidat", "memory"]):
        return "memory_work"
    else:
        return "general"


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Distill — workflow pattern discovery")
    parser.add_argument("--db", default=DEFAULT_DB, help="Path to opencode.db")
    parser.add_argument("--days", type=int, default=30, help="Look back N days")
    parser.add_argument("--min-occurrences", type=int, default=3, help="Min pattern frequency")
    parser.add_argument("--max-patterns", type=int, default=20, help="Max patterns to report")
    parser.add_argument("--table", action="store_true", help="Output as markdown table")
    args = parser.parse_args()
    
    conn = connect_db(args.db)
    
    # Phase 1: Get sessions
    sessions = get_sessions(conn, days=args.days)
    if not sessions:
        result = {"status": "empty", "message": f"No sessions found in last {args.days} days"}
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0)
    
    session_ids = [s["id"] for s in sessions]
    
    # Phase 1.5: Session type classification
    session_type_counts = defaultdict(int)
    for s in sessions:
        stype = classify_session_type(s["title"], s.get("agent", ""))
        session_type_counts[stype] += 1
    
    # Phase 2: Extract tool sequences (correct JSON format)
    session_tools, message_tools, tool_details = get_tool_sequences(conn, session_ids)
    
    # Phase 3: Find n-gram patterns
    patterns = find_ngram_patterns(session_tools, min_occurrences=args.min_occurrences)
    
    # Phase 4: Tool frequency analysis
    tool_freq = analyze_tool_frequency(session_tools)
    
    # Phase 5: Parallel tool usage
    parallel = find_parallel_patterns(message_tools)
    
    # Phase 5.5: Cross-tool workflow detection
    cross_transitions, cross_chains = find_cross_tool_patterns(
        session_tools, tool_details, min_occurrences=args.min_occurrences
    )
    
    # Phase 5.6: MiMo-Code SQL GROUP BY patterns
    sql_grouped = find_sql_grouped_patterns(
        conn, session_ids, min_occurrences=args.min_occurrences
    )
    
    # Phase 6: Session summary
    sessions_with_tools = sum(1 for t in session_tools.values() if len(t) > 0)
    total_tool_calls = sum(len(t) for t in session_tools.values())
    total_messages = len(message_tools)
    
    result = {
        "status": "analyzed",
        "window_days": args.days,
        "sessions_total": len(sessions),
        "sessions_with_tool_calls": sessions_with_tools,
        "messages_with_tools": total_messages,
        "total_tool_calls": total_tool_calls,
        "session_types": dict(session_type_counts),
        "tool_frequency": [{"tool": t, "count": c} for t, c in tool_freq],
        "patterns": patterns[:args.max_patterns],
        "cross_tool_transitions": cross_transitions[:15],
        "cross_tool_chains": cross_chains[:15],
        "sql_grouped_patterns": sql_grouped[:15],
        "parallel_tools": parallel[:10],
        "sessions": [{"id": s["id"], "title": s["title"][:60], "agent": s["agent"], 
                     "date": s["created_ts"]} for s in sessions[:10]]
    }
    
    if args.table:
        # Markdown table output
        print(f"## Distill Analysis: Last {args.days} Days\n")
        print(f"- Sessions: {len(sessions)} ({sessions_with_tools} with tool calls)")
        print(f"- Tool calls: {total_tool_calls}")
        print(f"- Patterns found: {len(patterns)}\n")
        
        if patterns:
            print("### Top Patterns\n")
            print("| Sequence | Freq | Sessions | Length | Confidence |")
            print("|----------|------|----------|--------|------------|")
            for p in patterns[:10]:
                seq = " → ".join(p["sequence"][:4])
                if len(p["sequence"]) > 4:
                    seq += "..."
                print(f"| {seq} | {p['frequency']} | {p['sessions_count']} | {p['length']} | {p['confidence']} |")
            print()
        
        print("### Tool Frequency\n")
        print("| Tool | Count |")
        print("|------|-------|")
        for t, c in tool_freq[:15]:
            print(f"| {t} | {c} |")
    else:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    conn.close()


if __name__ == "__main__":
    main()
