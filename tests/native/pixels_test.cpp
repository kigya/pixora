#include "pixels.h"
#include <cassert>
#include <cmath>
#include <limits>
#include <vector>
using namespace upscale;
int main() {
    Scratch scratch;
    for(int w: {1,3,65,97})for(int h:{1,4,67}) {
        std::vector<uint8_t> in(w*h*4),out(w*h*64);
        PixelsView input{in.data(),w,h,w*4},output{out.data(),w*4,h*4,w*16};
        for(int variant=0;variant<4;variant++) {
            for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
                auto p=input.row(y)+x*4;
                p[3]=variant==0?255:variant==1?128:variant==2 && x==0 && y==0?255:0;
                p[0]=p[3];p[1]=p[3]/2;p[2]=0;
            }
            for(int ty=0;ty<(h+31)/32;ty++)for(int tx=0;tx<(w+31)/32;tx++) {
                auto tile=tileBounds(w,h,32,tx,ty);
                prepareRGB(input,tile,scratch);
                assert(scratch.rgb.size()==static_cast<size_t>((tile.right-tile.left)*(tile.bottom-tile.top)*3));
                assert(scratch.rgb[0]==(variant==3 || (variant==2 && (tile.left>0 || tile.top>0))?0:255));
                const int tw=(tile.right-tile.left)*4,th=(tile.bottom-tile.top)*4;
                std::vector<float> red(tw*th,1.2f),green(tw*th,.5f),blue(tw*th,-.2f);
                const float* channels[3]={red.data(),green.data(),blue.data()};
                assert(assemble(input,output,tile,channels,tw));
                for(int y=tile.y0*4;y<tile.y1*4;y++)for(int x=tile.x0*4;x<tile.x1*4;x++) {
                    auto p=output.row(y)+x*4;assert(p[0]==p[3]);assert(p[2]==0);
                }
                red.assign(tw*th,std::numeric_limits<float>::quiet_NaN());
                assert(!assemble(input,output,tile,channels,tw));
            }
        }
    }
}
