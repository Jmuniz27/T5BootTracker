# Diagrama de componentes

**Fuente de verdad:** `component-diagram.mmd` (Mermaid). El PNG del informe se genera
desde ahí.

## Cómo regenerar el PNG

```bash
cd docs/diagrams/components
npx -y @mermaid-js/mermaid-cli -i component-diagram.mmd -o component-diagram.png -b white -s 3
cp component-diagram.png ../../../../doc_ing2_2p/Figures/component_diagram.png
```

Alternativa manual: pegar el `.mmd` en <https://mermaid.live> → *Actions → PNG*.

El capítulo 2 del informe lo inserta con `width=\textwidth, height=0.88\textheight`:
el diagrama es vertical y ocupa una página completa.

## Ojo con el PNG anterior

Hasta el 13-ago-2026 el informe usaba `Web and Mobile Client-2026-06-24-042020.png`,
que **no salía de este `.mmd` por CLI** sino de importar el `.mmd` a draw.io y exportar
desde ahí a mano. Ese pipeline no es reproducible en local, y el resultado quedó
congelado en el estado de junio: la imagen siguió mostrando siete apps mientras el
`.mmd` y el texto del informe ya decían ocho. Si alguien regenera el diagrama, que use
el CLI y no ese archivo.

El `.drawio` de esta carpeta es **otro diagrama distinto**, mucho más detallado
(componentes internos del frontend, del mobile y de cada app). No se usa en el informe
y está desactualizado: dice que analytics es un stub, que shadcn/ui no está instalado
y que mobile no tiene pantallas de pagos. Se conserva como historial.

## Por qué está agrupado en dominio y soporte

Las ocho apps en una sola fila daban un lienzo de 2.7:1. Al reducirlo al ancho de
página del informe el texto quedaba en unos 3 puntos, ilegible impreso. Agrupadas en
dos subgrafos el diagrama sale vertical, entra en una página y se lee.

Por el mismo motivo las relaciones con Postgres y con Celery se declaran a nivel de
grupo en vez de una arista por app: el detalle de qué app concreta escribe en la base
era justamente la maraña de líneas cruzadas que hacía ilegible la versión anterior, y
ese detalle ya vive en el ERD.

## Qué debe reflejar (verificado contra el código)

| Elemento | Detalle |
|---|---|
| Apps de Django | **Ocho** en `INSTALLED_APPS`: authentication, leads, payments, programs, notifications, meetings, users, analytics |
| Roles | **Cinco** en `CustomUser.Role`: ADMINISTRATOR, SALESPERSON, BOOTCAMPER, COORDINATOR, FINANCE — los dos últimos entraron por CR-014 y CR-015 |
| Analytics | Implementado (métricas por vendedor y comparativa), **no** es un stub |
| Google Calendar | Integración **real**, vía la app `meetings` |
| Object storage | **Sigue siendo planificado**: no hay servicio de S3/MinIO en el compose y los archivos van a `MEDIA_ROOT` en disco |
| Programs | Programas **y cohortes** (CR-014) |
