#pragma once

#include <cstdint>

namespace pixora::recommendation {

enum class ContentKind { Generic, Photo, LineArt, PixelArt };

struct Recommendation {
  ContentKind kind;
  const char* profile_id;
  const char* speed;
  const char* reason_id;
};

// rgba points to a bounded, locally decoded preview. The row stride is in bytes.
// Invalid input safely returns the generic Lite suggestion.
Recommendation analyze(const uint8_t* rgba, int width, int height,
                       int row_stride_bytes) noexcept;

}  // namespace pixora::recommendation
