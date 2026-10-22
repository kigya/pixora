#pragma once

#include <cstdint>

namespace pixora::recreate {

enum class Status : int {
    Ok = 0,
    Cancelled,
    InvalidArgument,
    ModelLoadFailed,
    GenerationFailed,
    OutOfMemory,
    InternalError,
};

struct Request {
    const char* model_path = nullptr;
    const char* lora_path = nullptr;
    const char* prompt = nullptr;
    const uint8_t* rgba = nullptr;
    uint32_t width = 0;
    uint32_t height = 0;
    int steps = 4;                 // LCM supports the app's 4- or 8-step choices.
    uint64_t seed = 0;
    float strength = 0.6f;
    float cfg = 1.0f;
    uint32_t max_side = 512;
};

struct Result {
    Status status = Status::InternalError;
    uint8_t* rgb = nullptr;        // malloc-owned, 3 channels; caller releases via free_result.
    uint32_t width = 0;
    uint32_t height = 0;
    char error[256] = {};
};

using ProgressCallback = void (*)(int step, int total_steps, void* user_data);

// Executes one CPU img2img generation. Input is tightly packed RGBA; alpha is ignored here
// and must be retained/restored by the caller. Result dimensions preserve the source aspect.
Status run(const Request& request, ProgressCallback progress, void* user_data, Result* result);

// Begin a fresh operation before exposing it to cancellation (typically when a job is created).
// `run()` deliberately does not reset this latch, so cancellation immediately before run entry is kept.
void reset_cancel();

// Thread-safe cancellation of the current or next run in the active operation. Only one run is permitted at a time.
void cancel();

void free_result(Result* result);

}  // namespace pixora::recreate
