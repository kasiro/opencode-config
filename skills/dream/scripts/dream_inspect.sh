#!/bin/bash
# dream_inspect.sh — Read-only SQLite inspector for OpenCode trajectory database
# Usage: ./dream_inspect.sh [--db PATH] [--sessions N] [--days N]
#   --db PATH     path to opencode.db (default: ~/.local/share/opencode/opencode.db)
#   --sessions N  number of recent sessions to inspect (default: 10)
#   --days N      look back N days (default: 7)

set -euo pipefail

DB="$HOME/.local/share/opencode/opencode.db"
SESSIONS=10
DAYS=7

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB="$2"
      shift 2
      ;;
    --sessions)
      SESSIONS="$2"
      shift 2
      ;;
    --days)
      DAYS="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--db PATH] [--sessions N] [--days N]"
      echo "  --db PATH     path to opencode.db (default: ~/.local/share/opencode/opencode.db)"
      echo "  --sessions N  number of recent sessions to inspect (default: 10)"
      echo "  --days N      look back N days (default: 7)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--db PATH] [--sessions N] [--days N]" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$DB" ]; then
  echo "ERROR: Database not found at $DB" >&2
  exit 1
fi

# Check sqlite3 availability
if ! command -v sqlite3 &>/dev/null; then
  echo "ERROR: sqlite3 not found" >&2
  exit 1
fi

echo "=== DREAM INSPECT ==="
echo "Database: $DB"
echo "Size: $(du -h "$DB" | cut -f1)"
echo ""

# --- Database overview ---
echo "--- TABLES ---"
sqlite3 "$DB" ".tables"
echo ""

# --- Session counts by agent ---
echo "--- SESSIONS BY AGENT ---"
sqlite3 -header -column "$DB" "
  SELECT agent, COUNT(*) as count, SUM(tokens_input) as total_input, SUM(tokens_output) as total_output
  FROM session
  WHERE agent IS NOT NULL AND agent != ''
  GROUP BY agent
  ORDER BY count DESC;
"
echo ""

# --- Session counts by model ---
echo "--- SESSIONS BY MODEL (top 10) ---"
sqlite3 -header -column "$DB" "
  SELECT json_extract(model, '$.id') as model_id,
         COUNT(*) as count,
         SUM(tokens_input) as total_input,
         SUM(tokens_output) as total_output
  FROM session
  WHERE model IS NOT NULL AND model != ''
  GROUP BY model_id
  ORDER BY count DESC
  LIMIT 10;
"
echo ""

# --- Recent sessions ---
echo "--- RECENT $SESSIONS SESSIONS ---"
sqlite3 -header -column "$DB" "
  SELECT id, substr(title, 1, 50) as title, agent,
         datetime(time_created/1000, 'unixepoch') as created,
         tokens_input, tokens_output
  FROM session
  WHERE time_created > strftime('%s','now','-$DAYS days','start of day')*1000
  ORDER BY time_created DESC
  LIMIT $SESSIONS;
"
echo ""

# --- Recent messages with diffs ---
echo "--- RECENT MESSAGES WITH FILE CHANGES (last 5) ---"
sqlite3 -header -column "$DB" "
  SELECT m.id, m.session_id,
         datetime(m.time_created/1000, 'unixepoch') as created,
         json_extract(m.data, '$.role') as role,
         json_extract(m.data, '$.summary.filesChanged') as files_changed,
         json_extract(m.data, '$.summary.additions') as additions,
         json_extract(m.data, '$.summary.deletions') as deletions,
         substr(json_extract(m.data, '$.summary.filesChanged'), 1, 100) as files
  FROM message m
  WHERE json_extract(m.data, '$.summary.filesChanged') IS NOT NULL
    AND json_extract(m.data, '$.summary.filesChanged') != '[]'
  ORDER BY m.time_created DESC
  LIMIT 5;
"
echo ""

# --- Model switches ---
echo "--- RECENT MODEL SWITCHES (last 10) ---"
sqlite3 -header -column "$DB" "
  SELECT session_id, type,
         datetime(time_created/1000, 'unixepoch') as created,
         json_extract(data, '$.model.id') as model_id,
         json_extract(data, '$.model.providerID') as provider
  FROM session_message
  WHERE type = 'model-switched'
  ORDER BY time_created DESC
  LIMIT 10;
"
echo ""

# --- Session with highest token usage ---
echo "--- TOP 5 TOKEN-HEAVY SESSIONS ---"
sqlite3 -header -column "$DB" "
  SELECT id, substr(title, 1, 40) as title, agent,
         tokens_input, tokens_output, (tokens_input + tokens_output) as total_tokens,
         datetime(time_created/1000, 'unixepoch') as created
  FROM session
  ORDER BY (tokens_input + tokens_output) DESC
  LIMIT 5;
"
echo ""

# --- Errors and issues in recent messages ---
echo "--- RECENT ERRORS/ISSUES (last 20 messages containing 'error' or 'fail') ---"
sqlite3 -header -column "$DB" "
  SELECT m.id, m.session_id,
         datetime(m.time_created/1000, 'unixepoch') as created,
         json_extract(m.data, '$.role') as role,
         substr(json_extract(m.data, '$.message'), 1, 120) as snippet
  FROM message m
  WHERE json_extract(m.data, '$.message') LIKE '%error%'
     OR json_extract(m.data, '$.message') LIKE '%fail%'
     OR json_extract(m.data, '$.message') LIKE '%bug%'
  ORDER BY m.time_created DESC
  LIMIT 20;
"
echo ""

echo "=== DREAM INSPECT COMPLETE ==="
