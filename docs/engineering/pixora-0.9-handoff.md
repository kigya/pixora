# Pixora 0.9.0 source and APK handoff

Version 0.9.0/code 18 retains package `dev.kigya.pixora` and the preceding release signing identity. The source branch preserves the 0.8.7 quality/classifier work, Expo/Kinetik/Recreate migration and the approved 24 October UX/rating correction. It targets the existing draft PR into `release/0.9.0`.

The signed ARM64 APK is delivered directly to Downloads for owner testing and installed on Xiaomi. Its package/version, signature, ZIP integrity, ZIP/ELF 16 KiB alignment and all ten bundled-model hashes are verified locally. Optional reconstruction weights and signing material are absent from the APK. The visible cat pair is an illustrative degraded/clean reference pair; the clean original is not claimed as generated output.

See [the current bounded verification report](ux-090.md) for measured tests, device scenarios, current coverage and limitations. Historic `not_run` records apply to the earlier owner restriction; testing and Xiaomi were authorized for this revision. No emulator or simulator was launched.

Whole-app release acceptance remains pending: strict 100% coverage is not met across all owned layers, six high-severity dependency findings remain open, Firebase Console needs renewed authentication and the local iOS SDK is missing. Recreate is not accepted on the tested 4 GB phone; the existing 6 GiB guard remains. No real support email or store review is sent by testing.

Main merge, GitHub Release, hosted privacy-policy publication and store submission are excluded. The updated privacy source is included, while the hosted policy remains an older revision until separate publication authorization.
