#pragma once
#include <cstddef>
#include <string>
#include <vector>
using jobject=void*;using jstring=const char*;using jclass=void*;using jmethodID=int;using jint=int;using jsize=int;using jboolean=bool;
struct FakeJIntArray { std::vector<jint> values; };
using jintArray=FakeJIntArray*;
struct JavaVM{};
#define JNIEXPORT
#define JNICALL
#define JNI_VERSION_1_6 0x00010006
constexpr jint JNI_ABORT=2;
struct JNIEnv {
    std::string returnedString;
    std::string missing;
    int calls=0,throwAt=-1;
    bool exception=false,proceed=true;
    bool failGetIntArrayElements=false;
    bool exceptionOnGetArrayLength=false;
    bool exceptionOnGetIntArrayElements=false;
    bool exceptionOnReleaseIntArrayElements=false;
    int arrayLengthCalls=0,arrayElementsCalls=0,arrayReleaseCalls=0;
    jint releasedArrayMode=0;
    int newStringCalls=0;
    jintArray lastArray=nullptr;
    void (*stageHook)(int)=nullptr;
    void (*progressHook)()=nullptr;
    jstring NewStringUTF(const char* value){++newStringCalls;returnedString=value;return returnedString.c_str();}
    jsize GetArrayLength(jintArray array){++arrayLengthCalls;lastArray=array;exception=exceptionOnGetArrayLength||exception;return array?static_cast<jsize>(array->values.size()):0;}
    jint* GetIntArrayElements(jintArray array,jboolean*){++arrayElementsCalls;lastArray=array;exception=exceptionOnGetIntArrayElements||exception;return failGetIntArrayElements||!array?nullptr:array->values.data();}
    void ReleaseIntArrayElements(jintArray array,jint*,jint mode){++arrayReleaseCalls;lastArray=array;releasedArrayMode=mode;exception=exceptionOnReleaseIntArrayElements||exception;}
    jclass GetObjectClass(jobject b){return b;}
    jmethodID GetMethodID(jclass,const char* name,const char*){return missing==name?0:std::string(name)=="onStage"?2:std::string(name)=="onTiming"?3:1;}
    template<class... T>void CallVoidMethod(jobject,jmethodID method,int stage,T...){if(method==2 && stageHook)stageHook(stage);exception=(++calls==throwAt)||exception;}
    bool CallBooleanMethod(jobject,jmethodID,int,int){if(progressHook)progressHook();exception=(++calls==throwAt)||exception;return proceed;}
    bool ExceptionCheck(){return exception;}
};
