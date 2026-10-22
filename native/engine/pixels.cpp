#include "pixels.h"
#include <algorithm>
#include <cmath>
namespace upscale {
Tile tileBounds(int w,int h,int tile,int tx,int ty,int padding) {
    const int x0=tx*tile,y0=ty*tile,x1=std::min(w,x0+tile),y1=std::min(h,y0+tile);
    return {x0,y0,x1,y1,std::max(0,x0-padding),std::max(0,y0-padding),std::min(w,x1+padding),std::min(h,y1+padding)};
}
void prepareRGB(PixelsView input,Tile region,Scratch& scratch) {
    const int l=region.left,t=region.top,tw=region.right-l,th=region.bottom-t;
        scratch.rgb.resize(static_cast<size_t>(tw)*th*3);
        bool transparent=false;
        for(int y=0;y<th;y++)for(int x=0;x<tw;x++) {
            const auto* p=input.row(y+t)+(x+l)*4;
            transparent=transparent || p[3]==0;
            // Android ARGB_8888 is premultiplied; inference needs straight RGB.
            for(int c=0;c<3;c++)scratch.rgb[(y*tw+x)*3+c]=p[3]?std::min(255,static_cast<int>(p[c])*255/p[3]):0;
        }
        // Extend edge colours into fully transparent pixels before inference.
        // Premultiplied Android bitmaps have lost their hidden RGB; zero-filling
        // would introduce a black context and dark fringes along alpha edges.
        if(transparent) {
        scratch.known.assign(static_cast<size_t>(tw)*th,0);
        scratch.queue.clear();scratch.queue.reserve(static_cast<size_t>(tw)*th);
        for(int y=0;y<th;y++)for(int x=0;x<tw;x++) {
            const int index=y*tw+x;
            if(input.row(y+t)[(x+l)*4+3]) {scratch.known[index]=1;scratch.queue.push_back(index);}
        }
        for(size_t head=0;head<scratch.queue.size();head++) {
            const int index=scratch.queue[head],x=index%tw,y=index/tw;
            const int neighbours[4]={x>0?index-1:-1,x+1<tw?index+1:-1,y>0?index-tw:-1,y+1<th?index+tw:-1};
            for(int neighbour:neighbours)if(neighbour>=0 && !scratch.known[neighbour]) {
                scratch.known[neighbour]=1;
                for(int c=0;c<3;c++)scratch.rgb[neighbour*3+c]=scratch.rgb[index*3+c];
                scratch.queue.push_back(neighbour);
            }
        }
        }

}
bool assemble(PixelsView input,PixelsView output,Tile region,const float* channels[3],int tensorWidth) {
    const int w=input.width,h=input.height,x0=region.x0,y0=region.y0,x1=region.x1,y1=region.y1,l=region.left,t=region.top;
        for(int oy=y0*4;oy<y1*4;oy++) {
            auto* dst=output.row(oy);
            const int sy=oy-t*4;
            for(int ox=x0*4;ox<x1*4;ox++) {
                const int sx=ox-l*4;
                // Resample alpha independently using bilinear pixel-centre coordinates.
                const float ax=std::clamp((ox+.5f)/4-.5f,0.f,static_cast<float>(w-1));
                const float ay=std::clamp((oy+.5f)/4-.5f,0.f,static_cast<float>(h-1));
                int ix=static_cast<int>(ax),iy=static_cast<int>(ay);float fx=ax-ix,fy=ay-iy;
                auto alpha=[&](int xx,int yy){return input.row(std::min(h-1,yy))[std::min(w-1,xx)*4+3];};
                const float a=(1-fy)*((1-fx)*alpha(ix,iy)+fx*alpha(ix+1,iy))+fy*((1-fx)*alpha(ix,iy+1)+fx*alpha(ix+1,iy+1));
                dst[ox*4+3]=static_cast<unsigned char>(std::round(a));
                for(int c=0;c<3;c++) {
                    const float value=channels[c][sy*tensorWidth+sx];
                    if(!std::isfinite(value))return false;
                    dst[ox*4+c]=static_cast<unsigned char>(std::round(std::clamp(value,0.f,1.f)*a));
                }
            }
        }
    return true;
}
}
