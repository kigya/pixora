#pragma once

#include <cstddef>
#include <new>
#include <string>

using jint = int;
using jlong = long long;
using jboolean = bool;
using jobject = void*;
using jclass = void*;
struct FakeMethodId;
using jmethodID = FakeMethodId*;
using jstring = const char*;

constexpr jint JNI_OK = 0;
constexpr jint JNI_ERR = -1;
constexpr jint JNI_EDETACHED = -2;
constexpr jint JNI_VERSION_1_6 = 0x00010006;
constexpr jboolean JNI_TRUE = true;

#define JNIEXPORT
#define JNICALL

struct JNIEnv;
struct FakeProgressCallback {
    bool proceed = true;
    bool throw_on_progress = false;
    int calls = 0;
    int last_step = -1;
    int last_total = -1;
};

struct JavaVM {
    JNIEnv* owner_env = nullptr;
    bool detached = false;
    bool fail_attach = false;
    int detach_count = 0;

    jint GetEnv(void** env, jint version);
    jint AttachCurrentThread(JNIEnv** env, void* args);
    jint DetachCurrentThread();
};

struct JNIEnv {
    JavaVM* vm = nullptr;
    std::string missing_method;
    bool fail_string = false;
    int throw_string = 0;
    bool fail_global_ref = false;
    int global_refs = 0;
    int deleted_global_refs = 0;
    bool exception = false;
    int exception_checks = 0;
    int exception_clears = 0;
    int java_vm_result = JNI_OK;

    const char* GetStringUTFChars(jstring value, jboolean*) {
        if (throw_string == 1) throw std::bad_alloc();
        if (throw_string == 2) throw 1;
        return fail_string ? nullptr : value;
    }
    void ReleaseStringUTFChars(jstring, const char*) {}
    jclass GetObjectClass(jobject value) { return value; }
    jmethodID GetMethodID(jclass, const char* name, const char*) {
        return missing_method == name ? nullptr : reinterpret_cast<jmethodID>(1);
    }
    jint GetJavaVM(JavaVM** output) {
        if (java_vm_result == JNI_OK) *output = vm;
        return java_vm_result;
    }
    jobject NewGlobalRef(jobject value) {
        if (fail_global_ref) return nullptr;
        ++global_refs;
        return value;
    }
    void DeleteGlobalRef(jobject) { ++deleted_global_refs; }
    jboolean CallBooleanMethod(jobject target, jmethodID, jint step, jint total) {
        auto* callback = static_cast<FakeProgressCallback*>(target);
        ++callback->calls;
        callback->last_step = step;
        callback->last_total = total;
        exception = callback->throw_on_progress || exception;
        return callback->proceed;
    }
    bool ExceptionCheck() {
        ++exception_checks;
        return exception;
    }
    void ExceptionClear() {
        ++exception_clears;
        exception = false;
    }
};

inline jint JavaVM::GetEnv(void** env, jint) {
    if (detached) return JNI_EDETACHED;
    *env = owner_env;
    return JNI_OK;
}

inline jint JavaVM::AttachCurrentThread(JNIEnv** env, void*) {
    if (fail_attach) return JNI_ERR;
    detached = false;
    *env = owner_env;
    return JNI_OK;
}

inline jint JavaVM::DetachCurrentThread() {
    ++detach_count;
    detached = true;
    return JNI_OK;
}
