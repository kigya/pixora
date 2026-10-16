#include <jni.h>

#include <cstdint>
#include <vector>

#include "../../../../../../native/recommendation/include/recommendation.h"

extern "C" JNIEXPORT jstring JNICALL
Java_dev_kigya_pixora_RecommendationEngine_analyzeRecommendation(
    JNIEnv* env, jclass, jint width, jint height, jintArray argb) {
  if (argb == nullptr || width < 2 || height < 2 || width > 256 ||
      height > 256 || env->GetArrayLength(argb) != width * height)
    return env->NewStringUTF("generic");

  jint* values = env->GetIntArrayElements(argb, nullptr);
  if (values == nullptr) return env->NewStringUTF("generic");
  std::vector<uint8_t> rgba(static_cast<size_t>(width) * height * 4);
  for (int i = 0; i < width * height; ++i) {
    const uint32_t value = static_cast<uint32_t>(values[i]);
    rgba[static_cast<size_t>(i) * 4] = (value >> 16) & 0xff;
    rgba[static_cast<size_t>(i) * 4 + 1] = (value >> 8) & 0xff;
    rgba[static_cast<size_t>(i) * 4 + 2] = value & 0xff;
    rgba[static_cast<size_t>(i) * 4 + 3] = (value >> 24) & 0xff;
  }
  env->ReleaseIntArrayElements(argb, values, JNI_ABORT);
  const auto result = pixora::recommendation::analyze(
      rgba.data(), width, height, width * 4);
  return env->NewStringUTF(result.reason_id);
}
