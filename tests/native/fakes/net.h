#pragma once
#include <algorithm>
#include <memory>
#include <vector>
#include <limits>
namespace ncnn {
struct Fault {
 int gpuCount=1,param=0,model=0,inputAt=0,extractAt=0,emptyAt=0,bits=32,pack=1,wrongW=0,wrongH=0,wrongC=0;
 bool fromEmpty=false,castEmpty=false,constant=false,nan=false,nanLast=false;
 int inputs=0,extracts=0;void(*extractHook)()=nullptr;
};inline Fault fault;
struct Option {int num_threads;bool use_vulkan_compute,use_fp16_storage,use_fp16_packed,use_fp16_arithmetic,use_packing_layout;};
struct Mat {
 int w=0,h=0,c=0,elempack=1,bits=32;std::shared_ptr<std::vector<float>> data;
 Mat()=default;
 Mat(int width,int height,int channels):w(width),h(height),c(channels),data(std::make_shared<std::vector<float>>(w*h*c)){}
 struct Channel {float* p;int w;float* row(int y){return p+y*w;}operator const float*()const{return p;}};
 Channel channel(int i)const{return {data->data()+i*w*h,w};}
 bool empty()const{return !data;}int elembits()const{return bits;}
 static constexpr int PIXEL_RGB=1;
 static Mat from_pixels(const unsigned char*,int,int w,int h){return fault.fromEmpty?Mat():Mat(w,h,3);}
 void substract_mean_normalize(const float*,const float*){}
};
struct Extractor {
 int w=0,h=0;
 void set_light_mode(bool){}
 int input(const char*,const Mat& mat){w=mat.w;h=mat.h;return ++fault.inputs==fault.inputAt?-1:0;}
 int extract(const char*,Mat& out){
  int call=++fault.extracts;if(fault.extractHook)fault.extractHook();
  if(call==fault.extractAt)return -1;
  if(call==fault.emptyAt)return 0;
  out=Mat(w*4,h*4,3);out.w+=fault.wrongW;out.h+=fault.wrongH;out.c+=fault.wrongC;out.bits=fault.bits;out.elempack=fault.pack;
  // Allocate using altered metadata to keep intentional shape failures safe.
  out.data=std::make_shared<std::vector<float>>(out.w*out.h*out.c);
  for(int c=0;c<out.c;c++)for(int y=0;y<out.h;y++)for(int x=0;x<out.w;x++)out.channel(c).row(y)[x]=(fault.nan || (fault.nanLast && x==27 && y==27))?std::numeric_limits<float>::quiet_NaN():fault.constant?.5f:static_cast<float>(x+y+c)/(out.w+out.h+3);
  return 0;
 }
};
struct Net {
 Option opt{};
 void set_vulkan_device(int){}
 int load_param(void*,const char*){return fault.param;}int load_model(void*,const char*){return fault.model;}
 Extractor create_extractor(){return {};}
};
inline void cast_float16_to_float32(const Mat& in,Mat& out,const Option&){out=fault.castEmpty?Mat():in;out.bits=32;}
inline void convert_packing(const Mat& in,Mat& out,int,const Option&){out=fault.castEmpty?Mat():in;out.elempack=1;}
}
