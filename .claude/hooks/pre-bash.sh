#!/usr/bin/env bash
# Receives tool input JSON on stdin.
input=$(cat)
cmd=$(echo "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null || echo "")

# Block direct push to main or force push
if echo "$cmd" | grep -qE 'git push.*(origin main|--force|-f )'; then
    echo "ERROR: Direct push to main / force push is blocked. Open a PR instead." >&2
    exit 2
fi

# Warn before running migrations (unless --check)
if echo "$cmd" | grep -q 'manage.py migrate' && ! echo "$cmd" | grep -q -- '--check'; then
    echo "WARNING: Running migrations against DB — make sure you are NOT on production." >&2
fi
