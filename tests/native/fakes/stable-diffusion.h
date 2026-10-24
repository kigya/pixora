#pragma once

#include <cstdint>

struct sd_ctx_t {};
enum sd_log_level_t { SD_LOG_INFO = 0 };
enum { SD_CANCEL_ALL = 1, LORA_APPLY_AUTO = 0, LCM_SAMPLE_METHOD = 1, LCM_SCHEDULER = 1 };

struct sd_ctx_params_t {
    const char* model_path = nullptr;
    const char* backend = nullptr;
    const char* params_backend = nullptr;
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
};
using sd_progress_callback_t = void (*)(int, int, float, void*);
using sd_log_callback_t = void (*)(sd_log_level_t, const char*, void*);

void sd_ctx_params_init(sd_ctx_params_t* params);
void sd_img_gen_params_init(sd_img_gen_params_t* params);
int sd_get_num_physical_cores();
sd_ctx_t* new_sd_ctx(const sd_ctx_params_t* params);
void free_sd_ctx(sd_ctx_t* context);
void sd_set_log_callback(sd_log_callback_t callback, void* data);
void sd_set_progress_callback(sd_progress_callback_t callback, void* data);
void sd_cancel_generation(sd_ctx_t* context, int mode);
bool generate_image(sd_ctx_t* context, sd_img_gen_params_t* params, sd_image_t** images, int* count);
void free_sd_images(sd_image_t* images, int count);
