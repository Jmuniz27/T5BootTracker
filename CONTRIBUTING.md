# Contribución — Boot-Tracker

## Branches
- `feature/nombre` — feature nueva
- `fix/nombre` — bug fix
- Nunca pushear directo a `main`

## Commits
Formato: `tipo(módulo): descripción`
Ejemplos:
- `feat(leads): auto-asignación con locking`
- `fix(auth): refresh token expirado`

Tipos: feat, fix, chore, docs, refactor, test

## PRs
- Referenciar el issue: `Closes #número`
- El CI debe pasar (tests Django + build frontend)
- 1 review requerido antes de merge
- PRs pequeños, un issue por PR
