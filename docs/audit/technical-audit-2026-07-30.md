# Technical Audit — Pre-Final-Delivery
**Boot-Tracker · 2026-07-30**
Auditor: Juan Munizaga (Jmuniz27)

---

## Executive Summary

Full technical audit of the project 12 days before the final academic delivery
(Aug 11, 2026), covering compliance with the final-delivery requirements
(spec + partial-delivery acceptance report), architecture, security, code
quality, data, and DevOps. Sources: `origin/main` (aa65f8b), Linear (96 issues),
open PRs, the final project document, and the midterm report.

Overall state: backend is solid (286 tests, all five critical business rules
verified in code); frontend covers every core screen; the CI→GHCR→VPS pipeline
is well designed. Three critical findings were identified and fixed the same
day (PRs #178, #179, #180). The largest remaining functional gaps are the
Analytics page wiring, exportable reports (HST-026), the session-inactivity
timeout (HST-003), and the acceptance-testing suite required by the marking
scheme.

## A. Critical Findings

| ID | Finding | Evidence | Severity | Status |
|---|---|---|---|---|
| SEC-1 | Privilege escalation: `PATCH /api/auth/me/` accepted `role`, `email`, `is_active`, letting any authenticated user self-promote to ADMINISTRATOR | `apps/authentication/serializers.py`, `views.py` (MeView) | Critical | **Fixed — PR #178** |
| OPS-1 | No database backups: `postgres_data`/`media_data` are local Docker volumes on a shared VPS, no pg_dump/cron | `docker-compose.hetzner.yml` | Critical | **Mitigated — PR #180** (cron install on VPS pending) |
| OPS-2 | Receipts unreachable in production: `static()` is a no-op with `DEBUG=False`; nginx lacked `client_max_body_size` so uploads >1 MB failed with 413 | `config/urls.py`, `frontend/nginx.conf` | Critical | **Fixed — PR #179** |
| SEC-2 | `/media/receipts/` served without authorization (guessable URL exposed third-party receipts) | `config/urls.py` | High | **Fixed — PR #179** (signed expiring URLs) |
| WEB-1 | Access+refresh JWT in localStorage with no refresh flow on web; a 401 leaves inconsistent state. Mobile already implements the correct pattern (`mobile/src/lib/api.ts`) | `frontend/src/api/client.js` | High | Open |
| OPS-3 | `deploy.sh` unversioned (exists only on the VPS) | `.github/workflows/ci-pr.yml` | High | Documented in PR #180; copy pending |
| DB-1 | Zero DB indexes project-wide (`Lead.deleted_at` is filtered on every query; `Lead.status/owner`, `Payment.status`) | `apps/*/models.py` | High | Open |
| PERF-1 | `PaymentMonitoringView` issues O(programs × bootcampers × 4) queries | `apps/payments/views.py` | High | Open (profiling before/after candidate) |
| SEC-3 | Login user-enumeration (`ACCOUNT_INACTIVE` before password check); insecure fallbacks in `base.py`; `seed_dev` lacks a production guard; admin `reset_password` returns plaintext with no audit log | `authentication/views.py`, `base.py` | Medium | Open |
| QA-1 | Payments web vertical has no tests; screen tests are smoke-only; `npm run coverage` broken (missing `@vitest/coverage-v8`); bandit/mypy run with `continue-on-error`; no `makemigrations --check` in CI | CI + frontend | Medium | Open |
| ARQ-1 | `LeadsDashboard.jsx` (1957 lines) + `PaymentsPage.jsx` (789) hold 43% of frontend src; duplicated Toast/StatCard/cedula validation/permissions; `apps/meetings` untested | frontend/backend | Medium | Open (opportunistic extraction only) |

## B. Gap Analysis vs Final Delivery

| Requirement | State | % | Action |
|---|---|---|---|
| HST-011 Google Calendar sync | Partial (ICS endpoint + device calendar in PR #176) | 30% | **Negotiated descope** — validate with the client at the S6 review |
| HST-017 Payment monitoring (10% rule) | Done | 100% | — |
| HST-024 Analytics dashboard | API + components done, **no page/route/sidebar entry** | 80% | Wire `AnalyticsPage` (hours) |
| HST-026 Exportable reports | Not started | 0% | Excel (openpyxl) + CSV with date/campaign filters |
| HST-027 User management | Done | 100% | — |
| HST-003 Session inactivity timeout | Not started | 0% | Frontend/mobile inactivity expiry over the 2h JWT |
| CR-004/009/010 | Done | 100% | — |
| CR-005 Forced release/reassignment | Backend+modal exist; CB-121 in progress | 80% | Close remaining criteria |
| CR-006 Management metrics | PR #172 uses a mock; no backend endpoint | 40% | Real endpoint in `apps/analytics` + ESLint fix |
| CR-011 Duplicates | Backend done; frontend modal in PR #170; CSV pending | 70% | Merge + evaluate CSV |
| Production deployment | Operational (Actions→GHCR→VPS) | 85% | Backups cron, deploy.sh versioning, healthcheck |
| Acceptance-testing tool (10 pts) | Not started | 0% | Playwright suite with BDD scenarios in CI |
| Profiling (django-silk, committed in midterm report) | Not installed | 0% | Install + document one before/after (PERF-1) |
| Load testing (JMeter, NFR) | Not started | 0% | 50-user plan on leads/payments |
| AES-256 at rest / MFA (NFR) | Not started | 0% | Document as accepted limitation |
| Signed acceptance acts S4+ / manuals / deploy guide | Partial | 50% | Highest-penalty deliverables (-100/-30) — schedule signatures |

## C. Roadmap to Aug 11

1. **Phase 0 (Jul 30–31) — criticals**: SEC-1/OPS-1/OPS-2 fixes (done, PRs #178–#180), close open PRs, restore production.
2. **Phase 1 (Aug 1–4) — missing Musts**: AnalyticsPage wiring + real CR-006 endpoint; Excel/CSV reports; HST-003 timeout; DB indexes + `PaymentMonitoringView` rewrite; close CB-121.
3. **Phase 2 (Aug 5–7) — quality & marking scheme**: Playwright BDD acceptance suite in CI; django-silk profiling with before/after; JMeter load test; hardening (SEC-3, `/health`, coverage, migration check in CI); payments-vertical tests.
4. **Phase 3 (Aug 8–11) — closing**: full regression, deployment guide + role manuals + individual contributions, signed acceptance acts, EAS mobile builds, demo rehearsal and recording.

Out of scope (documented limitations): MFA, AES-256 at rest, bidirectional
Google Calendar sync, CR-007/008/012, full LeadsDashboard refactor.

## D. Data-Protection Note

The OCR integration-test corpus (`backend/tests/test_ocr_service.py`) reads
real receipt files from a local, git-ignored directory. Verified: no receipt
has ever been committed and `.gitignore` covers `media/`. The corpus must stay
local-only, be excluded from any cloud sync and from every delivery artifact,
and be removed or replaced with synthetic data before the final handover.
