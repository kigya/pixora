#include <jni.h>
#include <cstdlib>
__attribute__((noinline)) static void controlledNativeCrash() { std::abort(); }
extern "C" JNIEXPORT void JNICALL Java_dev_kigya_pixora_FirebaseDiagnosticsActivity_crashNative(JNIEnv*, jobject) { controlledNativeCrash(); }
