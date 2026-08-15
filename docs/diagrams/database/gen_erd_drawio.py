#!/usr/bin/env python3
"""Genera los `.drawio` del ERD a partir de `erd.mmd`.

`erd.mmd` es la fuente de verdad del esquema (ver README.md). Este script lo
parsea y emite un `.drawio` ya maquetado.

El diseño replica el del ejemplo aprobado por el equipo: swimlane con
encabezado sólido y nombre en blanco, **cuerpo de tabla blanco con texto
negro**, pata de gallo `ERmany`→`ERone` y etiqueta con verbo en cada relación.

    python3 docs/diagrams/database/gen_erd_drawio.py             # erd.drawio
    python3 docs/diagrams/database/gen_erd_drawio.py --resumen   # erd-resumen.drawio

El resumen mantiene las 14 tablas y las 28 relaciones; recorta las columnas a
PK + FKs + las de negocio (ver KEEP).

No necesita dependencias: sólo la librería estándar.
"""

import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape as _escape


def esc(text):
    """Escapa para un ATRIBUTO XML: saxutils no toca las comillas por defecto,
    y los `value` llevan HTML con atributos entrecomillados."""
    return _escape(text, {'"': "&quot;", "'": "&#39;"})


HERE = Path(__file__).resolve().parent
SRC = HERE / "erd.mmd"
OUT = HERE / "erd.drawio"

# ─── Paleta: un color por app (encabezado sólido, tinte de fila) ───────────
APPS = {
    "authentication": ("#4F46E5", "#EEF0FF"),   # índigo
    "programs":       ("#0F9D8C", "#E4F6F3"),   # verde azulado
    "payments":       ("#2563EB", "#EFF4FF"),   # azul
    "leads":          ("#E8590C", "#FFEEE2"),   # naranja
    "meetings":       ("#DB2777", "#FDF2F8"),   # magenta
}

INK       = "#000000"   # texto de la fila: negro sobre blanco
INK_TYPE  = "#6E7781"   # tipo
INK_NOTE  = "#57606A"   # bloque de índices
ROW_FILL  = "#FFFFFF"   # cuerpo de la tabla: blanco
IDX_FILL  = "#F6F8FA"
ROW_STROKE = "#D0D7DE"

W_TABLE, H_HEAD, H_ROW = 320, 34, 24
X0, X_GAP, Y0, Y_GAP = 40, 120, 40, 60

# El ejemplo nombra las tablas por su modelo, sin el prefijo de app: el color
# y la leyenda ya dicen a qué app pertenece cada una.
SHORT = {
    "authentication_customuser": "customuser",
    "authentication_customuser_coordinator_programs": "coordinator_programs",
    "programs_program": "program",
    "programs_cohort": "cohort",
    "programs_coordinatoremailconfig": "coordinatoremailconfig",
    "programs_enrollment": "enrollment",
    "payments_payment": "payment",
    "payments_paymentlink": "paymentlink",
    "payments_paymentplan": "paymentplan",
    "payments_bootcamperassignmentsetting": "bootcamperassignmentsetting",
    "leads_lead": "lead",
    "leads_interaction": "interaction",
    "leads_leadassignmentsetting": "leadassignmentsetting",
    "meetings_meeting": "meeting",
}

# Verbo de cada relación, por (tabla hija, columna FK). El ejemplo etiqueta las
# aristas con un verbo; acá se completan las 28.
VERBS = {
    ("payments_payment", "program_id"):            "corresponde a",
    ("payments_payment", "bootcamper_id"):         "pagado por",
    ("payments_payment", "validated_by_id"):       "validado por",
    ("payments_payment", "deleted_by_id"):         "eliminado por",
    ("payments_payment", "payment_link_id"):       "generado desde",
    ("payments_paymentplan", "bootcamper_id"):     "plan de",
    ("payments_paymentplan", "uploaded_by_id"):    "subido por",
    ("payments_paymentlink", "enrollment_id"):     "negociado para",
    ("payments_paymentlink", "created_by_id"):     "creado por",
    ("payments_bootcamperassignmentsetting", "updated_by_id"): "configurado por",
    ("programs_enrollment", "bootcamper_id"):      "inscribe a",
    ("programs_enrollment", "bootcamp_id"):        "en",
    ("programs_enrollment", "cohort_id"):          "cursa la",
    ("programs_cohort", "program_id"):             "edición de",
    ("programs_coordinatoremailconfig", "program_id"): "notifica de",
    ("leads_lead", "owner_id"):                    "asignado a",
    ("leads_lead", "bootcamper_id"):               "convertido en",
    ("leads_lead", "discarded_by_id"):             "descartado por",
    ("leads_lead", "program_id"):                  "interesado en",
    ("leads_interaction", "lead_id"):              "registra",
    ("leads_interaction", "salesperson_id"):       "realizada por",
    ("leads_leadassignmentsetting", "updated_by_id"): "configurado por",
    ("meetings_meeting", "lead_id"):               "agendada con",
    ("meetings_meeting", "assigned_to_id"):        "a cargo de",
    ("authentication_customuser", "finance_owner_id"): "cobra a",
    ("authentication_customuser", "verified_by_id"):   "verificado por",
    ("authentication_customuser_coordinator_programs", "customuser_id"): "coordina",
    ("authentication_customuser_coordinator_programs", "program_id"):    "coordinado por",
}

# Constraints compuestas: no se pueden expresar en la sintaxis de Mermaid, así
# que se declaran acá. Fuente: `schema.dbml` y el `pg_dump` de `schema.sql`.
INDEXES = {
    "authentication_customuser_coordinator_programs": [
        "customuser_id, program_id",
    ],
    "programs_cohort": [
        "program_id, number",
    ],
    "programs_coordinatoremailconfig": [
        "program_id, email",
    ],
    "programs_enrollment": [
        "bootcamper_id, bootcamp_id, cohort_id",
        "bootcamper_id, bootcamp_id — si cohort NULL",
    ],
}

# ─── Modo resumen (`--resumen`) ───────────────────────────────────────────
# Las 14 tablas y las 28 relaciones siguen enteras; lo que se recorta son las
# columnas. Se conservan SIEMPRE la PK y todas las FKs (las relaciones se
# enganchan a ellas) más las de negocio listadas acá. Quedan fuera los
# timestamps de auditoría, los campos de OCR y facturación, y el soft-delete.
KEEP = {
    "authentication_customuser": ["email", "first_name", "last_name", "cedula",
                                  "role", "verification_status", "is_active"],
    "authentication_customuser_coordinator_programs": [],
    "programs_program": ["name", "start_date", "end_date", "total_cost",
                         "is_active"],
    "programs_cohort": ["number", "start_month", "end_month", "status"],
    "programs_coordinatoremailconfig": ["email", "name", "recipient_type",
                                        "is_active"],
    "programs_enrollment": ["start_date", "discount_percentage",
                            "agreed_price", "status"],
    "payments_payment": ["payment_method", "confirmed_amount", "status"],
    "payments_paymentplan": ["file_type"],
    "payments_paymentlink": ["url", "amount", "status", "expires_at"],
    "payments_bootcamperassignmentsetting": ["self_assign_enabled"],
    "leads_lead": ["name", "phone", "email", "source", "status"],
    "leads_interaction": ["interaction_type", "outcome", "interest_level",
                          "lead_status"],
    "leads_leadassignmentsetting": ["self_assign_enabled"],
    "meetings_meeting": ["title", "start_time", "end_time"],
}


def summarize(tables):
    """Deja PK + FKs + las columnas de negocio de KEEP."""
    out = {}
    for t, cols in tables.items():
        keep = set(KEEP[t])
        out[t] = [c for c in cols
                  if c["keys"] or c["name"] in keep]
    return out


COLUMNS = [
    ["payments_payment", "payments_paymentlink", "payments_paymentplan",
     "payments_bootcamperassignmentsetting"],
    ["programs_program", "programs_cohort", "programs_enrollment",
     "programs_coordinatoremailconfig"],
    ["authentication_customuser",
     "authentication_customuser_coordinator_programs"],
    ["leads_lead", "leads_interaction", "meetings_meeting",
     "leads_leadassignmentsetting"],
]

COL_RE = re.compile(
    r'^(\w+)\s+(\w+)(?:\s+((?:PK|FK|UK)(?:,(?:PK|FK|UK))*))?\s+"(.*)"$'
)
REL_RE = re.compile(r'^(\w+)\s+([|o][|o]--[o|][|{])\s+(\w+)\s*:\s*"(.*)"$')
LEN_RE = re.compile(r'^\d+(,\d+)?$')


def app_of(table):
    for app in APPS:
        if table.startswith(app):
            return app
    raise SystemExit(f"tabla sin app conocida: {table}")


def parse(path):
    """Devuelve (tablas, relaciones) leyendo el erDiagram de Mermaid."""
    tables, rels, cur = {}, [], None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("%%") or line == "erDiagram":
            continue
        if line == "}":
            cur = None
            continue
        m = re.match(r"^(\w+) \{$", line)
        if m:
            cur = m.group(1)
            tables[cur] = []
            continue
        if cur:
            m = COL_RE.match(line)
            if not m:
                raise SystemExit(f"columna no parseable en {cur}: {line!r}")
            typ, name, keys, note = m.groups()
            parts = [p.strip() for p in note.split("·")]
            length = parts[0] if parts and LEN_RE.match(parts[0]) else None
            nullable = "NULL" in parts
            tables[cur].append({
                "name": name,
                "type": (f"{typ}({length})" if length else typ)
                        + ("?" if nullable else ""),
                "keys": keys or "",
            })
            continue
        m = REL_RE.match(line)
        if m:
            parent, card, child, label = m.groups()
            bits = [b.strip() for b in label.split("·")]
            rels.append({
                "parent": parent,
                "child": child,
                "column": bits[0],
                "on_delete": bits[1].replace("_", " ") if len(bits) > 1 else "",
                "parent_optional": card.startswith("|o"),
                "child_one": card.endswith("o|"),
            })
    return tables, rels


def nrows(table, cols):
    return len(cols) + (len(INDEXES[table]) + 1 if table in INDEXES else 0)


def geometry(tables):
    heights = {t: H_HEAD + H_ROW * nrows(t, c) for t, c in tables.items()}
    totals = [sum(heights[t] for t in col) + Y_GAP * (len(col) - 1)
              for col in COLUMNS]
    tallest = max(totals)
    pos, col_of = {}, {}
    for i, col in enumerate(COLUMNS):
        x = X0 + i * (W_TABLE + X_GAP)
        y = Y0 + (tallest - totals[i]) / 2
        for t in col:
            pos[t] = (x, int(y), heights[t])
            col_of[t] = i
            y += heights[t] + Y_GAP
    return pos, col_of, tallest


def row_html(name, typ, badge, bold=False):
    """Formato de fila del ejemplo: nombre, tipo, y badge PK/FK/UK."""
    n = f"<b>{name}</b>" if bold else name
    out = f'{n} &nbsp;<font color="{INK_TYPE}">{typ}</font>'
    if badge:
        out += f'&nbsp; <font color="{INK_TYPE}"><b>{badge}</b></font>'
    return out


def build(tables, rels, pos, col_of):
    out, row_id = [], {}

    for table, cols in tables.items():
        head, _ = APPS[app_of(table)]
        x, y, h = pos[table]
        tid = f"t_{table}"
        label = SHORT[table]
        out.append(
            f'        <mxCell id="{tid}" value="{esc(label)}" '
            f'style="swimlane;html=1;rounded=1;arcSize=8;'
            f'childLayout=stackLayout;horizontal=1;startSize={H_HEAD};'
            f'horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;'
            f'collapsible=0;marginBottom=0;fillColor={head};strokeColor={head};'
            f'fontColor=#FFFFFF;fontSize={12 if len(label) > 22 else 14};'
            f'fontStyle=1;align=center;verticalAlign=middle;'
            f'swimlaneFillColor=#FFFFFF;shadow=1;strokeWidth=1;" '
            f'vertex="1" parent="1">\n'
            f'          <mxGeometry x="{x}" y="{y}" width="{W_TABLE}" '
            f'height="{h}" as="geometry"/>\n'
            f'        </mxCell>\n'
        )

        def add_row(rid, off, html, fill, ink, size=11):
            out.append(
                f'        <mxCell id="{rid}" value="{esc(html)}" '
                f'style="text;html=1;strokeColor={ROW_STROKE};fillColor={fill};'
                f'align=left;verticalAlign=middle;spacingLeft=12;spacingRight=8;'
                f'overflow=hidden;fontSize={size};fontColor={ink};'
                f'points=[[0,0.5,0],[1,0.5,0]];portConstraint=eastwest;" '
                f'vertex="1" parent="{tid}">\n'
                f'          <mxGeometry y="{off}" width="{W_TABLE}" '
                f'height="{H_ROW}" as="geometry"/>\n'
                f'        </mxCell>\n'
            )

        off = H_HEAD
        for c in cols:
            rid = f"r_{table}__{c['name']}"
            row_id[(table, c["name"])] = rid
            add_row(rid, off,
                    row_html(c["name"], c["type"], c["keys"],
                             bold="PK" in c["keys"]),
                    ROW_FILL, INK)
            off += H_ROW

        for i, cols_txt in enumerate(INDEXES.get(table, [])):
            if i == 0:
                add_row(f"i_{table}_h", off, "<b>Indexes</b>",
                        IDX_FILL, INK_NOTE, size=10)
                off += H_ROW
            add_row(f"i_{table}_{i}", off,
                    f'{cols_txt} &nbsp;<font color="{INK_TYPE}">unique</font>',
                    IDX_FILL, INK_NOTE, size=10)
            off += H_ROW

    for n, rel in enumerate(rels):
        child, parent = rel["child"], rel["parent"]
        src = row_id[(child, rel["column"])]
        dst = row_id[(parent, "id")]
        head, tint = APPS[app_of(child)]
        # el lado "1" es opcional cuando la FK admite NULL
        end = "ERone" if not rel["parent_optional"] else "ERzeroToOne"
        start = "ERone" if rel["child_one"] else "ERmany"
        if child == parent:                       # FK recursiva
            ex, ey, en, eny = 1, 0.5, 1, 0.5
        elif col_of[child] == col_of[parent]:
            ex, ey, en, eny = 0, 0.5, 0, 0.5
        elif pos[child][0] < pos[parent][0]:
            ex, ey, en, eny = 1, 0.5, 0, 0.5
        else:
            ex, ey, en, eny = 0, 0.5, 1, 0.5
        verb = VERBS.get((child, rel["column"]), rel["column"])
        value = (f'{verb}<br><font style="font-size:8px;">'
                 f'{rel["on_delete"]}</font>')
        out.append(
            f'        <mxCell id="e_{n}" value="{esc(value)}" '
            f'style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;'
            f'jettySize=auto;orthogonalLoop=1;strokeWidth=2;strokeColor={head};'
            f'exitX={ex};exitY={ey};exitDx=0;exitDy=0;'
            f'entryX={en};entryY={eny};entryDx=0;entryDy=0;'
            f'startArrow={start};startFill=0;endArrow={end};endFill=0;'
            f'fontSize=10;fontColor={head};labelBackgroundColor={tint};" '
            f'edge="1" parent="1" source="{src}" target="{dst}">\n'
            f'          <mxGeometry relative="1" as="geometry"/>\n'
            f'        </mxCell>\n'
        )
    return "".join(out), row_id


def legend(tallest):
    y = Y0 + tallest + 70
    swatches = "".join(
        f'<tr><td style="background:{head};width:18px;">&nbsp;</td>'
        f'<td style="padding:0 14px 0 8px;"><b>{app}</b></td></tr>'
        for app, (head, _) in APPS.items()
    )
    html = (
        '<div style="text-align:left;font-size:11px;color:#1F2328;">'
        '<b style="font-size:14px;">Leyenda</b><br/><br/>'
        f'<table cellpadding="2" cellspacing="0">{swatches}</table><br/>'
        '<b>PK</b> primaria &nbsp;·&nbsp; <b>FK</b> foránea &nbsp;·&nbsp; '
        '<b>UK</b> única &nbsp;·&nbsp; sufijo <b>?</b> = admite NULL<br/><br/>'
        'Cardinalidad: pata de gallo en el lado N; el lado 1 va con círculo '
        'cuando la FK admite NULL (0..1).<br/><br/>'
        'Las etiquetas <b>CASCADE</b> / <b>SET NULL</b> / <b>PROTECT</b> las '
        'aplica <b>Django</b>, no Postgres: en la base las 28 FKs son '
        'DEFERRABLE INITIALLY DEFERRED y ninguna declara ON DELETE.'
        '</div>'
    )
    return (
        f'        <mxCell id="legend" value="{esc(html)}" '
        f'style="rounded=1;arcSize=8;html=1;whiteSpace=wrap;fillColor=#FFFFFF;'
        f'strokeColor=#D0D7DE;fontColor=#1F2328;align=left;verticalAlign=top;'
        f'spacing=14;shadow=1;" vertex="1" parent="1">\n'
        f'          <mxGeometry x="{X0}" y="{y}" width="460" height="300" '
        f'as="geometry"/>\n'
        f'        </mxCell>\n'
    )


def main():
    resumen = "--resumen" in sys.argv
    out_path = HERE / ("erd-resumen.drawio" if resumen else "erd.drawio")
    tables, rels = parse(SRC)
    completo = sum(len(c) for c in tables.values())
    if resumen:
        tables = summarize(tables)
        for r in rels:                      # ninguna arista puede quedar huérfana
            if not any(c["name"] == r["column"] for c in tables[r["child"]]):
                raise SystemExit(
                    f"el resumen dejó fuera una FK: "
                    f"{r['child']}.{r['column']}"
                )
    faltan = [k for k in
              ((r["child"], r["column"]) for r in rels) if k not in VERBS]
    if faltan:
        raise SystemExit(f"relaciones sin verbo en VERBS: {faltan}")
    pos, col_of, tallest = geometry(tables)
    body, _ = build(tables, rels, pos, col_of)
    width = X0 * 2 + len(COLUMNS) * W_TABLE + (len(COLUMNS) - 1) * X_GAP
    xml = (
        '<mxfile host="app.diagrams.net" type="device">\n'
        '  <diagram id="boot-tracker-erd" name="ERD">\n'
        f'    <mxGraphModel dx="1400" dy="900" grid="0" gridSize="10" '
        f'guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" '
        f'pageScale="1" pageWidth="{width}" pageHeight="{Y0 + tallest + 420}" '
        f'background="light-dark(#FFFFFF,#FFFFFF)" math="0" shadow="0">\n'
        '      <root>\n'
        '        <mxCell id="0"/>\n'
        '        <mxCell id="1" parent="0"/>\n'
        f'{body}{legend(tallest)}'
        '      </root>\n'
        '    </mxGraphModel>\n'
        '  </diagram>\n'
        '</mxfile>\n'
    )
    out_path.write_text(xml, encoding="utf-8")
    n = sum(len(c) for c in tables.values())
    extra = f" (de {completo})" if resumen else ""
    print(f"{out_path.name}: {len(tables)} tablas, "
          f"{n} columnas{extra}, {len(rels)} relaciones")


if __name__ == "__main__":
    sys.exit(main())
