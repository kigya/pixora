#include "recreate.h"

#include <stable-diffusion.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <mutex>
#include <new>
#include <string>
#include <vector>

namespace pixora::recreate {
namespace {

std::mutex g_state_mutex;
std::mutex g_run_mutex;
sd_ctx_t* g_active_ctx = nullptr;
std::atomic<bool> g_cancel_requested{false};
thread_local ProgressCallback g_progress = nullptr;
thread_local void* g_progress_data = nullptr;
thread_local int g_requested_steps = 0;
thread_local int g_step_total = 0;
thread_local bool g_reporting_steps = false;

struct BusyGuard {
    std::unique_lock<std::mutex> lock{g_run_mutex, std::try_to_lock};
    bool acquired() const { return lock.owns_lock(); }
};

struct CallbackGuard {
    ~CallbackGuard() {
        sd_set_progress_callback(nullptr, nullptr);
        g_progress = nullptr;
        g_progress_data = nullptr;
        g_requested_steps = 0;
        g_step_total = 0;
        g_reporting_steps = false;
    }
};

struct ActiveContextGuard {
    explicit ActiveContextGuard(sd_ctx_t* value) : context(value) {
        std::lock_guard<std::mutex> lock(g_state_mutex);
        g_active_ctx = context;
        if (g_cancel_requested.load(std::memory_order_acquire)) {
            sd_cancel_generation(context, SD_CANCEL_ALL);
        }
    }

    ~ActiveContextGuard() {
        {
            std::lock_guard<std::mutex> lock(g_state_mutex);
            if (g_active_ctx == context) g_active_ctx = nullptr;
        }
        free_sd_ctx(context);
    }

    ActiveContextGuard(const ActiveContextGuard&) = delete;
    ActiveContextGuard& operator=(const ActiveContextGuard&) = delete;

    sd_ctx_t* context;
};

struct ImageArrayGuard {
    ~ImageArrayGuard() {
        if (images != nullptr) free_sd_images(images, count);
    }

    ImageArrayGuard(const ImageArrayGuard&) = delete;
    ImageArrayGuard& operator=(const ImageArrayGuard&) = delete;
    ImageArrayGuard() = default;

    sd_image_t* images = nullptr;
    int count = 0;
};

void progress_trampoline(int step, int total, float, void*) {
    // The SDK also uses this callback for lazy weight loads and tiled VAE work.
    // Only publish its bounded diffusion sampling sequence as user-facing steps.
    if (!g_reporting_steps && step == 0 && total > 0 && total <= g_requested_steps) {
        g_reporting_steps = true;
        g_step_total = total;
    }
    if (g_cancel_requested.load(std::memory_order_relaxed)) {
        std::lock_guard<std::mutex> lock(g_state_mutex);
        if (g_active_ctx != nullptr) sd_cancel_generation(g_active_ctx, SD_CANCEL_ALL);
    }
    if (g_reporting_steps && total == g_step_total && g_progress != nullptr) {
        g_progress(step, total, g_progress_data);
        if (step >= total) g_reporting_steps = false;
    }
}

void set_error(Result* result, Status status, const char* message) {
    result->status = status;
    if (message == nullptr) message = "Unknown reconstruction error";
    std::snprintf(result->error, sizeof(result->error), "%s", message);
}

uint32_t round_up_64(uint32_t n) { return ((n + 63u) / 64u) * 64u; }

void resize_bilinear(const uint8_t* src, uint32_t sw, uint32_t sh,
                     std::vector<uint8_t>& dst, uint32_t dw, uint32_t dh) {
    dst.resize(static_cast<size_t>(dw) * dh * 3u);
    for (uint32_t y = 0; y < dh; ++y) {
        const float sy = (static_cast<float>(y) + 0.5f) * sh / dh - 0.5f;
        const int y0 = std::clamp(static_cast<int>(std::floor(sy)), 0, static_cast<int>(sh) - 1);
        const int y1 = std::min(y0 + 1, static_cast<int>(sh) - 1);
        const float fy = std::clamp(sy - std::floor(sy), 0.0f, 1.0f);
        for (uint32_t x = 0; x < dw; ++x) {
            const float sx = (static_cast<float>(x) + 0.5f) * sw / dw - 0.5f;
            const int x0 = std::clamp(static_cast<int>(std::floor(sx)), 0, static_cast<int>(sw) - 1);
            const int x1 = std::min(x0 + 1, static_cast<int>(sw) - 1);
            const float fx = std::clamp(sx - std::floor(sx), 0.0f, 1.0f);
            for (int c = 0; c < 3; ++c) {
                const float a = src[(static_cast<size_t>(y0) * sw + x0) * 4u + c];
                const float b = src[(static_cast<size_t>(y0) * sw + x1) * 4u + c];
                const float d = src[(static_cast<size_t>(y1) * sw + x0) * 4u + c];
                const float e = src[(static_cast<size_t>(y1) * sw + x1) * 4u + c];
                dst[(static_cast<size_t>(y) * dw + x) * 3u + c] = static_cast<uint8_t>(std::clamp(
                    std::lround((a + (b - a) * fx) * (1.0f - fy) + (d + (e - d) * fx) * fy), 0l, 255l));
            }
        }
    }
}

void progress_adapter(int step, int total, float time, void* data) {
    (void)data;
    progress_trampoline(step, total, time, nullptr);
}

}  // namespace

Status run(const Request& request, ProgressCallback progress, void* user_data, Result* result) {
    if (result == nullptr) return Status::InvalidArgument;
    *result = Result{};
    result->status = Status::InternalError;
    if (!request.model_path || !request.lora_path || !request.rgba || request.width == 0 || request.height == 0 ||
        (request.steps != 4 && request.steps != 8) || request.max_side == 0 || request.max_side > 512 ||
        !std::isfinite(request.cfg) || request.cfg <= 0.0f || !std::isfinite(request.strength) ||
        request.strength <= 0.0f || request.strength > 1.0f) {
        set_error(result, Status::InvalidArgument, "Invalid model, image, dimensions, or generation parameters");
        return result->status;
    }
    const uint64_t pixel_count = static_cast<uint64_t>(request.width) * request.height;
    if (pixel_count > 100000000ull || pixel_count > std::numeric_limits<size_t>::max() / 4u) {
        set_error(result, Status::InvalidArgument, "Input image dimensions exceed the supported limit");
        return result->status;
    }
    BusyGuard busy;
    if (!busy.acquired()) {
        set_error(result, Status::InternalError, "Another reconstruction is already active");
        return result->status;
    }
    CallbackGuard callback_guard;
    if (g_cancel_requested.load(std::memory_order_acquire)) {
        set_error(result, Status::Cancelled, "Reconstruction cancelled");
        return result->status;
    }

    try {
        g_progress = progress;
        g_progress_data = user_data;
        g_requested_steps = request.steps;
        const double scale = std::min(1.0, static_cast<double>(request.max_side) /
                                            std::max(request.width, request.height));
        const uint32_t content_w = std::max(1u, static_cast<uint32_t>(std::lround(request.width * scale)));
        const uint32_t content_h = std::max(1u, static_cast<uint32_t>(std::lround(request.height * scale)));
        const uint32_t model_w = round_up_64(content_w);
        const uint32_t model_h = round_up_64(content_h);
        if (model_w > 576 || model_h > 576) {
            set_error(result, Status::InvalidArgument, "Padded generation canvas exceeds 576 pixels");
            return result->status;
        }
        std::vector<uint8_t> resized;
        resize_bilinear(request.rgba, request.width, request.height, resized, content_w, content_h);
        std::vector<uint8_t> padded(static_cast<size_t>(model_w) * model_h * 3u);
        const uint32_t ox = (model_w - content_w) / 2u;
        const uint32_t oy = (model_h - content_h) / 2u;
        // Extend edge pixels into letterbox padding to avoid injecting black borders.
        for (uint32_t y = 0; y < model_h; ++y) {
            const uint32_t sy = std::clamp(y, oy, oy + content_h - 1u) - oy;
            for (uint32_t x = 0; x < model_w; ++x) {
                const uint32_t sx = std::clamp(x, ox, ox + content_w - 1u) - ox;
                std::memcpy(&padded[(static_cast<size_t>(y) * model_w + x) * 3u],
                            &resized[(static_cast<size_t>(sy) * content_w + sx) * 3u], 3u);
            }
        }
        if (g_cancel_requested.load(std::memory_order_acquire)) {
            set_error(result, Status::Cancelled, "Reconstruction cancelled");
            return result->status;
        }

        sd_ctx_params_t ctx_params;
        sd_ctx_params_init(&ctx_params);
        // Never expose prompts, paths, or tensor diagnostics through SDK log output.
        sd_set_log_callback([](sd_log_level_t, const char*, void*) {}, nullptr);
        ctx_params.model_path = request.model_path;
        ctx_params.backend = "cpu";
        ctx_params.params_backend = "cpu";
        ctx_params.n_threads = std::clamp(sd_get_num_physical_cores(), 1, 2);
        ctx_params.lora_apply_mode = LORA_APPLY_AUTO;
        sd_ctx_t* ctx = new_sd_ctx(&ctx_params);
        if (ctx == nullptr) {
            set_error(result, g_cancel_requested.load() ? Status::Cancelled : Status::ModelLoadFailed,
                      "Could not load the local diffusion model");
            return result->status;
        }
        ActiveContextGuard context_guard(ctx);
        if (g_cancel_requested.load(std::memory_order_acquire)) {
            set_error(result, Status::Cancelled, "Reconstruction cancelled");
            return result->status;
        }
        sd_lora_t lora{false, 1.0f, request.lora_path};
        sd_img_gen_params_t params;
        sd_img_gen_params_init(&params);
        params.loras = &lora;
        params.lora_count = 1;
        params.prompt = request.prompt && request.prompt[0] ? request.prompt : "high quality detailed photograph";
        params.negative_prompt = "deformed, extra limbs, text, watermark";
        params.init_image = {model_w, model_h, 3u, padded.data()};
        params.width = static_cast<int>(model_w);
        params.height = static_cast<int>(model_h);
        params.strength = request.strength;
        params.seed = static_cast<int64_t>(request.seed);
        params.batch_count = 1;
        params.sample_params.sample_method = LCM_SAMPLE_METHOD;
        params.sample_params.scheduler = LCM_SCHEDULER;
        params.sample_params.sample_steps = request.steps;
        params.sample_params.guidance.txt_cfg = request.cfg;
        params.sample_params.guidance.img_cfg = 1.0f;
        params.sample_params.guidance.distilled_guidance = 1.0f;
        sd_set_progress_callback(progress_adapter, nullptr);
        ImageArrayGuard image_guard;
        const bool generated = generate_image(ctx, &params, &image_guard.images, &image_guard.count);
        if (g_cancel_requested.load(std::memory_order_acquire)) {
            set_error(result, Status::Cancelled, "Reconstruction cancelled");
            return result->status;
        }
        if (!generated || image_guard.images == nullptr || image_guard.count < 1 || image_guard.images[0].data == nullptr) {
            set_error(result, g_cancel_requested.load() ? Status::Cancelled : Status::GenerationFailed,
                      g_cancel_requested.load() ? "Reconstruction cancelled" : "Image generation failed");
            return result->status;
        }
        const sd_image_t image = image_guard.images[0];
        if (image.channel < 3 || image.width < model_w || image.height < model_h) {
            set_error(result, Status::GenerationFailed, "Diffusion engine returned an unexpected image shape");
            return result->status;
        }
        const size_t out_bytes = static_cast<size_t>(content_w) * content_h * 3u;
        result->rgb = static_cast<uint8_t*>(std::malloc(out_bytes));
        if (result->rgb == nullptr) {
            set_error(result, Status::OutOfMemory, "Could not allocate the generated image");
            return result->status;
        }
        for (uint32_t y = 0; y < content_h; ++y) {
            const uint8_t* src = image.data + (static_cast<size_t>(y + oy) * image.width + ox) * image.channel;
            uint8_t* dst = result->rgb + static_cast<size_t>(y) * content_w * 3u;
            for (uint32_t x = 0; x < content_w; ++x) std::memcpy(dst + x * 3u, src + x * image.channel, 3u);
        }
        result->width = content_w;
        result->height = content_h;
        result->status = Status::Ok;
        result->error[0] = '\0';
        return result->status;
    } catch (const std::bad_alloc&) {
        set_error(result, Status::OutOfMemory, "Not enough memory for image reconstruction");
    } catch (...) {
        set_error(result, Status::InternalError, "Unexpected error during image reconstruction");
    }
    g_progress = nullptr;
    g_progress_data = nullptr;
    return result->status;
}

void cancel() {
    g_cancel_requested.store(true, std::memory_order_release);
    std::lock_guard<std::mutex> lock(g_state_mutex);
    if (g_active_ctx != nullptr) sd_cancel_generation(g_active_ctx, SD_CANCEL_ALL);
}

void reset_cancel() {
    std::lock_guard<std::mutex> run_lock(g_run_mutex);
    g_cancel_requested.store(false, std::memory_order_release);
}

void free_result(Result* result) {
    if (result == nullptr) return;
    std::free(result->rgb);
    result->rgb = nullptr;
    result->width = result->height = 0;
}

}  // namespace pixora::recreate
