# Sprint Review — Sprint 3 (30 Mar – 12 Abr 2026)

## Sprint Goal

Implement the payments and conversion modules: OCR-based payment receipt processing, lead-to-bootcamper conversion flow (backend + frontend + mobile), and async email notifications.

## Team

| Role | Member |
|------|--------|
| Scrum Master | Jose Chong (Jlchong3) |
| Backend | Juan Munizaga, Zahid Díaz, Jose Chong |
| Frontend | Gabriela Jiménez, Annabella Sánchez |
| Mobile | Isabella Martín |

## Deliverables Completed

| Issue | Deliverable | Status |
|-------|-------------|--------|
| #13 | Conversion API: `POST /api/leads/{id}/convert/` → creates Bootcamper record | ✅ Done |
| #14 | Payments API + async OCR via Celery (MinIO/S3 storage) | ✅ Done |
| #15 | Email notifications: async HTML password reset via Resend + Celery | ✅ Done |
| #16 | Frontend: Lead conversion modal with cédula validation + program selection | ✅ Done |
| #17 | Frontend: Payment panel — drag&drop upload, OCR result display, approve/reject | ✅ Done |
| #18 | Mobile: Post-call log interaction screen | ✅ Done |
| #68 | Bug fix: Vite proxy pointed at localhost instead of Docker backend service | ✅ Done |
| #76 | Payment rejection flow with feedback visible to bootcamper | ✅ Done |

## In Progress / Pending

| Issue | Deliverable | Status |
|-------|-------------|--------|
| #39 | Sprint Review S3 ceremony documentation | ✅ Done (2026-06-24) |
| #104 | Mobile: web parity redesign for leads/login screens | ✅ Done — PR #105 merged (2026-06-24) |

## Velocity

- **Planned core issues:** 6 (#13–#18)
- **Completed (all issues):** 10 / 10 (100%)
- **PRs merged:** 10

## Sprint Review Evidence

- Sprint Review document: `../../../Communications/Client_Communications/Sprint_3/sprint_review_s3.pdf`
- Screenshot from review: `../../../Communications/Client_Communications/Sprint_3/review_s3.png`
- Daily standup recording: `../../../Communications/Internal_Team_Communications/Sprint_3/daily_s3.vtt`
- Daily standup screenshot: `../../../Communications/Internal_Team_Communications/Sprint_3/daily_s3.png`
- Acceptance: `../../../Communications/Client_Communications/Sprint_3/partial_delivery_acceptance.pdf`

## Key Decisions

- OCR is strictly async (Celery task) — inline processing was rejected to prevent request timeouts.
- Conversion endpoint guards: CONVERTED status cannot be set manually from the UI (enforced in frontend after Sprint 3 review).
- Cédula validation uses the Ecuadorian algorithm in `backend/apps/authentication/validators.py`.
