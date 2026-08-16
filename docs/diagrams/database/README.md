# Diagrama entidad-relación

**Fuente de verdad:** `erd.mmd` (Mermaid `erDiagram`). El PNG se genera desde ahí.
`schema.dbml` es su espejo en DBML, para importar en drawSQL / dbdiagram.
`schema.sql` no se escribe a mano: sale de un `pg_dump` de la base real.

| Archivo | Qué es | Cómo se mantiene |
|---|---|---|
| `erd.mmd` | **Fuente de verdad.** 13 modelos + 1 tabla M2M = 14 tablas, 26 FKs. | A mano, desde los modelos Django. |
| `erd.drawio` | **Diagrama completo**: 14 tablas, 162 columnas, 28 relaciones. | `gen_erd_drawio.py` (abajo). **No editar a mano.** |
| `erd-resumen.drawio` | **Versión resumida** para el informe: mismas tablas y relaciones, 88 columnas. | `gen_erd_drawio.py --resumen`. **No editar a mano.** |
| `erd-resumen.png` | **La imagen del informe**, exportada del anterior desde draw.io. | Exportar de nuevo desde draw.io, ver abajo. |
| `gen_erd_drawio.py` | Generador de los dos `.drawio` desde `erd.mmd`. | A mano; sólo librería estándar. |
| `erd.png` | Render rápido de Mermaid, sin estilo. | CLI de Mermaid (abajo). |
| `schema.dbml` | Mismo esquema en DBML, para drawSQL / dbdiagram. | A mano, en paralelo con `erd.mmd`. |
| `erd-drawio.sql` | DDL para el importador SQL de draw.io (camino alternativo). | A mano, en paralelo con `erd.mmd`. |
| `schema.sql` | DDL real de PostgreSQL 16. | `pg_dump` (abajo). **No editar.** |
| `drawSQL-image-export-2026-06-24.webp` | Export de drawSQL de junio. | ⚠️ **Desactualizado**, ver abajo. |
| `db_schema_export.txt` | Volcado de `information_schema` de junio. | ⚠️ **Desactualizado**, lo reemplaza `schema.sql`. |

## Cómo regenerar el PNG

```bash
cd docs/diagrams/database
npx -y @mermaid-js/mermaid-cli -i erd.mmd -o erd.png -b white -s 3
```

Alternativa manual: pegar el `.mmd` en <https://mermaid.live> → *Actions → PNG*.

Dos trampas del parser de Mermaid, ya pisadas:

- `erDiagram` **tiene que ir en la primera línea**. Un comentario `%%` antes rompe el parseo.
- Una línea con `%%` a secas (comentario vacío) también lo rompe. Poné `%% ---` si querés separar bloques.

## draw.io

**Abrí `erd.drawio` directamente** (draw.io de escritorio o <https://app.diagrams.net>).
Ya viene con colores, posiciones y etiquetas; no hay que importar ni acomodar nada.

Hay dos versiones:

- **`erd.drawio`** — completo, las 162 columnas. Es la referencia técnica.
- **`erd-resumen.drawio`** — para el informe. Mantiene las **14 tablas y las 28
  relaciones**, pero deja sólo PK + FKs + las columnas de negocio: 88 filas en vez de 162.
  Se van los timestamps de auditoría, los campos de OCR y facturación de `payment`, y el
  soft-delete. Qué se conserva está en el dict `KEEP` del generador; si el recorte dejara
  fuera una FK, el script **falla** en vez de emitir una arista huérfana.

Para regenerarlos después de tocar `erd.mmd`:

```bash
python3 docs/diagrams/database/gen_erd_drawio.py             # erd.drawio
python3 docs/diagrams/database/gen_erd_drawio.py --resumen   # erd-resumen.drawio
```

### La imagen del informe

`erd-resumen.png` sale de abrir `erd-resumen.drawio` en draw.io y exportar
(*File → Export as → PNG*). **Las posiciones de las cajas de esa imagen están
acomodadas a mano**: el generador reparte las tablas en cuatro columnas y deja
las líneas cruzándose, que es legible pero feo para una página del informe.

Consecuencia: regenerar el `.drawio` **descarta ese acomodo**. Si se regenera y
hace falta la imagen otra vez, hay que volver a acomodar y exportar. Es el precio
de tener el diagrama derivado de una fuente en vez de dibujado a mano, y conviene
pagarlo sólo cuando el esquema cambie de verdad.

Qué produce el generador:

- Una tarjeta `swimlane` por tabla: encabezado sólido con el nombre en blanco y negrita,
  y el **cuerpo blanco con el texto en negro** (`#FFFFFF` / `#000000`), filas de 24 px,
  sombra y esquinas redondeadas. Cada fila declara `points` + `portConstraint=eastwest`,
  así las líneas se enganchan a la columna concreta y no al borde de la caja.
- **Un color por app**: authentication índigo `#4F46E5`, programs verde azulado `#0F9D8C`,
  payments azul `#2563EB`, leads naranja `#E8590C`, meetings magenta `#DB2777`. Con caja
  de leyenda al pie.
- Filas con el formato `nombre · tipo en gris · badge PK/FK/UK`, y sufijo `?` en el tipo
  cuando la columna admite NULL. Los tipos llevan longitud y precisión
  (`varchar(254)`, `decimal(12,2)`).
- Bloque `Indexes` en las cuatro tablas con constraint compuesta.
- **Pata de gallo real**: `ERmany` en el lado hijo y `ERone` / `ERzeroToOne` en el padre
  según si la FK admite NULL, o sea que se distingue `1:N` de `0..1:N`.
- Cada una de las 28 relaciones con **etiqueta de dos líneas**: el verbo del dominio
  ("validado por", "descartado por") y debajo, más chico, el `on_delete`.
- Las tablas se nombran por su modelo, sin prefijo de app — el color y la leyenda ya dicen
  a qué app pertenece cada una.
- Fondo blanco fijado con `light-dark(#FFFFFF,#FFFFFF)` (blanco también en tema oscuro) y
  `fontColor` explícito en **cada** celda. El color queda sólo en el encabezado, en las
  líneas y en las etiquetas: el cuerpo de las tablas es blanco con texto negro.

Los verbos de las relaciones viven en el dict `VERBS` del generador. Si se agrega una FK
nueva a `erd.mmd` sin su verbo, el script **falla a propósito** en vez de emitir una
arista sin etiqueta.

Las cuatro constraints compuestas no se pueden expresar en la sintaxis de Mermaid, así que
viven en el dict `INDEXES` del generador; si aparece una nueva, hay que agregarla ahí
además de en `schema.dbml`.

### Camino alternativo: importar SQL

Si preferís partir de cero y maquetar vos: **Arrange/Disposición → Insert/Insertar →
Advanced/Avanzado → SQL...** y pegar `erd-drawio.sql`.

**No sirve pegar `schema.sql`**: el importador de draw.io sólo dibuja las relaciones que
encuentra como `FOREIGN KEY` **dentro** del `CREATE TABLE`, y el `pg_dump` las emite todas
como `ALTER TABLE` al final. Resultado: 25 cajas sueltas y ninguna línea. Por eso existe
`erd-drawio.sql`, con las FKs inline y las tablas ordenadas por dependencia.

Si alguna caja sale con una columna partida en dos, es el parser de draw.io tropezando con
la coma de `numeric(10,2)`: quitale la precisión (`numeric` a secas) y volvé a importar.
Por ese camino las cajas salen grises y apiladas en grilla: hay que acomodarlas a mano.

## Cómo regenerar el `schema.sql`

```bash
docker compose up -d db backend
docker compose exec -T backend python manage.py migrate
set -a && . .env && set +a
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --schema-only --no-owner --no-privileges \
  | grep -v '^\\restrict\|^\\unrestrict' > docs/diagrams/database/schema.sql
```

(El `grep` saca las líneas `\restrict` que agrega `pg_dump` 16.14 y que ningún otro
cliente entiende.)

Es también la forma de **verificar** `erd.mmd`: si una columna del diagrama no aparece
en el volcado, el diagrama miente.

## Ojo con los artefactos viejos

Hasta el 15-ago-2026 esta carpeta sólo tenía el export de drawSQL de junio
(`*.webp`, más un `erd.drawio` y un `db_schema_export.txt` de la misma fecha).
Ese export mostraba **7 tablas y 10 FKs** cuando el esquema real ya tenía **14 y 26**:
le faltaban `programs_cohort`, `payments_paymentplan`, `payments_paymentlink`,
`meetings_meeting`, los dos singletons de auto-asignación y la M2M
`coordinator_programs`, más ~25 columnas en las tablas que sí estaban.

Es el mismo problema que ya documentó `../components/README.md`: una imagen exportada
a mano desde una herramienta web, sin fuente en el repo, se desactualiza en silencio.

El `erd.drawio` de junio **quedó reemplazado** por el que genera `gen_erd_drawio.py`; la
versión vieja está en el historial de git si hiciera falta. El `.webp` y el
`db_schema_export.txt` siguen ahí sólo como histórico: **no los uses como referencia**,
se pueden borrar.

## Errores frecuentes al dibujar este esquema

Cinco cosas que el export viejo tenía mal y que es fácil repetir:

1. **`blank=True` no es nullable.** Un `CharField`/`TextField` con `blank=True` y sin
   `null=True` es `NOT NULL DEFAULT ''`. Aplica a casi todos los `ocr_*`,
   `confirmed_*`, `notes`, `campaign`, `program_interest`, `discard_*`. Sí son
   nullables de verdad los numéricos y de fecha (`ocr_amount`, `confirmed_amount`,
   `interest_level`, `duration_minutes`, `next_action_date`).
2. **La PK nunca es nullable.** drawSQL la pinta como `uuid?`; es un artefacto del
   render, no del esquema.
3. **`CASCADE` / `SET_NULL` / `PROTECT` los aplica Django, no Postgres.** En la base,
   las 28 FKs son `DEFERRABLE INITIALLY DEFERRED` y **ninguna declara `ON DELETE`**.
   Un borrado por SQL crudo se salta esa semántica. Aun así hay que anotarla en el
   diagrama: es la información más útil que puede llevar, y acá no es uniforme
   (`Interaction.salesperson` es `PROTECT`, `Payment.bootcamper` es `CASCADE`,
   `Lead.owner` es `SET_NULL`).
4. **Los timestamps son `timestamptz`**, no `timestamp`.
5. **La cardinalidad importa.** Todas las FKs nullables son opcionales: `0..1 : N`, no
   `1 : N`. En `erd.mmd` se distinguen con `|o--o{` (opcional) vs `||--o{` (obligatoria).

Y dos cosas que el diagrama no puede expresar y por eso van anotadas:

- **`programs_enrollment` tiene una constraint parcial**: `UNIQUE (bootcamper_id,
  bootcamp_id) WHERE cohort_id IS NULL`, además de la triple
  `unique_enrollment_per_cohort`. Hace falta porque Postgres no considera iguales a dos
  `NULL`. La unicidad hoy es **por cohorte**, no por programa: se puede reinscribir al
  mismo programa en otra cohorte.
- **`Payment.bootcamper` tiene `limit_choices_to={'role': 'BOOTCAMPER'}`** — regla de
  aplicación, no constraint de DB. Lo mismo el rango 1-5 de `interest_level` y el 0-100
  de `discount_percentage`: no hay `CHECK` en la base.

## Deuda conocida del esquema (no se "arregla" en el diagrama)

- **`meetings_meeting` es la única entidad de negocio sin PK `uuid`**: usa `BigAutoField`.
  Tampoco tiene `updated_at`. Los otros dos `bigint` del esquema
  (`leads_leadassignmentsetting`, `payments_bootcamperassignmentsetting`) son singletons
  de configuración, donde el UUID no aporta nada; el caso de `meetings` sí es una
  inconsistencia. Cambiarlo exige migración de datos.
- **`payments_payment` tiene soft-delete sin manager que lo filtre**, a diferencia de
  `leads_lead`, que sí tiene `LeadManager`. Hay que acordarse de filtrar `deleted_at`
  a mano en cada consulta de pagos.

## Pendiente: que esto no se vuelva a atrasar

No hay nada que impida que `erd.mmd` se desincronice de los modelos. La opción natural
es un check de CI: `manage.py makemigrations --check` (ya detecta modelos sin migrar) más
un paso que compare la lista de tablas y columnas del `pg_dump` contra `erd.mmd`.
`django-extensions` ya está en `backend/requirements/local.txt` si se prefiere generar el
diagrama con `graph_models` en vez de compararlo.
