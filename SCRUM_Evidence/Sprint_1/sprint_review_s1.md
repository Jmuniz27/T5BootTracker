# Sprint Review — Sprint 1 (2 Mar – 15 Mar 2026)

## Sprint Goal

Establish the technical foundation: database models, JWT authentication, Docker environment, CI pipeline, and skeleton screens for frontend and mobile.

## Team

| Role | Member |
|------|--------|
| Scrum Master | Jose Chong (Jlchong3) |
| Backend | Jose Chong, Zahid Díaz, Juan Munizaga |
| Frontend | Annabella Sánchez, Gabriela Jiménez |
| Mobile | Isabella Martín |
| DevOps | Juan Munizaga |

## Deliverables Completed

| Issue | Deliverable | Status |
|-------|-------------|--------|
| #1 | CustomUser model + base entities (Lead, Program, Payment) | ✅ Done |
| #2 | JWT Auth endpoints: login, logout, refresh, /me | ✅ Done |
| #3 | Docker Compose (backend + PostgreSQL + Redis) + GitHub Actions CI | ✅ Done |
| #4 | Frontend login screen with JWT flow | ✅ Done |
| #5 | Expo setup + mobile login screen | ✅ Done |
| #6 | Sprint 1 internal review + demo | ✅ Done |
| #37 | React app scaffold + base design system (Vite + Tailwind) | ✅ Done |

## Velocity

- **Planned:** 8 issues
- **Completed:** 8 (100%)
- **PRs merged:** 3

## Sprint Review Evidence

- Sprint Review document: `../../../Communications/Client_Communications/Sprint_1/sprint_review_s1.pdf`
- Acceptance: `../../../Communications/Client_Communications/Sprint_1/partial_delivery_acceptance.pdf`
- Internal retrospective: `../../../Communications/Internal_Team_Communications/Sprint_1/retrospective_screenshots_s1.png`

## Key Decisions

- PostgreSQL 16 chosen as database (replaces SQLite for prod parity).
- Redis + Celery set up from Sprint 1 to support async tasks in later sprints.
- Expo Router (file-based) selected over React Navigation for mobile.
