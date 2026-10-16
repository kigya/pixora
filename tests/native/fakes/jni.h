#pragma once
#include <string>
using jobject=void*;using jstring=const char*;using jclass=void*;using jmethodID=int;using jint=int;using jboolean=bool;
struct JavaVM{};
#define JNIEXPORT
#define JNICALL
#define JNI_VERSION_1_6 0x00010006
struct JNIEnv {
    std::string returnedString;
    jstring NewStringUTF(const char* value){returnedString=value;return returnedString.c_str();}
    std::string missing;
    int calls=0,throwAt=-1;
    bool exception=false,proceed=true;
    void (*stageHook)(int)=nullptr;
    void (*progressHook)()=nullptr;
    jclass GetObjectClass(jobject b){return b;}
    jmethodID GetMethodID(jclass,const char* name,const char*){return missing==name?0:std::string(name)=="onStage"?2:std::string(name)=="onTiming"?3:1;}
    template<class... T>void CallVoidMethod(jobject,jmethodID method,int stage,T...){if(method==2 && stageHook)stageHook(stage);exception=(++calls==throwAt)||exception;}
    bool CallBooleanMethod(jobject,jmethodID,int,int){if(progressHook)progressHook();exception=(++calls==throwAt)||exception;return proceed;}
    bool ExceptionCheck(){return exception;}
};
