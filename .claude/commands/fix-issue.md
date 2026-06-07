# /fix-issue

Fixes a GitHub issue end-to-end: reads the issue, creates a branch, implements the fix with tests, and opens a PR.

## Usage

```
/fix-issue <issue-number>
```

## Workflow

### 1. Read the issue

```bash
gh issue view $ARGUMENTS
```

Identify:
- What is broken or missing
- Which module is affected (`backend/apps/leads/`, `frontend/`, `mobile/`, etc.)
- Any acceptance criteria listed

### 2. Create a branch

Generate a short slug from the issue title (lowercase, hyphens, max 4 words):

```bash
git checkout main && git pull origin main
git checkout -b fix/issue-$ARGUMENTS-<short-slug>
```

### 3. Explore before changing

Read the relevant files before touching anything:
- For backend: check `views.py`, `services.py`, `models.py`, `serializers.py` in the affected app
- For frontend: check the relevant page/component
- For mobile: check the relevant screen

Look for existing patterns to follow (don't invent new patterns if one already exists).

### 4. Implement the fix

- **Backend**: put logic in `services.py`, not views. Keep views thin.
- **Frontend**: use TanStack Query for data, Zustand for state, react-hook-form + zod for forms.
- **Mobile**: use expo-secure-store for tokens, Expo Router for navigation.
- Write the minimum change needed — don't refactor unrelated code.

### 5. Write or update tests

- **Backend**: add or update a test in `backend/tests/test_<module>.py`
- Run: `docker-compose exec backend pytest backend/tests/test_<module>.py -v`
- All tests must pass before proceeding.

### 6. Commit

```bash
git add <changed files>
git commit -m "fix: <issue title> (#$ARGUMENTS)"
```

Do not use `git add .` — stage only the files you intentionally changed.

### 7. Open a PR

Use the `pr-author` agent to create the PR:

> "Use the pr-author agent to create a PR for the current branch. The PR fixes issue #$ARGUMENTS."

## Rules

- Never commit to `main` directly.
- Never skip tests — if the fix is complex and tests are hard to write, explain why in the PR body.
- Every backend fix that touches a view must verify `permission_classes` is present.
- If the fix requires a migration, run `docker-compose exec backend python manage.py makemigrations` and include it in the same commit.
