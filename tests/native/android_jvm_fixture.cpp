#include <jni.h>

#include <cstdint>
#include <cstdio>
#include <cstring>

namespace {

void notifyCallback(JNIEnv* env, jobject callback, jint stage, jdouble milliseconds,
                    jint done, jint total) {
  if (callback == nullptr) return;
  const jclass type = env->GetObjectClass(callback);
  if (type == nullptr) return;
  const jmethodID onStage = env->GetMethodID(type, "onStage", "(I)V");
  const jmethodID onTiming = env->GetMethodID(type, "onTiming", "(ID)V");
  const jmethodID onProgress = env->GetMethodID(type, "onProgress", "(II)Z");
  if (onStage != nullptr) env->CallVoidMethod(callback, onStage, stage);
  if (onTiming != nullptr)
    env->CallVoidMethod(callback, onTiming, stage, milliseconds);
  if (onProgress != nullptr)
    env->CallBooleanMethod(callback, onProgress, done, total);
  env->DeleteLocalRef(type);
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_dev_kigya_pixora_NativeEngine_feedbackEndpoint(JNIEnv* env, jobject) {
  return env->NewStringUTF("https://fixture.invalid/feedback");
}

extern "C" JNIEXPORT jboolean JNICALL
Java_dev_kigya_pixora_NativeEngine_gpuAvailable(JNIEnv*, jobject) {
  return JNI_TRUE;
}

extern "C" JNIEXPORT jint JNICALL
Java_dev_kigya_pixora_NativeEngine_processProfile(
    JNIEnv* env, jobject, jobject, jobject, jobject, jboolean gpu, jint tile,
    jobject callback, jint profile, jboolean testGpu) {
  notifyCallback(env, callback, profile, tile, testGpu ? 1 : 0, gpu ? 1 : 0);
  return profile * 1000 + tile * 10 + (gpu ? 2 : 0) + (testGpu ? 1 : 0);
}

extern "C" JNIEXPORT jint JNICALL
Java_dev_kigya_pixora_NativeEngine_processWithModel(
    JNIEnv* env, jobject, jobject, jobject, jobject, jboolean gpu, jint tile,
    jobject callback, jboolean fast, jboolean testGpu) {
  const jint mode = fast ? 1 : 0;
  notifyCallback(env, callback, mode, tile, testGpu ? 1 : 0, gpu ? 1 : 0);
  return 3000 + tile * 10 + (gpu ? 2 : 0) + (fast ? 1 : 0) +
         (testGpu ? 4 : 0);
}

extern "C" JNIEXPORT void JNICALL
Java_dev_kigya_pixora_NativeEngine_resetCancellation(JNIEnv*, jobject) {}

extern "C" JNIEXPORT void JNICALL
Java_dev_kigya_pixora_NativeEngine_cancel(JNIEnv*, jobject) {}

// Host JVM boundary fixture only: tests forwarding/transport, not classification.
// The shared C++ suite and real JNI suite own classifier/availability assertions.
extern "C" JNIEXPORT jstring JNICALL
Java_dev_kigya_pixora_RecommendationEngine_analyzeRecommendation(
    JNIEnv* env, jclass, jint width, jint height, jintArray argb, jint profiles) {
  const char* profile = "balanced";
  const char* reason = "generic";
  int bit = 1;
  if (argb != nullptr && env->GetArrayLength(argb) > 0) {
    jint firstPixel = 0;
    env->GetIntArrayRegion(argb, 0, 1, &firstPixel);
    if (env->ExceptionCheck()) return nullptr;
    if (width == 2 && height == 1) switch (static_cast<std::uint32_t>(firstPixel)) {
      case 0xff123456U: profile="standard"; reason="photo"; bit=0; break;
      case 0xff112233U: profile="art"; reason="art"; bit=4; break;
      case 0xffabcdefU: profile="pixel"; reason="pixel"; bit=5; break;
      case 0xff445566U: profile="natural"; reason="smooth"; bit=2; break;
      case 0xff778899U: reason="mixed"; break;
    }
  }
  if (!(profiles & (1 << bit))) {
    const char* alternatives[]={"standard","balanced","natural","lite"};
    profile=nullptr;
    for(int i=0;i<4;++i) if(profiles & (1<<i)) {profile=alternatives[i];break;}
    reason="unavailable";
  }
  if(!profile)return env->NewStringUTF("null");
  char json[192];
  std::snprintf(json,sizeof(json),
      "{\"profileId\":\"%s\",\"speed\":\"quality\",\"reasonId\":\"%s\"}",profile,reason);
  return env->NewStringUTF(json);
}

// Real disk-raster implementation behind the host JVM boundary. The inference
// fixture above still does not run a model and must not be treated as AI proof.
#include "../../native/engine/raster.h"
#include <vector>
#include <algorithm>
extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_createRaster(JNIEnv* env,jobject,jstring path,jint w,jint h) {
 const char* p=env->GetStringUTFChars(path,nullptr);int status=0;
 try{upscale::Raster raster(p,w,h,true);}catch(...){status=-7;}
 env->ReleaseStringUTFChars(path,p);return status;
}
extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_writeRaster(JNIEnv* env,jobject,jstring path,jint w,jint h,jobject bitmap,jint x,jint y,jint cx,jint cy,jint cw,jint ch) {
 jclass type=env->GetObjectClass(bitmap);auto getW=env->GetMethodID(type,"getWidth","()I"),getH=env->GetMethodID(type,"getHeight","()I");
 int width=env->CallIntMethod(bitmap,getW),height=env->CallIntMethod(bitmap,getH);jintArray argb=env->NewIntArray(width*height);
 auto getPixels=env->GetMethodID(type,"getPixels","([IIIIIII)V");env->CallVoidMethod(bitmap,getPixels,argb,0,width,0,0,width,height);
 std::vector<jint> pixels(width*height);env->GetIntArrayRegion(argb,0,width*height,pixels.data());env->DeleteLocalRef(argb);env->DeleteLocalRef(type);
 std::vector<uint8_t> rgba(width*height*4);
 for(size_t i=0;i<pixels.size();i++){int alpha=(unsigned)pixels[i]>>24;for(int c=0;c<3;c++)rgba[i*4+c]=(((pixels[i]>>(16-c*8))&255)*alpha+127)/255;rgba[i*4+3]=alpha;}
 const char* p=env->GetStringUTFChars(path,nullptr);int status=0;
 try{upscale::Raster raster(p,w,h,false);raster.write({rgba.data(),width,height,width*4},x,y,cx,cy,cw,ch);}catch(...){status=-7;}
 env->ReleaseStringUTFChars(path,p);return status;
}
extern "C" JNIEXPORT jint JNICALL Java_dev_kigya_pixora_NativeEngine_finishRaster(JNIEnv* env,jobject,jstring raw,jstring png,jint w,jint h,jobject callback) {
 const char* source=env->GetStringUTFChars(raw,nullptr);const char* output=env->GetStringUTFChars(png,nullptr);int status=0;
 jclass type=env->GetObjectClass(callback);auto progress=env->GetMethodID(type,"onProgress","(II)Z");
 try{upscale::Raster raster(source,w,h,false);if(!raster.png(output,[&]{return !env->CallBooleanMethod(callback,progress,0,0);}))status=1;}catch(...){status=-7;}
 env->DeleteLocalRef(type);env->ReleaseStringUTFChars(raw,source);env->ReleaseStringUTFChars(png,output);return status;
}
