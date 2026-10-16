#include "engine.h"
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
void initGPU() { upscale::initializeGPU(); }
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
    AAssetManager* mgr=AAssetManager_fromJava(env,assets);
    if(!mgr)return -4;
    upscale::Callbacks hooks;
    auto timing=env->GetMethodID(env->GetObjectClass(callback),"onTiming","(ID)V");
    if(!timing)return -2;
    hooks.stage=[&](int value){env->CallVoidMethod(callback,stage,value);return !env->ExceptionCheck();};
    hooks.timing=[&](int kind,double value){env->CallVoidMethod(callback,timing,kind,value);return !env->ExceptionCheck();};
    hooks.progress=[&](int done,int total){const bool proceed=env->CallBooleanMethod(callback,method,done,total);return proceed && !env->ExceptionCheck();};
    const int status=upscale::process({static_cast<uint8_t*>(input.data),w,h,static_cast<int>(input.info.stride)},
       {static_cast<uint8_t*>(output.data),w*4,h*4,static_cast<int>(output.info.stride)},gpu,tile,fast?1:profile,testGPU,cancelled,hooks,
       [&](void* opaque,const upscale::Model& model){auto& net=*static_cast<ncnn::Net*>(opaque);const std::string prefix="models/";return net.load_param(mgr,(prefix+model.param).c_str()) || net.load_model(mgr,(prefix+model.weights).c_str());});
    return status==1 && env->ExceptionCheck()?-6:status;
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
