---
name: p-app-context
description: Restore this mobile app's durable requirements, decisions and verification state for a requested repository task or continued P Build App phase. Do not initialize external projects or publish releases merely to perform a generic edit.
---
# Restore this app's context

Read the repository AGENTS.md, .p-build-app/state.json, docs/project-status.md, docs/product/idea.md, docs/product/prd.md and docs/product/features.md. Follow links to architecture/decisions, applicable test/event matrices and reports for the requested task only. Historical chat text is not required.

Read ignored .p-build-app/tooling.json for the local library location. If tooling is missing, inspect the installed project p-build-app skill link or ask for re-bootstrap; do not invent paths or install globally. Then use library scripts/pipeline.py --project PROJECT resume for the minimum read pack and skills --stage STAGE for source-qualified dependencies. Missing local tooling does not erase portable tracked product memory.

Treat PRD, explicit user constraints and accepted decisions as authority. Resume from the checkpoint, do not scaffold over an existing app. Do not create GitHub/Firebase projects, merge/publish unrelated work or expand scope for generic edits. For an explicit full-build continuation use $p-build-app and its current stage. Save task/test results and next action in docs/project-status.md; maintain feature and test traceability without adding redundant TODOs.

No-Go/Pivot, missing checks or missing Xiaomi remain blockers for dependent stages. Review current state/evidence before concluding release readiness. Never claim unseen screenshots, remote delivery, signing or publication.
