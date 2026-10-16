#include <jni.h>

#include <cstdint>
#include <new>
#include <vector>

#include "../../../../../../native/recommendation/include/recommendation.h"

namespace {

jstring generic(JNIEnv* env) {
  if (env->ExceptionCheck()) return nullptr;
  return env->NewStringUTF("generic");
}

class ScopedIntArrayElements {
 public:
  ScopedIntArrayElements(JNIEnv* env, jintArray array, jint* values)
      : env_(env), array_(array), values_(values) {}
  ScopedIntArrayElements(const ScopedIntArrayElements&) = delete;
  ScopedIntArrayElements& operator=(const ScopedIntArrayElements&) = delete;
  ~ScopedIntArrayElements() { release(); }

  void release() {
    if (values_ == nullptr) return;
    env_->ReleaseIntArrayElements(array_, values_, JNI_ABORT);
    values_ = nullptr;
  }

 private:
  JNIEnv* env_;
  jintArray array_;
  jint* values_;
};

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_dev_kigya_pixora_RecommendationEngine_analyzeRecommendation(
    JNIEnv* env, jclass, jint width, jint height, jintArray argb) {
  if (env == nullptr || env->ExceptionCheck()) return nullptr;
  if (argb == nullptr || width < 2 || height < 2 || width > 256 ||
      height > 256)
    return generic(env);

  const jint length = env->GetArrayLength(argb);
  if (env->ExceptionCheck()) return nullptr;
  if (length != width * height) return generic(env);

  jint* values = env->GetIntArrayElements(argb, nullptr);
  if (env->ExceptionCheck()) {
    if (values != nullptr) env->ReleaseIntArrayElements(argb, values, JNI_ABORT);
    return nullptr;
  }
  if (values == nullptr) return generic(env);
  ScopedIntArrayElements elements(env, argb, values);

  try {
    std::vector<uint8_t> rgba(static_cast<size_t>(width) * height * 4);
    for (int i = 0; i < width * height; ++i) {
      const uint32_t value = static_cast<uint32_t>(values[i]);
      rgba[static_cast<size_t>(i) * 4] = (value >> 16) & 0xff;
      rgba[static_cast<size_t>(i) * 4 + 1] = (value >> 8) & 0xff;
      rgba[static_cast<size_t>(i) * 4 + 2] = value & 0xff;
      rgba[static_cast<size_t>(i) * 4 + 3] = (value >> 24) & 0xff;
    }
    elements.release();
    if (env->ExceptionCheck()) return nullptr;
    const auto result = pixora::recommendation::analyze(
        rgba.data(), width, height, width * 4);
    return env->NewStringUTF(result.reason_id);
  } catch (const std::bad_alloc&) {
    elements.release();
    return generic(env);
  } catch (...) {
    elements.release();
    return generic(env);
  }
}
