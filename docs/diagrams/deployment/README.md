# Diagrama de despliegue

**Fuente de verdad:** `deployment-diagram.mmd` (Mermaid). El PNG se genera desde ahí.

## Cómo regenerar el PNG

```bash
cd docs/diagrams/deployment
echo '{"theme":"default","themeVariables":{"fontSize":"28px"}}' > /tmp/mmdc.json
npx -y @mermaid-js/mermaid-cli -i deployment-diagram.mmd -o deployment-diagram.png \
    -b white -s 3 -c /tmp/mmdc.json
cp deployment-diagram.png ../../../../doc_ing2_2p/Figures/deployment_diagram.png
```

Alternativa manual: pegar el `.mmd` en <https://mermaid.live> → *Actions → PNG*.

> **El `.mmd` no lleva comentarios `%%` al principio.** El CLI de Mermaid los colapsa
> con la primera línea y falla el parseo (`Expecting 'GRAPH', got 'NODE_STRING'`).
> Cualquier nota va en este README, no en el `.mmd`.

**El `fontSize` de 28px no es cosmético, no lo quites.** Con la fuente por defecto
(16px) el diagrama sale 2352x1113, o sea 2.11:1, y al reducirlo al ancho de página
del informe el texto queda en unos 2.7 puntos: ilegible impreso. Los márgenes de las
cajas y el largo de las flechas no escalan con la fuente, así que subirla hace que el
texto ocupe más proporción del lienzo: la relación pasa a 1.31:1 y el texto a unos
5 puntos. Mismo contenido, mismas cajas, mismas aristas — sólo cambia el tamaño
relativo.

**Formato:** el capítulo 2 lo inserta con `width=\textwidth, height=0.8\textheight`.
El tope de alto era `0.45\textheight` y achicaba la figura todavía más de lo
necesario; se subió junto con el cambio de fuente. Las `direction LR` de los
subgrafos son lo que evita que el diagrama se estire en vertical — si se cambian a
`TB` sale desproporcionadamente alto y vuelve a quedar ilegible.

## Historial

- **13-ago-2026 — reescrito con la arquitectura real.** La versión anterior dibujaba
  **Coolify** sobre el VPS de ESPOL (`boottracker.taws.espol.edu.ec`). Las dos cosas
  quedaron obsoletas: Coolify se descartó (quería los puertos 80/443 que ya tenía el
  nginx del host sirviendo otra app en producción) y el VPS de ESPOL se dio de baja.
  La imagen contradecía a su propio pie de figura y al capítulo 9 del informe.
- Los `.puml` y `.drawio` de esta carpeta **siguen describiendo la topología vieja de
  Coolify**. No se usan en el informe; se conservan como historial. Si se van a
  reutilizar, hay que actualizarlos igual que el `.mmd`.

## Qué debe reflejar (arquitectura verificada en el servidor)

| Elemento | Detalle |
|---|---|
| Entrega continua | merge a `main` → GitHub Actions (`ci-pr.yml`, 6 jobs) → imágenes a GHCR etiquetadas por SHA → job `deploy` por SSH |
| Servidor | VPS Hetzner **CX23** (2 vCPU, 3.7 GiB, x86_64), Ubuntu |
| Borde | **nginx del host** dueño de `:80`/`:443`, TLS con Certbot, reparte por hostname |
| Stack | frontend nginx `127.0.0.1:8080`, backend Django/gunicorn `:8000`, celery worker, Postgres 16, Redis 7, volúmenes `postgres_data` y `media_data` — **todo en loopback** |
| Vecino | `attendance_api` + `attendance_db` en el mismo VPS, **proyecto ajeno**: se dibuja porque comparte el nginx y los recursos, y la regla número uno es no tocarlo |
| Dominios | `boottracker.codingbootcampslatam.com` (nuestro) · `api.codingbootcampslatam.com` (el vecino) |
| Salientes | SMTP transaccional, Google Calendar API, y el bot de WhatsApp como **entrante** con secreto compartido |
