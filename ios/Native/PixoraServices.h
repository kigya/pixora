#pragma once
#import <Foundation/Foundation.h>
#import "PixoraImages.h"
#include "engine.h"
namespace pixora {
// Immutable platform boundaries are supplied when an independent owner is made.
// The application singleton always uses the real SDK-backed implementation.
struct Services {
 ImageAPI images;
 std::function<decltype(upscale::process)> process;
 std::function<double()> uptime;
 std::function<uint64_t()> memory;
 std::function<long long(NSURL*)> freeBytes;
};
Services services();
}
