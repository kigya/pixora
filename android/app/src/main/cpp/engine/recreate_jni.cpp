#include <android/bitmap.h>
#include <jni.h>

#include <algorithm>
#include <cstdint>
#include <vector>

#include "recreate.h"

namespace {
struct Pixels {
  JNIEnv* env;
  jobject bitmap;
  AndroidBitmapInfo info{};
  void* data = nullptr;
  Pixels(JNIEnv* e, jobject b) : env(e), bitmap(b) {
    if (b && AndroidBitmap_getInfo(e, b, &info) == ANDROID_BITMAP_RESULT_SUCCESS &&
        info.format == ANDROID_BITMAP_FORMAT_RGBA_8888 &&
        AndroidBitmap_lockPixels(e, b, &data) != ANDROID_BITMAP_RESULT_SUCCESS) data = nullptr;
  }
  ~Pixels() { if (data) AndroidBitmap_unlockPixels(env, bitmap); }
  explicit operator bool() const { return data != nullptr; }
};

struct Callback {
  JavaVM* vm = nullptr;
  jobject target = nullptr;
  jmethodID progress = nullptr;
  bool cancelled = false;
};

struct ResultGuard {
  pixora::recreate::Result value{};
  ~ResultGuard() { pixora::recreate::free_result(&value); }
};

uint8_t composite_premultiplied_channel_on_white(uint8_t premultiplied, uint8_t alpha) {
  // Android Bitmap pixels are premultiplied RGBA. Composite in that representation
  // before the diffusion engine receives an opaque RGB canvas; this avoids using
  // arbitrary/black transparent RGB as image content.
  return static_cast<uint8_t>(std::min(255u, static_cast<uint32_t>(premultiplied) + 255u - alpha));
}

void on_progress(int step, int total, void* opaque) {
  auto* state = static_cast<Callback*>(opaque);
  JNIEnv* env = nullptr;
  bool attached = false;
  if (state->vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
    if (state->vm->AttachCurrentThread(&env, nullptr) != JNI_OK) {
      state->cancelled = true;
      pixora::recreate::cancel();
      return;
    }
    attached = true;
  }
  const jboolean keep_going = env->CallBooleanMethod(state->target, state->progress, step, total);
  if (env->ExceptionCheck()) { env->ExceptionClear(); state->cancelled = true; }
  if (keep_going != JNI_TRUE) state->cancelled = true;
  if (state->cancelled) pixora::recreate::cancel();
  if (attached) state->vm->DetachCurrentThread();
}

jint code(pixora::recreate::Status status) {
  using pixora::recreate::Status;
  switch (status) {
    case Status::Ok: return 0;
    case Status::Cancelled: return 1;
    case Status::OutOfMemory: return -5;
    case Status::ModelLoadFailed: return -4;
    case Status::InvalidArgument: return -6;
    case Status::GenerationFailed: return -7;
    case Status::InternalError: return -8;
  }
  return -8;
}
}  // namespace

extern "C" JNIEXPORT jint JNICALL
Java_dev_kigya_pixora_NativeEngine_recreate(JNIEnv* env, jobject, jstring model_path,
    jstring lora_path, jstring prompt, jint steps, jlong seed, jint memory_budget_mib, jobject input,
    jobject output, jobject callback) {
  Pixels source(env, input), target(env, output);
  if (!source || !target || source.info.width == 0 || source.info.height == 0) return -6;
  if (source.info.width != target.info.width || source.info.height != target.info.height) return -6;
  const uint64_t pixel_count = static_cast<uint64_t>(source.info.width) * source.info.height;
  const uint64_t minimum_stride = static_cast<uint64_t>(source.info.width) * 4u;
  if (pixel_count > 100000000ull || source.info.stride < minimum_stride ||
      target.info.stride < minimum_stride) return -6;

  const char* model = env->GetStringUTFChars(model_path, nullptr);
  const char* lora = env->GetStringUTFChars(lora_path, nullptr);
  const char* description = env->GetStringUTFChars(prompt, nullptr);
  if (!model || !lora || !description) {
    if (model) env->ReleaseStringUTFChars(model_path, model);
    if (lora) env->ReleaseStringUTFChars(lora_path, lora);
    if (description) env->ReleaseStringUTFChars(prompt, description);
    return -6;
  }
  if (!callback) {
    env->ReleaseStringUTFChars(model_path, model); env->ReleaseStringUTFChars(lora_path, lora);
    env->ReleaseStringUTFChars(prompt, description); return -6;
  }
  const jclass callback_class = env->GetObjectClass(callback);
  const jmethodID progress_method = env->GetMethodID(callback_class, "onProgress", "(II)Z");
  if (!progress_method) {
    env->ReleaseStringUTFChars(model_path, model); env->ReleaseStringUTFChars(lora_path, lora);
    env->ReleaseStringUTFChars(prompt, description); return -6;
  }
  Callback callback_state;
  if (env->GetJavaVM(&callback_state.vm) != JNI_OK || callback_state.vm == nullptr) {
    env->ReleaseStringUTFChars(model_path, model); env->ReleaseStringUTFChars(lora_path, lora);
    env->ReleaseStringUTFChars(prompt, description); return -8;
  }
  callback_state.target = env->NewGlobalRef(callback);
  if (!callback_state.target) {
    env->ReleaseStringUTFChars(model_path, model); env->ReleaseStringUTFChars(lora_path, lora);
    env->ReleaseStringUTFChars(prompt, description); return -5;
  }
  callback_state.progress = progress_method;
  jint output_code = -5;
  try {
    const auto width = source.info.width, height = source.info.height;
    std::vector<uint8_t> rgba(static_cast<size_t>(width) * height * 4);
    for (uint32_t y = 0; y < height; ++y) {
      const auto* row = static_cast<const uint8_t*>(source.data) + y * source.info.stride;
      for (uint32_t x = 0; x < width; ++x) {
        const size_t i = (static_cast<size_t>(y) * width + x) * 4;
        const uint8_t alpha = row[x * 4 + 3];
        for (int channel = 0; channel < 3; ++channel)
          rgba[i + channel] = composite_premultiplied_channel_on_white(row[x * 4 + channel], alpha);
        rgba[i + 3] = 255;
      }
    }
    pixora::recreate::Request request;
    request.model_path = model; request.lora_path = lora; request.prompt = description;
    request.rgba = rgba.data(); request.width = width; request.height = height;
    request.steps = steps; request.seed = static_cast<uint64_t>(seed); request.strength = 0.6f;
    request.cfg = 1.0f; request.max_side = 256;
    request.memory_budget_mib = static_cast<uint32_t>(memory_budget_mib);
    ResultGuard result;
    const auto status = pixora::recreate::run(request, on_progress, &callback_state, &result.value);
    output_code = code(status);
    if (status == pixora::recreate::Status::Ok) {
      if (!result.value.rgb || result.value.width != width || result.value.height != height) output_code = -8;
      else {
        for (uint32_t y = 0; y < height; ++y) {
          auto* row = static_cast<uint8_t*>(target.data) + y * target.info.stride;
          const auto* source_row = static_cast<const uint8_t*>(source.data) + y * source.info.stride;
          for (uint32_t x = 0; x < width; ++x) {
            const size_t i = (static_cast<size_t>(y) * width + x) * 3;
            const uint32_t alpha = source_row[x * 4 + 3];
            for (int channel = 0; channel < 3; ++channel)
            row[x * 4 + channel] = static_cast<uint8_t>((static_cast<uint32_t>(result.value.rgb[i + channel]) * alpha + 127) / 255);
            row[x * 4 + 3] = static_cast<uint8_t>(alpha);
          }
        }
      }
    }
  } catch (const std::bad_alloc&) {
    output_code = -5;
  } catch (...) {
    output_code = -8;
  }
  env->DeleteGlobalRef(callback_state.target);
  env->ReleaseStringUTFChars(model_path, model); env->ReleaseStringUTFChars(lora_path, lora);
  env->ReleaseStringUTFChars(prompt, description);
  return output_code;
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kigya_pixora_NativeEngine_cancelRecreate(JNIEnv*, jobject) { pixora::recreate::cancel(); }

extern "C" JNIEXPORT void JNICALL
Java_dev_kigya_pixora_NativeEngine_resetRecreateCancellation(JNIEnv*, jobject) { pixora::recreate::reset_cancel(); }
