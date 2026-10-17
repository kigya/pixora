#include <cassert>
#include <cstddef>
#include <cstdint>
#include <new>
#include <stdexcept>
#include <cstdlib>

#include "jni.h"
#include "recommendation.h"

namespace {
std::size_t failAllocationSize = 0;
int allocationFailureKind = 0;
}

void* operator new(std::size_t size) {
  if (size == failAllocationSize && allocationFailureKind != 0) {
    const int kind = allocationFailureKind;
    failAllocationSize = 0;
    allocationFailureKind = 0;
    if (kind == 1) throw std::bad_alloc();
    throw std::runtime_error("injected allocation failure");
  }
  if (void* allocation = std::malloc(size)) return allocation;
  throw std::bad_alloc();
}
void operator delete(void* allocation) noexcept { std::free(allocation); }
void operator delete(void* allocation, std::size_t) noexcept { std::free(allocation); }
void* operator new[](std::size_t size) { return ::operator new(size); }
void operator delete[](void* allocation) noexcept { ::operator delete(allocation); }
void operator delete[](void* allocation, std::size_t size) noexcept {
  ::operator delete(allocation, size);
}

extern "C" jstring JNICALL
Java_dev_kigya_pixora_RecommendationEngine_analyzeRecommendation(
    JNIEnv*, jclass, jint, jint, jintArray, jint);

jstring analyzeBridge(JNIEnv* env, jclass type, jint width, jint height,
                      jintArray pixels, jint profiles = pixora::recommendation::All) {
  return Java_dev_kigya_pixora_RecommendationEngine_analyzeRecommendation(
      env, type, width, height, pixels, profiles);
}

namespace {

void assertGeneric(JNIEnv& env, jstring result) {
  assert(result != nullptr);
  assert(env.returnedString == R"({"profileId":"balanced","speed":"quality","reasonId":"generic"})");
}

jint pixel(int red, int green, int blue, int alpha = 255) {
  return static_cast<jint>((static_cast<uint32_t>(alpha) << 24) |
                           (static_cast<uint32_t>(red) << 16) |
                           (static_cast<uint32_t>(green) << 8) |
                           static_cast<uint32_t>(blue));
}

FakeJIntArray pixelGrid(int alpha) {
  FakeJIntArray result;
  constexpr int width = 96, height = 80, block = 4;
  result.values.resize(width * height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const int cell = ((x / block) * 7 + (y / block) * 11) % 6;
      result.values[y * width + x] = pixel(cell * 42, (cell * 67) % 256,
                                            255 - cell * 31, alpha);
    }
  }
  return result;
}

void invalidBoundsAndNullAreSafe() {
  assert(analyzeBridge(
             nullptr, nullptr, 96, 80, nullptr) == nullptr);
  JNIEnv env;
  assertGeneric(env, analyzeBridge(
                         &env, nullptr, 96, 80, nullptr));
  assert(env.arrayLengthCalls == 0);

  FakeJIntArray values;
  values.values.resize(4);
  for (const auto& dimensions : {std::pair<jint, jint>{1, 2}, {2, 1},
                                 {1025, 2}, {2, 1025}}) {
    JNIEnv callEnv;
    assertGeneric(callEnv,
                  analyzeBridge(
                      &callEnv, nullptr, dimensions.first, dimensions.second,
                      &values));
    assert(callEnv.arrayLengthCalls == 0);
  }
}

void arrayLengthAndJavaExceptionsArePreserved() {
  FakeJIntArray values;
  values.values.resize(3);
  JNIEnv mismatch;
  assertGeneric(mismatch,
                analyzeBridge(
                    &mismatch, nullptr, 2, 2, &values));
  assert(mismatch.arrayLengthCalls == 1);
  assert(mismatch.arrayElementsCalls == 0);

  JNIEnv lengthException;
  lengthException.exceptionOnGetArrayLength = true;
  assert(analyzeBridge(
             &lengthException, nullptr, 2, 2, &values) == nullptr);
  assert(lengthException.exception);
  assert(lengthException.newStringCalls == 0);
  assert(lengthException.arrayElementsCalls == 0);

  JNIEnv alreadyPending;
  alreadyPending.exception = true;
  assert(analyzeBridge(
             &alreadyPending, nullptr, 2, 2, &values) == nullptr);
  assert(alreadyPending.arrayLengthCalls == 0);
  assert(alreadyPending.newStringCalls == 0);
}

void failedArrayAccessIsSafeAndUnpinsWhenNeeded() {
  FakeJIntArray values;
  values.values.resize(4);
  JNIEnv unavailable;
  unavailable.failGetIntArrayElements = true;
  assertGeneric(unavailable,
                analyzeBridge(
                    &unavailable, nullptr, 2, 2, &values));
  assert(unavailable.arrayReleaseCalls == 0);

  JNIEnv accessException;
  accessException.failGetIntArrayElements = true;
  accessException.exceptionOnGetIntArrayElements = true;
  assert(analyzeBridge(
             &accessException, nullptr, 2, 2, &values) == nullptr);
  assert(accessException.exception);
  assert(accessException.newStringCalls == 0);
  assert(accessException.arrayReleaseCalls == 0);

  JNIEnv accessExceptionWithValues;
  accessExceptionWithValues.exceptionOnGetIntArrayElements = true;
  assert(analyzeBridge(
             &accessExceptionWithValues, nullptr, 2, 2, &values) == nullptr);
  assert(accessExceptionWithValues.arrayReleaseCalls == 1);
  assert(accessExceptionWithValues.releasedArrayMode == JNI_ABORT);
  assert(accessExceptionWithValues.newStringCalls == 0);

  JNIEnv releaseException;
  releaseException.exceptionOnReleaseIntArrayElements = true;
  assert(analyzeBridge(
             &releaseException, nullptr, 2, 2, &values) == nullptr);
  assert(releaseException.exception);
  assert(releaseException.newStringCalls == 0);
}

void allocationFailuresReleasePinnedArrayAndReturnFallback() {
  auto values = pixelGrid(255);
  for (const int failureKind : {1, 2}) {
    JNIEnv env;
    failAllocationSize = values.values.size() * sizeof(uint8_t) * 4;
    allocationFailureKind = failureKind;
    assertGeneric(env,
                  analyzeBridge(
                      &env, nullptr, 96, 80, &values));
    assert(env.arrayReleaseCalls == 1);
    assert(env.releasedArrayMode == JNI_ABORT);
  }

  JNIEnv releaseException;
  releaseException.exceptionOnReleaseIntArrayElements = true;
  failAllocationSize = values.values.size() * sizeof(uint8_t) * 4;
  allocationFailureKind = 1;
  assert(analyzeBridge(
             &releaseException, nullptr, 96, 80, &values) == nullptr);
  assert(releaseException.exception);
  assert(releaseException.arrayReleaseCalls == 1);
  assert(releaseException.newStringCalls == 0);
}

void validArgbConvertsAndReleasesWithAbort() {
  auto values = pixelGrid(255);
  JNIEnv env;
  const auto result =
      analyzeBridge(
          &env, nullptr, 96, 80, &values);
  assert(result != nullptr);
  assert(env.returnedString == R"({"profileId":"pixel","speed":"quality","reasonId":"pixel"})");
  assert(env.arrayElementsCalls == 1);
  assert(env.arrayReleaseCalls == 1);
  assert(env.releasedArrayMode == JNI_ABORT);
}

void transparentHiddenRgbCannotCreatePixelGrid() {
  auto values = pixelGrid(0);
  JNIEnv env;
  const auto result =
      analyzeBridge(
          &env, nullptr, 96, 80, &values);
  assertGeneric(env, result);
  assert(env.arrayReleaseCalls == 1);
  assert(env.releasedArrayMode == JNI_ABORT);
}

void structuredResultsRespectAvailability() {
  auto pixels = pixelGrid(255);
  JNIEnv fallback;
  analyzeBridge(&fallback, nullptr, 96, 80, &pixels, pixora::recommendation::Lite);
  assert(fallback.returnedString == R"({"profileId":"lite","speed":"quality","reasonId":"unavailable"})");
  JNIEnv hidden;
  analyzeBridge(&hidden, nullptr, 96, 80, &pixels, 0);
  assert(hidden.returnedString == "null");
  JNIEnv large;
  FakeJIntArray full;
  full.values.resize(1024 * 2, pixel(80, 80, 80));
  assertGeneric(large, analyzeBridge(&large, nullptr, 1024, 2, &full));
  assert(large.arrayElementsCalls == 1);
}

}  // namespace

int main() {
  structuredResultsRespectAvailability();
  invalidBoundsAndNullAreSafe();
  arrayLengthAndJavaExceptionsArePreserved();
  failedArrayAccessIsSafeAndUnpinsWhenNeeded();
  allocationFailuresReleasePinnedArrayAndReturnFallback();
  validArgbConvertsAndReleasesWithAbort();
  transparentHiddenRgbCannotCreatePixelGrid();
}
