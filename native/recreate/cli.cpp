#include "recreate.h"

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

namespace {
void on_progress(int step, int total, void*) {
    std::fprintf(stderr, "step %d/%d\n", step, total);
}
bool read_file(const char* path, std::vector<uint8_t>& bytes) {
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) return false;
    const auto size = file.tellg();
    if (size < 0) return false;
    bytes.resize(static_cast<size_t>(size));
    file.seekg(0);
    return static_cast<bool>(file.read(reinterpret_cast<char*>(bytes.data()), size));
}
bool write_file(const char* path, const uint8_t* bytes, size_t size) {
    std::ofstream file(path, std::ios::binary);
    return file && static_cast<bool>(file.write(reinterpret_cast<const char*>(bytes), size));
}
}

int main(int argc, char** argv) {
    if (argc != 10) {
        std::cerr << "usage: recreate-cli MODEL LORA INPUT_RGBA WIDTH HEIGHT STEPS SEED PROMPT OUTPUT_RGB\n";
        return 2;
    }
    const uint32_t width = static_cast<uint32_t>(std::strtoul(argv[4], nullptr, 10));
    const uint32_t height = static_cast<uint32_t>(std::strtoul(argv[5], nullptr, 10));
    std::vector<uint8_t> rgba;
    if (width == 0 || height == 0 || !read_file(argv[3], rgba) || rgba.size() != static_cast<size_t>(width) * height * 4u) {
        std::cerr << "input RGBA file or dimensions are invalid\n";
        return 2;
    }
    pixora::recreate::Request request;
    request.model_path = argv[1];
    request.lora_path = argv[2];
    request.rgba = rgba.data();
    request.width = width;
    request.height = height;
    request.steps = std::atoi(argv[6]);
    request.seed = std::strtoull(argv[7], nullptr, 10);
    request.prompt = argv[8];
    pixora::recreate::Result result;
    const auto status = pixora::recreate::run(request, on_progress, nullptr, &result);
    if (status != pixora::recreate::Status::Ok) {
        std::cerr << "generation failed: " << result.error << "\n";
        pixora::recreate::free_result(&result);
        return 1;
    }
    const bool written = write_file(argv[9], result.rgb, static_cast<size_t>(result.width) * result.height * 3u);
    std::cerr << "output dimensions: " << result.width << "x" << result.height << "\n";
    pixora::recreate::free_result(&result);
    return written ? 0 : 1;
}
