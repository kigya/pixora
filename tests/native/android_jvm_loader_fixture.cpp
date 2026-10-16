// Test-only empty host library so JVM tests can initialize fbjni-backed React
// Native callback types without invoking any native bridge methods.
extern "C" void pixora_jvm_loader_fixture_marker() {}
