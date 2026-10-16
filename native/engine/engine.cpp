#include "engine.h"
#include <net.h>
#if NCNN_VULKAN
#include <gpu.h>
#endif
#include <chrono>
#include <cmath>
#include <mutex>
namespace upscale {
void initializeGPU() {
#if NCNN_VULKAN
 static std::once_flag once;
 std::call_once(once,[]{ncnn::create_gpu_instance();});
#endif
}
Model modelFor(int profile) {
 switch(profile) {
 case 1:return {"realesr-general-x4v3.param","realesr-general-x4v3.bin","in0","out0"};
 case 2:return {"realesrgan-x4plus-anime.param","realesrgan-x4plus-anime.bin","data","output"};
 case 3:return {"realesr-animevideov3-x4.param","realesr-animevideov3-x4.bin","data","output"};
 case 4:return {"realesrnet-x4plus.param","realesrnet-x4plus.bin","in0","out0"};
 default:return {"realesrgan-x4plus.param","realesrgan-x4plus.bin","data","output"};
 }
}
int process(PixelsView input,PixelsView output,bool gpu,int tile,int profile,bool testGPU,
 std::atomic<bool>& cancelled,const Callbacks& callbacks,const std::function<int(void*,const Model&)>& load) {
 const int w=input.width,h=input.height;
 if(!input.data || !output.data || w<1 || h<1 || w>1024 || h>1024 || output.width!=w*4 || output.height!=h*4 || input.stride<w*4 || output.stride<w*16 || tile<32)return -2;
 if(profile<0 || profile>4)return -4;
 if(!callbacks.stage(0))return -2;
    const auto started=std::chrono::steady_clock::now();
    auto milliseconds=[](auto begin){return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count();};
    ncnn::Net net;
    net.opt.num_threads=2;
    net.opt.use_vulkan_compute=gpu;
    net.opt.use_fp16_storage=gpu;
    net.opt.use_fp16_packed=gpu;
    net.opt.use_fp16_arithmetic=false;
    net.opt.use_packing_layout=true;
#if NCNN_VULKAN
    if(gpu){initializeGPU();if(ncnn::get_gpu_count()<1)return -3;net.set_vulkan_device(ncnn::get_default_gpu_index());}
#else
    if(gpu)return -3;
#endif
    const Model model=modelFor(profile);
    const char* inputName=model.input;
    const char* outputName=model.output;
    if(load(&net,model)!=0) return -4;
    if(!callbacks.timing(0,milliseconds(started)))return -6;
    if(cancelled.load())return 1;
    // Validate Vulkan with the already loaded network. Resources belong to this
    // call only: there is no persistent model cache after a job finishes.
    if(gpu && testGPU) {
        const auto checkStart=std::chrono::steady_clock::now();
        ncnn::Mat test(8,8,3);
        for(int c=0;c<3;c++)for(int y=0;y<8;y++)for(int x=0;x<8;x++)test.channel(c).row(y)[x]=(x+y+c)/17.f;
        auto check=net.create_extractor();ncnn::Mat result;
        if(check.input(inputName,test)!=0 || check.extract(outputName,result)!=0 || result.empty())return -3;
        if(result.elembits()==16){ncnn::Mat fp32;ncnn::cast_float16_to_float32(result,fp32,net.opt);result=fp32;}
        if(result.elempack!=1){ncnn::Mat unpacked;ncnn::convert_packing(result,unpacked,1,net.opt);result=unpacked;}
        if(result.w!=32 || result.h!=32 || result.c!=3)return -3;
        const float first=result.channel(0).row(4)[4],last=result.channel(0).row(27)[27];
        if(!std::isfinite(first) || !std::isfinite(last) || std::abs(first-last)<1e-5f)return -3;
        if(!callbacks.timing(1,milliseconds(checkStart)))return -6;
    }
    if(!callbacks.stage(1)) return -2;
    const int nx=(w+tile-1)/tile, ny=(h+tile-1)/tile,total=nx*ny;
    // Context padding is cropped per tile; seam tests compare against whole-image inference.
    upscale::Scratch scratch;
    double preprocessingMs=0,inferenceMs=0,assemblyMs=0;
    for(int ty=0;ty<ny;ty++)for(int tx=0;tx<nx;tx++) {
        if(cancelled.load()) return 1;
        const auto region=upscale::tileBounds(w,h,tile,tx,ty);
        const int tw=region.right-region.left,th=region.bottom-region.top;
        const auto preprocessStart=std::chrono::steady_clock::now();
        upscale::prepareRGB({static_cast<uint8_t*>(input.data),w,h,static_cast<int>(input.stride)},region,scratch);
        ncnn::Mat in=ncnn::Mat::from_pixels(scratch.rgb.data(),ncnn::Mat::PIXEL_RGB,tw,th);
        if(in.empty())return -5;
        const float norm[3]={1.f/255,1.f/255,1.f/255};in.substract_mean_normalize(nullptr,norm);
        preprocessingMs+=milliseconds(preprocessStart);
        const auto inferenceStart=std::chrono::steady_clock::now();
        auto ex=net.create_extractor();ex.set_light_mode(true);
        if(ex.input(inputName,in)!=0)return gpu?-3:-6;
        ncnn::Mat out;
        if(ex.extract(outputName,out)!=0 || out.empty())return gpu?-3:-6;
        if(out.elembits()==16) {ncnn::Mat fp32;ncnn::cast_float16_to_float32(out,fp32,net.opt);out=fp32;}
        if(out.elempack!=1) {ncnn::Mat unpacked;ncnn::convert_packing(out,unpacked,1,net.opt);out=unpacked;}
        if(out.empty())return -5;
        if(out.elembits()!=32 || out.c!=3 || out.w!=tw*4 || out.h!=th*4)return gpu?-3:-6;
        inferenceMs+=milliseconds(inferenceStart);
        if(cancelled.load())return 1;
        const auto assemblyStart=std::chrono::steady_clock::now();
        const float* channels[3]={out.channel(0),out.channel(1),out.channel(2)};
        if(!upscale::assemble({static_cast<uint8_t*>(input.data),w,h,static_cast<int>(input.stride)},
            {static_cast<uint8_t*>(output.data),w*4,h*4,static_cast<int>(output.stride)},region,channels,out.w))return gpu?-3:-6;
        assemblyMs+=milliseconds(assemblyStart);
        const bool keepGoing=callbacks.progress(ty*nx+tx+1,total);
        if(!keepGoing)return 1;
    }
    if(!callbacks.timing(2,preprocessingMs) || !callbacks.timing(3,inferenceMs) || !callbacks.timing(4,assemblyMs))return -6;
    return cancelled.load()?1:0;
}
}
