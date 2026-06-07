# /new-feature

Scaffolds a new feature following Boot-Tracker's existing patterns. Enters Plan Mode first, then implements after confirmation.

## Usage

```
/new-feature
```

Claude will ask clarifying questions before writing any code.

## Workflow

### Phase 1 — Understand the request

Ask the user:
1. What module does this belong to? (backend / frontend / mobile / all)
2. What is the feature name? (used for branch name)
3. Is there a GitHub issue? If so, run `gh issue view <number>`.
4. Any specific business rules or constraints?

### Phase 2 — Explore existing patterns (Plan Mode)

Before writing a single line, explore the relevant module:

**For backend features:**
```bash
# Understand the existing pattern
cat backend/apps/leads/views.py      # APIView pattern
cat backend/apps/leads/serializers.py
cat backend/apps/leads/services.py
cat backend/apps/leads/permissions.py
cat backend/apps/leads/urls.py
```

**For frontend features:**
```bash
ls frontend/src/pages/
ls frontend/src/components/
ls frontend/src/api/
ls frontend/src/store/
```

**For mobile features:**
```bash
ls mobile/app/
ls mobile/components/ 2>/dev/null || echo "no components dir yet"
```

### Phase 3 — Present implementation plan

Write a plan that includes:
- Files to create (with their purpose)
- Files to modify (with what changes)
- API endpoint design (if backend)
- What tests will be written
- Any migrations needed

**Wait for user confirmation before proceeding.**

### Phase 4 — Create branch

```bash
git checkout main && git pull origin main
git checkout -b feat/<feature-slug>
```

### Phase 5 — Implement

Follow the existing patterns exactly:

**Backend pattern:**
- `views.py` — thin views using `APIView`, always with `permission_classes`
- `services.py` — all business logic here
- `serializers.py` — input validation and output shaping
- `urls.py` — add the new endpoint
- `permissions.py` — add custom permission class if needed

**Frontend pattern (when screens exist):**
- Page component in `frontend/src/pages/`
- API client in `frontend/src/api/<module>.api.ts`
- Zustand store in `frontend/src/store/<module>.store.ts`
- shadcn/ui wrappers in `frontend/src/components/`
- Forms: react-hook-form + zod schema

**Mobile pattern:**
- Screen file in `mobile/app/<route>.tsx` (Expo Router file-based)
- Tokens: `expo-secure-store` only
- Network: handle offline state with `@react-native-community/netinfo`

### Phase 6 — Write tests

Every new backend feature needs:
- At minimum: one success test and one permission-denied test
- Place in `backend/tests/test_<module>.py`
- Run: `docker-compose exec backend pytest backend/tests/test_<module>.py -v`

### Phase 7 — Open a PR

Use the `pr-author` agent:

> "Use the pr-author agent to create a PR for the current branch."

## Critical rules

- **Every new backend endpoint must declare `permission_classes`.** No exceptions.
- **Never hardcode credentials** — use `settings.*` or `os.environ`.
- **Never put business logic in views or serializers** — it goes in `services.py`.
- **Never use `AsyncStorage` for tokens in mobile** — use `expo-secure-store`.
- If the feature adds a new model, run migrations and include them in the PR.
