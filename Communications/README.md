# Communications - Evidence Guide

This folder stores the communication evidence for the Boot-Tracker project.
Keep this area in English, but preserve the original wording of transcripts when
the source material requires it.

## Folder Layout

```text
Communications/
|-- Kickoff_and_General/
|   `-- Project-wide communication evidence.
|-- Client_Communications/
|   |-- Sprint_1/
|   |-- Sprint_2/
|   |-- Sprint_3/
|   `-- Partial_Delivery/
|-- Internal_Team_Communications/
|   `-- Internal team evidence.
|-- COMMUNICATIONS_INDEX.md
|-- README.md
```

## Index Rules

- Every evidence file in `Communications/` must appear in `COMMUNICATIONS_INDEX.md`.
- Each index entry must include:
  - file path
  - brief description
  - file type
  - participants
  - date or date range
  - related sprint or issue, when available
- Keep the index as the source of truth for evidence discovery.
- If a source lives in Teams or SharePoint, add the local transcript, summary, or
  screenshot here and note the external source in the description.

## Naming Conventions

- Use descriptive, lowercase, underscore-separated filenames.
- Prefer names that identify the meeting, sprint, or purpose.
- Keep existing filenames unless a rename is needed to remove ambiguity.

Examples:

- `kickoff_meeting.md`
- `figma_review.md`
- `sprint_review_s3.pdf`
- `daily_s3_summary.md`

## How To Add New Evidence

1. Place the file in the appropriate subfolder.
2. Add a new row to `COMMUNICATIONS_INDEX.md`.
3. Keep the numbering sequential and stable.
4. Include an external-source note if the evidence originated in Teams, email,
   or SharePoint.
5. Use the commit pattern `docs(communications): add evidence NNN - short description`.

## Maintenance Notes

- Do not store large raw recordings in the repo unless they are required for the
  final deliverable.
- Prefer transcripts, summaries, or screenshots when they provide the same proof.
- If the source video lives in SharePoint or Teams, link it in the summary file
  and mirror that reference in `COMMUNICATIONS_INDEX.md`.
- Update the index whenever a file is added, renamed, or removed.
