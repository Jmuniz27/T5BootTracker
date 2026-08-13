# Merged Pull Requests -- Sprint 7

GitHub no asocia milestone a los Pull Requests de este repositorio (solo a Issues), por lo que esta lista no se pudo generar automaticamente por milestone via gh api. Para completarla, filtrar la lista completa de PRs mergeados por fecha dentro de la ventana del sprint (6 ago - 11 ago 2026 (fecha de cierre real segun milestone de GitHub; el deadline academico es 11 ago 2026)) con:

    gh pr list --state merged --json number,title,mergedAt,author --jq "select(.mergedAt filter here)"

o cruzar manualmente cada PR mergeado con los issues Closes #N de la tabla de github_issues_s7.md.
