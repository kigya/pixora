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

- ADR-813: after further manual review, splash remains visible until JS NavigationContainer.onReady following initial settings/session refresh, and for at least 1500 ms; the animator separately runs for 1500 ms. UI/JS threads remain responsive. The shared splash lesson is stored only in the private local database. The owner accepted the other fixes and continuation of the workflow.

- ADR-814: the owner subsequently authorized automatic verification and fixes without Samsung UI interaction. Do not install the new release yet. The earlier test pause is lifted only for automatic strict coverage/security/build/CI checks. Physical UI/install checks must not receive a fabricated PASS.

## ADR-815 — corrective version 0.8.1 after main CI

The sole 0.8.0 main squash is PR #13, commit `2ea2dd2`. [Run 38955818843](https://github.com/kigya/pixora/actions/runs/38955818843) failed: setup-java v4 rejected JDK 21.0.12.1+1 formatting and npm ci received a 404 for text-table 0.3.0. The approved workflow preserves history and routes fixes through release/0.8.1, a task PR and one new version squash. No new product features. Samsung installation/UI remain deferred.

The lockfile was restored against the official registry: [eslint 8.57.1](https://registry.npmjs.org/eslint/8.57.1) requires text-table ^0.2.0; [text-table 0.2.0](https://registry.npmjs.org/text-table/0.2.0) supplies the correct version/URL. Integrity already matched 0.2.0 and was unchanged. An empty-cache npm ci installed 995 packages; checking all 932 URLs found one old 404, with the other 931 returning 2xx.

setup-java was updated to v6.1.0 at immutable SHA `b843ebf9b913146b38da2eaa7aeddf76074ae1ad`. Independent review of [normalization/matching](https://github.com/actions/setup-java/blob/b843ebf9b913146b38da2eaa7aeddf76074ae1ad/src/util.ts) and the [Temurin resolver](https://github.com/actions/setup-java/blob/b843ebf9b913146b38da2eaa7aeddf76074ae1ad/src/distributions/temurin/installer.ts) confirmed exact patch/build selection without an older-JDK fallback. Version 0.8.1/code 11 matches package/lock, Android and iOS project/generator.

After clean npm ci, local Gradle MCP could not find bare npx while refreshing the autolinking cache (b53 stopped before tests). settings.gradle invokes installed CLI 20.2.0 directly through NODE_BINARY or node from PATH. Standard RN 0.87.1 working-directory and lock/config cache inputs remain; there is no download fallback or library skipping. Independent review passed. Automatic gates/builds are repeated for 0.8.1.

## ADR-816 — corrective version 0.8.2 after iOS CI timeouts

The 0.8.1 main pipeline and subsequent documentation/publication runs passed JavaScript/security and Android, but the combined iOS/C++ CodeQL job repeatedly reached its 60-minute limit while tracing React Native Pods. The latest observed failure is [run 38972319584](https://github.com/kigya/pixora/actions/runs/38972319584) on sanitized main `d075f8f`. Preserve the sanitized branch history and README; do not merge pre-cleanup PR heads back into main.

Route the repair through release/0.8.2 and a task PR, then one version squash into main. Version 0.8.2/code 12 adds no product behavior. Separate C++ extraction and its strict coverage/source gate from unsigned iOS device Release and simulator XCTest with its own strict gate. CodeQL [supports C/C++ but not Objective-C or Objective-C++](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/); the existing mobile source scan remains responsible for iOS source scanning. Retain every automatic test, source-presence gate, security scan and release build. Automatic repairs are authorized under ADR-814; Samsung installation and UI checks remain deferred.

## ADR-817 — corrective version 0.8.3 selects the Xcode default toolchain

Main 0.8.2 is PR #18/b492ffa. [Run 39008209266](https://github.com/kigya/pixora/actions/runs/39008209266) passed JavaScript/security, Android and native C++, but the unsigned iOS Release failed to link Firebase Swift compatibility libraries. Its environment selected Metal before XcodeDefault: TOOLCHAIN_DIR pointed at Metal, while the Swift compiler and DT_TOOLCHAIN_DIR correctly used XcodeDefault. The project's normal Swift library search paths therefore resolved to the wrong toolchain. This was a hosted-environment difference; the local Release had passed.

Version 0.8.3/code 13 retains the split jobs, all strict gates and dependency pins. scripts/ios-env.sh selects the pinned Xcode default toolchain process-locally; both iOS build and test commands pass the supported xcodebuild -toolchain selector. Device/simulator build-setting checks verify existing default Swift compatibility library paths even when the parent environment contains Metal first. No dependency patch, extra library, dummy Swift source, unsupported DT_TOOLCHAIN_DIR search-path replacement or production configuration is added. Re-run local automatic gates, use task PR into release/0.8.3 and one final main squash, and verify its actual CI. Failed 0.8.2 remains recorded. Samsung installation/UI and incomplete service QA stay deferred under ADR-814.

## ADR-818 — start with the system language

The owner's 2026-10-17 correction removes the first-launch language-selection screen. Version 0.8.4/code 14 opens Home after startup settings load, including on a clean install. The native default already uses `system`; existing manual choices remain saved and can be changed in Settings. This supersedes the initial-selection part of FEAT-805 without changing the supported languages or native locale sync. LESSON-0006 records the broader Personal preference in the local shared library.

The owner requested source publication through the established GitHub PR flow without new application testing. Do not carry 0.8.3 coverage/build/device receipts forward as 0.8.4 PASS. Main-only GitHub CI may run automatically after the final merge; its result belongs to that exact commit. The existing signed 0.8.3 APK and Samsung installation are historical artifacts, not this source revision.
