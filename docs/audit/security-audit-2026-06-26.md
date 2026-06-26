# Security Audit — Pre-Public Release
**Boot-Tracker · 2026-06-26**
Auditor: Juan Munizaga (Jmuniz27)

---

## Executive Summary

The Boot-Tracker repository was audited before changing visibility from **private → public**
on GitHub. The system is deployed in production at `boottracker.taws.espol.edu.ec` via
Coolify + Traefik. The most critical finding was that **production uses the same credentials
as those in the source code** (`SECRET_KEY` fallback and `DB_PASSWORD`), so simply making
the repo public would have exposed live production secrets. All BLOCK-level issues were
fixed in branch `chore/security-audit-public-release`. WARN-level issues were also
addressed. Rotation of the actual production credentials must be performed in Coolify
before the repo goes public (see Section B).

**History check:** `git log --all -- .env` returned no commits — `.env` files have never
been committed. The `.gitignore` covers them.

---

## Section A — Findings

### BLOCK (fixed in this PR)

| ID | File:Line | Finding | Fix Applied |
|----|-----------|---------|------------|
| B1 | `backend/config/settings/base.py:10` | `SECRET_KEY` has an insecure fallback `'django-insecure-change-me-in-production'`. Once the repo is public this becomes a known value; if Coolify's env var is ever missing, prod boots with it — forging sessions, JWT, password-reset tokens. | Added `SECRET_KEY = os.environ['SECRET_KEY']` in `production.py` (no default — startup fails loudly if missing). |
| B2 | `backend/config/settings/base.py:87` | `DB_PASSWORD` defaults to `'boottracker123'`. User confirmed production uses this same value. | Added `DATABASES['default']['PASSWORD'] = os.environ['DB_PASSWORD']` in `production.py`. |
| B3 | `backend/config/settings/base.py:140-148` | SimpleJWT uses `SECRET_KEY` as signing key (no `SIGNING_KEY` override). Resolves with B1. | Covered by B1 fix. |

### WARN (fixed in this PR)

| ID | File:Line | Finding | Fix Applied |
|----|-----------|---------|------------|
| W1 | `backend/config/urls.py:17-18` | `/api/schema/` and `/api/docs/` were public (drf-spectacular `SERVE_PERMISSIONS` defaults to `AllowAny`). Full API surface enumerable unauthenticated in production. | Set `SPECTACULAR_SETTINGS['SERVE_PERMISSIONS'] = ['rest_framework.permissions.IsAdminUser']` in `production.py`. Local dev remains open. |
| W2 | `backend/config/settings/base.py:122-137` | No rate limiting anywhere. Login and password-reset endpoints (`AllowAny`) exposed to brute-force and reset-spam. | Added `AnonRateThrottle`/`UserRateThrottle` as defaults + `'auth': '5/min'` scope. Added `throttle_classes = [ScopedRateThrottle]` + `throttle_scope = 'auth'` to `LoginView`, `PasswordResetRequestView`, `PasswordResetConfirmView`. |
| W3 | `backend/Dockerfile`, `backend/Dockerfile.prod` | No `USER` directive — gunicorn/Celery ran as root. | Added `appgroup`/`appuser` non-root user and `USER appuser` in both Dockerfiles. |
| W4 | (missing file) | No `.dockerignore` — `COPY . .` bundled `.env`, `media/`, `.coverage`, `.sql` into Docker image. | Created `backend/.dockerignore` excluding secrets, runtime artifacts, and test files. |

### INFO (no code change required)

| ID | File:Line | Finding | Action |
|----|-----------|---------|--------|
| I1 | `authentication/management/commands/seed_dev.py:58-80,164` | Dev seed creates `admin@boottracker.com/admin1234` and prints credentials. | Verify these accounts do NOT exist in prod DB (see Section B, step 4). Dev-only command. |
| I2 | `backend/config/settings/production.py:7-25` | Production security headers are correctly set: `DEBUG=False`, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `HSTS (31536000s + subdomains)`, `X_FRAME_OPTIONS='DENY'`, `SECURE_PROXY_SSL_HEADER` for Coolify. | No action needed. |
| I3 | Multiple views | RBAC coverage is solid: `DEFAULT_PERMISSION_CLASSES=[IsAuthenticated]`; every `APIView`/`ViewSet` declares role-based `permission_classes`; `AllowAny` is used only intentionally (login/refresh/reset). | No action needed. |
| I4 | `.gitignore:5,41` | `.env`, `backend/.env`, `mobile/.env` correctly ignored. Git history is clean. | Re-confirm with `git log --all -- .env` before publishing. |
| I5 | `authentication/views.py:120-154` | `RefreshView` constructs a new access token manually and returns the same refresh token, bypassing `ROTATE_REFRESH_TOKENS`/`BLACKLIST_AFTER_ROTATION`. A stolen refresh token stays valid its full lifetime. `LogoutView` blacklists correctly. | Marked as future improvement (post-delivery). Does not block publication. |
| I6 | `Communications/` | Sprint-review PDFs and acceptance forms are git-tracked. | Intentional — spec requires client communication evidence in the repo. |

---

## Section B — Coolify Handoff (BEFORE making the repo public)

> **Who:** The person who manages the Coolify deployment (currently not Juan).
> **When:** Before flipping the GitHub repo from private to public.

### Steps

1. **Rotate `SECRET_KEY`**
   Generate a new key and set it as Coolify env var `SECRET_KEY`:
   ```bash
   python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
   ```
   Effect: current sessions and JWTs are invalidated (users will need to re-login — expected and acceptable).

2. **Rotate `DB_PASSWORD`**
   - Change the password of the `boottracker` PostgreSQL user in the database.
   - Update the `DB_PASSWORD` env var in Coolify to match.
   - Redeploy. The value `boottracker123` will be publicly readable once the repo is published — it **must** no longer be valid before that happens.

3. **Verify required env vars are present in Coolify**
   With this PR, production startup will **fail** (intentionally) if any of these are missing:
   - `SECRET_KEY` (rotated in step 1)
   - `DB_PASSWORD` (rotated in step 2)
   - `ALLOWED_HOSTS`
   - `CORS_ALLOWED_ORIGINS`
   - `CSRF_TRUSTED_ORIGINS`
   - `DJANGO_SETTINGS_MODULE=config.settings.production`

4. **Verify seed users do NOT exist in production**
   The `seed_dev` command creates `admin@boottracker.com/admin1234`, `vendedor1@boottracker.com/vendedor1234`, etc. Confirm these do not exist (or have strong passwords if they were created for testing):
   ```bash
   # Connect to the production DB and check:
   SELECT email, is_staff FROM authentication_customuser WHERE email LIKE '%@boottracker.com';
   ```

5. **Redeploy and smoke test**
   - Login as a real user via `https://boottracker.taws.espol.edu.ec`.
   - Hit one authenticated endpoint (e.g. `/api/leads/`) and verify a 200 response.
   - Confirm `/api/docs/` returns 403 for non-admin users.

---

## Section C — main vs deploy branch

As of 2026-06-26, `origin/deploy` is **7 commits behind `origin/main`**.

**Files that differ** (`git diff --stat origin/main..origin/deploy`):
- `backend/apps/leads/migrations/0006_migrate_contacted_to_interested.py` ← migration only in main
- `backend/apps/leads/services.py` ← auto-transition NEW→INTERESTED, migrate CONTACTED
- `frontend/src/components/layout/AppLayout.jsx` ← minor update
- `frontend/src/pages/LeadsDashboard.jsx` ← lead state sync, UX improvements, avatars, custom selects, form validation

**Recommendation:** Before the delivery demo, merge `main` → `deploy` so that production
reflects the latest UX improvements. Confirm which branch Coolify watches (it should be
`deploy`), then:
```bash
git checkout deploy
git merge main
git push origin deploy
```
Coolify will trigger a redeploy. Run migrations after deploy:
```bash
# In Coolify post-deploy hook or manually:
python manage.py migrate
```

---

## Section D — Repository hygiene fixes (this PR)

| Fix | Description |
|-----|-------------|
| `.gitignore` additions | Added `.coverage`, `scratch_*.md`, `*.log`, `*ProjectSpec*.pdf`, `backend/query.sql` to prevent accidental commits of test artifacts and internal files. |
| `LICENSE` (MIT) | Added to the repo root. A public repo without a license is "all rights reserved" by default — ambiguous for academic evaluation and open contribution. |
| `README.md` updates | Fixed outdated "Estado del código" table (frontend/mobile are implemented, prod is deployed). Added production URL, badges (CI, license), architecture section, docs links, env var section. |

---

## Checklist — Before making the repo public

- [ ] This PR merged to `main` and CI green.
- [ ] Coolify: `SECRET_KEY` rotated (step B.1).
- [ ] Coolify: `DB_PASSWORD` rotated and PostgreSQL password updated (step B.2).
- [ ] Coolify: All required env vars confirmed present (step B.3).
- [ ] Seed accounts verified absent from production DB (step B.4).
- [ ] Coolify redeploy + smoke test passed (step B.5).
- [ ] `main` merged to `deploy` (optional but recommended for demo, Section C).
- [ ] `git log --all -- .env` returns no commits.
- [ ] GitHub repo visibility changed to **Public**.
