#!/usr/bin/env python3
"""Deterministic context collector for the `linear-sync` agent (Boot-Tracker).

Given a Linear issue id (CB-<N>), resolves the merged PR, CI status on `main`,
and the list of changed files, then prints a single JSON object on stdout.

This is a *convenience* layer: it only shells out to the `gh` CLI and uses the
Python standard library (no pip deps). The agent can fall back to raw `gh`
commands if this script is unavailable or errors. The script never raises on a
missing piece — it records the field as null and appends to `warnings`.

Usage:
    python .claude/scripts/pr_context.py CB-40

Exit codes:
    0  success (JSON with the gathered context)
    2  the argument is not a valid CB-<N> identifier (matching guard)
"""

from __future__ import annotations

import json
import re
import subprocess
import sys

ID_RE = re.compile(r"^CB-(\d+)$", re.IGNORECASE)


def run_gh(args: list[str]) -> tuple[bool, str]:
    """Run a `gh` command; return (ok, stdout-or-stderr). Never raises."""
    try:
        proc = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError:
        return False, "gh CLI not found on PATH"
    except subprocess.TimeoutExpired:
        return False, f"gh {' '.join(args)} timed out"
    except Exception as exc:  # pragma: no cover - defensive
        return False, f"gh {' '.join(args)} failed: {exc}"
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout or "").strip()
    return True, proc.stdout


def parse_json(raw: str):
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(json.dumps({"error": "usage: pr_context.py CB-<N>"}))
        return 2

    issue_id = argv[1].strip()
    m = ID_RE.match(issue_id)
    if not m:
        # Matching guard (step 5): refuse anything that is not CB-<N>.
        print(json.dumps({"error": f"no CB-<N> id: {issue_id!r}"}))
        return 2

    number = m.group(1)
    issue_id = f"CB-{number}"  # normalise casing
    warnings: list[str] = []

    result = {
        "issue_id": issue_id,
        "branch": None,
        "pr_number": None,
        "merged_at": None,
        "labels": [],
        "ci": [],
        "changed_files": [],
        "warnings": warnings,
    }

    # --- Resolve the merged PR for the issue --------------------------------
    # Linear branch names embed `cb-<N>`; search merged PRs by that token.
    ok, out = run_gh(
        [
            "pr",
            "list",
            "--search",
            f"cb-{number}",
            "--state",
            "merged",
            "--json",
            "number,headRefName,mergedAt,labels",
            "--limit",
            "10",
        ]
    )
    prs = parse_json(out) if ok else None
    if not ok:
        warnings.append(f"pr list failed: {out}")
    elif not prs:
        warnings.append(f"no merged PR found for cb-{number}")
    else:
        # Most recently merged match wins.
        prs_sorted = sorted(
            prs, key=lambda p: p.get("mergedAt") or "", reverse=True
        )
        pr = prs_sorted[0]
        result["pr_number"] = pr.get("number")
        result["branch"] = pr.get("headRefName")
        result["merged_at"] = pr.get("mergedAt")
        result["labels"] = [
            lbl.get("name") for lbl in (pr.get("labels") or []) if lbl.get("name")
        ]

    # --- CI status on main ---------------------------------------------------
    ok, out = run_gh(
        [
            "run",
            "list",
            "--branch",
            "main",
            "--limit",
            "3",
            "--json",
            "conclusion,status,headSha,workflowName,createdAt",
        ]
    )
    runs = parse_json(out) if ok else None
    if not ok:
        warnings.append(f"run list failed: {out}")
    elif runs:
        result["ci"] = runs
    else:
        warnings.append("no CI runs found on main")

    # --- Changed files in the PR --------------------------------------------
    if result["pr_number"] is not None:
        ok, out = run_gh(["pr", "diff", str(result["pr_number"]), "--name-only"])
        if ok:
            result["changed_files"] = [
                line.strip() for line in out.splitlines() if line.strip()
            ]
        else:
            warnings.append(f"pr diff failed: {out}")

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
