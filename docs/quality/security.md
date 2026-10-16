# Security status0.8.0

Initial public import review: no private signing/admin keys or physical device identifiers. Gitleaks8.30.1 found public Firebase client API keys in three config files and an APK SHA-256 string in historical PRD, duplicated across import/squash commits. Exact historical fingerprints are classified in .gitleaksignore. Because a final squash changes fingerprints, .gitleaks.toml additionally requires an exact known public value AND an explicit config/document path; unknown credentials and other paths still fail. Independent review confirmed this scope. No whole-file or rule suppression. Tool archives and immutable GitHub Actions references are pinned from official upstream metadata.

Dependency scan: overriding `@grpc/grpc-js` to 1.14.5 removes the two previously reported gRPC advisories from the lockfile. OSV still reports two unpatched issues, also responsible for npm audit's propagated total of 56 vulnerable dependency nodes:

- [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): recursive pattern parsing may exhaust the Node stack. The resolved path is CLI/Metro/Jest glob tooling. Patterns come from this repository's configuration, not images or interactive app input.
- [sprintf-js GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): unbounded precision can consume Node resources. The resolved path is legacy js-yaml/argparse used by build/test tooling. Application code does not import it or accept user-provided format strings.

Both upstream advisories list no patched version as of 2026-10-16. `osv-scanner.toml` records individual, expiring dispositions through 2026-11-16; unrelated findings continue to fail. Independent review confirmed the paths and absence of imports/user input from application code. This accepts a constrained build-tool risk, not a claim that these packages are fixed. Verification against the final installed lockfile/bundle remains pending. npm's suggested React Native downgrade is not an appropriate security update for the pinned toolchain.

Full mobile source security, CodeQL and final runtime data-flow review remain pending. These checks do not prove absence of vulnerabilities.
