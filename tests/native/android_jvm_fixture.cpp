#include <jni.h>

#include <cstdint>
#include <cstdio>
#include <cstring>

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

// Host JVM boundary fixture only: tests forwarding/transport, not classification.
// The shared C++ suite and real JNI suite own classifier/availability assertions.
extern "C" JNIEXPORT jstring JNICALL
Java_dev_kigya_pixora_RecommendationEngine_analyzeRecommendation(
    JNIEnv* env, jclass, jint width, jint height, jintArray argb, jint profiles) {
  const char* profile = "balanced";
  const char* reason = "generic";
  int bit = 1;
  if (argb != nullptr && env->GetArrayLength(argb) > 0) {
    jint firstPixel = 0;
    env->GetIntArrayRegion(argb, 0, 1, &firstPixel);
    if (env->ExceptionCheck()) return nullptr;
    if (width == 2 && height == 1) switch (static_cast<std::uint32_t>(firstPixel)) {
      case 0xff123456U: profile="standard"; reason="photo"; bit=0; break;
      case 0xff112233U: profile="art"; reason="art"; bit=4; break;
      case 0xffabcdefU: profile="pixel"; reason="pixel"; bit=5; break;
      case 0xff445566U: profile="natural"; reason="smooth"; bit=2; break;
      case 0xff778899U: reason="mixed"; break;
    }
  }
  if (!(profiles & (1 << bit))) {
    const char* alternatives[]={"standard","balanced","natural","lite"};
    profile=nullptr;
    for(int i=0;i<4;++i) if(profiles & (1<<i)) {profile=alternatives[i];break;}
    reason="unavailable";
  }
  if(!profile)return env->NewStringUTF("null");
  char json[192];
  std::snprintf(json,sizeof(json),
      "{\"profileId\":\"%s\",\"speed\":\"quality\",\"reasonId\":\"%s\"}",profile,reason);
  return env->NewStringUTF(json);
}
