#pragma once

#include <jni.h>

#include <cstdint>
#include <vector>

constexpr int ANDROID_BITMAP_FORMAT_RGBA_8888 = 1;
constexpr int ANDROID_BITMAP_RESULT_SUCCESS = 0;

struct AndroidBitmapInfo {
    uint32_t width = 0;
    uint32_t height = 0;
    uint32_t stride = 0;
    uint32_t format = ANDROID_BITMAP_FORMAT_RGBA_8888;
};

struct FakeBitmap {
    AndroidBitmapInfo info{};
    std::vector<uint8_t> data;
    int info_result = ANDROID_BITMAP_RESULT_SUCCESS;
    int lock_result = ANDROID_BITMAP_RESULT_SUCCESS;
    int locks = 0;
    int unlocks = 0;

    FakeBitmap(uint32_t width, uint32_t height, uint32_t stride = 0, bool allocate_pixels = true)
        : info{width, height, stride == 0 ? width * 4u : stride, ANDROID_BITMAP_FORMAT_RGBA_8888},
          data(allocate_pixels ? static_cast<size_t>(info.stride) * height : 0u) {}
};

inline int AndroidBitmap_getInfo(JNIEnv*, jobject bitmap, AndroidBitmapInfo* output) {
    if (!bitmap) return -1;
    auto* fake = static_cast<FakeBitmap*>(bitmap);
    *output = fake->info;
    return fake->info_result;
}

inline int AndroidBitmap_lockPixels(JNIEnv*, jobject bitmap, void** pixels) {
    if (!bitmap) return -1;
    auto* fake = static_cast<FakeBitmap*>(bitmap);
    ++fake->locks;
    if (fake->lock_result != ANDROID_BITMAP_RESULT_SUCCESS) return fake->lock_result;
    *pixels = fake->data.data();
    return ANDROID_BITMAP_RESULT_SUCCESS;
}

inline int AndroidBitmap_unlockPixels(JNIEnv*, jobject bitmap) {
    if (bitmap) ++static_cast<FakeBitmap*>(bitmap)->unlocks;
    return ANDROID_BITMAP_RESULT_SUCCESS;
}
