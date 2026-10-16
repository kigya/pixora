#pragma once
#include <array>
// Test-only payload decodes to "x". Production data is generated privately.
static constexpr unsigned char endpointMask = 167;
static constexpr std::array<unsigned char, 1> endpointData = {223};
