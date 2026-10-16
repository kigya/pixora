#include "pixels.h"
#include "feedback_endpoint.h"
#include <string>
#include <jni.h>
#include <android/bitmap.h>
#include <android/asset_manager_jni.h>
#include <net.h>
#include <gpu.h>
#include <atomic>
#include <mutex>
#include <vector>
#include <cmath>
#include <algorithm>
#include <new>
#include <cstdlib>
#include <chrono>

extern "C" int omp_get_num_places();

// Android changes allowed CPUs when an Activity enters/leaves the background.
// LLVM OpenMP's affinity discovery may abort on that changing topology. Set this
// before its first parallel region, including model loading on a new worker.
extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM*, void*) {
    setenv("KMP_AFFINITY", "disabled", 1);
    // Flat discovery avoids inconsistent core topology when Android moves the
    // worker into a restricted background cpuset during runtime initialization.
    setenv("KMP_TOPOLOGY_METHOD", "flat", 1);
    setenv("KMP_HIDDEN_HELPER_AFFINITY", "disabled", 1);
    setenv("OMP_WAIT_POLICY", "passive", 1);
    setenv("KMP_BLOCKTIME", "0", 1);
    // Complete topology initialization while the user starts a foreground job.
    // Leaving this lazy lets first model loading race with Android cpuset changes.
    // This loads neither model weights nor a GPU and creates no inference work.
    (void)omp_get_num_places();
    return JNI_VERSION_1_6;
}

namespace {
std::atomic<bool> cancelled{false};
std::once_flag gpuInit;
void initGPU() { std::call_once(gpuInit, [] { ncnn::create_gpu_instance(); }); }
struct Pixels {
    JNIEnv* env; jobject bitmap; AndroidBitmapInfo info{}; void* data=nullptr;
    Pixels(JNIEnv* e,jobject b):env(e),bitmap(b) {
        if(AndroidBitmap_getInfo(env,b,&info)!=0 || info.format!=ANDROID_BITMAP_FORMAT_RGBA_8888) return;
        if(AndroidBitmap_lockPixels(env,b,&data)!=0) data=nullptr;
    }
    ~Pixels(){ if(data) AndroidBitmap_unlockPixels(env,bitmap); }
};
int run(JNIEnv* env,jobject assets,jobject source,jobject target,bool gpu,int tile,jobject callback,bool fast=false,bool testGPU=false,int profile=0) {
    Pixels input(env,source),output(env,target);
    if(!input.data || !output.data) return -2;
    const int w=input.info.width,h=input.info.height;
    if(output.info.width!=w*4 || output.info.height!=h*4 || w>1024 || h>1024 || tile<32) return -2;
    auto method=env->GetMethodID(env->GetObjectClass(callback),"onProgress","(II)Z");
    if(!method) return -2;
    auto stage=env->GetMethodID(env->GetObjectClass(callback),"onStage","(I)V");
    if(!stage) return -2;
    env->CallVoidMethod(callback,stage,0);
    if(env->ExceptionCheck()) return -2;
    const auto started=std::chrono::steady_clock::now();
    auto milliseconds=[](auto begin){return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count();};
    auto timing=env->GetMethodID(env->GetObjectClass(callback),"onTiming","(ID)V");
    if(!timing)return -2;
    ncnn::Net net;
    net.opt.num_threads=2;
    net.opt.use_vulkan_compute=gpu;
    net.opt.use_fp16_storage=gpu;
    net.opt.use_fp16_packed=gpu;
    net.opt.use_fp16_arithmetic=false;
    net.opt.use_packing_layout=true;
    if(gpu){initGPU();if(ncnn::get_gpu_count()<1)return -3;net.set_vulkan_device(ncnn::get_default_gpu_index());}
    AAssetManager* mgr=AAssetManager_fromJava(env,assets);
    const char* param=profile==4?"models/realesrnet-x4plus.param":profile==2?"models/realesrgan-x4plus-anime.param":profile==3?"models/realesr-animevideov3-x4.param":fast?"models/realesr-general-x4v3.param":"models/realesrgan-x4plus.param";
    const char* weights=profile==4?"models/realesrnet-x4plus.bin":profile==2?"models/realesrgan-x4plus-anime.bin":profile==3?"models/realesr-animevideov3-x4.bin":fast?"models/realesr-general-x4v3.bin":"models/realesrgan-x4plus.bin";
    const char* inputName=(fast || profile==4)?"in0":"data";
    const char* outputName=(fast || profile==4)?"out0":"output";
    if(!mgr || net.load_param(mgr,param)!=0 || net.load_model(mgr,weights)!=0) return -4;
    env->CallVoidMethod(callback,timing,0,milliseconds(started));
    if(env->ExceptionCheck())return -6;
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
        env->CallVoidMethod(callback,timing,1,milliseconds(checkStart));
        if(env->ExceptionCheck())return -6;
    }
    env->CallVoidMethod(callback,stage,1);
    if(env->ExceptionCheck()) return -2;
    const int nx=(w+tile-1)/tile, ny=(h+tile-1)/tile,total=nx*ny;
    // Context padding is cropped per tile; seam tests compare against whole-image inference.
    upscale::Scratch scratch;
    double preprocessingMs=0,inferenceMs=0,assemblyMs=0;
    for(int ty=0;ty<ny;ty++)for(int tx=0;tx<nx;tx++) {
        if(cancelled.load()) return 1;
        const auto region=upscale::tileBounds(w,h,tile,tx,ty);
        const int tw=region.right-region.left,th=region.bottom-region.top;
        const auto preprocessStart=std::chrono::steady_clock::now();
        upscale::prepareRGB({static_cast<uint8_t*>(input.data),w,h,static_cast<int>(input.info.stride)},region,scratch);
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
        if(!upscale::assemble({static_cast<uint8_t*>(input.data),w,h,static_cast<int>(input.info.stride)},
            {static_cast<uint8_t*>(output.data),w*4,h*4,static_cast<int>(output.info.stride)},region,channels,out.w))return gpu?-3:-6;
        assemblyMs+=milliseconds(assemblyStart);
        const bool keepGoing=env->CallBooleanMethod(callback,method,ty*nx+tx+1,total);
        if(env->ExceptionCheck())return -6;
        if(!keepGoing)return 1;
    }
    env->CallVoidMethod(callback,timing,2,preprocessingMs);
    env->CallVoidMethod(callback,timing,3,inferenceMs);
    env->CallVoidMethod(callback,timing,4,assemblyMs);
    return env->ExceptionCheck()?-6:0;
}
}
extern "C" JNIEXPORT void JNICALL Java_dev_kigya_pixora_NativeEngine_resetCancellation(JNIEnv*,jobject){cancelled.store(false);}
extern "C" JNIEXPORT void JNICALL Java_dev_kigya_pixora_NativeEngine_cancel(JNIEnv*,jobject){cancelled.store(true);}
extern "C" JNIEXPORT jboolean JNICALL Java_dev_kigya_pixora_NativeEngine_gpuAvailable(JNIEnv*,jobject){initGPU();return ncnn::get_gpu_count()>0;}
extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_process(JNIEnv* env,jobject,jobject assets,jobject input,jobject output,jboolean gpu,jint tile,jobject callback){
    try{return run(env,assets,input,output,gpu,tile,callback);}catch(const std::bad_alloc&){return -5;}catch(...){return gpu?-3:-6;}
}

extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_processWithModel(JNIEnv* env,jobject,jobject assets,jobject input,jobject output,jboolean gpu,jint tile,jobject callback,jboolean fast,jboolean testGPU){
    try{return run(env,assets,input,output,gpu,tile,callback,fast,testGPU);}catch(const std::bad_alloc&){return -5;}catch(...){return gpu?-3:-6;}
}

extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_processProfile(JNIEnv* env,jobject,jobject assets,jobject input,jobject output,jboolean gpu,jint tile,jobject callback,jint profile,jboolean testGPU){
    if(profile<0 || profile>4)return -4;
    try{return run(env,assets,input,output,gpu,tile,callback,profile==1,testGPU,profile);}catch(const std::bad_alloc&){return -5;}catch(...){return gpu?-3:-6;}
}

#ifdef UPSCALE_COVERAGE
extern "C" int __llvm_profile_write_file();
extern "C" void __llvm_profile_set_filename(const char*);
#endif
extern "C" JNIEXPORT void JNICALL Java_dev_kigya_pixora_NativeEngine_setCoveragePath(JNIEnv* env,jobject,jstring path) {
#ifdef UPSCALE_COVERAGE
    const char* name=env->GetStringUTFChars(path,nullptr);
    __llvm_profile_set_filename(name);
    env->ReleaseStringUTFChars(path,name);
#endif
}
extern "C" JNIEXPORT void JNICALL Java_dev_kigya_pixora_NativeEngine_flushCoverage(JNIEnv*,jobject) {
#ifdef UPSCALE_COVERAGE
    __llvm_profile_write_file();
#endif
}

// Encoding raises the extraction cost; client URLs are not secrets.
extern "C" JNIEXPORT jstring JNICALL Java_dev_kigya_pixora_NativeEngine_feedbackEndpoint(JNIEnv* env, jobject) {
    std::string value;
    value.reserve(endpointData.size());
    for (unsigned char byte : endpointData) value.push_back(static_cast<char>(byte ^ endpointMask));
    return env->NewStringUTF(value.c_str());
}
