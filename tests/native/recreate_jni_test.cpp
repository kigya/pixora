#include "recreate.h"

#include <cassert>
#include <cstdlib>
#include <cstring>
#include <new>
#include <stdexcept>
#include <utility>
#include <vector>

namespace fake_recreate {
pixora::recreate::Status status = pixora::recreate::Status::Ok;
bool invoke_progress = true;
bool null_rgb = false;
bool wrong_width = false;
bool wrong_height = false;
int calls = 0;
int cancel_calls = 0;
int reset_calls = 0;
int throw_kind = 0;
pixora::recreate::Request last_request{};
std::vector<uint8_t> input_copy;

void reset() {
    status = pixora::recreate::Status::Ok;
    invoke_progress = true;
    null_rgb = wrong_width = wrong_height = false;
    calls = cancel_calls = reset_calls = 0;
    throw_kind = 0;
    last_request = {};
    input_copy.clear();
}
}

namespace pixora::recreate {
Status run(const Request& request, ProgressCallback progress, void* user_data, Result* result) {
    ++fake_recreate::calls;
    const int cancel_count_before = fake_recreate::cancel_calls;
    fake_recreate::last_request = request;
    fake_recreate::input_copy.assign(request.rgba,
                                     request.rgba + static_cast<size_t>(request.width) * request.height * 4u);
    if (fake_recreate::throw_kind == 1) throw std::bad_alloc();
    if (fake_recreate::throw_kind == 2) throw std::runtime_error("fake failure");
    if (fake_recreate::invoke_progress && progress) progress(2, 5, user_data);
    if (fake_recreate::cancel_calls != cancel_count_before)
        return result->status = Status::Cancelled;
    result->status = fake_recreate::status;
    if (result->status != Status::Ok) return result->status;
    result->width = request.width - (fake_recreate::wrong_width ? 1u : 0u);
    result->height = request.height - (fake_recreate::wrong_height ? 1u : 0u);
    if (!fake_recreate::null_rgb) {
        const size_t bytes = static_cast<size_t>(result->width) * result->height * 3u;
        result->rgb = static_cast<uint8_t*>(std::malloc(bytes));
        if (!result->rgb) return result->status = Status::OutOfMemory;
        for (size_t i = 0; i < bytes; i += 3u) {
            result->rgb[i] = 200;
            result->rgb[i + 1u] = 100;
            result->rgb[i + 2u] = 50;
        }
    }
    return result->status;
}
void cancel() { ++fake_recreate::cancel_calls; }
void reset_cancel() { ++fake_recreate::reset_calls; }
void free_result(Result* result) {
    if (!result) return;
    std::free(result->rgb);
    result->rgb = nullptr;
}
}  // namespace pixora::recreate

#include "../../android/app/src/main/cpp/engine/recreate_jni.cpp"

namespace {
jint invoke(JNIEnv& env, FakeBitmap* source, FakeBitmap* target, FakeProgressCallback* callback,
            jstring model = "model.gguf", jstring lora = "lora.safetensors", jstring prompt = "prompt",
            jint steps = 4, jint budget = 512) {
    return Java_dev_kigya_pixora_NativeEngine_recreate(&env, nullptr, model, lora, prompt, steps, 7,
                                                       budget, source, target, callback);
}

void fill_input(FakeBitmap& bitmap) {
    const uint8_t pixels[][4] = {{50, 25, 0, 128}, {70, 80, 90, 0},
                                 {40, 50, 60, 255}, {25, 27, 30, 64}};
    for (uint32_t y = 0; y < 2; ++y)
        for (uint32_t x = 0; x < 2; ++x)
            std::memcpy(bitmap.data.data() + y * bitmap.info.stride + x * 4u,
                        pixels[y * 2u + x], 4u);
}
}

int main() {
    JNIEnv env;
    JavaVM vm;
    vm.owner_env = &env;
    env.vm = &vm;
    FakeBitmap source(2, 2, 12), target(2, 2, 12);
    fill_input(source);
    FakeProgressCallback callback;

    // Diffusion sees the premultiplied source composited over white; the output
    // still restores each exact source alpha, including transparent and soft edges.
    fake_recreate::reset();
    assert(invoke(env, &source, &target, &callback) == 0);
    assert(fake_recreate::calls == 1 && env.global_refs == 1 && env.deleted_global_refs == 1);
    assert(source.locks == 1 && target.locks == 1 && source.unlocks == 1 && target.unlocks == 1);
    assert(fake_recreate::last_request.width == 2 && fake_recreate::last_request.height == 2);
    assert(fake_recreate::last_request.steps == 4 && fake_recreate::last_request.seed == 7);
    assert(fake_recreate::last_request.max_side == 256 && fake_recreate::last_request.memory_budget_mib == 512);
    assert(fake_recreate::input_copy[0] == 177 && fake_recreate::input_copy[1] == 152 && fake_recreate::input_copy[2] == 127);
    assert(fake_recreate::input_copy[3] == 255 && fake_recreate::input_copy[7] == 255);
    assert(fake_recreate::input_copy[4] == 255 && fake_recreate::input_copy[5] == 255 && fake_recreate::input_copy[6] == 255);
    assert(fake_recreate::input_copy[8] == 40 && fake_recreate::input_copy[9] == 50 && fake_recreate::input_copy[10] == 60);
    assert(fake_recreate::input_copy[12] == 216 && fake_recreate::input_copy[13] == 218 && fake_recreate::input_copy[14] == 221);
    assert(target.data[0] == 100 && target.data[1] == 50 && target.data[2] == 25 && target.data[3] == 128);
    assert(target.data[4] == 0 && target.data[5] == 0 && target.data[6] == 0 && target.data[7] == 0);
    assert(target.data[12] == 200 && target.data[13] == 100 && target.data[14] == 50);
    assert(target.data[16] == 50 && target.data[17] == 25 && target.data[18] == 13 && target.data[19] == 64);
    assert(callback.calls == 1 && callback.last_step == 2 && callback.last_total == 5);

    // Every wrapper status is translated to the stable Java error contract.
    for (const auto pair : std::vector<std::pair<pixora::recreate::Status, jint>>{
             {pixora::recreate::Status::Cancelled, 1}, {pixora::recreate::Status::OutOfMemory, -5},
             {pixora::recreate::Status::ModelLoadFailed, -4}, {pixora::recreate::Status::InvalidArgument, -6},
             {pixora::recreate::Status::GenerationFailed, -7}, {pixora::recreate::Status::InternalError, -8}}) {
        fake_recreate::reset(); fake_recreate::status = pair.first; fake_recreate::invoke_progress = false;
        assert(invoke(env, &source, &target, &callback) == pair.second);
    }
    fake_recreate::reset(); fake_recreate::status = static_cast<pixora::recreate::Status>(99);
    fake_recreate::invoke_progress = false; assert(invoke(env, &source, &target, &callback) == -8);

    // Invalid bitmaps, dimensions, strings, and callback contracts fail before generation.
    fake_recreate::reset(); assert(invoke(env, nullptr, &target, &callback) == -6);
    assert(invoke(env, &source, nullptr, &callback) == -6);
    FakeBitmap zero_width(1, 1); zero_width.info.width = 0;
    assert(invoke(env, &zero_width, &zero_width, &callback) == -6);
    FakeBitmap zero_height(1, 1); zero_height.info.height = 0;
    assert(invoke(env, &zero_height, &zero_height, &callback) == -6);
    FakeBitmap other_size(1, 1); assert(invoke(env, &source, &other_size, &callback) == -6);
    FakeBitmap other_height(2, 1); assert(invoke(env, &source, &other_height, &callback) == -6);
    FakeBitmap invalid_info(2, 2); invalid_info.info_result = 1;
    assert(invoke(env, &invalid_info, &invalid_info, &callback) == -6);
    FakeBitmap invalid_format(2, 2); invalid_format.info.format = 2;
    assert(invoke(env, &invalid_format, &invalid_format, &callback) == -6);
    FakeBitmap invalid_lock(2, 2); invalid_lock.lock_result = 1;
    assert(invoke(env, &invalid_lock, &invalid_lock, &callback) == -6);
    FakeBitmap short_stride(2, 2); short_stride.info.stride = 7;
    assert(invoke(env, &short_stride, &short_stride, &callback) == -6);
    FakeBitmap short_target_stride(2, 2); short_target_stride.info.stride = 7;
    assert(invoke(env, &source, &short_target_stride, &callback) == -6);
    FakeBitmap oversized_source(1, 1), oversized_target(1, 1);
    oversized_source.info.width = oversized_target.info.width = 100001;
    oversized_source.info.height = oversized_target.info.height = 1000;
    oversized_source.info.stride = oversized_target.info.stride = 400004;
    assert(invoke(env, &oversized_source, &oversized_target, &callback) == -6);
    assert(invoke(env, &source, &target, &callback, nullptr) == -6);
    assert(invoke(env, &source, &target, &callback, "model", nullptr) == -6);
    assert(invoke(env, &source, &target, &callback, "model", "lora", nullptr) == -6);
    env.missing_method = "onProgress"; assert(invoke(env, &source, &target, &callback) == -6);
    env.missing_method.clear();
    env.fail_string = true; assert(invoke(env, &source, &target, &callback) == -6); env.fail_string = false;
    env.fail_global_ref = true; assert(invoke(env, &source, &target, &callback) == -5); env.fail_global_ref = false;
    env.java_vm_result = JNI_ERR; assert(invoke(env, &source, &target, &callback) == -8); env.java_vm_result = JNI_OK;
    env.vm = nullptr; assert(invoke(env, &source, &target, &callback) == -8); env.vm = &vm;
    assert(invoke(env, &source, &target, nullptr) == -6);

    // An unattached worker thread is attached for its callback and detached on return.
    fake_recreate::reset(); vm.detached = true; const int detached_before = vm.detach_count;
    assert(invoke(env, &source, &target, &callback) == 0);
    assert(vm.detach_count == detached_before + 1 && vm.detached);
    fake_recreate::reset(); vm.detached = true; vm.fail_attach = true;
    assert(invoke(env, &source, &target, &callback) == 1);
    assert(fake_recreate::cancel_calls == 1); vm.fail_attach = false; vm.detached = false;

    // User cancellation and Java callback exceptions ask the native operation to stop.
    fake_recreate::reset(); callback.proceed = false;
    assert(invoke(env, &source, &target, &callback) == 1);
    assert(fake_recreate::cancel_calls == 1); callback.proceed = true;
    fake_recreate::reset(); callback.throw_on_progress = true; env.exception = false;
    assert(invoke(env, &source, &target, &callback) == 1);
    assert(fake_recreate::cancel_calls == 1 && env.exception_clears > 0); callback.throw_on_progress = false;

    fake_recreate::reset(); fake_recreate::throw_kind = 1;
    const int frees_before_bad_alloc = env.deleted_global_refs;
    assert(invoke(env, &source, &target, &callback) == -5);
    assert(env.deleted_global_refs == frees_before_bad_alloc + 1);
    fake_recreate::reset(); fake_recreate::throw_kind = 2;
    const int frees_before_other = env.deleted_global_refs;
    assert(invoke(env, &source, &target, &callback) == -8);
    assert(env.deleted_global_refs == frees_before_other + 1);

    // Successful core status with malformed output is rejected without writing pixels.
    fake_recreate::reset(); fake_recreate::null_rgb = true;
    assert(invoke(env, &source, &target, &callback) == -8);
    fake_recreate::reset(); fake_recreate::wrong_width = true;
    assert(invoke(env, &source, &target, &callback) == -8);
    fake_recreate::reset(); fake_recreate::wrong_height = true;
    assert(invoke(env, &source, &target, &callback) == -8);

    Java_dev_kigya_pixora_NativeEngine_cancelRecreate(nullptr, nullptr);
    assert(fake_recreate::cancel_calls == 1);
    Java_dev_kigya_pixora_NativeEngine_resetRecreateCancellation(nullptr, nullptr);
    assert(fake_recreate::reset_calls == 1);
}
