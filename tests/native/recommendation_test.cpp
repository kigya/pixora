#include <cassert>
#include <cstdint>
#include <vector>

#include "recommendation.h"

using pixora::recommendation::ContentKind;
using pixora::recommendation::analyze;

namespace {

std::vector<uint8_t> image(int width, int height, int alpha = 255) {
  std::vector<uint8_t> pixels(static_cast<size_t>(width) * height * 4);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const size_t i = (static_cast<size_t>(y) * width + x) * 4;
      pixels[i + 3] = static_cast<uint8_t>(alpha);
    }
  }
  return pixels;
}

void set(std::vector<uint8_t>& pixels, int width, int x, int y, uint8_t r,
         uint8_t g, uint8_t b, uint8_t a = 255) {
  const size_t i = (static_cast<size_t>(y) * width + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

void photoSample() {
  constexpr int width = 96, height = 80;
  auto pixels = image(width, height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const int patch = ((x / 9 + y / 11) % 5) * 45;
      set(pixels, width, x, y, static_cast<uint8_t>(35 + (x * 2 + patch) % 190),
          static_cast<uint8_t>(25 + (y * 3 + patch) % 190),
          static_cast<uint8_t>(30 + (x + y + patch) % 190), x < 24 ? 0 : 255);
    }
  }
  assert(analyze(pixels.data(), width, height, width * 4).kind ==
         ContentKind::Generic);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) set(pixels, width, x, y,
        static_cast<uint8_t>(35 + (x * 2 + (x / 9 + y / 11) % 5 * 45) % 190),
        static_cast<uint8_t>(25 + (y * 3 + (x / 9 + y / 11) % 5 * 45) % 190),
        static_cast<uint8_t>(30 + (x + y + (x / 9 + y / 11) % 5 * 45) % 190));
  }
  assert(analyze(pixels.data(), width, height, width * 4).kind ==
         ContentKind::Photo);
}

void smoothPhotoLikeSampleStaysGeneric() {
  constexpr int width = 96, height = 80;
  auto pixels = image(width, height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x)
      set(pixels, width, x, y, static_cast<uint8_t>(x * 2),
          static_cast<uint8_t>(y * 3), static_cast<uint8_t>(x + y));
  }
  assert(analyze(pixels.data(), width, height, width * 4).kind ==
         ContentKind::Generic);
}

void drawingSample() {
  constexpr int width = 80, height = 80;
  auto pixels = image(width, height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const bool dark = ((x - 18) * (x - 18) + (y - 21) * (y - 21) < 180) ||
                        ((x > 42 && x < 47 && y > 10 && y < 66)) ||
                        ((y > 53 && y < 59 && x > 31 && x < 68));
      const uint8_t tint = static_cast<uint8_t>((x / 20 + y / 20) % 4);
      constexpr uint8_t reds[] = {220, 190, 210, 245};
      constexpr uint8_t greens[] = {230, 225, 200, 215};
      constexpr uint8_t blues[] = {240, 235, 240, 225};
      set(pixels, width, x, y, dark ? 24 : reds[tint], dark ? 29 : greens[tint],
          dark ? 38 : blues[tint]);
    }
  }
  assert(analyze(pixels.data(), width, height, width * 4).kind ==
         ContentKind::LineArt);
}

void pixelGridSample() {
  constexpr int width = 96, height = 80, block = 4;
  auto pixels = image(width, height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const int cell = ((x / block) * 7 + (y / block) * 11) % 6;
      set(pixels, width, x, y, static_cast<uint8_t>(cell * 42),
          static_cast<uint8_t>((cell * 67) % 256),
          static_cast<uint8_t>(255 - cell * 31));
    }
  }
  assert(analyze(pixels.data(), width, height, width * 4).kind ==
         ContentKind::PixelArt);
}

void transparentHiddenPixelGridStaysGeneric() {
  constexpr int width = 96, height = 80, block = 4;
  auto pixels = image(width, height, 0);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const int cell = ((x / block) * 7 + (y / block) * 11) % 6;
      set(pixels, width, x, y, static_cast<uint8_t>(cell * 42),
          static_cast<uint8_t>((cell * 67) % 256),
          static_cast<uint8_t>(255 - cell * 31), 0);
    }
  }
  assert(analyze(pixels.data(), width, height, width * 4).kind ==
         ContentKind::Generic);

  // Semi-transparent pixels must be classified from their visible composite,
  // not from concealed RGB values either.
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const int cell = ((x / block) * 7 + (y / block) * 11) % 6;
      set(pixels, width, x, y, static_cast<uint8_t>(cell * 42),
          static_cast<uint8_t>((cell * 67) % 256),
          static_cast<uint8_t>(255 - cell * 31), 8);
    }
  }
  assert(analyze(pixels.data(), width, height, width * 4).kind ==
         ContentKind::Generic);
}

void screenshotAndAlphaSamplesStayGeneric() {
  constexpr int width = 96, height = 80;
  auto screenshot = image(width, height);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const bool ink = (y == 12 || y == 13) && x > 12 && x < 76;
      const bool frame = (x == 12 || x == 13 || x == 76 || x == 77) &&
                         y > 28 && y < 68;
      const uint8_t value = ink || frame ? 18 : 248;
      set(screenshot, width, x, y, value, value, value);
    }
  }
  assert(analyze(screenshot.data(), width, height, width * 4).kind ==
         ContentKind::Generic);

  auto alpha = image(width, height, 0);
  for (int y = 16; y < 64; ++y) {
    for (int x = 16; x < 64; ++x) set(alpha, width, x, y, 30, 120, 230, 255);
  }
  assert(analyze(alpha.data(), width, height, width * 4).kind ==
         ContentKind::Generic);
}

void mixedAndJpegNoiseStayGeneric() {
  constexpr int width = 96, height = 80;
  auto mixed = image(width, height);
  uint32_t state = 1;
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      state = state * 1664525u + 1013904223u;
      const uint8_t noise = static_cast<uint8_t>(state >> 24);
      if (x < 48) set(mixed, width, x, y, noise, static_cast<uint8_t>(noise / 2),
                      static_cast<uint8_t>(255 - noise));
      else {
        const bool line = ((x + y) % 13) < 3;
        set(mixed, width, x, y, line ? 15 : 240, line ? 21 : 225, line ? 28 : 210);
      }
    }
  }
  assert(analyze(mixed.data(), width, height, width * 4).kind ==
         ContentKind::Generic);

  auto noise = image(width, height);
  state = 12;
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      state = state * 1103515245u + 12345u;
      set(noise, width, x, y, static_cast<uint8_t>(state >> 24),
          static_cast<uint8_t>(state >> 16), static_cast<uint8_t>(state >> 8));
    }
  }
  assert(analyze(noise.data(), width, height, width * 4).kind ==
         ContentKind::Generic);
}

void lowContrastAndShortGridStayGeneric() {
  constexpr int width = 64, height = 64;
  auto low_contrast = image(width, height);
  constexpr uint8_t colors[][3] = {
      {80, 96, 112}, {96, 80, 112}, {112, 96, 80},
      {80, 112, 96}, {96, 112, 80}, {112, 80, 96},
  };
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      const auto& color = colors[((x / 8) + (y / 8)) % 6];
      set(low_contrast, width, x, y, color[0], color[1], color[2]);
    }
  }
  assert(analyze(low_contrast.data(), width, height, width * 4).kind ==
         ContentKind::Generic);
  auto short_image = image(32, 8);
  assert(analyze(short_image.data(), 32, 8, 32 * 4).kind ==
         ContentKind::Generic);
}

void malformedInputStaysGeneric() {
  auto pixels = image(4, 4);
  auto small = image(2, 2);
  auto tall = image(4, 1025);
  assert(analyze(nullptr, 4, 4, 16).kind == ContentKind::Generic);
  assert(analyze(pixels.data(), 1, 4, 4).kind == ContentKind::Generic);
  assert(analyze(pixels.data(), 4, 1, 16).kind == ContentKind::Generic);
  assert(analyze(pixels.data(), 4, 4, 15).kind == ContentKind::Generic);
  assert(analyze(pixels.data(), 1025, 4, 4100).kind == ContentKind::Generic);
  assert(analyze(tall.data(), 4, 1025, 16).kind == ContentKind::Generic);
  assert(analyze(small.data(), 2, 2, 8).kind == ContentKind::Generic);
}

}  // namespace

int main() {
  malformedInputStaysGeneric();
  photoSample();
  smoothPhotoLikeSampleStaysGeneric();
  drawingSample();
  pixelGridSample();
  screenshotAndAlphaSamplesStayGeneric();
  transparentHiddenPixelGridStaysGeneric();
  mixedAndJpegNoiseStayGeneric();
  lowContrastAndShortGridStayGeneric();
}
