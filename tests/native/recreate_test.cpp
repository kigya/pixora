#include "recreate.h"
#include "stable-diffusion.h"

#include <atomic>
#include <cassert>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>
#include <string>
#include <thread>
#include <vector>

namespace pixora_fake_sd {
enum class GenerateMode { Success, False, NullArray, EmptyArray, NullData, BadChannels, BadWidth, BadHeight, ThrowBadAlloc, ThrowOther };
GenerateMode mode = GenerateMode::Success;
bool fail_context = false;
bool cancel_during_context_creation = false;
bool cancel_during_log_setup = false;
bool cancel_after_canvas = false;
bool fail_result_allocation = false;
bool wait_in_generate = false;
bool entered_generate = false;
bool release_generate = false;
int context_frees = 0;
int image_frees = 0;
int cancellations = 0;
int log_callbacks = 0;
sd_ctx_params_t last_context{};
sd_img_gen_params_t last_request{};
sd_lora_t last_lora{};
sd_progress_callback_t progress = nullptr;
sd_progress_callback_t last_progress = nullptr;
void* progress_user = nullptr;
void* last_progress_user = nullptr;
sd_preview_callback_t preview = nullptr;
sd_preview_callback_t last_preview = nullptr;
void* preview_user = nullptr;
sd_preview_info_t preview_info{};
uint8_t reflected_padding_sample = 0;
uint8_t reflected_content_sample = 0;
int preview_mode = -1;
int preview_interval = 0;
int configured_preview_mode = -1;
int configured_preview_interval = 0;
bool preview_denoised = true;
bool preview_noisy = true;
int preview_set_calls = 0;
std::mutex mutex;
std::condition_variable condition;
void reset() {
    std::lock_guard<std::mutex> lock(mutex);
    mode = GenerateMode::Success; fail_context = false; cancel_during_context_creation = false;
    cancel_during_log_setup = false; cancel_after_canvas = false; fail_result_allocation = false;
    wait_in_generate = false;
    entered_generate = false; release_generate = false; context_frees = image_frees = cancellations = log_callbacks = 0;
    last_context = {}; last_request = {}; last_lora = {}; progress = last_progress = nullptr;
    progress_user = last_progress_user = nullptr;
    preview = last_preview = nullptr; preview_user = nullptr; preview_info = {};
    preview_mode = configured_preview_mode = -1; preview_interval = configured_preview_interval = 0;
    preview_denoised = preview_noisy = true; preview_set_calls = 0;
    reflected_padding_sample = reflected_content_sample = 0;
}
}

void sd_ctx_params_init(sd_ctx_params_t* params) { *params = {}; }
void sd_img_gen_params_init(sd_img_gen_params_t* params) { *params = {}; }
int sd_get_num_physical_cores() { return 16; }
sd_ctx_t* new_sd_ctx(const sd_ctx_params_t* params) {
    pixora_fake_sd::last_context = *params;
    if (pixora_fake_sd::cancel_during_context_creation) pixora::recreate::cancel();
    return pixora_fake_sd::fail_context ? nullptr : new sd_ctx_t();
}
void free_sd_ctx(sd_ctx_t* context) { if (context) { ++pixora_fake_sd::context_frees; delete context; } }
void sd_set_log_callback(sd_log_callback_t callback, void* data) {
    if (callback) { ++pixora_fake_sd::log_callbacks; callback(SD_LOG_INFO, "private diagnostic", data); }
    if (pixora_fake_sd::cancel_during_log_setup) pixora::recreate::cancel();
}
void sd_set_progress_callback(sd_progress_callback_t callback, void* data) {
    pixora_fake_sd::progress = callback; pixora_fake_sd::progress_user = data;
    if (callback) { pixora_fake_sd::last_progress = callback; pixora_fake_sd::last_progress_user = data; }
}
void sd_set_preview_callback(sd_preview_callback_t callback, int mode, int interval, bool denoised, bool noisy, void* data) {
    using namespace pixora_fake_sd;
    preview = callback; preview_user = data; preview_info = {};
    preview_mode = mode; preview_interval = interval; preview_denoised = denoised; preview_noisy = noisy;
    ++preview_set_calls;
    if (callback) {
        last_preview = callback;
        configured_preview_mode = mode;
        configured_preview_interval = interval;
    }
}
sd_preview_info_t sd_get_preview_info() { return pixora_fake_sd::preview_info; }
void sd_cancel_generation(sd_ctx_t*, int mode) { assert(mode == SD_CANCEL_ALL); ++pixora_fake_sd::cancellations; }
bool generate_image(sd_ctx_t*, sd_img_gen_params_t* params, sd_image_t** images, int* count) {
    using namespace pixora_fake_sd;
    last_request = *params;
    if (params->width == 512 && params->height == 512 && params->init_image.data != nullptr) {
        const auto* pixels = static_cast<const uint8_t*>(params->init_image.data);
        const size_t padding_sample = (125u * 512u + 256u) * 3u;
        const size_t content_sample = (127u * 512u + 256u) * 3u;
        reflected_padding_sample = pixels[padding_sample];
        reflected_content_sample = pixels[content_sample];
    }
    if (params->lora_count > 0 && params->loras != nullptr) {
        last_lora = params->loras[0];
        last_request.loras = &last_lora;
    }
    {
        std::unique_lock<std::mutex> lock(mutex);
        entered_generate = true; condition.notify_all();
        if (wait_in_generate) condition.wait(lock, [] { return release_generate; });
    }
    if (progress) {
        progress(0, 0, 0, progress_user); // Invalid zero-total callbacks are ignored.
        progress(0, 1000, 0, progress_user); // SDK lazy-load callback must not leak as generation progress.
        const int actual_steps = (params->sample_params.sample_steps * 3) / 5 + 1;
        progress(0, actual_steps, 0, progress_user); // matching-looking callback without sampling metadata is ignored.
        preview_info = {2, actual_steps};
        progress(0, actual_steps, 0, progress_user); // a later sampling pass is not selected.
        preview_info = {1, 0};
        progress(0, 0, 0, progress_user); // empty sampling metadata is ignored.
        preview_info = {1, params->sample_params.sample_steps + 1};
        progress(0, params->sample_params.sample_steps + 1, 0, progress_user); // excessive SDK totals are ignored.
        preview_info = {1, actual_steps + 1};
        progress(0, actual_steps, 0, progress_user); // mismatched total for the active pass is ignored.
        preview_info = {1, actual_steps};
        progress(-1, actual_steps, 0, progress_user); // negative callback steps are ignored.
        progress(0, actual_steps + 1, 0, progress_user); // a callback total must exactly match the active pass.
        progress(actual_steps + 1, actual_steps, 0, progress_user); // steps beyond the active total are ignored.
        progress(0, actual_steps, 0, progress_user);
        progress(-1, actual_steps, 0, progress_user); // negative progress after pass recognition is ignored.
        progress(0, actual_steps, 0, progress_user); // duplicate steps do not break monotonic progress.
        progress(actual_steps + 1, actual_steps, 0, progress_user); // out-of-range steps are ignored.
        for (int step = 1; step <= actual_steps; ++step)
            progress(step, actual_steps, static_cast<float>(step), progress_user);
        progress(0, actual_steps, 0, progress_user); // VAE progress cannot rearm completed sampling progress.
        preview_info = {2, actual_steps};
        progress(0, actual_steps, 0, progress_user); // a later sampling pass is not reported.
        preview_info = {};
        progress(0, 1000, 0, progress_user); // tiled VAE callback is also filtered.
    }
    if (mode == GenerateMode::ThrowBadAlloc) throw std::bad_alloc();
    if (mode == GenerateMode::ThrowOther) throw std::runtime_error("private sdk diagnostics");
    if (mode == GenerateMode::False) return false;
    if (mode == GenerateMode::NullArray) { *images = nullptr; *count = 1; return true; }
    if (mode == GenerateMode::EmptyArray) { *images = new sd_image_t[1]{}; *count = 0; return true; }
    *images = new sd_image_t[1]{}; *count = 1;
    auto& image = (*images)[0];
    image.width = static_cast<uint32_t>(params->width); image.height = static_cast<uint32_t>(params->height);
    image.channel = mode == GenerateMode::BadChannels ? 2u : 3u;
    if (mode == GenerateMode::BadWidth) image.width--;
    if (mode == GenerateMode::BadHeight) image.height--;
    if (mode != GenerateMode::NullData) {
        image.data = new uint8_t[static_cast<size_t>(image.width) * image.height * image.channel];
        for (size_t i = 0; i < static_cast<size_t>(image.width) * image.height * image.channel; ++i)
            image.data[i] = static_cast<uint8_t>((i + 17) % 251);
    }
    return true;
}
void free_sd_images(sd_image_t* images, int count) {
    if (images) { for (int i = 0; i < count; ++i) delete[] images[i].data; delete[] images; }
    ++pixora_fake_sd::image_frees;
}
extern "C" uint8_t* pixora_recreate_test_allocate(size_t size) {
    return pixora_fake_sd::fail_result_allocation ? nullptr : static_cast<uint8_t*>(std::malloc(size));
}
extern "C" void pixora_recreate_test_after_canvas() {
    if (pixora_fake_sd::cancel_after_canvas) pixora::recreate::cancel();
}

namespace {
using pixora::recreate::Request;
using pixora::recreate::Result;
using pixora::recreate::Status;
int progress_calls = 0;
int last_step = 0;
int last_total = 0;
void on_progress(int step, int total, void*) { ++progress_calls; last_step = step; last_total = total; }
void cancel_on_step(int step, int, void*) { if (step == 1) pixora::recreate::cancel(); }
Request request(const std::vector<uint8_t>& rgba, uint32_t width = 65, uint32_t height = 33) {
    Request value; value.model_path = "diffusion.gguf"; value.lora_path = "lcm.gguf"; value.prompt = "";
    value.rgba = rgba.data(); value.width = width; value.height = height; return value;
}
Status run(const Request& req, Result* result = nullptr, pixora::recreate::ProgressCallback callback = nullptr) {
    Result local;
    const auto status = pixora::recreate::run(req, callback, nullptr, result ? result : &local);
    if (!result) pixora::recreate::free_result(&local);
    return status;
}
}

int main() {
    using namespace pixora::recreate;
    using pixora_fake_sd::GenerateMode;
    std::vector<uint8_t> rgba(65u * 33u * 4u, 127);
    for (uint32_t y = 0; y < 33; ++y) {
        for (uint32_t x = 0; x < 65; ++x) {
            const size_t offset = (static_cast<size_t>(y) * 65u + x) * 4u;
            rgba[offset] = static_cast<uint8_t>(y * 5u);
            rgba[offset + 1u] = static_cast<uint8_t>(x * 3u);
            rgba[offset + 2u] = static_cast<uint8_t>((x + y) % 255u);
            rgba[offset + 3u] = 255;
        }
    }
    Result result;

    assert(run(request(rgba), nullptr) == Status::Ok);
    Request req = request(rgba);
    assert(run(req, &result, on_progress) == Status::Ok);
    assert(progress_calls == 4 && last_total == 3 && last_step == 3);
    assert(pixora_fake_sd::last_preview != nullptr);
    assert(pixora_fake_sd::preview == nullptr);
    assert(pixora_fake_sd::configured_preview_mode == PREVIEW_NONE && pixora_fake_sd::configured_preview_interval == 1);
    assert(!pixora_fake_sd::preview_denoised && !pixora_fake_sd::preview_noisy);
    pixora_fake_sd::last_preview(0, 0, nullptr, false, nullptr); // The installed PREVIEW_NONE callback is a safe no-op.
    assert(pixora_fake_sd::last_context.model_path == req.model_path);
    assert(std::string(pixora_fake_sd::last_context.backend) == "cpu");
    assert(std::string(pixora_fake_sd::last_context.params_backend) == "disk");
    assert(pixora_fake_sd::last_context.enable_mmap);
    assert(pixora_fake_sd::last_context.disable_prefetch);
    assert(!pixora_fake_sd::last_context.eager_load);
    assert(pixora_fake_sd::last_context.conditioning_cache_size == 0);
    assert(std::string(pixora_fake_sd::last_context.max_vram) == "0.5");
    assert(pixora_fake_sd::last_context.n_threads == 2);
    const auto& sent = pixora_fake_sd::last_request;
    assert(sent.width == 512 && sent.height == 512 && sent.init_image.channel == 3);
    assert(sent.vae_tiling_params.enabled == false);
    assert(pixora_fake_sd::reflected_padding_sample == pixora_fake_sd::reflected_content_sample);
    assert(sent.lora_count == 1 && sent.loras[0].path == req.lora_path);
    assert(std::string(sent.prompt) == "high quality detailed photograph");
    assert(std::string(sent.negative_prompt).find("watermark") != std::string::npos);
    assert(sent.strength == 0.6f && sent.sample_params.guidance.txt_cfg == 1.0f);
    assert(pixora_fake_sd::log_callbacks > 0);
    assert(result.width == 65 && result.height == 33 && result.rgb != nullptr);
    free_result(&result); assert(!result.rgb && result.width == 0 && result.height == 0);
    req.memory_budget_mib = 768;
    assert(run(req) == Status::Ok);
    assert(std::string(pixora_fake_sd::last_context.max_vram) == "0.75");
    req.memory_budget_mib = 1024;
    assert(run(req) == Status::Ok);
    assert(std::string(pixora_fake_sd::last_context.max_vram) == "1.0");
    req.memory_budget_mib = 512;
    assert(run(Request{req.model_path, req.lora_path, nullptr, req.rgba, req.width, req.height}, &result) == Status::Ok);
    assert(std::string(pixora_fake_sd::last_request.prompt) == "high quality detailed photograph");
    free_result(&result);
    cancel();
    assert(pixora_fake_sd::last_progress != nullptr);
    pixora_fake_sd::last_progress(1, 1, 0, pixora_fake_sd::last_progress_user);
    reset_cancel();
    free_result(nullptr);
    Result empty_result; free_result(&empty_result);
    const std::vector<uint8_t> oversized_side(513u * 64u * 4u, 90);
    Request shrink = request(oversized_side, 513, 64);
    assert(run(shrink, &result) == Status::Ok);
    assert(result.width == 256 && result.height == 32);
    assert(pixora_fake_sd::last_request.width == 512 && pixora_fake_sd::last_request.height == 512);
    assert(pixora_fake_sd::last_request.vae_tiling_params.enabled == false);
    free_result(&result);
    const std::vector<uint8_t> one_by_thousand(1u * 1000u * 4u, 90);
    Request narrow = request(one_by_thousand, 1, 1000);
    assert(run(narrow, &result) == Status::Ok);
    assert(result.width == 1 && result.height == 256);
    assert(pixora_fake_sd::last_request.width == 512 && pixora_fake_sd::last_request.height == 512);
    free_result(&result);
    req.prompt = "a specific prompt";
    assert(run(req) == Status::Ok);
    assert(std::string(pixora_fake_sd::last_request.prompt) == "a specific prompt");
    req.steps = 8; pixora_fake_sd::reset(); progress_calls = 0;
    assert(run(req, nullptr, on_progress) == Status::Ok && last_total == 5 && last_step == 5 && progress_calls == 6);

    assert(run(req, nullptr, cancel_on_step) == Status::Cancelled);
    assert(pixora_fake_sd::cancellations > 0);
    reset_cancel();

    Request invalid = req;
    assert(run(invalid) == Status::Ok);
    assert(run(invalid, nullptr) == Status::Ok);
    auto invalid_case = [&](auto mutate) { Request bad = req; mutate(bad); Result output; assert(run(bad, &output) == Status::InvalidArgument); assert(!output.rgb); };
    invalid_case([](Request& r) { r.model_path = nullptr; });
    invalid_case([](Request& r) { r.lora_path = nullptr; });
    invalid_case([](Request& r) { r.rgba = nullptr; });
    invalid_case([](Request& r) { r.width = 0; });
    invalid_case([](Request& r) { r.height = 0; });
    invalid_case([](Request& r) { r.steps = 6; });
    invalid_case([](Request& r) { r.max_side = 257; });
    invalid_case([](Request& r) { r.max_side = 0; });
    invalid_case([](Request& r) { r.memory_budget_mib = 256; });
    invalid_case([](Request& r) { r.memory_budget_mib = 640; });
    invalid_case([](Request& r) { r.memory_budget_mib = 2048; });
    invalid_case([](Request& r) { r.cfg = 0; });
    invalid_case([](Request& r) { r.cfg = __builtin_nanf(""); });
    invalid_case([](Request& r) { r.strength = 0; });
    invalid_case([](Request& r) { r.strength = 1.1f; });
    invalid_case([](Request& r) { r.strength = __builtin_inff(); });
    invalid_case([](Request& r) { r.width = 10001; r.height = 10000; });
    assert(pixora::recreate::run(req, nullptr, nullptr, nullptr) == Status::InvalidArgument);

    for (auto mode : {GenerateMode::False, GenerateMode::NullArray, GenerateMode::EmptyArray,
                      GenerateMode::NullData, GenerateMode::BadChannels, GenerateMode::BadWidth, GenerateMode::BadHeight}) {
        pixora_fake_sd::reset(); pixora_fake_sd::mode = mode;
        Result output; assert(run(req, &output) == Status::GenerationFailed); assert(!output.rgb);
    }
    pixora_fake_sd::reset(); pixora_fake_sd::fail_context = true;
    assert(run(req, &result) == Status::ModelLoadFailed); assert(!result.rgb);
    reset_cancel(); pixora_fake_sd::reset(); pixora_fake_sd::fail_context = true;
    pixora_fake_sd::cancel_during_context_creation = true;
    assert(run(req, &result) == Status::Cancelled); assert(!result.rgb);
    reset_cancel(); pixora_fake_sd::reset(); pixora_fake_sd::cancel_during_context_creation = true;
    assert(run(req, &result) == Status::Cancelled); assert(!result.rgb);
    reset_cancel(); pixora_fake_sd::reset(); pixora_fake_sd::cancel_during_log_setup = true;
    assert(run(req, &result) == Status::Cancelled); assert(!result.rgb);
    reset_cancel(); pixora_fake_sd::reset(); pixora_fake_sd::cancel_after_canvas = true;
    assert(run(req, &result) == Status::Cancelled); assert(!result.rgb);
    reset_cancel();
    pixora_fake_sd::reset(); pixora_fake_sd::mode = GenerateMode::ThrowBadAlloc;
    assert(run(req, &result) == Status::OutOfMemory);
    pixora_fake_sd::reset(); pixora_fake_sd::mode = GenerateMode::ThrowOther;
    assert(run(req, &result) == Status::InternalError);
    pixora_fake_sd::reset(); pixora_fake_sd::fail_result_allocation = true;
    assert(run(req, &result) == Status::OutOfMemory); assert(!result.rgb);

    reset_cancel(); pixora::recreate::cancel();
    assert(run(req, &result) == Status::Cancelled);
    reset_cancel();

    pixora_fake_sd::reset(); pixora_fake_sd::wait_in_generate = true;
    std::atomic<Status> active_status{Status::InternalError};
    std::thread worker([&] { active_status = run(req); });
    {
        std::unique_lock<std::mutex> lock(pixora_fake_sd::mutex);
        pixora_fake_sd::condition.wait(lock, [] { return pixora_fake_sd::entered_generate; });
    }
    Result busy_result; assert(run(req, &busy_result) == Status::InternalError);
    cancel();
    {
        std::lock_guard<std::mutex> lock(pixora_fake_sd::mutex); pixora_fake_sd::release_generate = true;
    }
    pixora_fake_sd::condition.notify_all(); worker.join();
    assert(active_status == Status::Cancelled);
    reset_cancel();
    return 0;
}
