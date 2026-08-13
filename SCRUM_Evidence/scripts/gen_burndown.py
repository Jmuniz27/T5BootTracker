# -*- coding: utf-8 -*-
"""
Genera burndown charts reales (issues abiertos por dia) para los sprints S4-S7
de Boot-Tracker, a partir de los datos de milestones de GitHub ya descargados
por T-04 (ver BACKLOG_ENTREGA_FINAL.md).

Fuente de datos: gh api repos/Jmuniz27/T5BootTracker/issues?milestone=<id>&state=all
guardado en milestone_<id>.tsv (columnas: number, title, assignee, state, created, closed)
"""
import io
import datetime as dt
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SCRATCH = r"C:\Users\jmuni\AppData\Local\Temp\claude\C--Users-jmuni-OneDrive-Documents-Proyectos-IngSoft\7cee0eb3-338b-49b3-bb59-6e03228a5a1c\scratchpad"
OUT_BASE = r"C:\Users\jmuni\OneDrive\Documents\Proyectos\IngSoft\boot-tracker\SCRUM_Evidence"

# sprint -> (milestone id, start_date, due_date)  -- fechas reales del milestone de GitHub
sprints = {
    4: (9,  dt.date(2026, 7, 7),  dt.date(2026, 7, 19)),
    5: (10, dt.date(2026, 7, 21), dt.date(2026, 7, 26)),
    6: (12, dt.date(2026, 7, 23), dt.date(2026, 8, 2)),
    7: (13, dt.date(2026, 8, 6),  dt.date(2026, 8, 11)),
}

def load_issues(m):
    rows = []
    with io.open(SCRATCH + "\\milestone_" + str(m) + ".tsv", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 6:
                continue
            num, title, assignee, state, created, closed = parts[:6]
            rows.append(dict(
                created=dt.datetime.strptime(created, "%Y-%m-%d").date(),
                closed=dt.datetime.strptime(closed, "%Y-%m-%d").date() if closed else None,
            ))
    return rows

for n, (mid, start, due) in sprints.items():
    issues = load_issues(mid)
    total = len(issues)
    days = [start + dt.timedelta(days=i) for i in range((due - start).days + 1)]

    remaining_actual = []
    for day in days:
        # An issue counts as "open" on `day` if it was created on/before `day`
        # (or created after the sprint started but tracked in this milestone anyway)
        # and not yet closed by end of `day`.
        open_count = sum(1 for i in issues if (i["closed"] is None or i["closed"] > day))
        remaining_actual.append(open_count)

    ideal = [total - (total * idx / (len(days) - 1) if len(days) > 1 else total) for idx in range(len(days))]

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(days, ideal, linestyle="--", color="#94a3b8", label="Ideal (linear)")
    ax.plot(days, remaining_actual, marker="o", color="#1E3A8A", label="Actual (issues open)")
    ax.set_title("Burndown chart -- Sprint " + str(n) + " (milestone GitHub #" + str(mid) + ")")
    ax.set_xlabel("Date")
    ax.set_ylabel("Open issues")
    ax.set_ylim(bottom=0)
    ax.legend()
    fig.autofmt_xdate(rotation=30)
    fig.tight_layout()

    out_path = OUT_BASE + "\\Sprint_" + str(n) + "\\burndown_s" + str(n) + ".png"
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    print("Sprint", n, "-> saved", out_path, "| total issues:", total, "| remaining at due date:", remaining_actual[-1])
