# Decisions — 2026-10-16

- ADR-801: recommendations use local heuristics, without a new model; suggestions require a button press and are never applied automatically. Explicit owner decision.
- ADR-802: include the full iOS implementation and align behavior with the approved development workflow.
- ADR-803: retain the supplied examples; the owner confirmed public redistribution rights. They remain illustrative examples, not evidence of model output.
- ADR-804: iOS uses available background execution and interrupts cleanly on expiration; a retry starts from the beginning.
- ADR-805: the physical Samsung SM-S916B replaces Xiaomi for all acceptance gates; legacy xiaomi-* gate IDs may remain with an explicit override.
- ADR-806: public kigya/pixora; the primary integrator owns Git operations; task PRs target release/0.8.0, with one final squash into main and CI only on main pushes.
- ADR-807: docs/PRD.md remains the primary specification; the workflow PRD records changes and FEAT IDs. Historical reports are not fresh verification evidence.
