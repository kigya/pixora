# Decisions — 2026-10-16

- ADR-801: recommendations use local heuristics, without a new model; suggestions require a button press and are never applied automatically. Explicit owner decision.
- ADR-802: include the full iOS implementation and align behavior with the approved development workflow.
- ADR-803: retain the supplied examples; the owner confirmed public redistribution rights. They remain illustrative examples, not evidence of model output.
- ADR-804: iOS uses available background execution and interrupts cleanly on expiration; a retry starts from the beginning.
- ADR-805: the physical Samsung SM-S916B replaces Xiaomi for all acceptance gates; legacy xiaomi-* gate IDs may remain with an explicit override.
- ADR-806: public kigya/pixora; the primary integrator owns Git operations; task PRs target release/0.8.0, with one final squash into main and CI only on main pushes.
- ADR-807: docs/PRD.md remains the primary specification; the workflow PRD records changes and FEAT IDs. Historical reports are not fresh verification evidence.

## Owner's manual review — clarification on 2026-10-16

- ADR-808: the owner manually reviewed the application and reported that everything was OK. Apply suggestion hides the card for the current image; a new image receives a new suggestion.
- ADR-809: Feedback/Having Issues uses the same symmetric header with a centered title as Privacy/Licenses. The duplicate Having Issues button inside the form is removed. This applies a shared navigation preference; the private lesson database stays outside the repository.
- ADR-810: a new explicit instruction supersedes the previous 0.8 default-OFF/opt-in rule: Usage Analytics and Error Reports default to enabled, with an informational notice and independent opt-outs in Settings. Explicitly saved choices are preserved. Switches respond immediately; native storage writes are serialized.
- ADR-811: Android 12+ animates the logo on the system splash screen with AnimatedVectorDrawable; launcher-icon behavior depends on the system launcher.
- ADR-812: the owner explicitly paused further automatic and manual application tests. Changes, a release-mode build with a test signature and a Samsung installation proceed, followed by owner review. Earlier checks apply to earlier source states; new code does not inherit their PASS/100% claims. Main merge and full handoff readiness remain unconfirmed until manual acceptance and agreement on remaining required checks.
