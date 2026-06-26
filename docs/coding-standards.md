# Coding Standards and Enforcement

This document outlines the coding standards and preemptive error detection mechanisms implemented across the different layers of the Boot-Tracker application. The goal is to ensure code quality, maintainability, and early detection of bugs and security vulnerabilities.

## Per-layer Tooling

| Layer | Tool | Purpose | Enforcement |
|---|---|---|---|
| **Backend** | `ruff` | Linter and code formatter. Detects style issues and potential bugs. | Enforced in CI (`backend-ci` -> `Run linter`). Configuration in `backend/ruff.toml`. |
| **Backend** | `mypy` | Static type checker. Detects type-related errors before runtime. | Setup in CI (`backend-ci` -> `Type check (mypy)`). |
| **Backend** | `bandit` | Security linter. Detects common security issues in Python code. | Setup in CI (`backend-ci` -> `Security scan (bandit)`). |
| **Frontend** | `ESLint` + `SonarJS` | Linter with preemptive error detection. Catches logic bugs, duplications, and cognitive complexity. | Enforced in CI (`frontend-ci` -> `Run linter`). Configuration in `frontend/eslint.config.js`. |
| **Mobile** | `expo lint` + `tsc` | Linter and type checking for React Native/Expo. | Enforced in CI (`mobile-ci` -> `Run linter`). |

## Active Rules and Justification

### Backend
- **Ruff**: Configured in `backend/ruff.toml`. Currently enforcing standard `E`, `F`, and `W` rules (pycodestyle errors, pyflakes, and pycodestyle warnings) to maintain a consistent code style. Future iterations will enforce `B` (flake8-bugbear) and `I` (isort).
- **Mypy**: Enforces type hints across the application, preventing `NoneType` errors and type mismatches.
- **Bandit**: Scans for insecure patterns (e.g., hardcoded passwords, unsafe YAML loading, shell injections).

### Frontend
- **ESLint with SonarJS**: We use `eslint-plugin-sonarjs` to extend basic ESLint rules. SonarJS rules like `no-identical-expressions`, `no-all-duplicated-branches`, and `cognitive-complexity` act as preemptive error detection (similar to PMD), catching bugs that basic style linters miss.

### Mobile
- **Expo Lint**: Ensures adherence to React Native and Expo best practices.
- **TypeScript**: Strictly types the application to prevent runtime type errors.

## Running Locally

To execute these checks locally before pushing code:

**Backend:**
```bash
docker compose exec backend ruff check .
docker compose exec backend bandit -r apps/ -ll
docker compose exec backend mypy apps/ --ignore-missing-imports
```

**Frontend:**
```bash
cd frontend
npm run lint
```

**Mobile:**
```bash
cd mobile
npm run lint
```
