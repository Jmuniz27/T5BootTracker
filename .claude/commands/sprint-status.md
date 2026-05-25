# /sprint-status

Muestra el estado del sprint actual de Boot-Tracker.

Ejecuta estos comandos y presenta un resumen claro:

```bash
# Issues abiertos con assignee y milestone
gh issue list --state open --limit 50 \
  --json number,title,assignees,milestone,labels \
  --jq '.[] | {
    num: .number,
    title: .title,
    assignee: (.assignees[0].login // "SIN ASIGNAR"),
    sprint: (.milestone.title // "SIN SPRINT"),
    labels: [.labels[].name]
  }'
```

Con esa información, presenta una tabla agrupada por persona:

```
SPRINT ACTUAL — [nombre del milestone activo]

Juan Munizaga:
  ○ #XX — Título del issue

Gabriela Jiménez:
  ○ #XX — Título del issue

[etc.]

SIN ASIGNAR:
  ⚠ #XX — Título del issue
```

Luego indica:
- Cuántos issues están abiertos vs cerrados en el sprint actual
- Si hay issues sin assignee (problema a resolver)
- Si el sprint va a tiempo para su fecha límite
