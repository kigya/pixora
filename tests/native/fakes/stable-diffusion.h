#pragma once

#include <cstdint>

struct sd_ctx_t {};
enum sd_log_level_t { SD_LOG_INFO = 0 };
enum { SD_CANCEL_ALL = 1, LORA_APPLY_AUTO = 0, LCM_SAMPLE_METHOD = 1, LCM_SCHEDULER = 1, PREVIEW_NONE = 0 };

struct sd_ctx_params_t {
    const char* model_path = nullptr;
    const char* backend = nullptr;
    const char* params_backend = nullptr;
    const char* max_vram = nullptr;
    bool enable_mmap = false;
    bool disable_prefetch = false;
    bool eager_load = false;
    int conditioning_cache_size = 0;
    int n_threads = 0;
    int lora_apply_mode = 0;
};
struct sd_image_t {
    uint32_t width = 0;
    uint32_t height = 0;
    uint32_t channel = 0;
    uint8_t* data = nullptr;
};
struct sd_lora_t { bool enabled; float multiplier; const char* path; };
struct sd_guidance_t { float txt_cfg = 0; float img_cfg = 0; float distilled_guidance = 0; };
struct sd_sample_params_t {
    int sample_method = 0;
    int scheduler = 0;
    int sample_steps = 0;
    sd_guidance_t guidance;
};
struct sd_tiling_params_t {
    bool enabled = false;
    bool temporal_tiling = false;
    int tile_size_w = 0;
    int tile_size_h = 0;
    float target_overlap = 0;
    float rel_size_w = 0;
    float rel_size_h = 0;
    const char* extra_tiling_args = nullptr;
};
struct sd_img_gen_params_t {
    sd_lora_t* loras = nullptr;
    int lora_count = 0;
    const char* prompt = nullptr;
    const char* negative_prompt = nullptr;
    sd_image_t init_image;
    int width = 0;
    int height = 0;
    float strength = 0;
    int64_t seed = 0;
    int batch_count = 0;
    sd_sample_params_t sample_params;
    sd_tiling_params_t vae_tiling_params;
};
using sd_progress_callback_t = void (*)(int, int, float, void*);
using sd_log_callback_t = void (*)(sd_log_level_t, const char*, void*);
using sd_preview_callback_t = void (*)(int, int, sd_image_t*, bool, void*);
struct sd_preview_info_t { int sample_pass = 0; int total_steps = 0; };

void sd_ctx_params_init(sd_ctx_params_t* params);
void sd_img_gen_params_init(sd_img_gen_params_t* params);
int sd_get_num_physical_cores();
sd_ctx_t* new_sd_ctx(const sd_ctx_params_t* params);
void free_sd_ctx(sd_ctx_t* context);
void sd_set_log_callback(sd_log_callback_t callback, void* data);
void sd_set_progress_callback(sd_progress_callback_t callback, void* data);
void sd_set_preview_callback(sd_preview_callback_t callback, int mode, int interval, bool denoised, bool noisy, void* data);
sd_preview_info_t sd_get_preview_info();
void sd_cancel_generation(sd_ctx_t* context, int mode);
bool generate_image(sd_ctx_t* context, sd_img_gen_params_t* params, sd_image_t** images, int* count);
void free_sd_images(sd_image_t* images, int count);
