# Project instructions

Перед разработкой или изменением приложения прочитать `docs/PRD.md`. Это основной источник требований MVP. Не добавлять облачные сервисы, платные зависимости, монетизацию или функции вне PRD без нового указания пользователя. Техническая документация используется для реализации требований, а не для расширения продукта.

Постоянная память Serena: `product/prd-mvp`. Предыдущее исследование рынка не добавляет требования к MVP.

Use Node 22 and JDK 21 for the pinned React Native 0.87.1 toolchain. Preserve bundled model provenance and hashes. Never substitute image resizing for AI inference. Never claim a device test passed without executing it. Keep inference fully offline; Network is authorized only for explicit feedback and Firebase Analytics/Crashlytics/Remote Config from the approved 0.7 plan. Never send images, URIs, filenames or feedback content to telemetry. Keep telemetry opt-outs independent from Remote Config. Exclude secrets/keystores from version control.

## Mandatory project skills

Before new code or refactoring read applicable local skills: `.agents/skills/react-native-best-practices/SKILL.md`, `.agents/skills/react-native-skills/SKILL.md`; for navigation use `react-navigation/SKILL.md`, for component tests `react-native-testing/SKILL.md` and the installed-version API reference. Sources are pinned in `.agents/skills/sources.json`. Project is bare React Native Android: Expo/web/iOS-only recommendations do not apply; do not add Expo, Nativewind, new state libraries or memoization without a measured need. PRD and user requirements take priority over generic skill suggestions. Profile before optimization; remeasure and retain only verified improvements. Preserve OpenMP initialization, alpha and seam correctness, cancellation and resource ownership. Never weaken coverage denominators or claim 100% without measured reports for each language.

<!-- P BUILD APP: BEGIN -->
# P Build App project guidance

The project uses the Personal-scoped P Build App workflow. Read `.p-build-app/state.json`, `docs/project-status.md`, `docs/product/idea.md`, `docs/product/prd.md` and `docs/product/features.md` before work. Read `.agents/skills/p-app-context/SKILL.md` to restore only the requested task; local tooling location comes from ignored `.p-build-app/tooling.json`.

The original idea and PRD determine scope. MVP is Bare React Native + TypeScript, free without ads/paywalls/paid AI, Android phones/tablets first and compatible iOS. Prefer local processing; optional free Firebase, no custom hosted server/automatic Supabase. Package IDs are dev.kigya.<valid-lowercase-appname>.

Main agent owns integration/Git. Workers receive explicit file ownership, must preserve others' edits and save concise reports in docs/agent-reports. Normally two levels, four active agents total including primary; nested delegation cannot exceed shared capacity. Requested model roles are Sol for main/architecture/complex review and Luna for narrow tasks; report unavailable models without silent replacement.

Load only phase-relevant source-qualified dependencies from the locked library. Local/user requirements outrank upstream Expo/EAS, paid-service, obfuscation or PR-CI examples. Do not blindly execute downloaded scripts. Use current official docs for library/API versions.

Keep durable requirements, decisions, feature/test matrices and checkpoint current; publish sanitized documentation with code. Never write credentials/private device information into tracked memory. Generic repository edits do not authorize fresh GitHub/Firebase initialization or expanding scope.

Use PRs into release/<version>, one final squash merge into main per version; CI only on main push. Run required checks locally before merge. Coverage is strict 100% of owned executable code with explicit generated/vendor exclusions. Failed checks remain blockers. Physical Xiaomi debug and release validation are distinct; other APIs/iOS are automatic checks/builds.

This workflow ends with release handoff, not final signing/GitHub Release/store publication. Record limitations honestly. On Pivot/No-Go or critical market uncertainty stop dependent implementation and explain reasons.
<!-- P BUILD APP: END -->
