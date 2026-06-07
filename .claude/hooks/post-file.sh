#!/usr/bin/env bash
# Receives tool input JSON on stdin (Write or Edit).
input=$(cat)
fp=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null || echo "")

[ -z "$fp" ] && exit 0

# Syntax-check backend Python files (skip migrations — they're auto-generated)
if echo "$fp" | grep -qE '\.py$' && echo "$fp" | grep -q 'boot-tracker/backend/' && ! echo "$fp" | grep -q '/migrations/'; then
    if python3 -m py_compile "$fp" 2>&1; then
        echo "Syntax OK: $fp"
    else
        echo "SYNTAX ERROR in $fp" >&2
        exit 1
    fi
fi

# Warn when a migration file is written
if echo "$fp" | grep -qE '/migrations/[0-9]'; then
    echo "WARNING: Migration file written — mention it in your PR description."
fi
