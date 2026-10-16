#include <jni.h>

#include <cstdint>

namespace {

void notifyCallback(JNIEnv* env, jobject callback, jint stage, jdouble milliseconds,
                    jint done, jint total) {
  if (callback == nullptr) return;
  const jclass type = env->GetObjectClass(callback);
  if (type == nullptr) return;
  const jmethodID onStage = env->GetMethodID(type, "onStage", "(I)V");
  const jmethodID onTiming = env->GetMethodID(type, "onTiming", "(ID)V");
  const jmethodID onProgress = env->GetMethodID(type, "onProgress", "(II)Z");
  if (onStage != nullptr) env->CallVoidMethod(callback, onStage, stage);
  if (onTiming != nullptr)
    env->CallVoidMethod(callback, onTiming, stage, milliseconds);
  if (onProgress != nullptr)
    env->CallBooleanMethod(callback, onProgress, done, total);
  env->DeleteLocalRef(type);
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_dev_kigya_pixora_NativeEngine_feedbackEndpoint(JNIEnv* env, jobject) {
  return env->NewStringUTF("https://fixture.invalid/feedback");
}

extern "C" JNIEXPORT jboolean JNICALL
Java_dev_kigya_pixora_NativeEngine_gpuAvailable(JNIEnv*, jobject) {
  return JNI_TRUE;
}

extern "C" JNIEXPORT jint JNICALL
Java_dev_kigya_pixora_NativeEngine_processProfile(
    JNIEnv* env, jobject, jobject, jobject, jobject, jboolean gpu, jint tile,
    jobject callback, jint profile, jboolean testGpu) {
  notifyCallback(env, callback, profile, tile, testGpu ? 1 : 0, gpu ? 1 : 0);
  return profile * 1000 + tile * 10 + (gpu ? 2 : 0) + (testGpu ? 1 : 0);
}

extern "C" JNIEXPORT jint JNICALL
Java_dev_kigya_pixora_NativeEngine_processWithModel(
    JNIEnv* env, jobject, jobject, jobject, jobject, jboolean gpu, jint tile,
    jobject callback, jboolean fast, jboolean testGpu) {
  const jint mode = fast ? 1 : 0;
  notifyCallback(env, callback, mode, tile, testGpu ? 1 : 0, gpu ? 1 : 0);
  return 3000 + tile * 10 + (gpu ? 2 : 0) + (fast ? 1 : 0) +
         (testGpu ? 4 : 0);
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kigya_pixora_NativeEngine_resetCancellation(JNIEnv*, jobject) {}

extern "C" JNIEXPORT void JNICALL
Java_dev_kigya_pixora_NativeEngine_cancel(JNIEnv*, jobject) {}

// Host JVM boundary fixture only: prove RecommendationEngine forwards the bounded
// bitmap's dimensions and ARGB sample. Physical instrumentation uses the real classifier.
extern "C" JNIEXPORT jstring JNICALL
Java_dev_kigya_pixora_RecommendationEngine_analyzeRecommendation(
    JNIEnv* env, jclass, jint width, jint height, jintArray argb) {
  if (argb == nullptr || env->GetArrayLength(argb) == 0) {
    return env->NewStringUTF("generic");
  }
  jint firstPixel = 0;
  env->GetIntArrayRegion(argb, 0, 1, &firstPixel);
  if (env->ExceptionCheck()) return nullptr;
  if (width != 2 || height != 1) return env->NewStringUTF("generic");
  switch (static_cast<std::uint32_t>(firstPixel)) {
    case 0xff123456U:
      return env->NewStringUTF("photo");
    case 0xff112233U:
      return env->NewStringUTF("art");
    case 0xffabcdefU:
      return env->NewStringUTF("pixel");
    default:
      return env->NewStringUTF("generic");
  }
}
