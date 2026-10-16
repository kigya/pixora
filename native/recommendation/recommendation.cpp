#include "recommendation.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>

namespace pixora::recommendation {
namespace {

constexpr Recommendation kGeneric{ContentKind::Generic, "lite", "quality",
                                  "generic"};

struct Features {
  int colors = 0;
  double edge_density = 0.0;
  double transparent_fraction = 0.0;
};

int visibleChannel(const uint8_t* pixel, int channel) {
  constexpr int kNeutralBackground = 128;
  const int alpha = pixel[3];
  return (pixel[channel] * alpha + kNeutralBackground * (255 - alpha) + 127) /
         255;
}

int luminance(const uint8_t* pixel) {
  return (299 * visibleChannel(pixel, 0) + 587 * visibleChannel(pixel, 1) +
          114 * visibleChannel(pixel, 2)) /
         1000;
}

Features measure(const uint8_t* rgba, int width, int height, int stride) {
  std::array<bool, 4096> palette{};
  int alpha_zero = 0;
  int samples = 0;
  int edges = 0;
  int comparisons = 0;
  for (int y = 0; y < height; ++y) {
    const auto* row = rgba + static_cast<std::ptrdiff_t>(y) * stride;
    const auto* next = y + 1 < height ? row + stride : nullptr;
    for (int x = 0; x < width; ++x) {
      const auto* pixel = row + x * 4;
      if (pixel[3] < 16) {
        ++alpha_zero;
      } else {
        const int key = ((visibleChannel(pixel, 0) >> 4) << 8) |
                        ((visibleChannel(pixel, 1) >> 4) << 4) |
                        (visibleChannel(pixel, 2) >> 4);
        palette[static_cast<size_t>(key)] = true;
      }
      ++samples;
      if (x + 1 < width) {
        edges += std::abs(luminance(pixel) - luminance(pixel + 4)) >= 40;
        ++comparisons;
      }
      if (next != nullptr) {
        edges += std::abs(luminance(pixel) - luminance(next + x * 4)) >= 40;
        ++comparisons;
      }
    }
  }
  const int colors = static_cast<int>(
      std::count(palette.begin(), palette.end(), true));
  return {colors, static_cast<double>(edges) / comparisons,
          static_cast<double>(alpha_zero) / samples};
}

double boundaryEnergy(const uint8_t* rgba, int width, int height, int stride,
                      int period) {
  double boundary = 0.0;
  double interior = 0.0;
  int boundary_count = 0;
  int interior_count = 0;
  for (int y = 0; y < height; ++y) {
    const auto* row = rgba + static_cast<std::ptrdiff_t>(y) * stride;
    for (int x = 0; x + 1 < width; ++x) {
      const double delta = std::abs(luminance(row + x * 4) -
                                    luminance(row + (x + 1) * 4));
      if ((x + 1) % period == 0) {
        boundary += delta;
        ++boundary_count;
      } else {
        interior += delta;
        ++interior_count;
      }
    }
  }
  for (int y = 0; y + 1 < height; ++y) {
    const auto* row = rgba + static_cast<std::ptrdiff_t>(y) * stride;
    const auto* next = row + stride;
    for (int x = 0; x < width; ++x) {
      const double delta = std::abs(luminance(row + x * 4) -
                                    luminance(next + x * 4));
      if ((y + 1) % period == 0) {
        boundary += delta;
        ++boundary_count;
      } else {
        interior += delta;
        ++interior_count;
      }
    }
  }
  const double boundary_mean = boundary / boundary_count;
  const double interior_mean = interior / interior_count;
  if (boundary_mean < 18.0 || interior_mean > boundary_mean * 0.12 + 1.0)
    return 0.0;
  return std::min(1.0, boundary_mean / 80.0) *
         (1.0 - std::min(1.0, interior_mean / (boundary_mean * 0.18 + 2.0)));
}

bool strongPixelGrid(const uint8_t* rgba, int width, int height, int stride) {
  if (width < 24 || height < 24) return false;
  double best = 0.0;
  for (int period = 2; period <= 12; ++period) {
    best = std::max(best, boundaryEnergy(rgba, width, height, stride, period));
  }
  return best >= 0.62;
}

}  // namespace

Recommendation analyze(const uint8_t* rgba, int width, int height,
                       int row_stride_bytes) noexcept {
  if (rgba == nullptr || width < 2 || height < 2 ||
      width > 1024 || height > 1024 || row_stride_bytes < width * 4)
    return kGeneric;

  const Features features = measure(rgba, width, height, row_stride_bytes);
  if (strongPixelGrid(rgba, width, height, row_stride_bytes))
    return {ContentKind::PixelArt, "pixel", "quality", "pixel"};

  // Distinct flat colors plus clear boundaries indicate drawing-like content.
  // Very sparse palettes are excluded because text/UI screenshots share them.
  if (features.colors >= 5 && features.colors <= 44 &&
      features.edge_density >= 0.018 && features.edge_density <= 0.22)
    return {ContentKind::LineArt, "art", "quality", "art"};

  // Photos have broad color variation and texture, while near-uniform JPEG
  // noise and edge-dense mixed images stay on the conservative generic path.
  if (features.colors >= 110 && features.edge_density >= 0.035 &&
      features.edge_density <= 0.36 && features.transparent_fraction < 0.08)
    return {ContentKind::Photo, "lite", "quality", "photo"};

  return kGeneric;
}

}  // namespace pixora::recommendation
