# 0.8.0 plan and release handoff

Status: approved 0.8.0 scope is being integrated; final validation/release handoff is pending. This roadmap contains only requirements approved in the [primary PRD](../PRD.md), [workflow PRD](prd.md) and [decisions](../engineering/decisions.md). It approves no additional features, deadlines or commercial plans.

## Approved 0.8.0 scope

1. Preserve the existing offline Android flow and add a local heuristic mode suggestion that users can accept or ignore; explain preparation of large originals with actual dimensions and original preservation. Suggestion usefulness remains a hypothesis, not a market result.
2. Complete the existing iOS main-flow port with ncnn CPU inference, export, cancellation and explicitly bounded behavior when backgrounded.
3. Show a new explanation and obtain separate optional Analytics and Crashlytics choices before collection; the old notice-display flag is not consent. Remote Config remains separate. After a successful export, use a neutral system review prompt without star filtering.
4. Ask for language on a fresh installation, synchronize native locale on both platforms, preserve existing choices/data on upgrade, support newly approved locales and migrate `pt` to `pt-BR`.
5. Keep feedback a separate, explicitly submitted action with optional reply email, size/rate/idempotency restrictions and platform/version information. Do not include support-form content in Analytics.
6. Keep Android minification/R8 and resource shrinking disabled, complete approved local quality gates and prepare a verifiable release handoff. The primary integrator handles integration/CI/Git under ADR-806.

Exact requirements/TEST IDs are in [FEAT-801–806](prd.md). Do not expand scope with new models, cloud classification, accounts, ads, paywalls or monetization.

## Completion order and handoff criteria

1. Resolve integration source/test/documentation blockers while preserving strict test thresholds. Tests without passing results do not establish completion.
2. Obtain native Android, C++ and iOS checks for the corresponding TEST IDs; JS tests do not substitute for native/device checks.
3. Pass separate physical debug and release gates on Samsung SM-S916B with real local inference/export and exact artifacts recorded privately. The existing debug installation alone is not a PASS.
4. Check consent/default-off/upgrade/revocation, Remote Config independence, system review prompts, feedback, languages/RTL/large text and platform background restrictions. Record Firebase/email delivery only with matching verification evidence.
5. Prepare a local release handoff with version/code, target configuration, hashes, test reports, limitations and remaining unknowns. Compare Definition of Done with actual local quality/status evidence.

This workflow ends at release handoff. Store signing, GitHub Releases, Google Play/App Store publication and submission are separate.

## After 0.8.0

No 30/60/90-day plan, acquisition strategy, monetization or prices are approved or introduced here. First complete 0.8 acceptance; any next testable product hypothesis requires a separate owner decision. Technical [metrics](metrics.md) describe usage and reliability; they do not predict demand or revenue.
