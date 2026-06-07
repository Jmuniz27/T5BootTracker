#!/usr/bin/env bash
# PostToolUse hook for Bash — fires after every Bash call.
# Only prints output when the command was `gh pr create`.
input=$(cat)

cmd=$(echo "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('command', '') or d.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null || echo "")

if echo "$cmd" | grep -q 'gh pr create'; then
    pr_num=$(echo "$input" | grep -oE '/pull/[0-9]+' | grep -oE '[0-9]+' | head -1)
    echo ""
    if [ -n "$pr_num" ]; then
        echo "⚠️  PR created! Before requesting merge, run in Claude Code:"
        echo "    'Use the pr-reviewer agent to review PR #${pr_num}'"
    else
        echo "⚠️  PR created! Before requesting merge, run in Claude Code:"
        echo "    'Use the pr-reviewer agent to review this PR'"
    fi
    echo "    Merge only after Claude approves and CI is green."
fi
