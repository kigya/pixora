#include <cassert>
#include "../../android/app/src/main/cpp/engine/raster_jni.cpp"
#include <cstdio>
int main(){
 JNIEnv env;const char* raw="coverage/native-core/jni.rgba";const char* png="coverage/native-core/jni.png";FakeBitmap image(4,4);
 auto create=[&](const char* path= "coverage/native-core/jni.rgba"){return Java_dev_kigya_pixora_NativeEngine_createRaster(&env,nullptr,path,4,4);};
 auto write=[&](const char* path="coverage/native-core/jni.rgba"){return Java_dev_kigya_pixora_NativeEngine_writeRaster(&env,nullptr,path,4,4,&image,0,0,0,0,4,4);};
 auto finish=[&](const char* input="coverage/native-core/jni.rgba",const char* output="coverage/native-core/jni.png"){return Java_dev_kigya_pixora_NativeEngine_finishRaster(&env,nullptr,input,output,4,4,nullptr);};
 assert(create()==0 && write()==0 && finish()==0);
 assert(create(nullptr)==-2);assert(write(nullptr)==-2);assert(finish(nullptr)==-2);assert(finish(raw,nullptr)==-2);
 env.failString=true;assert(create()==-2);env.failString=false;
 assert(create("/not/a/path")==-7);assert(write("/not/a/path")==-7);assert(finish("/not/a/path")==-7);
 for(int error:{1,2}){env.throwString=error;assert(create()==(error==1?-5:-7));assert(finish()==(error==1?-5:-7));assert(write()==(error==1?-5:-7));}env.throwString=0;
 image.infoCode=1;assert(write()==-2);image.infoCode=0;image.info.format=0;assert(write()==-2);image.info.format=1;image.lockCode=1;assert(write()==-2);
 image.lockCode=0;for(int error:{1,2}){image.throwCode=error;assert(write()==(error==1?-5:-7));}image.throwCode=0;
 env.missing="onProgress";assert(finish()==-2);env.missing="";
 env.proceed=false;assert(finish()==1);env.proceed=true;env.exception=true;assert(finish()==-6);env.exception=false;assert(finish(raw,"/not/a/path")==-7);
 std::remove(raw);std::remove(png);
}
