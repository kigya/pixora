#pragma once
#include <jni.h>
#include <cstdint>
#include <vector>
#include <stdexcept>
#define ANDROID_BITMAP_FORMAT_RGBA_8888 1
struct AndroidBitmapInfo {uint32_t width,height,stride,format;};
struct FakeBitmap {
    AndroidBitmapInfo info;std::vector<unsigned char> data;
    int infoCode=0,lockCode=0,throwCode=0;
    FakeBitmap(int w,int h):info{static_cast<uint32_t>(w),static_cast<uint32_t>(h),static_cast<uint32_t>(w*4),1},data(w*h*4,255){}
};
inline int AndroidBitmap_getInfo(JNIEnv*,jobject b,AndroidBitmapInfo* info){auto p=static_cast<FakeBitmap*>(b);*info=p->info;return p->infoCode;}
inline int AndroidBitmap_lockPixels(JNIEnv*,jobject b,void** data){auto p=static_cast<FakeBitmap*>(b);if(p->throwCode==1)throw std::bad_alloc();if(p->throwCode==2)throw std::runtime_error("system error");*data=p->data.data();return p->lockCode;}
inline void AndroidBitmap_unlockPixels(JNIEnv*,jobject){}
