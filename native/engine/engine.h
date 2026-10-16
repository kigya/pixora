#pragma once
#include "pixels.h"
#include <functional>
#include <atomic>
namespace upscale {
struct Callbacks {
 std::function<bool(int,int)> progress;
 std::function<bool(int)> stage;
 std::function<bool(int,double)> timing;
};
struct Model { const char* param; const char* weights; const char* input; const char* output; };
Model modelFor(int profile);
void initializeGPU();
// Caller owns RGBA buffers, cancellation and platform model loading.
// The network and scratch storage are released when this call returns.
int process(PixelsView input, PixelsView output, bool gpu, int tile, int profile,
 bool testGPU, std::atomic<bool>& cancelled, const Callbacks& callbacks,
 const std::function<int(void*,const Model&)>& load);
}
