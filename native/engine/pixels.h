#pragma once
#include <cstdint>
#include <vector>

namespace upscale {
struct PixelsView {
    uint8_t* data;
    int width, height, stride;
    uint8_t* row(int y) const { return data + y * stride; }
};
struct Tile { int x0,y0,x1,y1,left,top,right,bottom; };
struct Scratch {
    std::vector<uint8_t> rgb,known;
    std::vector<int> queue;
};
Tile tileBounds(int width,int height,int tile,int tx,int ty,int padding=32);
void prepareRGB(PixelsView input,Tile tile,Scratch& scratch);
bool assemble(PixelsView input,PixelsView output,Tile tile,const float* channels[3],int tensorWidth);
}
