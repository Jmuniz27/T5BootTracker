# /linear-sync

Verifica si un issue de Linear está **realmente completo** y, sólo entonces,
lo marca como **Done**. Si falta algo, lo mueve a **In Review** y comenta qué
falta. Úsalo después de hacer merge de un PR a `main`.

Uso: `/linear-sync CB-<N>` — por ejemplo `/linear-sync CB-40`.

El argumento es `$ARGUMENTS`.

## Qué hacer

1. **Valida el argumento.** Debe tener la forma `CB-<N>` (acepta `cb-<N>` y
   normaliza a mayúsculas). Si no, responde que no es un id válido de Boot-Tracker
   y **no toques Linear**. No actúes sobre ningún otro issue.

2. **Lanza el agente `linear-sync`** (subagent_type: `linear-sync`) pasándole el
   id del issue `$ARGUMENTS`. El agente:
   - Lee el issue completo en Linear (criterios de aceptación, sub-tareas, labels).
   - Resuelve el PR mergeado y el estado de CI (`python .claude/scripts/pr_context.py CB-<N>`).
   - Inspecciona el código y los tests del diff (backend / frontend / mobile según labels).
   - Decide con criterio estricto.

3. **Presenta el resultado** del agente: decisión, nuevo estado y el comentario
   que dejó en Linear.

## La barra (todo el equipo la conoce)

**Done = todos los criterios de aceptación implementados + tests presentes y
no-skippeados + build verde.**

- Falta cualquier criterio o test → **In Review** + comentario con la lista de
  faltantes (por requisito, no vago).
- Build rojo → **no se cambia el estado**; comentario "Build is failing — fix CI
  before this can be closed."

Nunca se marca Done con un criterio incumplido.
