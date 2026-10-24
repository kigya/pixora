#include "recreate.h"

#include <stable-diffusion.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <new>
#include <string>
#include <vector>

#if defined(PIXORA_RECREATE_TESTING)
extern "C" uint8_t* pixora_recreate_test_allocate(size_t size);
extern "C" void pixora_recreate_test_after_canvas();
#endif

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
thread_local int g_last_step = -1;
thread_local bool g_reporting_steps = false;
thread_local bool g_sampling_completed = false;

void preview_noop(int, int, sd_image_t*, bool, void*) {}

struct BusyGuard {
    std::unique_lock<std::mutex> lock{g_run_mutex, std::try_to_lock};
    bool acquired() const { return lock.owns_lock(); }
};

struct CallbackGuard {
    ~CallbackGuard() {
        sd_set_progress_callback(nullptr, nullptr);
        sd_set_preview_callback(nullptr, PREVIEW_NONE, 0, false, false, nullptr);
        g_progress = nullptr;
        g_progress_data = nullptr;
        g_requested_steps = 0;
        g_step_total = 0;
        g_last_step = -1;
        g_reporting_steps = false;
        g_sampling_completed = false;
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
        // The run mutex guarantees exactly one active context; this guard owns it.
        g_active_ctx = nullptr;
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
    if (g_cancel_requested.load(std::memory_order_relaxed)) {
        std::lock_guard<std::mutex> lock(g_state_mutex);
        if (g_active_ctx != nullptr) sd_cancel_generation(g_active_ctx, SD_CANCEL_ALL);
    }

    // Progress callbacks also fire during lazy weight loading and VAE tiling.
    // The pinned SDK exposes its real sampling pass alongside the callback;
    // accept only the first img2img denoising pass with an exact step count.
    const sd_preview_info_t sampling = sd_get_preview_info();
    if (!g_sampling_completed && !g_reporting_steps && sampling.sample_pass == 1 &&
        sampling.total_steps > 0 && sampling.total_steps <= g_requested_steps &&
        total == sampling.total_steps && step >= 0 && step <= total) {
        g_reporting_steps = true;
        g_step_total = sampling.total_steps;
        g_last_step = -1;
    }
    if (g_reporting_steps && !g_sampling_completed && total == g_step_total &&
        step >= 0 && step <= g_step_total && step > g_last_step && g_progress != nullptr) {
        g_progress(step, total, g_progress_data);
        g_last_step = step;
        if (step == g_step_total) {
            g_sampling_completed = true;
        }
    }
}

void set_error(Result* result, Status status, const char* message) {
    result->status = status;
    std::snprintf(result->error, sizeof(result->error), "%s", message);
}

uint32_t reflect_index(int64_t index, uint32_t extent) {
    if (extent <= 1u) return 0u;
    const int64_t period = 2 * (static_cast<int64_t>(extent) - 1);
    int64_t wrapped = index % period;
    if (wrapped < 0) wrapped += period;
    return static_cast<uint32_t>(wrapped < extent ? wrapped : period - wrapped);
}

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

void resize_rgb_region_bilinear(const uint8_t* src, uint32_t sw, uint32_t sh, uint32_t channels,
                                uint32_t region_x, uint32_t region_y, uint32_t rw, uint32_t rh,
                                std::vector<uint8_t>& dst, uint32_t dw, uint32_t dh) {
    dst.resize(static_cast<size_t>(dw) * dh * 3u);
    for (uint32_t y = 0; y < dh; ++y) {
        const float sy = (static_cast<float>(y) + 0.5f) * rh / dh - 0.5f;
        const int y0 = std::clamp(static_cast<int>(std::floor(sy)), 0, static_cast<int>(rh) - 1);
        const int y1 = std::min(y0 + 1, static_cast<int>(rh) - 1);
        const float fy = std::clamp(sy - std::floor(sy), 0.0f, 1.0f);
        for (uint32_t x = 0; x < dw; ++x) {
            const float sx = (static_cast<float>(x) + 0.5f) * rw / dw - 0.5f;
            const int x0 = std::clamp(static_cast<int>(std::floor(sx)), 0, static_cast<int>(rw) - 1);
            const int x1 = std::min(x0 + 1, static_cast<int>(rw) - 1);
            const float fx = std::clamp(sx - std::floor(sx), 0.0f, 1.0f);
            for (uint32_t c = 0; c < 3; ++c) {
                const size_t a = (static_cast<size_t>(region_y + y0) * sw + region_x + x0) * channels + c;
                const size_t b = (static_cast<size_t>(region_y + y0) * sw + region_x + x1) * channels + c;
                const size_t d = (static_cast<size_t>(region_y + y1) * sw + region_x + x0) * channels + c;
                const size_t e = (static_cast<size_t>(region_y + y1) * sw + region_x + x1) * channels + c;
                dst[(static_cast<size_t>(y) * dw + x) * 3u + c] = static_cast<uint8_t>(std::clamp(
                    std::lround((src[a] + (src[b] - src[a]) * fx) * (1.0f - fy) +
                                (src[d] + (src[e] - src[d]) * fx) * fy), 0l, 255l));
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
        (request.steps != 4 && request.steps != 8) || request.max_side == 0 || request.max_side > 256 ||
        (request.memory_budget_mib != 512 && request.memory_budget_mib != 768 && request.memory_budget_mib != 1024) ||
        !std::isfinite(request.cfg) || request.cfg <= 0.0f || !std::isfinite(request.strength) ||
        request.strength <= 0.0f || request.strength > 1.0f) {
        set_error(result, Status::InvalidArgument, "Invalid model, image, dimensions, or generation parameters");
        return result->status;
    }
    const uint64_t pixel_count = static_cast<uint64_t>(request.width) * request.height;
    // Two uint32 dimensions multiply safely in uint64_t. The pixel cap also keeps
    // all subsequent RGBA and RGB byte counts safely within size_t.
    if (pixel_count > 100000000ull) {
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
        const double output_scale = std::min(1.0, static_cast<double>(request.max_side) /
                                                   std::max(request.width, request.height));
        const uint32_t output_w = std::max(1u, static_cast<uint32_t>(std::lround(request.width * output_scale)));
        const uint32_t output_h = std::max(1u, static_cast<uint32_t>(std::lround(request.height * output_scale)));
        // The model's 512px square canvas is required for stable img2img color and
        // composition on compact sources. Upscale small inputs for inference, then
        // crop and downsample the generated content to the unchanged public result size.
        constexpr uint32_t model_w = 512u;
        constexpr uint32_t model_h = 512u;
        const double canvas_scale = static_cast<double>(model_w) / std::max(request.width, request.height);
        const uint32_t content_w = std::clamp(static_cast<uint32_t>(std::lround(request.width * canvas_scale)), 1u, model_w);
        const uint32_t content_h = std::clamp(static_cast<uint32_t>(std::lround(request.height * canvas_scale)), 1u, model_h);
        std::vector<uint8_t> resized;
        resize_bilinear(request.rgba, request.width, request.height, resized, content_w, content_h);
        std::vector<uint8_t> padded(static_cast<size_t>(model_w) * model_h * 3u);
        const uint32_t ox = (model_w - content_w) / 2u;
        const uint32_t oy = (model_h - content_h) / 2u;
        // Reflect the content around its edges to avoid injecting flat color bands.
        for (uint32_t y = 0; y < model_h; ++y) {
            const uint32_t sy = reflect_index(static_cast<int64_t>(y) - oy, content_h);
            for (uint32_t x = 0; x < model_w; ++x) {
                const uint32_t sx = reflect_index(static_cast<int64_t>(x) - ox, content_w);
                std::memcpy(&padded[(static_cast<size_t>(y) * model_w + x) * 3u],
                            &resized[(static_cast<size_t>(sy) * content_w + sx) * 3u], 3u);
            }
        }
#if defined(PIXORA_RECREATE_TESTING)
        pixora_recreate_test_after_canvas();
#endif
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
        // Keep model tensors disk-backed and lazily loaded. CPU mmap pages remain reclaimable;
        // eager loading and asynchronous prefetch would defeat the small-memory profile.
        ctx_params.params_backend = "disk";
        ctx_params.enable_mmap = true;
        ctx_params.disable_prefetch = true;
        ctx_params.eager_load = false;
        ctx_params.conditioning_cache_size = 0;
        const char* memory_budget_gib = request.memory_budget_mib == 512 ? "0.5"
                                         : request.memory_budget_mib == 768 ? "0.75" : "1.0";
        ctx_params.max_vram = memory_budget_gib;
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
        params.vae_tiling_params.enabled = false;
        params.strength = request.strength;
        params.seed = static_cast<int64_t>(request.seed);
        params.batch_count = 1;
        params.sample_params.sample_method = LCM_SAMPLE_METHOD;
        params.sample_params.scheduler = LCM_SCHEDULER;
        params.sample_params.sample_steps = request.steps;
        params.sample_params.guidance.txt_cfg = request.cfg;
        params.sample_params.guidance.img_cfg = 1.0f;
        params.sample_params.guidance.distilled_guidance = 1.0f;
        // PREVIEW_NONE avoids decoding/rendering preview images. Registering a
        // no-op callback lets the SDK track sampling-pass metadata so progress
        // can be distinguished from lazy-load and VAE-tile callbacks.
        sd_set_preview_callback(preview_noop, PREVIEW_NONE, 1, false, false, nullptr);
        sd_set_progress_callback(progress_adapter, nullptr);
        ImageArrayGuard image_guard;
        const bool generated = generate_image(ctx, &params, &image_guard.images, &image_guard.count);
        if (g_cancel_requested.load(std::memory_order_acquire)) {
            set_error(result, Status::Cancelled, "Reconstruction cancelled");
            return result->status;
        }
        if (!generated || image_guard.images == nullptr || image_guard.count < 1 || image_guard.images[0].data == nullptr) {
            set_error(result, Status::GenerationFailed, "Image generation failed");
            return result->status;
        }
        const sd_image_t image = image_guard.images[0];
        if (image.channel < 3 || image.width < model_w || image.height < model_h) {
            set_error(result, Status::GenerationFailed, "Diffusion engine returned an unexpected image shape");
            return result->status;
        }
        std::vector<uint8_t> output;
        resize_rgb_region_bilinear(image.data, image.width, image.height, image.channel, ox, oy,
                                   content_w, content_h, output, output_w, output_h);
        const size_t out_bytes = output.size();
#if defined(PIXORA_RECREATE_TESTING)
        result->rgb = pixora_recreate_test_allocate(out_bytes);
#else
        result->rgb = static_cast<uint8_t*>(std::malloc(out_bytes));
#endif
        if (result->rgb == nullptr) {
            set_error(result, Status::OutOfMemory, "Could not allocate the generated image");
            return result->status;
        }
        std::memcpy(result->rgb, output.data(), out_bytes);
        result->width = output_w;
        result->height = output_h;
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
