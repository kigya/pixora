#pragma once
#include "pixels.h"
#include <functional>
#include <string>
namespace upscale {
// Disk-backed premultiplied RGBA. No image-sized allocation or memory mapping.
class Raster {
    int fd_=-1, width_,height_;
    std::string path_;
public:
    Raster(const std::string& path,int width,int height,bool create);
    ~Raster();
    Raster(const Raster&)=delete;
    Raster& operator=(const Raster&)=delete;
    void write(PixelsView tile,int x,int y,int cropX,int cropY,int width,int height);
    bool png(const std::string& destination,const std::function<bool()>& cancelled);
};
bool originalSizeAllowed(int width,int height,int scale);
}
