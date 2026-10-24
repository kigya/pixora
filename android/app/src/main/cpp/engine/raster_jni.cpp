#include "raster.h"
#include <jni.h>
#include <android/bitmap.h>
#include <new>
namespace {
struct Path {
 JNIEnv* env; jstring value; const char* chars;
 Path(JNIEnv* e,jstring s):env(e),value(s),chars(s?e->GetStringUTFChars(s,nullptr):nullptr){}
 ~Path(){if(chars)env->ReleaseStringUTFChars(value,chars);}
};
struct Locked {
 JNIEnv* env;jobject bitmap;AndroidBitmapInfo info{};void* data=nullptr;
 Locked(JNIEnv* e,jobject b):env(e),bitmap(b){if(AndroidBitmap_getInfo(e,b,&info)==0 && info.format==ANDROID_BITMAP_FORMAT_RGBA_8888 && AndroidBitmap_lockPixels(e,b,&data)!=0)data=nullptr;}
 ~Locked(){if(data)AndroidBitmap_unlockPixels(env,bitmap);}
};
}
extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_createRaster(JNIEnv* env,jobject,jstring path,jint w,jint h) {
 try {Path file(env,path);if(!file.chars)return -2;upscale::Raster raster(file.chars,w,h,true);return 0;}catch(const std::bad_alloc&){return -5;}catch(...){return -7;}
}
extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_writeRaster(JNIEnv* env,jobject,jstring path,jint w,jint h,jobject image,jint x,jint y,jint cx,jint cy,jint width,jint height) {
 try {Path file(env,path);Locked pixels(env,image);if(!file.chars || !pixels.data)return -2;upscale::Raster raster(file.chars,w,h,false);raster.write({static_cast<uint8_t*>(pixels.data),(int)pixels.info.width,(int)pixels.info.height,(int)pixels.info.stride},x,y,cx,cy,width,height);return 0;}catch(const std::bad_alloc&){return -5;}catch(...){return -7;}
}
extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_finishRaster(JNIEnv* env,jobject,jstring raw,jstring png,jint w,jint h,jobject callback) {
 try {Path input(env,raw),output(env,png);if(!input.chars || !output.chars)return -2;auto progress=env->GetMethodID(env->GetObjectClass(callback),"onProgress","(II)Z");if(!progress)return -2;upscale::Raster raster(input.chars,w,h,false);bool ok=raster.png(output.chars,[&]{return !env->CallBooleanMethod(callback,progress,0,0) || env->ExceptionCheck();});return env->ExceptionCheck()?-6:ok?0:1;}catch(const std::bad_alloc&){return -5;}catch(...){return -7;}
}
