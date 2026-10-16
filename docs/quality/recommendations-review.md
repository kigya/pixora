# Independent review: FEAT-801/802

2026-10-16, independent read-only specialist review before task PR merge.

The first review found Pixel recommendations could be influenced by hidden RGB in transparent pixels. The classifier now composites each channel over neutral gray before palette, edge and grid measurements. Fully transparent and alpha-8 patterned inputs are regression-tested. Follow-up review found no remaining correctness blocker in this scope.

The UI regression now selects Natural and 4× manually and verifies both remain selected while the recommendation is visible; Apply changes profile/speed only. Stale requests, unavailable profiles, failure fallback, original/work/output dimensions, preparation cancellation, preserved original and Fast's separate 512 px limit were reviewed. Android CMake references the shared core and JNI bridge.

Worker verification: 163 Jest tests passed; owned JS/TS statements, functions, lines and branches each 100%. Recommendation C++ harness: 110/110 lines and 64/64 branches; machine-readable report and strict gate. Typecheck and changed-source lint passed. These results precede integration; Android codegen/build, full-app native coverage and Samsung acceptance remain pending.

Three supplied quality-review examples produced no Pixel suggestion. This is a smoke check, not a representative labeled corpus or proof of recommendation accuracy. Suggestions remain optional and manually applied.
