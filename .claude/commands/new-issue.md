# /new-issue

Crea un GitHub issue para Boot-Tracker con el formato estándar del equipo.

Pregunta al usuario:
1. Número de issue (ej: #32)
2. Título corto (ej: "Frontend: pantalla de recuperación de contraseña")
3. Sprint (A, B, C, D, E o F)
4. Assignee (juan / jlchong / zahid / gabriela / annabella / isabella)
5. Descripción de qué hay que hacer
6. Criterios de aceptación (al menos 2, en formato checklist)

Luego crea el issue:

```bash
gh issue create \
  --title "[Sprint X] Título del issue" \
  --body "## Qué hacer
[descripción]

## Criterios de aceptación
- [ ] criterio 1
- [ ] criterio 2

## Notas técnicas
[si aplica]" \
  --assignee "<username>" \
  --milestone "Sprint X: <nombre del milestone>"
```

Después de crearlo, confirma con: "Issue #XX creado y asignado a [persona] en Sprint X."
