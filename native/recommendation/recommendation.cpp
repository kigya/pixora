#include "recommendation.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <vector>

namespace pixora::recommendation {
namespace {

constexpr Recommendation kGeneric{ContentKind::Generic, "balanced", "quality", "generic"};
constexpr Recommendation kMixed{ContentKind::Mixed, "balanced", "quality", "mixed"};

// These are conservative, uncalibrated decision thresholds, not probabilities.
struct Features {
  int visible = 0;
  int colors = 0;
  int tones = 0;
  double flat = 0;
  double edges = 0;
  double texture = 0;
  double noise = 0;
  double axis_edges = 0;
  double extreme_tones = 0;
};

int channel(const uint8_t* pixel, int c) {
  return (pixel[c] * pixel[3] + 128 * (255 - pixel[3]) + 127) / 255;
}
int luminance(const uint8_t* pixel) {
  return (299 * channel(pixel, 0) + 587 * channel(pixel, 1) +
          114 * channel(pixel, 2)) / 1000;
}
int difference(const uint8_t* a, const uint8_t* b) {
  int delta = 0;
  for (int c = 0; c < 3; ++c)
    delta = std::max(delta, std::abs(channel(a, c) - channel(b, c)));
  return delta;
}

Features measure(const uint8_t* rgba, int width, int height, int stride) {
  std::array<int, 4096> palette{};
  std::array<int, 32> tones{};
  int comparisons = 0, flat = 0, edges = 0, texture = 0;
  int interiors = 0, noise = 0, axis = 0, edge_sites = 0, extremes = 0;
  Features result;
  for (int y = 0; y < height; ++y) {
    const auto* row = rgba + static_cast<std::ptrdiff_t>(y) * stride;
    for (int x = 0; x < width; ++x) {
      const auto* p = row + x * 4;
      if (p[3] < 16) continue;  // Concealed RGB cannot supply evidence.
      ++result.visible;
      ++palette[((channel(p, 0) >> 4) << 8) |
                ((channel(p, 1) >> 4) << 4) | (channel(p, 2) >> 4)];
      const int luma = luminance(p);
      ++tones[luma >> 3];
      extremes += luma < 40 || luma > 220;
      int dx = -1, dy = -1;
      if (x + 1 < width && p[7] >= 16) dx = difference(p, p + 4);
      if (y + 1 < height && p[stride + 3] >= 16) dy = difference(p, p + stride);
      for (int delta : {dx, dy}) {
        if (delta < 0) continue;
        ++comparisons;
        flat += delta <= 4;
        edges += delta >= 40;
        texture += delta > 4 && delta < 40;
      }
      if (dx >= 0 && dy >= 0 && (dx >= 40 || dy >= 40)) {
        ++edge_sites;
        axis += (dx >= 40 && dy <= 4) || (dy >= 40 && dx <= 4);
      }
      if (x > 0 && y > 0 && dx >= 0 && dy >= 0 &&
          p[-1] >= 16 && p[3 - stride] >= 16 && dx < 20 && dy < 20 &&
          difference(p, p - 4) < 20 && difference(p, p - stride) < 20) {
        ++interiors;
        const int residual = std::abs(4 * luma - luminance(p - 4) -
            luminance(p + 4) - luminance(p - stride) - luminance(p + stride));
        noise += residual >= 24;
      }
    }
  }
  // Ignore isolated quantization bins; do not let a few noisy pixels define type.
  const int minimum = std::max(1, result.visible / 4096);
  for (int count : palette) result.colors += count >= minimum;
  for (int count : tones) result.tones += count >= std::max(1, result.visible / 512);
  if (comparisons) {
    result.flat = static_cast<double>(flat) / comparisons;
    result.edges = static_cast<double>(edges) / comparisons;
    result.texture = static_cast<double>(texture) / comparisons;
  }
  if (interiors) result.noise = static_cast<double>(noise) / interiors;
  if (edge_sites) result.axis_edges = static_cast<double>(axis) / edge_sites;
  if (result.visible) result.extreme_tones = static_cast<double>(extremes) / result.visible;
  return result;
}

// Area average rather than nearest-neighbor: overview must not manufacture a grid.
std::vector<uint8_t> overview(const uint8_t* rgba, int width, int height,
                              int stride, int& out_width, int& out_height) {
  const double scale = std::min(1.0, 256.0 / std::max(width, height));
  out_width = std::max(1, static_cast<int>(width * scale));
  out_height = std::max(1, static_cast<int>(height * scale));
  std::vector<uint8_t> out(static_cast<size_t>(out_width) * out_height * 4);
  for (int y = 0; y < out_height; ++y) {
    for (int x = 0; x < out_width; ++x) {
      const int left = x * width / out_width, right = (x + 1) * width / out_width;
      const int top = y * height / out_height, bottom = (y + 1) * height / out_height;
      int alpha = 0, rgb[3] = {0, 0, 0};
      for (int sy = top; sy < bottom; ++sy) {
        for (int sx = left; sx < right; ++sx) {
          const auto* p = rgba + static_cast<std::ptrdiff_t>(sy) * stride + sx * 4;
          alpha += p[3];
          for (int c = 0; c < 3; ++c) rgb[c] += p[c] * p[3];
        }
      }
      const size_t i = (static_cast<size_t>(y) * out_width + x) * 4;
      for (int c = 0; c < 3; ++c) out[i + c] = alpha ? rgb[c] / alpha : 0;
      out[i + 3] = alpha / ((right - left) * (bottom - top));
    }
  }
  return out;
}

bool photoLike(const Features& f) {
  return f.visible >= 64 && (f.colors >= 90 || f.tones >= 20) &&
         (f.flat < 0.88 || (f.tones >= 20 && f.texture < 0.20)) &&
         f.edges < 0.36 && f.noise < 0.55;
}
bool drawingLike(const Features& f) {
  return f.visible >= 64 && f.colors >= 5 && f.colors <= 180 &&
         f.flat >= 0.70 && f.edges >= 0.006 && f.edges <= 0.22 &&
         f.texture < 0.24 && f.noise < 0.08;
}
bool interfaceLike(const Features& f) {
  return f.edges > 0.003 &&
         (f.colors < 5 || (f.extreme_tones > 0.88 && f.axis_edges > 0.70));
}

struct AxisEvidence {
  std::array<double, 1024> energy{};
  std::array<int, 1024> transitions{};
  int length = 0;
  int cross = 0;
};

// Test every phase, independently per axis. Repeated flat blocks must account
// for almost all boundary energy on BOTH axes, with substantial occupied edges.
bool gridAxis(const AxisEvidence& axis, int period) {
  if (period < 2 || period > 16 || axis.cross <= 0 ||
      axis.length > static_cast<int>(axis.energy.size()) ||
      axis.length < period * 6) return false;
  for (int phase = 0; phase < period; ++phase) {
    double boundary = 0, interior = 0;
    int boundary_count = 0, interior_count = 0, occupied = 0;
    for (int i = 1; i < axis.length; ++i) {
      if (i % period == phase) {
        boundary += axis.energy[i];
        ++boundary_count;
        occupied += axis.transitions[i] > axis.cross / 3;
      } else {
        interior += axis.energy[i];
        ++interior_count;
      }
    }
    // With period >= 2 and length >= 6 * period, every phase has at least
    // five boundary sites and five interior sites. Both divisors are positive.
    const double b = boundary / (boundary_count * axis.cross);
    const double inside = interior / (interior_count * axis.cross);
    if (b >= 20 && inside <= 0.5 && occupied >= boundary_count * 0.65)
      return true;
  }
  return false;
}

enum class GridKind { None, Pixels, CompressionBlocks };

GridKind pixelGrid(const uint8_t* rgba, int width, int height, int stride,
               const Features& full) {
  if (width < 24 || height < 24 || full.visible < width * height / 10 ||
      full.colors < 5 || full.colors > 128 || full.flat < 0.45 ||
      full.noise > 0.02) return GridKind::None;
  AxisEvidence horizontal, vertical;
  horizontal.length = width; horizontal.cross = height;
  vertical.length = height; vertical.cross = width;
  for (int y = 0; y < height; ++y) {
    const auto* row = rgba + static_cast<std::ptrdiff_t>(y) * stride;
    for (int x = 0; x < width; ++x) {
      const auto* p = row + x * 4;
      if (x > 0) {
        const int delta = difference(p, p - 4);
        horizontal.energy[x] += delta;
        horizontal.transitions[x] += delta >= 20;
      }
      if (y > 0) {
        const int delta = difference(p, p - stride);
        vertical.energy[y] += delta;
        vertical.transitions[y] += delta >= 20;
      }
    }
  }
  for (int period = 2; period <= 16; ++period) {
    if (gridAxis(horizontal, period) && gridAxis(vertical, period))
      return period == 8 || period == 16 ? GridKind::CompressionBlocks : GridKind::Pixels;
  }
  return GridKind::None;
}

// Keep feature extraction, vote accumulation and the final decision separately
// testable. These remain private implementation details, not a bridge API.
struct Votes {
  int photos = 0, drawings = 0, patches = 0, interfaces = 0, smooth = 0;
  void add(const Features& patch) {
    if (patch.visible < 64) return;
    ++patches;
    photos += photoLike(patch);
    drawings += drawingLike(patch) && !photoLike(patch);
    interfaces += interfaceLike(patch);
    smooth += photoLike(patch) && patch.edges < 0.02 &&
              patch.texture < 0.20 && patch.noise < 0.03;
  }
};

Recommendation choose(const Features& full, const Features& scene,
                      const Votes& votes) {
  if (!votes.patches) return kGeneric;
  if (interfaceLike(scene) || votes.interfaces || (votes.photos && votes.drawings)) return kMixed;
  if (drawingLike(full) && drawingLike(scene) && !votes.photos &&
      votes.drawings * 2 >= votes.patches)
    return {ContentKind::LineArt, "art", "quality", "art"};
  if (photoLike(scene) && votes.photos * 2 >= votes.patches) {
    if (votes.smooth * 2 > votes.patches && full.edges < 0.02 && full.noise < 0.03)
      return {ContentKind::Smooth, "natural", "quality", "smooth"};
    return {ContentKind::Photo, "standard", "quality", "photo"};
  }
  return kMixed;
}

Recommendation classify(const uint8_t* rgba, int width, int height, int stride) {
  // Full-resolution statistics preserve evidence destroyed in the overview.
  const auto full = measure(rgba, width, height, stride);
  if (full.visible < 64 || (full.colors < 2 && full.edges < 0.003)) return kGeneric;
  const auto grid = pixelGrid(rgba, width, height, stride, full);
  if (grid == GridKind::CompressionBlocks) return kMixed;
  if (grid == GridKind::Pixels)
    return {ContentKind::PixelArt, "pixel", "quality", "pixel"};

  int ow, oh;
  const auto small = overview(rgba, width, height, stride, ow, oh);
  const auto scene = measure(small.data(), ow, oh, ow * 4);
  const int pw = std::min(128, width), ph = std::min(128, height);
  const std::array<std::array<int, 2>, 5> positions{{
      {{0, 0}}, {{width - pw, 0}}, {{0, height - ph}},
      {{width - pw, height - ph}}, {{(width - pw) / 2, (height - ph) / 2}}}};
  Votes votes;
  for (size_t i = 0; i < positions.size(); ++i) {
    bool duplicate = false;
    for (size_t j = 0; j < i; ++j) duplicate |= positions[i] == positions[j];
    if (duplicate) continue;
    const auto patch = measure(rgba + static_cast<std::ptrdiff_t>(positions[i][1]) * stride +
        positions[i][0] * 4, pw, ph, stride);
    votes.add(patch);
  }
  return choose(full, scene, votes);
}

}  // namespace

Recommendation analyze(const uint8_t* rgba, int width, int height,
                       int row_stride_bytes) noexcept {
  if (!rgba || width < 2 || height < 2 || width > 1024 || height > 1024 ||
      row_stride_bytes < width * 4) return kGeneric;
  try {
    return classify(rgba, width, height, row_stride_bytes);
  } catch (...) {
    return kGeneric;  // Memory pressure must not prevent manual processing.
  }
}

Recommendation available(Recommendation result, uint32_t profiles) noexcept {
  struct Profile { const char* id; uint32_t bit; };
  constexpr std::array<Profile, 6> supported{{
      {"standard", Standard}, {"balanced", Balanced}, {"natural", Natural},
      {"lite", Lite}, {"art", Art}, {"pixel", Pixel}}};
  for (const auto& profile : supported)
    if (result.profile_id && std::strcmp(result.profile_id, profile.id) == 0 &&
        (profiles & profile.bit)) return result;
  for (size_t i = 0; i < 4; ++i)
    if (profiles & supported[i].bit)
      return {ContentKind::Generic, supported[i].id, "quality", "unavailable"};
  return {ContentKind::Generic, nullptr, "quality", "unavailable"};
}

}  // namespace pixora::recommendation
