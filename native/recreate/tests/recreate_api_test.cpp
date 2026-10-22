#include "recreate.h"

#include <cstdint>
#include <cstdio>

namespace {
int expect(pixora::recreate::Status actual, pixora::recreate::Status expected, const char* name) {
    if (actual == expected) return 0;
    std::fprintf(stderr, "%s: expected status %d, got %d\n", name,
                 static_cast<int>(expected), static_cast<int>(actual));
    return 1;
}
}

int main() {
    using pixora::recreate::Request;
    using pixora::recreate::Result;
    using pixora::recreate::Status;
    int failures = 0;
    Result result;

    failures += expect(pixora::recreate::run(Request{}, nullptr, nullptr, nullptr),
                       Status::InvalidArgument, "null result");
    failures += expect(pixora::recreate::run(Request{}, nullptr, nullptr, &result),
                       Status::InvalidArgument, "missing request data");

    uint8_t rgba[4] = {0, 0, 0, 255};
    Request invalid_steps;
    invalid_steps.model_path = "missing-model.gguf";
    invalid_steps.lora_path = "missing-lora.safetensors";
    invalid_steps.rgba = rgba;
    invalid_steps.width = 1;
    invalid_steps.height = 1;
    invalid_steps.steps = 5;
    failures += expect(pixora::recreate::run(invalid_steps, nullptr, nullptr, &result),
                       Status::InvalidArgument, "unsupported step count");

    Request invalid_image = invalid_steps;
    invalid_image.steps = 4;
    invalid_image.width = 0;
    failures += expect(pixora::recreate::run(invalid_image, nullptr, nullptr, &result),
                       Status::InvalidArgument, "zero image width");

    // Cancellation accepted before run entry must survive until the operation checks it;
    // this does not require or attempt loading model weights.
    pixora::recreate::reset_cancel();
    pixora::recreate::cancel();
    Request cancelled = invalid_steps;
    cancelled.steps = 4;
    failures += expect(pixora::recreate::run(cancelled, nullptr, nullptr, &result),
                       Status::Cancelled, "pre-entry cancellation");
    pixora::recreate::reset_cancel();

    pixora::recreate::free_result(nullptr);
    pixora::recreate::free_result(&result);
    return failures == 0 ? 0 : 1;
}
