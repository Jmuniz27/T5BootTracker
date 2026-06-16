#!/usr/bin/env bash
# PreToolUse hook for Bash — fires before every Bash call.
# Backstop determinista para gh pr create: exige el piso estructural minimo.
# El hook prompt inteligente (settings.json) valida criterios de aceptacion;
# este script garantiza el piso aunque el modelo lo ignore.

input=$(cat)

cmd=$(echo "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', '') or d.get('command', ''))
except:
    print('')
" 2>/dev/null || echo "")

# Solo actuar cuando el comando es gh pr create
if ! echo "$cmd" | grep -q 'gh pr create'; then
    exit 0
fi

missing=()

# Verificar que no se esta en main
current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$current_branch" = "main" ]; then
    missing+=("- La rama actual es 'main'. Crear una rama de feature primero.")
fi

# Verificar que el body referencia un issue (#N o CB-N)
if ! echo "$cmd" | grep -qE '#[0-9]+|CB-[0-9]+'; then
    missing+=("- El body del PR no referencia ningun issue (falta 'Closes #N' o 'CB-N').")
fi

# Verificar que el body menciona como probar
if ! echo "$cmd" | grep -qiE 'test|c[oó]mo probar|how to test|pasos|steps'; then
    missing+=("- El body del PR no explica como probar el cambio.")
fi

if [ ${#missing[@]} -eq 0 ]; then
    exit 0
fi

reason="El PR no cumple el piso estructural minimo:"$'\n'
for item in "${missing[@]}"; do
    reason+="$item"$'\n'
done
reason+="Usa el agente pr-author para generar un PR conforme: 'Use the pr-author agent to create this PR'."

python3 -c "
import json, sys
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PreToolUse',
        'permissionDecision': 'ask',
        'permissionDecisionReason': sys.argv[1]
    }
}))" "$reason"
