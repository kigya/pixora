#pragma once

#include <cstdint>

namespace pixora::recommendation {

enum class ContentKind { Generic, Photo, LineArt, PixelArt, Smooth, Mixed };

// Stable bridge bits; sharpening presets are deliberately never recommended.
enum AvailableProfile : uint32_t {
  Standard = 1u << 0, Balanced = 1u << 1, Natural = 1u << 2,
  Lite = 1u << 3, Art = 1u << 4, Pixel = 1u << 5,
  All = Standard | Balanced | Natural | Lite | Art | Pixel,
};

struct Recommendation {
  ContentKind kind;
  const char* profile_id;  // nullptr means no suitable available profile.
  const char* speed;
  const char* reason_id;
};

// Straight RGBA, at most 1024 px per side. No pixels leave native code.
// Invalid/uninformative input returns a generic Balanced suggestion.
Recommendation analyze(const uint8_t* rgba, int width, int height,
                       int row_stride_bytes) noexcept;
Recommendation available(Recommendation result, uint32_t profiles) noexcept;

}  // namespace pixora::recommendation
